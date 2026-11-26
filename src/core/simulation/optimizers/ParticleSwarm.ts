import type {
  CandidateState, Optimizer, OptimizerCapabilities, OptimizerContext, OptimizerEvent,
  OptimizerState, OptimizerStepResult,
} from '../types';
import { cloneVector, emptyStatistics } from '../types';
import { resolvePosition } from '../BoundaryPolicy';

/** Canonical constriction-form PSO. Candidate coordinates remain optimizer-owned. */
export class ParticleSwarmOptimizer implements Optimizer {
  readonly id = 'particle-swarm';
  readonly name = 'Particle Swarm Optimization';
  readonly populationBased = true;
  readonly defaultPopulationSize = 30;

  private candidates: CandidateState[] = [];
  private state: OptimizerState | null = null;
  private eventCounter = 0;
  private wasConverged = false;

  initialize(context: OptimizerContext): void {
    this.eventCounter = 0;
    this.wasConverged = false;
    this.candidates = context.initialPopulation.positions.map((position, index) => {
      const result = context.evaluation.evaluate(position);
      return {
        id: `pso-${index}`,
        position: cloneVector(position),
        previousPosition: cloneVector(position),
        fitness: result.value,
        bestPosition: cloneVector(position),
        bestFitness: result.value,
        role: { id: 'particle', label: 'Particle' },
        active: true,
        metadata: { vx: 0, vy: 0 },
      };
    });
    this.state = this.buildState(context);
  }

  step(context: OptimizerContext): OptimizerStepResult {
    const events: OptimizerEvent[] = [];
    const remaining = context.evaluation.getRemaining();
    const budgeted = Math.min(this.candidates.length, remaining);
    if (budgeted <= 0) return { events };

    const globalBefore = this.findBest();
    const globalPosition = cloneVector(globalBefore.position);
    const span = Math.max(
      context.domain.x1Max - context.domain.x1Min,
      context.domain.x2Max - context.domain.x2Min,
    );
    const maxVelocity = Math.max(span * 0.2, 1e-9);
    // Clerc-Goldberg constriction with phi1 = phi2 = 2.05, phi = 4.1.
    const phi1 = this.parameter(context, 'cognitive', 2.05);
    const phi2 = this.parameter(context, 'social', 2.05);
    const phi = phi1 + phi2;
    const chi = phi > 4 ? 2 / Math.abs(2 - phi - Math.sqrt(phi * phi - 4 * phi)) : 0.729843788;
    let improvedGlobal: CandidateState | undefined;

    for (let i = 0; i < budgeted; i++) {
      const candidate = this.candidates[i];
      const velocity = candidate.metadata as { vx?: number; vy?: number } | undefined;
      const personal = candidate.bestPosition ?? candidate.position;
      let vx = chi * ((velocity?.vx ?? 0)
        + phi1 * context.random.next() * (personal.x - candidate.position.x)
        + phi2 * context.random.next() * (globalPosition.x - candidate.position.x));
      let vy = chi * ((velocity?.vy ?? 0)
        + phi1 * context.random.next() * (personal.y - candidate.position.y)
        + phi2 * context.random.next() * (globalPosition.y - candidate.position.y));

      const speed = Math.hypot(vx, vy);
      const clamped = speed > maxVelocity;
      if (clamped) {
        vx *= maxVelocity / speed;
        vy *= maxVelocity / speed;
        events.push(this.event(context, 'velocity-clamped', candidate.id, { maxVelocity }));
      }

      const position = resolvePosition(
        { x: candidate.position.x + vx, y: candidate.position.y + vy },
        context.domain, context.boundaryPolicy, context.random, context.constraints,
      );
      const result = context.evaluation.evaluate(position);
      candidate.previousPosition = cloneVector(candidate.position);
      candidate.previousFitness = candidate.fitness;
      candidate.position = cloneVector(position);
      candidate.fitness = result.value;
      candidate.metadata = { vx, vy, velocityClamped: clamped };

      if (candidate.bestFitness === undefined || result.value < candidate.bestFitness) {
        candidate.bestPosition = cloneVector(position);
        candidate.bestFitness = result.value;
        events.push(this.event(context, 'pbest-improved', candidate.id, { fitness: result.value }));
        if (!improvedGlobal || result.value < improvedGlobal.fitness) improvedGlobal = candidate;
      }
    }

    this.state = this.buildState(context);
    if (improvedGlobal && this.state.best.fitness < globalBefore.fitness) {
      events.push(this.event(context, 'gbest-updated', improvedGlobal.id, {
        fitness: this.state.best.fitness,
        position: cloneVector(this.state.best.position),
      }));
    }
    const diversity = this.state.statistics.diversity;
    const converged = diversity <= span * 0.01;
    if (converged && !this.wasConverged) events.push(this.event(context, 'swarm-converged'));
    this.wasConverged = converged;
    this.state.events = events;
    return { events };
  }

  getState(): OptimizerState {
    return this.state ?? {
      iteration: 0, evaluations: 0, candidates: [],
      best: { position: { x: 0, y: 0 }, fitness: Infinity },
      statistics: emptyStatistics(), events: [], algorithmState: { id: this.id },
    };
  }

  reset(context: OptimizerContext): void { this.initialize(context); }

  getCapabilities(): OptimizerCapabilities {
    return {
      population: true, singleAgent: false, constraints: true,
      noisyObjective: true, dynamicObjective: true, variablePopulation: false,
      roles: false, events: true, personalMemory: true,
    };
  }

  private parameter(context: OptimizerContext, key: string, fallback: number): number {
    const value = Number(context.parameters[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private findBest(): CandidateState {
    let best = this.candidates[0];
    for (const candidate of this.candidates) if (candidate.fitness < best.fitness) best = candidate;
    return best;
  }

  private buildState(context: OptimizerContext): OptimizerState {
    const best = this.findBest();
    return {
      iteration: context.iteration,
      evaluations: context.evaluation.getCount(),
      candidates: this.candidates,
      best: { candidateId: best?.id, position: cloneVector(best?.position ?? { x: 0, y: 0 }), fitness: best?.fitness ?? Infinity },
      statistics: emptyStatistics(), events: [],
      algorithmState: { id: this.id, variant: 'constriction', cognitive: this.parameter(context, 'cognitive', 2.05), social: this.parameter(context, 'social', 2.05) },
    };
  }

  private event(context: OptimizerContext, type: string, candidateId?: string, data?: Record<string, unknown>): OptimizerEvent {
    return {
      id: `${type}-${context.iteration}-${this.eventCounter++}`,
      type, iteration: context.iteration,
      candidateIds: candidateId ? [candidateId] : undefined,
      data,
    };
  }
}
