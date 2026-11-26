import type { Vector2 } from '../math/Types';
import type { InitialPopulation, BoundaryPolicy } from './types';
import { SeededRandom } from './SeededRandom';
import { sampleUniform, resolvePosition, type Domain } from './BoundaryPolicy';
import type { ConstraintService } from './ConstraintService';

/**
 * Initial positions are generated independently from the optimizer's RNG so
 * different algorithms can be compared from identical starts (Phase 5).
 * The generator is deterministic: same seed + count + domain => same points.
 */
export function generateInitialPopulation(
  domain: Domain,
  count: number,
  seed: number,
  boundaryPolicy: BoundaryPolicy,
  constraints?: ConstraintService,
): InitialPopulation {
  const n = Math.max(1, Math.floor(count));
  const populationSeed = (seed ^ 0x9e3779b9) >>> 0;
  const random = new SeededRandom(populationSeed);
  const positions: Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const sample = sampleUniform(domain, random);
    positions.push(resolvePosition(sample, domain, boundaryPolicy, random, constraints));
  }

  return {
    id: `initial-${populationSeed.toString(16)}-${n}`,
    seed: populationSeed,
    positions,
  };
}
