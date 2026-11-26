import type {
  CandidateState, Optimizer, OptimizerContext, OptimizerEvent,
  OptimizerState, OptimizerStepResult,
} from '../types';
import { cloneVector, emptyStatistics } from '../types';
import { sampleUniform, resolvePosition } from '../BoundaryPolicy';

/**
 * Minimal reference optimizer used to validate the simulation engine:
 * evaluation service, seeded RNG, budget accounting, candidate rendering,
 * telemetry and deterministic reset.
 */
export class RandomSearchOptimizer implements Optimizer {
  readonly id = 'random-search';
  readonly name = 'Random Search';
  readonly populationBased = true;
  readonly defaultPopulationSize = 30;

  private candidates: CandidateState[] = [];
  private state: OptimizerState | null = null;
  private eventCounter = 0;

  initialize(context: OptimizerContext): void {
    this.eventCounter = 0;
    this.candidates = context.initialPopulation.positions.map((position, index) => {
      const result = context.evaluation.evaluate(position);
      return {
        id: `rs-${index}`,
        position: cloneVector(position),
        previousPosition: cloneVector(position),
        fitness: result.value,
        previousFitness: undefined,
        bestPosition: cloneVector(position),
        bestFitness: result.value,
        role: 'candidate',
        active: true,
      };
    });
    this.state = this.buildState(context);
  }

  step(context: OptimizerContext): OptimizerStepResult {
    const events: OptimizerEvent[] = [];
    const previousBest = this.state?.best.fitness ?? Infinity;
    const remaining = context.evaluation.getRemaining();
    const budgeted = Math.min(this.candidates.length, remaining);
    if (budgeted <= 0) return { events };

    for (let i = 0; i < budgeted; i++) {
      const candidate = this.candidates[i];
      const proposal = sampleUniform(context.domain, context.random);
      const position = resolvePosition(
        proposal, context.domain, context.boundaryPolicy,
        context.random, context.constraints,
      );
      const result = context.evaluation.evaluate(position);

      candidate.previousPosition = cloneVector(candidate.position);
      candidate.previousFitness = candidate.fitness;
      candidate.position = cloneVector(position);
      candidate.fitness = result.value;
      candidate.active = true;

      if (candidate.bestFitness === undefined || result.value < candidate.bestFitness) {
        candidate.bestPosition = cloneVector(position);
        candidate.bestFitness = result.value;
      }
    }

    this.state = this.buildState(context);
    if (this.state.best.fitness < previousBest) {
      events.push(this.event(context, 'best-improved', this.state.best.candidateId, {
        fitness: this.state.best.fitness,
      }));
    }
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

  private buildState(context: OptimizerContext): OptimizerState {
    let best = this.candidates[0];
    for (const candidate of this.candidates) {
      if (candidate.fitness < best.fitness) best = candidate;
    }
    return {
      iteration: context.iteration,
      evaluations: context.evaluation.getCount(),
      candidates: this.candidates,
      best: {
        candidateId: best?.id,
        position: cloneVector(best?.position ?? { x: 0, y: 0 }),
        fitness: best?.fitness ?? Infinity,
      },
      statistics: emptyStatistics(),
      events: [],
    };
  }

  private event(
    context: OptimizerContext, type: string, candidateId?: string,
    data?: Record<string, unknown>,
  ): OptimizerEvent {
    return {
      id: `${type}-${context.iteration}-${this.eventCounter++}`,
      type,
      iteration: context.iteration,
      candidateIds: candidateId ? [candidateId] : undefined,
      data,
    };
  }
}
