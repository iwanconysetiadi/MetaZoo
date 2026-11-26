import type { OptimizationWorld } from '../world/OptimizationWorld';
import type {
  CandidateState, CompletionReason, InitialPopulation, Optimizer,
  OptimizerContext, OptimizerEvent, OptimizerState, RenderFrame,
  RunConfiguration, RunMetadata, SimulationSnapshot, SimulationStatus, OptimizerStepResult,
  CompatibilityResult, CompatibilityLevel, Checkpoint, HeadlessRunResult, SimulationEngineEvent,
} from './types';
import {
  cloneOptimizerState, deepClone, snapshotToState,
} from './types';
import { SeededRandom } from './SeededRandom';
import { ConstraintService } from './ConstraintService';
import { EvaluationBudgetExceededError, EvaluationService } from './EvaluationService';
import { SimulationClock } from './SimulationClock';
import { SimulationHistory } from './SimulationHistory';
import { Telemetry } from './Telemetry';
import { computeStatistics } from './statistics';
import { generateInitialPopulation } from './InitialPopulation';
import { createOptimizer, getOptimizerDescriptor } from './optimizers/registry';
import { EventBus } from './EventBus';

export interface SimulationEngineCallbacks {
  onStateChange?: (engine: SimulationEngine) => void;
  onWorldTimeChanged?: (time: number) => void;
  onDisplaySnapshot?: (snapshot: SimulationSnapshot | null) => void;
}

export type RunSetup = Partial<RunConfiguration> & { optimizerId: string };

const MAX_WALL_STEP = 0.25;

export class SimulationEngine {
  private world: OptimizationWorld;
  private callbacks: SimulationEngineCallbacks;

  private config: RunConfiguration | null = null;
  private optimizer: Optimizer | null = null;
  private constraints: ConstraintService;
  private evaluation: EvaluationService | null = null;
  private random = new SeededRandom(1);
  private initialRandomState = 1;
  private initialPopulation: InitialPopulation | null = null;

  private clock = new SimulationClock();
  private history = new SimulationHistory();
  private telemetry = new Telemetry();

  private state: OptimizerState | null = null;
  private previousState: OptimizerState | null = null;
  private status: SimulationStatus = 'READY';
  private completionReason: CompletionReason | null = null;
  private errorMessage: string | null = null;
  private failedIteration: number | null = null;
  private compatibility: CompatibilityResult | null = null;
  readonly eventBus = new EventBus<SimulationEngineEvent>();
  private boundRevision = -1;

  private renderAlpha = 1;
  private displayIndex: number | null = null;
  private replaying = false;

  constructor(world: OptimizationWorld, callbacks: SimulationEngineCallbacks = {}) {
    this.world = world;
    this.callbacks = callbacks;
    this.constraints = new ConstraintService(world);
  }

