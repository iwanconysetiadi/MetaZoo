import type {
  CandidateState, Optimizer, OptimizerCapabilities, OptimizerContext, OptimizerEvent,
  OptimizerState, OptimizerStepResult,
} from '../types';
import { cloneVector, emptyStatistics } from '../types';
import { resolvePosition } from '../BoundaryPolicy';

/**
 * Single-agent gradient descent. Validates world gradient access, trajectory
 * rendering, deterministic state and local-minimum behaviour.
 */
export class GradientDescentOptimizer implements Optimizer {
  readonly id = 'gradient-descent';
  readonly name = 'Gradient Descent';
  readonly populationBased = false;
  readonly defaultPopulationSize = 1;

  private candidate: CandidateState | null = null;
  private state: OptimizerState | null = null;
  private eventCounter = 0;

  initialize(context: OptimizerContext): void {
    this.eventCounter = 0;
    const position = context.initialPopulation.positions[0] ?? {
      x: (context.domain.x1Min + context.domain.x1Max) / 2,
      y: (context.domain.x2Min + context.domain.x2Max) / 2,
    };
    const result = context.evaluation.evaluate(position);
    this.candidate = {
      id: 'gd-0',
      position: cloneVector(position),
      previousPosition: cloneVector(position),
      fitness: result.value,
      bestPosition: cloneVector(position),
      bestFitness: result.value,
      role: { id: 'single-agent' },
      active: true,
      metadata: { stepSize: 0 },
    };
    this.state = this.buildState(context);
  }

  step(context: OptimizerContext): OptimizerStepResult {
    const events: OptimizerEvent[] = [];
    if (!this.candidate) return { events };
    if (context.evaluation.getRemaining() < 1) return { events };

    const previousBest = this.candidate.bestFitness ?? Infinity;
    const parameters = context.parameters;
    const learningRate = numberParam(parameters, 'learningRate', 0.08);
    const maxStepFraction = numberParam(parameters, 'maxStepFraction', 0.12);

    const gradient = context.world.gradient(this.candidate.position.x, this.candidate.position.y);
    if (!Number.isFinite(gradient.x) || !Number.isFinite(gradient.y)) {
      return { events };
    }

    const span = Math.max(
      context.domain.x1Max - context.domain.x1Min,
      context.domain.x2Max - context.domain.x2Min,
    );
    const maxStep = maxStepFraction * span;

    let dx = -learningRate * gradient.x;
    let dy = -learningRate * gradient.y;
    const length = Math.hypot(dx, dy);
    if (length > maxStep && length > 0) {
      dx *= maxStep / length;
      dy *= maxStep / length;
    }

    const proposal = {
      x: this.candidate.position.x + dx,
      y: this.candidate.position.y + dy,
    };
    const position = resolvePosition(
      proposal, context.domain, context.boundaryPolicy,
      context.random, context.constraints,
    );
    const result = context.evaluation.evaluate(position);

    this.candidate.previousPosition = cloneVector(this.candidate.position);
    this.candidate.previousFitness = this.candidate.fitness;
    this.candidate.position = cloneVector(position);
    this.candidate.fitness = result.value;
    this.candidate.metadata = { stepSize: Math.hypot(dx, dy) };

    if (this.candidate.bestFitness === undefined || result.value < this.candidate.bestFitness) {
      this.candidate.bestPosition = cloneVector(position);
      this.candidate.bestFitness = result.value;
      if (result.value < previousBest) {
        events.push(this.event(context, 'best-improved', {
          fitness: result.value,
        }));
      }
    }

    this.state = this.buildState(context);
    return { events };
  }

  getState(): OptimizerState {
    if (!this.state) {
      return {
        iteration: 0,
        evaluations: 0,
        candidates: [],
        best: { position: { x: 0, y: 0 }, fitness: Infinity },
        statistics: emptyStatistics(),
        events: [],
      };
    }
    return this.state;
  }

  reset(context: OptimizerContext): void {
    this.initialize(context);
  }

  getCapabilities(): OptimizerCapabilities {
    return {
      population: false,
      singleAgent: true,
      constraints: true,
      noisyObjective: true,
      dynamicObjective: true,
      variablePopulation: false,
      roles: false,
      events: true,
      personalMemory: true,
    };
  }

  private buildState(context: OptimizerContext): OptimizerState {
    const candidate = this.candidate!;
    return {
      iteration: context.iteration,
      evaluations: context.evaluation.getCount(),
      candidates: [candidate],
      best: {
        candidateId: candidate.id,
        position: cloneVector(candidate.position),
        fitness: candidate.fitness,
      },
      statistics: emptyStatistics(),
      events: [],
      algorithmState: {
        learningRate: numberParam(context.parameters, 'learningRate', 0.08),
        gradientMagnitude: Math.hypot(
          context.world.gradient(candidate.position.x, candidate.position.y).x,
          context.world.gradient(candidate.position.x, candidate.position.y).y,
        ),
      },
    };
  }

  private event(context: OptimizerContext, type: string, data?: Record<string, unknown>): OptimizerEvent {
    return {
      id: `${type}-${context.iteration}-${this.eventCounter++}`,
      type,
      iteration: context.iteration,
      candidateIds: this.candidate ? [this.candidate.id] : undefined,
      data,
    };
  }
}

function numberParam(parameters: Record<string, unknown>, key: string, fallback: number): number {
  const value = parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
