import { describe, it, expect } from 'vitest';
import { OptimizationWorld, createDefaultConfig } from '../src/core/world/OptimizationWorld';
import { SeededRandom } from '../src/core/simulation/SeededRandom';
import { applyBoundary, resolvePosition } from '../src/core/simulation/BoundaryPolicy';
import { ConstraintService } from '../src/core/simulation/ConstraintService';
import {
  EvaluationBudgetExceededError, EvaluationService,
} from '../src/core/simulation/EvaluationService';
import { SimulationEngine } from '../src/core/simulation/SimulationEngine';
import type { RunSetup } from '../src/core/simulation/SimulationEngine';
import {
  createOptimizer, listOptimizerDescriptors,
} from '../src/core/simulation/optimizers/registry';
import { buildChallengeObjective } from '../src/core/custom/ChallengeObjective';
import { CHALLENGE_PRESETS } from '../src/core/custom/factory';
import type { BoundaryPolicy } from '../src/core/simulation/types';

const DOMAIN = { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 };

function makeWorld(): OptimizationWorld {
  return new OptimizationWorld(createDefaultConfig());
}

function makeEngine(setup: Partial<RunSetup> = {}): SimulationEngine {
  const world = makeWorld();
  return new SimulationEngine(world);
}

function setupEngine(
  engine: SimulationEngine,
  overrides: Partial<RunSetup> = {},
): void {
  engine.initialize({
    optimizerId: 'random-search',
    seed: 123,
    populationSize: 8,
    maxEvaluations: 10000,
    maxIterations: 500,
    boundaryPolicy: 'reflect',
    ...overrides,
  });
}

function signature(engine: SimulationEngine): string {
  const state = engine.getState();
  if (!state) return 'none';
  return JSON.stringify({
    iteration: state.iteration,
    evaluations: state.evaluations,
    candidates: state.candidates.map(c => [c.id, c.position.x, c.position.y, c.fitness]),
  });
}

function loadChallenge(world: OptimizationWorld, id: string): void {
  const preset = CHALLENGE_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error(`Missing preset ${id}`);
  const built = buildChallengeObjective(preset.build(), 0);
  world.setObjective(built.objective, built.domain as any);
}

describe('SeededRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('restores its exact state', () => {
    const random = new SeededRandom(7);
    for (let i = 0; i < 5; i++) random.next();
    const state = random.getState();
    const expected = random.next();
    random.setState(state);
    expect(random.next()).toBe(expected);
  });

  it('produces stable ranges and integers', () => {
    const random = new SeededRandom(99);
    for (let i = 0; i < 50; i++) {
      const value = random.range(-2, 3);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(3);
      const integer = random.int(0, 4);
      expect(Number.isInteger(integer)).toBe(true);
      expect(integer).toBeGreaterThanOrEqual(0);
      expect(integer).toBeLessThanOrEqual(4);
    }
  });
});

describe('BoundaryPolicy', () => {
  const random = () => new SeededRandom(11);

  it('clamps outside positions into the domain', () => {
    const result = applyBoundary({ x: 12, y: -9 }, DOMAIN, 'clamp', random());
    expect(result).toEqual({ x: 5, y: -5 });
  });

  it('reflects outside positions back into the domain', () => {
    const result = applyBoundary({ x: 6.5, y: -6.5 }, DOMAIN, 'reflect', random());
    expect(result.x).toBeCloseTo(3.5, 8);
    expect(result.y).toBeCloseTo(-3.5, 8);
  });

  it('wraps outside positions', () => {
    const result = applyBoundary({ x: 6, y: -6 }, DOMAIN, 'wrap', random());
    expect(result.x).toBeCloseTo(-4, 8);
    expect(result.y).toBeCloseTo(4, 8);
  });

  it('rejects by resampling inside the domain', () => {
    const result = applyBoundary({ x: 20, y: -20 }, DOMAIN, 'reject', random());
    expect(result.x).toBeGreaterThanOrEqual(DOMAIN.x1Min);
    expect(result.x).toBeLessThanOrEqual(DOMAIN.x1Max);
    expect(result.y).toBeGreaterThanOrEqual(DOMAIN.x2Min);
    expect(result.y).toBeLessThanOrEqual(DOMAIN.x2Max);
  });

  it('resamples infeasible proposals onto a feasible point', () => {
    const world = makeWorld();
    loadChallenge(world, 'restricted-sanctuary');
    const constraints = new ConstraintService(world);
    const resolved = resolvePosition(
      { x: 5, y: 5 }, world.getConfig().domain,
      'clamp' as BoundaryPolicy, new SeededRandom(3), constraints,
    );
    expect(constraints.isFeasible(resolved.x, resolved.y)).toBe(true);
  });
});