  // ---------------------------------------------------------------- setup
  initialize(setup: RunSetup): void {
    const optimizer = createOptimizer(setup.optimizerId);
    if (!optimizer) throw new Error(`Unknown optimizer "${setup.optimizerId}"`);

    const descriptor = getOptimizerDescriptor(setup.optimizerId);
    const domain = this.world.getConfig().domain;
    const populationSize = Math.max(
      1,
      Math.floor(setup.populationSize ?? descriptor?.defaultPopulationSize ?? 30),
    );

    this.config = {
      runId: setup.runId ?? makeRunId(setup.seed ?? 42),
      worldId: this.world.getConfig().functionId,
      worldRevision: this.world.getRevision(),
      optimizerId: setup.optimizerId,
      seed: Math.floor(setup.seed ?? 42),
      populationSize,
      maxIterations: Math.max(1, Math.floor(setup.maxIterations ?? 500)),
      maxEvaluations: Math.max(1, Math.floor(setup.maxEvaluations ?? 5000)),
      boundaryPolicy: setup.boundaryPolicy ?? 'reflect',
      objectiveMode: setup.objectiveMode ?? 'observed',
      logicalDelta: setup.logicalDelta ?? 0.2,
      iterationsPerSecond: setup.iterationsPerSecond ?? 5,
      targetFitness: setup.targetFitness,
      targetTolerance: setup.targetTolerance,
      optimizerParameters: deepClone(setup.optimizerParameters ?? {}),
      createdAt: setup.createdAt ?? new Date().toISOString(),
    };

    if (this.optimizer?.dispose) this.optimizer.dispose();
    this.optimizer = optimizer;
    this.compatibility = this.checkCompatibility(optimizer, this.world);
    if (this.compatibility.level === 'UNSUPPORTED') {
      throw new Error(`Unsupported optimizer/world combination: ${this.compatibility.reasons.join('; ')}`);
    }
    this.constraints = new ConstraintService(this.world);
    this.evaluation = new EvaluationService(
      this.world, this.constraints,
      this.config.maxEvaluations, this.config.objectiveMode,
    );
    this.random = new SeededRandom(this.config.seed);
    this.initialRandomState = this.random.getState();
    this.initialPopulation = generateInitialPopulation(
      domain, populationSize, this.config.seed,
      this.config.boundaryPolicy, this.constraints,
    );

    this.clock = new SimulationClock(this.config.logicalDelta, this.config.iterationsPerSecond);
    this.history.clear();
    this.telemetry.clear();
    this.boundRevision = this.world.getRevision();
    this.status = 'READY';
    this.completionReason = null;
    this.errorMessage = null;
    this.failedIteration = null;
    this.displayIndex = null;
    this.replaying = false;
    this.renderAlpha = 1;
    this.world.setSimTime(0);

    try {
      this.optimizer.initialize(this.createContext());
    } catch (error) {
      this.failFromError(error);
      this.callbacks.onStateChange?.(this);
      throw error;
    }

    const raw = this.optimizer.getState();
    const validationError = this.validateState(raw, 0);
    if (validationError) {
      this.fail(validationError);
      this.callbacks.onStateChange?.(this);
      throw new Error(validationError);
    }

    this.state = this.finalizeState(raw, 0, []);
    this.previousState = cloneOptimizerState(this.state);
    this.captureSnapshot(this.state, this.state.events);
    this.callbacks.onWorldTimeChanged?.(0);
    this.callbacks.onDisplaySnapshot?.(null);
    this.callbacks.onStateChange?.(this);
    this.eventBus.publish('run-initialized', { iteration: 0 });
  }

  // ---------------------------------------------------------------- controls
  play(): void {
    if (!this.config || !this.optimizer) return;
    if (this.checkRevision()) return;
    if (this.status === 'COMPLETED' || this.status === 'FAILED' || this.status === 'STALE') return;
    if (this.displayIndex !== null || this.replaying) this.returnToLive();
    this.status = 'RUNNING';
    this.clock.running = true;
    this.clock.resetProgress();
    this.callbacks.onStateChange?.(this);
  }

  pause(): void {
    if (!this.config) return;
    if (this.status === 'RUNNING') this.status = 'PAUSED';
    this.clock.running = false;
    this.renderAlpha = 1;
    this.callbacks.onStateChange?.(this);
  }

  /** Explicitly finish the current run without discarding its history. */
  stop(): void {
    if (!this.config) return;
    if (this.status === 'RUNNING' || this.status === 'PAUSED' || this.status === 'READY') {
      this.complete('manual-stop');
    }
  }

  stepOnce(): void {
    if (!this.config || !this.optimizer) return;
    if (this.checkRevision()) return;
    if (this.status === 'COMPLETED' || this.status === 'FAILED' || this.status === 'STALE') return;
    if (this.displayIndex !== null || this.replaying) this.returnToLive();
    if (this.status === 'RUNNING') this.pause();

    this.executeStep();
    const statusAfterStep = this.status as SimulationStatus;
    if (statusAfterStep !== 'COMPLETED' && statusAfterStep !== 'FAILED' && statusAfterStep !== 'STALE') {
      this.status = 'PAUSED';
    }
    this.clock.running = false;
    this.renderAlpha = 1;
    this.callbacks.onStateChange?.(this);
  }

  reset(): void {
    if (!this.config || !this.optimizer || !this.evaluation) return;
    const regenerate = this.world.getRevision() !== this.boundRevision;
    this.reinitialize(regenerate);
  }

