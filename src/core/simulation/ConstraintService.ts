import type { OptimizationWorld } from '../world/OptimizationWorld';

/**
 * Single source of constraint truth for optimizers. Phase 1.5 worlds expose
 * feasibility through their composed objective; this service keeps algorithms
 * from reaching into the objective object directly.
 */
export class ConstraintService {
  private world: OptimizationWorld;

  constructor(world: OptimizationWorld) {
    this.world = world;
  }

  isFeasible(x1: number, x2: number): boolean {
    return this.world.isFeasible(x1, x2);
  }

  violation(x1: number, x2: number): number {
    return this.world.constraintViolation(x1, x2);
  }

  /** Convenience helper for statistics. */
  feasibleRatio(positions: Array<{ x: number; y: number }>): number {
    if (positions.length === 0) return 0;
    let feasible = 0;
    for (const p of positions) {
      if (this.isFeasible(p.x, p.y)) feasible++;
    }
    return feasible / positions.length;
  }
}
