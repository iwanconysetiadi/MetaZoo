import { describe, it, expect } from 'vitest';
import { OptimizationWorld, createDefaultConfig } from '../src/core/world/OptimizationWorld';

function worldFor(functionId: string): OptimizationWorld {
  const config = createDefaultConfig();
  config.functionId = functionId;
  config.resolution = 128;
  const world = new OptimizationWorld(config);
  const def = world.getFunction().getDomain();
  config.domain = { ...def };
  world.setDomain(def);
  return world;
}

describe('critical point pipeline', () => {
  it('validates every reported critical point has a near-zero gradient', () => {
    for (const id of ['sphere', 'rastrigin', 'ackley', 'rosenbrock', 'himmelblau']) {
      const world = worldFor(id);
      const points = world.getCriticalPoints();
      expect(points.length).toBeGreaterThan(0);
      for (const cp of points) {
        const g = world.gradient(cp.x1, cp.x2);
        const mag = Math.hypot(g.x, g.y);
        if (!isFinite(mag)) {
          // Non-differentiable global optimum (e.g. Ackley's origin) is allowed.
          expect(cp.type).toBe('global-minimum');
          continue;
        }
        expect(mag).toBeLessThan(1e-2);
      }
    }
  });

  it('finds the global minimum of the sphere at the origin', () => {
    const world = worldFor('sphere');
    const globals = world.getCriticalPoints().filter(cp => cp.type === 'global-minimum');
    expect(globals.length).toBe(1);
    expect(globals[0].x1).toBeCloseTo(0, 2);
    expect(globals[0].x2).toBeCloseTo(0, 2);
  });

  it('finds many validated local minima for Rastrigin (not at integer coords)', () => {
    const world = worldFor('rastrigin');
    const points = world.getCriticalPoints();
    const locals = points.filter(cp => cp.type === 'local-minimum');
    expect(locals.length).toBeGreaterThan(20);

    for (const cp of locals) {
      const g = world.gradient(cp.x1, cp.x2);
      expect(Math.hypot(g.x, g.y)).toBeLessThan(1e-2);
      const h = world.hessian(cp.x1, cp.x2);
      expect(h.m11).toBeGreaterThan(0);
      expect(h.m11 * h.m22 - h.m12 * h.m21).toBeGreaterThan(0);
    }

    // The bogus integer minima must not survive validation.
    for (const cp of locals) {
      const nearInteger = Math.abs(cp.x1 - Math.round(cp.x1)) < 1e-3 && Math.abs(cp.x2 - Math.round(cp.x2)) < 1e-3;
      if (nearInteger) {
        // Only the origin is an exact-integer critical point.
        expect(Math.hypot(cp.x1, cp.x2)).toBeLessThan(1e-2);
      }
    }
  });

  it('classifies Himmelblau global minima as minima', () => {
    const world = worldFor('himmelblau');
    const points = world.getCriticalPoints();
    const minima = points.filter(cp => cp.type === 'global-minimum' || cp.type === 'local-minimum');
    expect(minima.length).toBeGreaterThanOrEqual(4);
  });
});