  private reinitialize(regeneratePopulation: boolean): void {
    if (!this.config || !this.optimizer || !this.evaluation) return;

    this.boundRevision = this.world.getRevision();
    this.config.worldRevision = this.boundRevision;
    this.config.worldId = this.world.getConfig().functionId;
    this.evaluation.reset();
    this.evaluation.setObjectiveMode(this.config.objectiveMode);
    this.evaluation.setMaxEvaluations(this.config.maxEvaluations);
    this.random.setState(this.initialRandomState);

    if (regeneratePopulation || !this.initialPopulation) {
      this.initialPopulation = generateInitialPopulation(
        this.world.getConfig().domain,
        this.config.populationSize,
        this.config.seed,
        this.config.boundaryPolicy,
        this.constraints,
      );
    }

    this.clock.reset();
    this.clock.setPlaybackSpeed(this.clock.playbackSpeed);
    this.history.clear();
    this.telemetry.clear();
    this.status = 'READY';
    this.completionReason = null;
    this.errorMessage = null;
    this.failedIteration = null;
    this.displayIndex = null;
    this.replaying = false;
    this.renderAlpha = 1;
    this.world.setSimTime(0);

    try {
      this.optimizer.initialize(this.createContext());
      const raw = this.optimizer.getState();
      const validationError = this.validateState(raw, 0);
      if (validationError) throw new Error(validationError);
      this.state = this.finalizeState(raw, 0, []);
      this.previousState = cloneOptimizerState(this.state);
      this.captureSnapshot(this.state, this.state.events);
    } catch (error) {
      this.failFromError(error);
    }

    this.callbacks.onWorldTimeChanged?.(0);
    this.callbacks.onDisplaySnapshot?.(null);
    this.callbacks.onStateChange?.(this);
  }

  setPlaybackSpeed(speed: number): void {
    this.clock.setPlaybackSpeed(speed);
    this.callbacks.onStateChange?.(this);
  }

  getPlaybackSpeed(): number {
    return this.clock.playbackSpeed;
  }

  // ---------------------------------------------------------------- stepping
  /**
   * Called by the render loop. Wall time is converted into whole logical steps;
   * the optimizer is never stepped once per graphics frame.
   */
  advance(deltaSeconds: number): void {
    if (!this.config) return;
    if (this.checkRevision()) return;

    if (this.replaying) {
      this.advanceReplay(deltaSeconds);
      return;
    }

    if (this.status !== 'RUNNING') {
      this.renderAlpha = 1;
      return;
    }

    const steps = this.clock.addWallTime(Math.min(Math.max(deltaSeconds, 0), MAX_WALL_STEP));
    for (let i = 0; i < steps && this.status === 'RUNNING'; i++) {
      this.executeStep();
    }

    this.renderAlpha = this.status === 'RUNNING' ? this.clock.getProgress() : 1;
  }

  private executeStep(): void {
    if (!this.config || !this.optimizer || !this.evaluation || !this.state) return;

    if (this.evaluation.getCount() >= this.config.maxEvaluations) {
      this.complete('max-evaluations');
      return;
    }
    if (this.clock.iteration >= this.config.maxIterations) {
      this.complete('max-iterations');
      return;
    }

    let result: OptimizerStepResult;
    try {
      result = this.optimizer.step(this.createContext());
    } catch (error) {
      if (error instanceof EvaluationBudgetExceededError) {
        this.complete('max-evaluations');
        return;
      }
      this.failFromError(error);
      return;
    }

    const raw = this.optimizer.getState();
    const validationError = this.validateState(raw, this.state.evaluations);
    if (validationError) {
      this.fail(validationError);
      return;
    }

    const nextIteration = this.clock.iteration + 1;
    const events = result.events ?? [];
    const next = this.finalizeState(raw, nextIteration, events);

    this.previousState = cloneOptimizerState(this.state);
    this.state = next;
    this.clock.recordStep();
    this.renderAlpha = 0;
    this.captureSnapshot(next, events);

    this.world.setSimTime(this.clock.simulationTime);
    this.callbacks.onWorldTimeChanged?.(this.clock.simulationTime);

    if (result.terminated) {
      this.complete('algorithm-termination');
      return;
    }
    if (this.targetReached(next)) {
      this.complete('target-reached');
      return;
    }
    if (this.evaluation.getCount() >= this.config.maxEvaluations) {
      this.complete('max-evaluations');
      return;
    }
    if (this.clock.iteration >= this.config.maxIterations) {
      this.complete('max-iterations');
    }
  }

  // ---------------------------------------------------------------- history
  scrubTo(index: number): void {
    if (!this.config || this.history.size === 0) return;
    this.pause();
    this.replaying = false;
    this.displayIndex = Math.max(0, Math.min(this.history.size - 1, Math.floor(index)));
    this.renderAlpha = 1;
    this.applyDisplaySnapshot();
    this.callbacks.onStateChange?.(this);
  }

