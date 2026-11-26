import type { Vector2 } from '../math/Types';
import type { TelemetryData } from './Telemetry';
import type { OptimizationWorld } from '../world/OptimizationWorld';
import type { SeededRandom } from './SeededRandom';
import type { EvaluationService } from './EvaluationService';
import type { ConstraintService } from './ConstraintService';

export type BoundaryPolicy = 'clamp' | 'reflect' | 'reject' | 'wrap';
export type ObjectiveMode = 'observed' | 'true';

export type SimulationStatus =
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'STALE';

export type CompletionReason =
  | 'max-iterations'
  | 'max-evaluations'
  | 'target-reached'
  | 'manual-stop'
  | 'algorithm-termination';

export interface CandidateRole {
  id: string;
  label?: string;
  rank?: number;
  metadata?: Record<string, unknown>;
}

export interface CandidateState {
  id: string;
  position: Vector2;
  previousPosition: Vector2;
  fitness: number;
  previousFitness?: number;
  bestPosition?: Vector2;
  bestFitness?: number;
  role?: CandidateRole;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface OptimizerStatistics {
  bestFitness: number;
  meanFitness: number;
  worstFitness: number;
  medianFitness: number;
  diversity: number;
  feasibleRatio: number;
  candidateCount: number;
}

export interface OptimizerEvent {
  id: string;
  type: string;
  iteration: number;
  candidateIds?: string[];
  data?: Record<string, unknown>;
}

export interface OptimizerState {
  iteration: number;
  evaluations: number;
  candidates: CandidateState[];
  best: {
    candidateId?: string;
    position: Vector2;
    fitness: number;
  };
  statistics: OptimizerStatistics;
  events: OptimizerEvent[];
  algorithmState?: Record<string, unknown>;
}

export interface OptimizerStepResult {
  events: OptimizerEvent[];
  terminated?: boolean;
  terminationReason?: string;
}

export interface EvaluationResult {
  position: Vector2;
  trueValue: number;
  observedValue: number;
  value: number;
  feasible: boolean;
  violation: number;
}

export interface InitialPopulation {
  id: string;
  seed: number;
  positions: Vector2[];
}

export interface OptimizerContext {
  world: OptimizationWorld;
  evaluation: EvaluationService;
  constraints: ConstraintService;
  random: SeededRandom;
  iteration: number;
  evaluations: number;
  maxEvaluations: number;
  boundaryPolicy: BoundaryPolicy;
  objectiveMode: ObjectiveMode;
  domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number };
  initialPopulation: InitialPopulation;
  parameters: Record<string, unknown>;
  simulationTime: number;
  logicalDelta: number;
}

export interface Optimizer {
  readonly id: string;
  readonly name: string;
  readonly populationBased: boolean;
  readonly defaultPopulationSize: number;

  initialize(context: OptimizerContext): void;
  step(context: OptimizerContext): OptimizerStepResult;
  getState(): OptimizerState;
  reset(context: OptimizerContext): void;
  dispose?(): void;
  getCapabilities?(): OptimizerCapabilities;
}

export interface OptimizerCapabilities {
  population: boolean;
  singleAgent: boolean;
  constraints: boolean;
  noisyObjective: boolean;
  dynamicObjective: boolean;
  variablePopulation: boolean;
  roles: boolean;
  events: boolean;
  personalMemory: boolean;
}

export interface WorldCapabilities {
  constrained: boolean;
  noisy: boolean;
  dynamic: boolean;
  deterministic: boolean;
  knownGlobalOptimum: boolean;
}

export type CompatibilityLevel = 'SUPPORTED' | 'SUPPORTED_WITH_CAUTION' | 'UNSUPPORTED';

export interface CompatibilityResult {
  level: CompatibilityLevel;
  reasons: string[];
}

export interface OptimizerDescriptor {
  id: string;
  name: string;
  description: string;
  populationBased: boolean;
  defaultPopulationSize: number;
  engineTest?: boolean;
}

export interface RunMetadata {
  runId: string;
  worldId: string;
  worldRevision: number;
  optimizerId: string;
  optimizerVersion?: string;
  seed: number;
  populationSize?: number;
  maxEvaluations?: number;
  maxIterations?: number;
  initialPopulationId?: string;
  boundaryPolicy: BoundaryPolicy;
  objectiveMode: ObjectiveMode;
  logicalDelta: number;
  iterationsPerSecond: number;
  targetFitness?: number;
  targetTolerance?: number;
  optimizerParameters: Record<string, unknown>;
  createdAt: string;
}

