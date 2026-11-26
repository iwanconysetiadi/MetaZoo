export interface SearchDomain {
  x1Min: number;
  x1Max: number;
  x2Min: number;
  x2Max: number;
}

export interface OptimumEstimate {
  x1: number;
  x2: number;
  value: number;
}

/**
 * Deterministic multi-start estimator: dense coarse grid to locate promising
 * cells, then a pattern-search refinement. Explicitly an *estimate* — it does
 * not prove global optimality.
 */
export function estimateOptimum(
  evaluate: (x1: number, x2: number) => number,
  domain: SearchDomain,
  isFeasible?: (x1: number, x2: number) => boolean,
  grid: number = 41,
): OptimumEstimate {
  const spanX = domain.x1Max - domain.x1Min;
  const spanZ = domain.x2Max - domain.x2Min;

  let bestX = domain.x1Min;
  let bestZ = domain.x2Min;
  let bestF = Infinity;

  const feasible = isFeasible ?? (() => true);

  for (let i = 0; i < grid; i++) {
    const x1 = domain.x1Min + (i / (grid - 1)) * spanX;
    for (let j = 0; j < grid; j++) {
      const x2 = domain.x2Min + (j / (grid - 1)) * spanZ;
      if (!feasible(x1, x2)) continue;
      const f = evaluate(x1, x2);
      if (isFinite(f) && f < bestF) {
        bestF = f;
        bestX = x1;
        bestZ = x2;
      }
    }
  }

  if (!isFinite(bestF)) {
    return { x1: (domain.x1Min + domain.x1Max) / 2, x2: (domain.x2Min + domain.x2Max) / 2, value: NaN };
  }

  // Pattern-search refinement.
  let px = bestX;
  let pz = bestZ;
  let pf = bestF;
  let step = Math.max(spanX, spanZ) / (grid - 1);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  while (step > 1e-6) {
    let improved = false;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const nx = clamp(px + Math.cos(ang) * step, domain.x1Min, domain.x1Max);
      const nz = clamp(pz + Math.sin(ang) * step, domain.x2Min, domain.x2Max);
      if (!feasible(nx, nz)) continue;
      const f = evaluate(nx, nz);
      if (isFinite(f) && f < pf - 1e-12) {
        pf = f; px = nx; pz = nz; improved = true;
      }
    }
    if (!improved) step *= 0.5;
  }

  return { x1: px, x2: pz, value: pf };
}