  returnToLive(): void {
    if (!this.config) return;
    this.displayIndex = null;
    this.replaying = false;
    this.clock.resetProgress();
    this.renderAlpha = 1;
    this.world.setSimTime(this.clock.simulationTime);
    this.callbacks.onWorldTimeChanged?.(this.clock.simulationTime);
    this.callbacks.onDisplaySnapshot?.(null);
    this.callbacks.onStateChange?.(this);
  }

  startReplay(): void {
    if (!this.config || this.history.size < 2) return;
    this.pause();
    this.replaying = true;
    this.displayIndex = 0;
    this.clock.resetProgress();
    this.renderAlpha = 0;
    this.applyDisplaySnapshot();
    this.callbacks.onStateChange?.(this);
  }

  stopReplay(): void {
    if (!this.replaying) return;
    this.replaying = false;
    this.renderAlpha = 1;
    this.callbacks.onStateChange?.(this);
  }

  private advanceReplay(deltaSeconds: number): void {
    if (!this.replaying) return;
    const steps = this.clock.addWallTime(Math.min(Math.max(deltaSeconds, 0), MAX_WALL_STEP));
    for (let i = 0; i < steps; i++) {
      if (this.displayIndex === null) break;
      if (this.displayIndex >= this.history.size - 1) {
        this.replaying = false;
        this.renderAlpha = 1;
        this.callbacks.onStateChange?.(this);
        return;
      }
      this.displayIndex++;
      this.applyDisplaySnapshot();
    }
    this.renderAlpha = this.replaying ? this.clock.getProgress() : 1;
  }

  private applyDisplaySnapshot(): void {
    if (this.displayIndex === null) return;
    const snapshot = this.history.get(this.displayIndex);
    if (!snapshot) return;
    this.world.setSimTime(snapshot.simulationTime);
    this.callbacks.onWorldTimeChanged?.(snapshot.simulationTime);
    this.callbacks.onDisplaySnapshot?.(snapshot);
  }

  // ---------------------------------------------------------------- state
  getRenderFrame(): RenderFrame | null {
    if (!this.state) return null;

    if (this.displayIndex !== null) {
      const current = this.history.get(this.displayIndex);
      if (!current) return { previous: this.previousState, current: this.state, alpha: 1 };
      const previous = this.displayIndex > 0 ? this.history.get(this.displayIndex - 1) : current;
      return {
        previous: previous ? snapshotToStateShallow(previous) : null,
        current: snapshotToStateShallow(current),
        alpha: this.replaying ? this.clock.getProgress() : 1,
      };
    }

    return {
      previous: this.previousState,
      current: this.state,
      alpha: this.renderAlpha,
    };
  }

  getState(): OptimizerState | null {
    return this.state;
  }

  getDisplayedState(): OptimizerState | null {
    if (this.displayIndex !== null) {
      const snapshot = this.history.get(this.displayIndex);
      return snapshot ? snapshotToState(snapshot) : this.state;
    }
    return this.state;
  }

  getStatus(): SimulationStatus {
    return this.status;
  }