export interface RunConfiguration {
  runId: string;
  worldId: string;
  worldRevision: number;
  optimizerId: string;
  seed: number;
  populationSize: number;
  maxIterations: number;
  maxEvaluations: number;
  boundaryPolicy: BoundaryPolicy;
  objectiveMode: ObjectiveMode;
  logicalDelta: number;
  iterationsPerSecond: number;
  targetFitness?: number;
  targetTolerance?: number;
  optimizerParameters: Record<string, unknown>;
  createdAt: string;
}

export interface SimulationSnapshot {
  iteration: number;
  evaluations: number;
  simulationTime: number;
  candidates: CandidateState[];
  best: OptimizerState['best'];
  statistics: OptimizerStatistics;
  events: OptimizerEvent[];
  algorithmState?: Record<string, unknown>;
}

export interface RenderFrame {
  previous: OptimizerState | null;
  current: OptimizerState;
  alpha: number;
}

export interface SimulationEngineEvent {
  type: 'run-initialized' | 'run-started' | 'run-paused' | 'run-resumed' | 'run-reset'
    | 'run-completed' | 'budget-exhausted' | 'candidate-invalid'
    | 'world-revision-changed' | 'checkpoint-created';
  iteration: number;
  data?: Record<string, unknown>;
}

export interface Checkpoint {
  schemaVersion: number;
  iteration: number;
  evaluations: number;
  simulationTime: number;
  optimizerId: string;
  optimizerState: OptimizerState;
  randomState: number;
  worldRevision: number;
  worldSimTime: number;
  telemetry: unknown;
  historySize: number;
  createdAt: string;
}

export interface HeadlessRunResult {
  finalState: OptimizerState;
  telemetry: TelemetryData;
  completionReason: CompletionReason | null;
  evaluations: number;
  iterations: number;
  runMetadata: RunMetadata;
  stateHash: string;
}

export const DEFAULT_LOGICAL_DELTA = 0.2;
export const DEFAULT_ITERATIONS_PER_SECOND = 5;

export function emptyStatistics(): OptimizerStatistics {
  return {
    bestFitness: Infinity,
    meanFitness: Infinity,
    worstFitness: Infinity,
    medianFitness: Infinity,
    diversity: 0,
    feasibleRatio: 0,
    candidateCount: 0,
  };
}

export function cloneVector(v: Vector2): Vector2 {
  return { x: v.x, y: v.y };
}

export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (sc) return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneCandidate(candidate: CandidateState): CandidateState {
  return {
    ...candidate,
    position: cloneVector(candidate.position),
    previousPosition: cloneVector(candidate.previousPosition),
    bestPosition: candidate.bestPosition ? cloneVector(candidate.bestPosition) : undefined,
    metadata: candidate.metadata ? deepClone(candidate.metadata) : undefined,
  };
}

export function cloneOptimizerState(state: OptimizerState): OptimizerState {
  return {
    iteration: state.iteration,
    evaluations: state.evaluations,
    candidates: state.candidates.map(cloneCandidate),
    best: {
      candidateId: state.best.candidateId,
      position: cloneVector(state.best.position),
      fitness: state.best.fitness,
    },
    statistics: { ...state.statistics },
    events: state.events.map(e => ({ ...e, candidateIds: e.candidateIds ? [...e.candidateIds] : undefined, data: e.data ? deepClone(e.data) : undefined })),
    algorithmState: state.algorithmState ? deepClone(state.algorithmState) : undefined,
  };
}

export function snapshotToState(snapshot: SimulationSnapshot): OptimizerState {
  return {
    iteration: snapshot.iteration,
    evaluations: snapshot.evaluations,
    candidates: snapshot.candidates.map(cloneCandidate),
    best: {
      candidateId: snapshot.best.candidateId,
      position: cloneVector(snapshot.best.position),
      fitness: snapshot.best.fitness,
    },
    statistics: { ...snapshot.statistics },
    events: snapshot.events.map(e => ({ ...e, candidateIds: e.candidateIds ? [...e.candidateIds] : undefined })),
    algorithmState: snapshot.algorithmState ? deepClone(snapshot.algorithmState) : undefined,
  };
}