describe('EvaluationService', () => {
  it('counts every evaluation and enforces the budget', () => {
    const world = makeWorld();
    const constraints = new ConstraintService(world);
    const evaluation = new EvaluationService(world, constraints, 3);
    evaluation.evaluate({ x: 0, y: 0 });
    evaluation.evaluate({ x: 1, y: 1 });
    expect(evaluation.getCount()).toBe(2);
    evaluation.evaluateTrue({ x: 2, y: 2 });
    expect(evaluation.getCount()).toBe(3);
    expect(evaluation.isExhausted()).toBe(true);
    expect(() => evaluation.evaluate({ x: 0, y: 0 })).toThrow(EvaluationBudgetExceededError);
  });

  it('separates true and observed values on noisy worlds', () => {
    const world = makeWorld();
    loadChallenge(world, 'noisy-valley');
    const evaluation = new EvaluationService(world, new ConstraintService(world));
    const point = { x: 0.75, y: -1.25 };
    const trueResult = evaluation.evaluateTrue(point);
    const observedResult = evaluation.evaluateObserved(point);
    expect(Number.isFinite(trueResult.value)).toBe(true);
    expect(Number.isFinite(observedResult.value)).toBe(true);
    expect(observedResult.value).not.toBe(trueResult.value);
    expect(evaluation.getCount()).toBe(2);
  });

  it('records an optional evaluation audit', () => {
    const world = makeWorld();
    const evaluation = new EvaluationService(world, new ConstraintService(world));
    evaluation.enableAudit(true);
    evaluation.evaluate({ x: 0.5, y: -0.5 }, 'initialization');
    expect(evaluation.getAuditLog()).toHaveLength(1);
    expect(evaluation.getAuditLog()[0].source).toBe('initialization');
    expect(evaluation.getAuditLog()[0].number).toBe(1);
  });

  it('reports feasibility through the shared constraint service', () => {
    const world = makeWorld();
    loadChallenge(world, 'restricted-sanctuary');
    const constraints = new ConstraintService(world);
    expect(constraints.isFeasible(0, 0)).toBe(true);
    expect(constraints.isFeasible(5, 5)).toBe(false);
  });
});

describe('Optimizer registry', () => {
  it('exposes the reference optimizers', () => {
    const ids = listOptimizerDescriptors().map(d => d.id);
    expect(ids).toContain('random-search');
    expect(ids).toContain('gradient-descent');
    expect(ids).toContain('test-swarm');
  });

  it('creates known optimizers and rejects unknown ones', () => {
    expect(createOptimizer('random-search')).toBeTruthy();
    expect(createOptimizer('does-not-exist')).toBeNull();
  });
});