  getCompletionReason(): CompletionReason | null {
    return this.completionReason;
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  getFailedIteration(): number | null {
    return this.failedIteration;
  }

  getRunConfiguration(): RunConfiguration | null {
    return this.config ? deepClone(this.config) : null;
  }

  getOptimizer(): Optimizer | null {
    return this.optimizer;
  }

  getClock(): SimulationClock {
    return this.clock;
  }

  getHistory(): SimulationHistory {
    return this.history;
  }

  getTelemetry(): Telemetry {
    return this.telemetry;
  }

  getEvaluationCount(): number {
    return this.evaluation?.getCount() ?? 0;
  }

  getCompatibility(): CompatibilityResult | null {
    return this.compatibility;
  }

  getRunMetadata(): RunMetadata | null {
    if (!this.config) return null;
    return {
      runId: this.config.runId,
      worldId: this.config.worldId,
      worldRevision: this.config.worldRevision,
      optimizerId: this.config.optimizerId,
      seed: this.config.seed,
      populationSize: this.config.populationSize,
      maxEvaluations: this.config.maxEvaluations,
      maxIterations: this.config.maxIterations,
      initialPopulationId: `pop-${this.config.seed}`,
      boundaryPolicy: this.config.boundaryPolicy,
      objectiveMode: this.config.objectiveMode,
      logicalDelta: this.config.logicalDelta,
      iterationsPerSecond: this.config.iterationsPerSecond,
      targetFitness: this.config.targetFitness,
      targetTolerance: this.config.targetTolerance,
      optimizerParameters: deepClone(this.config.optimizerParameters),
      createdAt: this.config.createdAt,
    };
  }

  createCheckpoint(): Checkpoint | null {
    if (!this.config || !this.state) return null;
    return {
      schemaVersion: 1,
      iteration: this.clock.iteration,
      evaluations: this.evaluation?.getCount() ?? 0,
      simulationTime: this.clock.simulationTime,
      optimizerId: this.config.optimizerId,
      optimizerState: cloneOptimizerState(this.state),
      randomState: this.random.getState(),
      worldRevision: this.world.getRevision(),
      worldSimTime: this.world.getSimTime(),
      telemetry: deepClone(this.telemetry.getData()),
      historySize: this.history.size,
      createdAt: new Date().toISOString(),
    };
  }

  resumeFromCheckpoint(checkpoint: Checkpoint): void {
    if (checkpoint.schemaVersion !== 1) throw new Error('Unsupported checkpoint schema version');
    if (!this.optimizer) throw new Error('Simulation not initialized');
    if (checkpoint.optimizerId !== this.config?.optimizerId) throw new Error('Checkpoint optimizer mismatch');

    this.random.setState(checkpoint.randomState);
    this.state = cloneOptimizerState(checkpoint.optimizerState);
    this.previousState = cloneOptimizerState(this.state);
    this.clock.iteration = checkpoint.iteration;
    this.clock.simulationTime = checkpoint.simulationTime;
    this.evaluation?.setCount(checkpoint.evaluations);
    this.world.setSimTime(checkpoint.worldSimTime);
    this.status = 'PAUSED';
    this.completionReason = null;
    this.callbacks.onStateChange?.(this);
  }

  getStateHash(): string {
    if (!this.state) return '';
    return JSON.stringify(this.state);
  }

  static runHeadless(world: OptimizationWorld, setup: RunSetup): HeadlessRunResult {
    const engine = new SimulationEngine(world);
    engine.initialize(setup);
    const maxSteps = setup.maxIterations ?? 500;
    for (let i = 0; i < maxSteps + 5; i++) {
      const status = engine.getStatus();
      if (status === 'COMPLETED' || status === 'FAILED' || status === 'STALE') break;
      engine.stepOnce();
    }
    const finalState = cloneOptimizerState(engine.getState()!);
    const metadata = engine.getRunMetadata()!;
    const telemetryData = deepClone(engine.getTelemetry().getData());
    const completionReason = engine.getCompletionReason();
    engine.dispose();
    return {
      finalState,
      telemetry: telemetryData,
      completionReason,
      evaluations: finalState.evaluations,
      iterations: finalState.iteration,
      runMetadata: metadata,
      stateHash: JSON.stringify(finalState),
    };
  }

  private checkCompatibility(optimizer: Optimizer, world: OptimizationWorld): CompatibilityResult {
    const capabilities = optimizer.getCapabilities?.() ?? {
      population: true,
      singleAgent: true,
      constraints: true,
      noisyObjective: true,
      dynamicObjective: true,
      variablePopulation: true,
      roles: true,
      events: true,
      personalMemory: true,
    };
    const worldCapabilities = world.getCapabilities();
    const reasons: string[] = [];
    let level: CompatibilityLevel = 'SUPPORTED';

    if (worldCapabilities.constrained && !capabilities.constraints) {
      reasons.push('Optimizer does not declare constraint support.');
      level = 'UNSUPPORTED';
    }
    if (worldCapabilities.noisy && !capabilities.noisyObjective) {
      reasons.push('Optimizer does not declare noisy-objective support.');
      if (level !== 'UNSUPPORTED') level = 'SUPPORTED_WITH_CAUTION';
    }
    if (worldCapabilities.dynamic && !capabilities.dynamicObjective) {
      reasons.push('Optimizer does not declare dynamic-objective support.');
      if (level !== 'UNSUPPORTED') level = 'SUPPORTED_WITH_CAUTION';
    }
    if (reasons.length === 0) reasons.push('Optimizer and world capabilities are compatible.');
    return { level, reasons };
  }

  getBoundRevision(): number {
    return this.boundRevision;
  }

  hasRun(): boolean {
    return this.config !== null && this.state !== null;
  }

  isViewingHistory(): boolean {
    return this.displayIndex !== null;
  }

  getDisplayIndex(): number | null {
    return this.displayIndex;
  }

  isReplaying(): boolean {
    return this.replaying;
  }

  notifyWorldChanged(): void {
    this.checkRevision();
  }

  exportRunConfiguration(): string {
    return this.config ? JSON.stringify(this.config, null, 2) : '';
  }

  dispose(): void {
    this.optimizer?.dispose?.();
    this.optimizer = null;
    this.config = null;
    this.state = null;
    this.previousState = null;
    this.evaluation = null;
    this.history.clear();
    this.telemetry.clear();
  }

  // ---------------------------------------------------------------- internals
  private createContext(): OptimizerContext {
    if (!this.config || !this.evaluation || !this.initialPopulation) {
      throw new Error('Simulation not initialized');
    }
    return {
      world: this.world,
      evaluation: this.evaluation,
      constraints: this.constraints,
      random: this.random,
      iteration: this.clock.iteration,
      evaluations: this.evaluation.getCount(),
      maxEvaluations: this.config.maxEvaluations,
      boundaryPolicy: this.config.boundaryPolicy,
      objectiveMode: this.config.objectiveMode,
      domain: this.world.getConfig().domain,
      initialPopulation: this.initialPopulation,
      parameters: this.config.optimizerParameters,
      simulationTime: this.clock.simulationTime,
      logicalDelta: this.clock.logicalDelta,
    };
  }

  private finalizeState(raw: OptimizerState, iteration: number, events: OptimizerEvent[]): OptimizerState {
    const state = cloneOptimizerState(raw);
    state.iteration = iteration;
    state.evaluations = this.evaluation?.getCount() ?? 0;
    state.events = events.map(e => ({
      ...e,
      candidateIds: e.candidateIds ? [...e.candidateIds] : undefined,
      data: e.data ? deepClone(e.data) : undefined,
    }));

    const { statistics, best } = computeStatistics(state.candidates, this.constraints);
    state.statistics = statistics;
    state.best = best;
    return state;
  }

  private validateState(state: OptimizerState, previousEvaluations: number): string | null {
    if (!state || !Array.isArray(state.candidates)) {
      return 'Invalid candidate state detected: optimizer returned no candidate array.';
    }
    if (state.candidates.length === 0) {
      return 'Invalid candidate state detected: optimizer returned an empty population.';
    }

    const ids = new Set<string>();
    for (const candidate of state.candidates) {
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        return 'Invalid candidate state detected: candidate missing id.';
      }
      if (ids.has(candidate.id)) {
        return `Invalid candidate state detected: duplicate candidate id "${candidate.id}".`;
      }
      ids.add(candidate.id);
      if (!isFiniteVector(candidate.position)) {
        return `Invalid candidate state detected: non-finite position for ${candidate.id}.`;
      }
      if (!Number.isFinite(candidate.fitness)) {
        return `Invalid candidate state detected: non-finite fitness for ${candidate.id}.`;
      }
      if (typeof candidate.active !== 'boolean') {
        return `Invalid candidate state detected: missing active flag for ${candidate.id}.`;
      }
    }

    if (!state.best || !isFiniteVector(state.best.position) || !Number.isFinite(state.best.fitness)) {
      return 'Invalid candidate state detected: malformed best candidate.';
    }

    const evaluations = this.evaluation?.getCount() ?? 0;
    if (evaluations < previousEvaluations) {
      return 'Invalid candidate state detected: evaluation count decreased.';
    }
    if (this.config && evaluations > this.config.maxEvaluations) {
      return 'Invalid candidate state detected: evaluation budget exceeded.';
    }
    return null;
  }

