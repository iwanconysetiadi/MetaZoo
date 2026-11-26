import type { Vector2 } from '../math/Types';
import type { OptimizationWorld } from '../world/OptimizationWorld';
import type { ConstraintService } from './ConstraintService';
import type { EvaluationResult, ObjectiveMode } from './types';

export class EvaluationBudgetExceededError extends Error {
  constructor() {
    super('Evaluation budget exhausted');
    this.name = 'EvaluationBudgetExceededError';
  }
}

/**
 * The ONLY approved path for optimizers to evaluate an objective. Every call
 * is counted; the budget is enforced here so no optimizer can silently exceed
 * the configured evaluation limit.
 */
export class EvaluationService {
  private world: OptimizationWorld;
  private constraints: ConstraintService;
  private evaluations = 0;
  private maxEvaluations: number;
  private objectiveMode: ObjectiveMode;

  constructor(
    world: OptimizationWorld,
    constraints: ConstraintService,
    maxEvaluations = Infinity,
    objectiveMode: ObjectiveMode = 'observed',
  ) {
    this.world = world;
    this.constraints = constraints;
    this.maxEvaluations = maxEvaluations;
    this.objectiveMode = objectiveMode;
  }

  getCount(): number {
    return this.evaluations;
  }

  getMaxEvaluations(): number {
    return this.maxEvaluations;
  }

  getRemaining(): number {
    if (!isFinite(this.maxEvaluations)) return Infinity;
    return Math.max(0, this.maxEvaluations - this.evaluations);
  }

  isExhausted(): boolean {
    return this.evaluations >= this.maxEvaluations;
  }

  getObjectiveMode(): ObjectiveMode {
    return this.objectiveMode;
  }

  setObjectiveMode(mode: ObjectiveMode): void {
    this.objectiveMode = mode;
  }

  setMaxEvaluations(max: number): void {
    this.maxEvaluations = isFinite(max) && max >= 0 ? max : Infinity;
  }

  reset(): void {
    this.evaluations = 0;
  }

  /** Evaluate using the configured experimental value (true or observed). */
  evaluate(position: Vector2): EvaluationResult {
    return this.evaluateInternal(position, this.objectiveMode);
  }

  evaluateTrue(position: Vector2): EvaluationResult {
    return this.evaluateInternal(position, 'true');
  }

  evaluateObserved(position: Vector2): EvaluationResult {
    return this.evaluateInternal(position, 'observed');
  }

  private evaluateInternal(position: Vector2, mode: ObjectiveMode): EvaluationResult {
    if (this.evaluations >= this.maxEvaluations) {
      throw new EvaluationBudgetExceededError();
    }
    this.evaluations++;

    const trueValue = this.world.evaluateTrue(position.x, position.y);
    const observedValue = this.world.evaluateObserved(position.x, position.y);
    const value = mode === 'true' ? trueValue : observedValue;

    return {
      position: { x: position.x, y: position.y },
      trueValue,
      observedValue,
      value,
      feasible: this.constraints.isFeasible(position.x, position.y),
      violation: this.constraints.violation(position.x, position.y),
    };
  }
}
