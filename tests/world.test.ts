import { describe, it, expect } from 'vitest';
import { OptimizationWorld, createDefaultConfig } from '../src/core/world/OptimizationWorld';

describe('OptimizationWorld', () => {
  it('produces landscape buffers on demand', () => {
    const config = createDefaultConfig();
    const world = new OptimizationWorld(config);
    const buffers = world.getLandscapeBuffers();
    expect(buffers).toBeTruthy();
    expect(buffers.resolution).toBe(config.resolution);
    expect(buffers.costBuffer.length).toBe(config.resolution * config.resolution);
    expect(buffers.normalizedCostBuffer.length).toBe(config.resolution * config.resolution);
  });

  it('round-trips coordinates', () => {
    const world = new OptimizationWorld(createDefaultConfig());
    for (const [x1, x2] of [[0, 0], [1.5, -2.3], [-5, 5]]) {
      const w = world.optimizationToWorld(x1, x2);
      const o = world.worldToOptimization(w.x, w.z);
      expect(o.x1).toBeCloseTo(x1, 6);
      expect(o.x2).toBeCloseTo(x2, 6);
    }
  });

  it('samples cost consistent with evaluate', () => {
    const world = new OptimizationWorld(createDefaultConfig());
    const s = world.sample(0.5, 0.5);
    expect(s.cost).toBeCloseTo(world.evaluate(0.5, 0.5), 6);
  });

  it('produces a basin map', () => {
    const world = new OptimizationWorld(createDefaultConfig());
    const map = world.getBasinMap();
    expect(map).toBeTruthy();
    expect(map!.basins.length).toBeGreaterThan(0);
  });
});