  private captureSnapshot(state: OptimizerState, events: OptimizerEvent[]): void {
    const snapshot: SimulationSnapshot = {
      iteration: state.iteration,
      evaluations: state.evaluations,
      simulationTime: state.iteration * this.clock.logicalDelta,
      candidates: state.candidates.map(c => cloneCandidateForSnapshot(c)),
      best: {
        candidateId: state.best.candidateId,
        position: { ...state.best.position },
        fitness: state.best.fitness,
      },
      statistics: { ...state.statistics },
      events: events.map(e => ({
        ...e,
        candidateIds: e.candidateIds ? [...e.candidateIds] : undefined,
        data: e.data ? deepClone(e.data) : undefined,
      })),
      algorithmState: state.algorithmState ? deepClone(state.algorithmState) : undefined,
    };

    this.history.push(snapshot);
    this.telemetry.record(snapshot, this.distanceToReference(state.best.position));
  }

  private distanceToReference(position: { x: number; y: number }): number {
    const reference = this.world.getGlobalMinima()[0];
    if (!reference) return NaN;
    return Math.hypot(position.x - reference.x1, position.y - reference.x2);
  }

  private targetReached(state: OptimizerState): boolean {
    if (!this.config || this.config.targetFitness === undefined) return false;
    const tolerance = this.config.targetTolerance ?? 1e-6;
    return Math.abs(state.best.fitness - this.config.targetFitness) <= tolerance;
  }

