import type { Vector2 } from '../math/Types';
import type { BoundaryPolicy } from './types';
import type { SeededRandom } from './SeededRandom';
import type { ConstraintService } from './ConstraintService';

export interface Domain {
  x1Min: number;
  x1Max: number;
  x2Min: number;
  x2Max: number;
}

export function insideDomain(position: Vector2, domain: Domain): boolean {
  return (
    position.x >= domain.x1Min && position.x <= domain.x1Max &&
    position.y >= domain.x2Min && position.y <= domain.x2Max
  );
}

export function sampleUniform(domain: Domain, random: SeededRandom): Vector2 {
  return {
    x: random.range(domain.x1Min, domain.x1Max),
    y: random.range(domain.x2Min, domain.x2Max),
  };
}

function reflectValue(value: number, min: number, max: number): number {
  if (max <= min) return min;
  const span = max - min;
  let v = value - min;
  const period = span * 2;
  v = ((v % period) + period) % period;
  return v <= span ? min + v : min + (period - v);
}

function wrapValue(value: number, min: number, max: number): number {
  if (max <= min) return min;
  const span = max - min;
  return min + ((((value - min) % span) + span) % span);
}

/**
 * Apply the configured search-domain policy. This never evaluates the
 * objective; it only produces the coordinate the optimizer will evaluate.
 */
export function applyBoundary(
  position: Vector2,
  domain: Domain,
  policy: BoundaryPolicy,
  random: SeededRandom,
  constraints?: ConstraintService,
): Vector2 {
  switch (policy) {
    case 'clamp':
      return {
        x: Math.max(domain.x1Min, Math.min(domain.x1Max, position.x)),
        y: Math.max(domain.x2Min, Math.min(domain.x2Max, position.y)),
      };
    case 'reflect':
      return {
        x: reflectValue(position.x, domain.x1Min, domain.x1Max),
        y: reflectValue(position.y, domain.x2Min, domain.x2Max),
      };
    case 'wrap':
      return {
        x: wrapValue(position.x, domain.x1Min, domain.x1Max),
        y: wrapValue(position.y, domain.x2Min, domain.x2Max),
      };
    case 'reject': {
      if (insideDomain(position, domain)) return { ...position };
      return sampleUniform(domain, random);
    }
    default:
      return { ...position };
  }
}

/**
 * Boundary + constraint resolution used by reference optimizers. If the
 * proposal is infeasible, attempt a small deterministic resample before
 * falling back to the boundary-resolved position. Infeasible fallbacks are
 * still reported through ConstraintService and may be penalised by the world.
 */
export function resolvePosition(
  proposal: Vector2,
  domain: Domain,
  policy: BoundaryPolicy,
  random: SeededRandom,
  constraints?: ConstraintService,
): Vector2 {
  const candidate = applyBoundary(proposal, domain, policy, random, constraints);
  if (!constraints || constraints.isFeasible(candidate.x, candidate.y)) return candidate;

  for (let attempt = 0; attempt < 16; attempt++) {
    const sample = sampleUniform(domain, random);
    if (constraints.isFeasible(sample.x, sample.y)) return sample;
  }
  return candidate;
}
