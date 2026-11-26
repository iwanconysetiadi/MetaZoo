import type {
  CandidateState, Optimizer, OptimizerContext, OptimizerEvent,
  OptimizerState, OptimizerStepResult,
} from '../types';
import { cloneVector, emptyStatistics } from '../types';
import { resolvePosition } from '../BoundaryPolicy';

/**
 * ENGINE TEST ONLY. A deliberately simple attraction swarm used to validate
 * population rendering, interpolation and event plumbing. It is not presented
 * as a scientific metaheuristic and will be replaced by the Phase 3 zoo.
 */
export class TestSwarmOptimizer implements Optimizer {
  readonly id = 'test-swarm';
  readonly name = 'Generic Attraction Swarm (ENGINE TEST)';
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
        id: `swarm-${index}`,
        position: cloneVector(position),
        previousPosition: cloneVector(position),
        fitness: result.value,
        bestPosition: cloneVector(position),
        bestFitness: result.value,
        role: 'candidate',
        active: true,
        metadata: { vx: 0, vy: 0 },
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

    const globalBest = this.findBest();
    const span = Math.max(
      context.domain.x1Max - context.domain.x1Min,
      context.domain.x2Max - context.domain.x2Min,
    );
    const maxVelocity = 0.3 * span;

    for (let i = 0; i < budgeted; i++) {
      const candidate = this.candidates[i];
      const metadata = (candidate.metadata ?? {}) as { vx?: number; vy?: number };
      const personalBest = candidate.bestPosition ?? candidate.position;

      let vx = (metadata.vx ?? 0) * 0.55;
      let vy = (metadata.vy ?? 0) * 0.55;
      vx += 1.35 * context.random.next() * (personalBest.x - candidate.position.x);
      vy += 1.35 * context.random.next() * (personalBest.y - candidate.position.y);
      vx += 1.35 * context.random.next() * (globalBest.position.x - candidate.position.x);
      vy += 1.35 * context.random.next() * (globalBest.position.y - candidate.position.y);
      vx += context.random.gaussian() * 0.02 * span;
      vy += context.random.gaussian() * 0.02 * span;

      const speed = Math.hypot(vx, vy);
      if (speed > maxVelocity && speed > 0) {
        vx *= maxVelocity / speed;
        vy *= maxVelocity / speed;
      }

      const proposal = {
        x: candidate.position.x + vx,
        y: candidate.position.y + vy,
      };
      const position = resolvePosition(
        proposal, context.domain, context.boundaryPolicy,
        context.random, context.constraints,
      );
      const result = context.evaluation.evaluate(position);

      candidate.previousPosition = cloneVector(candidate.position);
      candidate.previousFitness = candidate.fitness;
      candidate.position = cloneVector(position);
      candidate.fitness = result.value;
      candidate.metadata = { vx, vy };

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

  private findBest(): CandidateState {
    let best = this.candidates[0];
    for (const candidate of this.candidates) {
      if (candidate.fitness < best.fitness) best = candidate;
    }
    return best;
  }

  private buildState(context: OptimizerContext): OptimizerState {
    const best = this.findBest();
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