  private complete(reason: CompletionReason): void {
    this.status = 'COMPLETED';
    this.completionReason = reason;
    this.clock.running = false;
    this.renderAlpha = 1;
    this.eventBus.publish(reason === 'max-evaluations' ? 'budget-exhausted' : 'run-completed', {
      iteration: this.clock.iteration,
      data: { reason },
    });
    this.callbacks.onStateChange?.(this);
  }

  private fail(message: string): void {
    this.status = 'FAILED';
    this.errorMessage = message;
    this.failedIteration = this.clock.iteration;
    this.clock.running = false;
    this.renderAlpha = 1;
    this.eventBus.publish('candidate-invalid', {
      iteration: this.clock.iteration,
      data: { message },
    });
    this.callbacks.onStateChange?.(this);
  }

  private failFromError(error: unknown): void {
    this.fail(error instanceof Error ? error.message : String(error));
  }

  private checkRevision(): boolean {
    if (!this.config) return false;
    if (this.world.getRevision() === this.boundRevision) return false;
    if (this.status !== 'STALE') {
      this.status = 'STALE';
      this.errorMessage = 'World changed. This simulation is based on the previous world definition.';
      this.clock.running = false;
      this.renderAlpha = 1;
      this.eventBus.publish('world-revision-changed', {
        iteration: this.clock.iteration,
        data: { revision: this.world.getRevision() },
      });
      this.callbacks.onStateChange?.(this);
    }
    return true;
  }
}

function isFiniteVector(v: { x: number; y: number } | undefined): boolean {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y);
}

function snapshotToStateShallow(snapshot: SimulationSnapshot): OptimizerState {
  return {
    iteration: snapshot.iteration,
    evaluations: snapshot.evaluations,
    candidates: snapshot.candidates,
    best: snapshot.best,
    statistics: snapshot.statistics,
    events: snapshot.events,
    algorithmState: snapshot.algorithmState,
  };
}

function cloneCandidateForSnapshot(candidate: CandidateState): CandidateState {
  return {
    ...candidate,
    position: { ...candidate.position },
    previousPosition: { ...candidate.previousPosition },
    bestPosition: candidate.bestPosition ? { ...candidate.bestPosition } : undefined,
    metadata: candidate.metadata ? deepClone(candidate.metadata) : undefined,
  };
}

function makeRunId(seed: number): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `run-${seed}-${Date.now().toString(36)}-${suffix}`;
}

export function createDefaultRunConfiguration(
  world: OptimizationWorld,
  setup: RunSetup,
): RunConfiguration {
  const descriptor = getOptimizerDescriptor(setup.optimizerId);
  return {
    runId: setup.runId ?? makeRunId(setup.seed ?? 42),
    worldId: world.getConfig().functionId,
    worldRevision: world.getRevision(),
    optimizerId: setup.optimizerId,
    seed: Math.floor(setup.seed ?? 42),
    populationSize: Math.max(1, Math.floor(setup.populationSize ?? descriptor?.defaultPopulationSize ?? 30)),
    maxIterations: Math.max(1, Math.floor(setup.maxIterations ?? 500)),
    maxEvaluations: Math.max(1, Math.floor(setup.maxEvaluations ?? 5000)),
    boundaryPolicy: setup.boundaryPolicy ?? 'reflect',
    objectiveMode: setup.objectiveMode ?? 'observed',
    logicalDelta: setup.logicalDelta ?? 0.2,
    iterationsPerSecond: setup.iterationsPerSecond ?? 5,
    targetFitness: setup.targetFitness,
    targetTolerance: setup.targetTolerance,
    optimizerParameters: deepClone(setup.optimizerParameters ?? {}),
    createdAt: setup.createdAt ?? new Date().toISOString(),
  };
}