describe('SimulationEngine', () => {
  it('is deterministic for a seed and configuration', () => {
    const a = makeEngine();
    const b = makeEngine();
    setupEngine(a);
    setupEngine(b);
    for (let i = 0; i < 10; i++) {
      a.stepOnce();
      b.stepOnce();
    }
    expect(signature(a)).toBe(signature(b));
  });

  it('reproduces the same run after reset', () => {
    const engine = makeEngine();
    setupEngine(engine);
    for (let i = 0; i < 8; i++) engine.stepOnce();
    const before = signature(engine);
    const iterationBefore = engine.getState()?.iteration;

    engine.reset();
    expect(engine.getStatus()).toBe('READY');
    for (let i = 0; i < 8; i++) engine.stepOnce();

    expect(engine.getState()?.iteration).toBe(iterationBefore);
    expect(signature(engine)).toBe(before);
  });

  it('produces identical logical states regardless of playback speed', () => {
    const a = makeEngine();
    const b = makeEngine();
    setupEngine(a);
    setupEngine(b);
    a.setPlaybackSpeed(1);
    b.setPlaybackSpeed(2);
    a.play();
    b.play();
    for (let i = 0; i < 10; i++) {
      a.advance(1 / (5 * 1));
      b.advance(1 / (5 * 2));
    }
    expect(a.getState()?.iteration).toBe(10);
    expect(b.getState()?.iteration).toBe(10);
    expect(signature(a)).toBe(signature(b));
  });

  it('completes when the iteration cap is reached', () => {
    const engine = makeEngine();
    setupEngine(engine, { maxIterations: 3, populationSize: 4 });
    for (let i = 0; i < 3; i++) engine.stepOnce();
    expect(engine.getStatus()).toBe('COMPLETED');
    expect(engine.getCompletionReason()).toBe('max-iterations');
  });

  it('completes when the evaluation budget is exhausted', () => {
    const engine = makeEngine();
    setupEngine(engine, { populationSize: 4, maxEvaluations: 9, maxIterations: 100 });
    for (let i = 0; i < 30 && engine.getStatus() !== 'COMPLETED'; i++) engine.stepOnce();
    expect(engine.getStatus()).toBe('COMPLETED');
    expect(engine.getCompletionReason()).toBe('max-evaluations');
    expect(engine.getEvaluationCount()).toBeLessThanOrEqual(9);
  });

  it('supports an explicit manual stop', () => {
    const engine = makeEngine();
    setupEngine(engine);
    engine.stop();
    expect(engine.getStatus()).toBe('COMPLETED');
    expect(engine.getCompletionReason()).toBe('manual-stop');
  });

  it('detects target fitness completion', () => {
    const engine = makeEngine();
    setupEngine(engine, { targetFitness: 0, targetTolerance: 1e9 });
    engine.stepOnce();
    expect(engine.getStatus()).toBe('COMPLETED');
    expect(engine.getCompletionReason()).toBe('target-reached');
  });

  it('marks the run stale when the world revision changes, then recovers on reset', () => {
    const world = makeWorld();
    const engine = new SimulationEngine(world);
    setupEngine(engine);
    expect(engine.getStatus()).toBe('READY');

    world.setFunction('rastrigin');
    engine.advance(0.2);
    expect(engine.getStatus()).toBe('STALE');

    engine.reset();
    expect(engine.getStatus()).toBe('READY');
    expect(engine.getBoundRevision()).toBe(world.getRevision());
  });

  it('reports N/A diversity for single-candidate optimizers', () => {
    const engine = makeEngine();
    setupEngine(engine, { optimizerId: 'gradient-descent', populationSize: 1 });
    const state = engine.getState();
    expect(state?.statistics.candidateCount).toBe(1);
    expect(state?.statistics.diversity).toBe(0);
  });

  it('records telemetry and supports history scrubbing', () => {
    const engine = makeEngine();
    setupEngine(engine, { maxIterations: 20 });
    for (let i = 0; i < 5; i++) engine.stepOnce();

    const telemetry = engine.getTelemetry().getData();
    expect(telemetry.iteration.length).toBeGreaterThanOrEqual(6);
    expect(Number.isFinite(telemetry.bestFitness[telemetry.bestFitness.length - 1])).toBe(true);

    engine.scrubTo(2);
    expect(engine.isViewingHistory()).toBe(true);
    expect(engine.getDisplayedState()?.iteration).toBe(2);

    engine.returnToLive();
    expect(engine.isViewingHistory()).toBe(false);
    expect(engine.getDisplayedState()?.iteration).toBe(5);
  });

  it('produces identical headless results for the same seed', () => {
    const setup = {
      optimizerId: 'random-search',
      seed: 123,
      populationSize: 8,
      maxEvaluations: 1000,
      maxIterations: 5,
      boundaryPolicy: 'reflect' as const,
    };
    const a = SimulationEngine.runHeadless(makeWorld(), setup);
    const b = SimulationEngine.runHeadless(makeWorld(), setup);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.evaluations).toBe(b.evaluations);
    expect(a.iterations).toBe(b.iterations);
    expect(a.completionReason).toBe(b.completionReason);
    expect(a.telemetry.iteration).toEqual(b.telemetry.iteration);
  });

  it('resumes deterministically from a checkpoint', () => {
    const a = makeEngine();
    setupEngine(a, { maxIterations: 10 });
    for (let i = 0; i < 5; i++) a.stepOnce();

    const b = makeEngine();
    setupEngine(b, { maxIterations: 10 });
    for (let i = 0; i < 5; i++) b.stepOnce();
    const checkpoint = b.createCheckpoint()!;
    b.resumeFromCheckpoint(checkpoint);
    for (let i = 5; i < 10; i++) b.stepOnce();
    for (let i = 5; i < 10; i++) a.stepOnce();

    expect(signature(a)).toBe(signature(b));
    expect(a.getStateHash()).toBe(b.getStateHash());
  });

  it('exposes capability declarations', () => {
    const optimizer = createOptimizer('random-search')!;
    expect(optimizer.getCapabilities?.().population).toBe(true);
    const world = makeWorld();
    expect(world.getCapabilities().deterministic).toBe(true);
    const engine = makeEngine();
    setupEngine(engine);
    expect(engine.getCompatibility()).toBeTruthy();
  });

  it('serializes the run configuration', () => {
    const engine = makeEngine();
    setupEngine(engine, { seed: 777, maxEvaluations: 321 });
    const parsed = JSON.parse(engine.exportRunConfiguration());
    expect(parsed.seed).toBe(777);
    expect(parsed.maxEvaluations).toBe(321);
    expect(parsed.optimizerId).toBe('random-search');
    expect(typeof parsed.runId).toBe('string');
    expect(parsed.worldRevision).toBe(engine.getBoundRevision());
  });

  it('advances the dynamic world on the logical timeline', () => {
    const world = makeWorld();
    loadChallenge(world, 'moving-oasis');
    const engine = new SimulationEngine(world);
    setupEngine(engine, { maxIterations: 20 });
    engine.play();
    for (let i = 0; i < 5; i++) engine.advance(0.2);
    expect(engine.getState()?.iteration).toBe(5);
    expect(world.getSimTime()).toBeCloseTo(5 * 0.2, 8);
  });
});
