import type { Vector2 } from '../math/Types';
import type { OptimizationWorld } from '../world/OptimizationWorld';
import type { ConstraintService } from './ConstraintService';
import type { EvaluationResult, ObjectiveMode } from './types';

export interface EvaluationAuditEntry {
  number: number;
  position: Vector2;
  trueValue: number;
  observedValue: number;
  feasible: boolean;
  source: string;
  cached: boolean;
}

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
  private auditEnabled = false;
  private auditLog: EvaluationAuditEntry[] = [];
  private cacheEnabled = false;
  private cache = new Map<string, { trueValue: number; observedValue: number }>();
  private cacheHits = 0;

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

  setCount(count: number): void {
    this.evaluations = Math.max(0, Math.floor(count));
  }

  enableAudit(enabled: boolean): void {
    this.auditEnabled = enabled;
    if (!enabled) this.auditLog = [];
  }

  getAuditLog(): EvaluationAuditEntry[] {
    return this.auditLog;
  }

  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) this.cache.clear();
  }

  getCacheHits(): number {
    return this.cacheHits;
  }

  private cacheKey(position: Vector2): string {
    return `${position.x.toPrecision(17)},${position.y.toPrecision(17)}`;
  }

  /** Evaluate using the configured experimental value (true or observed). */
  evaluate(position: Vector2, source = 'candidate-update'): EvaluationResult {
    return this.evaluateInternal(position, this.objectiveMode, source);
  }

  evaluateTrue(position: Vector2, source = 'candidate-update'): EvaluationResult {
    return this.evaluateInternal(position, 'true', source);
  }

  evaluateObserved(position: Vector2, source = 'candidate-update'): EvaluationResult {
    return this.evaluateInternal(position, 'observed', source);
  }

  private evaluateInternal(position: Vector2, mode: ObjectiveMode, source: string): EvaluationResult {
    if (this.evaluations >= this.maxEvaluations) {
      throw new EvaluationBudgetExceededError();
    }
    this.evaluations++;

    const key = this.cacheKey(position);
    const cached = this.cacheEnabled && this.cache.get(key);
    if (cached) {
      this.cacheHits++;
    }
    const trueValue = cached ? cached.trueValue : this.world.evaluateTrue(position.x, position.y);
    const observedValue = cached ? cached.observedValue : this.world.evaluateObserved(position.x, position.y);
    if (this.cacheEnabled && !cached) {
      this.cache.set(key, { trueValue, observedValue });
    }
    const value = mode === 'true' ? trueValue : observedValue;
    const feasible = this.constraints.isFeasible(position.x, position.y);

    if (this.auditEnabled) {
      this.auditLog.push({
        number: this.evaluations,
        position: { x: position.x, y: position.y },
        trueValue,
        observedValue,
        feasible,
        source,
        cached: !!cached,
      });
    }

    return {
      position: { x: position.x, y: position.y },
      trueValue,
      observedValue,
      value,
      feasible,
      violation: this.constraints.violation(position.x, position.y),
    };
  }
}
