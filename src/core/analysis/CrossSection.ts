import { OptimizationWorld } from '../world/OptimizationWorld';

export type CrossSectionMode = 'x1' | 'x2' | 'custom';

export interface CrossSectionSample {
  t: number;
  x1: number;
  x2: number;
  f: number;
  wx: number;
  wy: number;
  wz: number;
}

export interface CrossSectionProfile {
  mode: CrossSectionMode;
  position: number;
  samples: CrossSectionSample[];
  minF: number;
  maxF: number;
  minIndex: number;
  axisLabel: string;
  startLabel: string;
  endLabel: string;
  fixedLabel: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Samples f along a 1-D slice of the optimization domain.
 *  - 'x1': vary x1 with x2 fixed   -> g(x1) = f(x1, c)
 *  - 'x2': vary x2 with x1 fixed   -> h(x2) = f(c, x2)
 *  - 'custom': f along the line A->B (diagonal, with a perpendicular offset)
 * Purely a profile of the objective; geometry is never modified.
 */
export function computeCrossSection(
  world: OptimizationWorld,
  mode: CrossSectionMode,
  position: number,
  n: number = 150,
): CrossSectionProfile {
  const { x1Min, x1Max, x2Min, x2Max } = world.getConfig().domain;
  const pos = clamp01(position);
  const samples: CrossSectionSample[] = [];

  let axisLabel = 'x₁';
  let startLabel = x1Min.toFixed(2);
  let endLabel = x1Max.toFixed(2);
  let fixedLabel = '';

  let ax = 0, az = 0, bx = 0, bz = 0;

  if (mode === 'x1') {
    const fixedX2 = x2Min + pos * (x2Max - x2Min);
    fixedLabel = `x₂ = ${fixedX2.toFixed(2)}`;
    ax = x1Min; az = fixedX2;
    bx = x1Max; bz = fixedX2;
    startLabel = x1Min.toFixed(2);
    endLabel = x1Max.toFixed(2);
    axisLabel = 'x₁';
  } else if (mode === 'x2') {
    const fixedX1 = x1Min + pos * (x1Max - x1Min);
    fixedLabel = `x₁ = ${fixedX1.toFixed(2)}`;
    ax = fixedX1; az = x2Min;
    bx = fixedX1; bz = x2Max;
    startLabel = x2Min.toFixed(2);
    endLabel = x2Max.toFixed(2);
    axisLabel = 'x₂';
  } else {
    const spanX = x1Max - x1Min;
    const spanZ = x2Max - x2Min;
    const dx = spanX, dz = spanZ;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len, pz = dx / len;
    const offset = (pos - 0.5) * Math.min(spanX, spanZ) * 0.7;
    ax = Math.max(x1Min, Math.min(x1Max, x1Min + px * offset));
    az = Math.max(x2Min, Math.min(x2Max, x2Min + pz * offset));
    bx = Math.max(x1Min, Math.min(x1Max, x1Max + px * offset));
    bz = Math.max(x2Min, Math.min(x2Max, x2Max + pz * offset));
    fixedLabel = 'custom line';
    axisLabel = 't';
    startLabel = 'A';
    endLabel = 'B';
  }

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x1 = ax + (bx - ax) * t;
    const x2 = az + (bz - az) * t;
    const f = world.evaluate(x1, x2);
    const { x: wx, z: wz } = world.optimizationToWorld(x1, x2);
    const wy = world.getTerrainHeight(x1, x2);
    samples.push({ t, x1, x2, f: isFinite(f) ? f : 0, wx, wy, wz });
  }

  let minF = Infinity, maxF = -Infinity, minIndex = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].f < minF) { minF = samples[i].f; minIndex = i; }
    if (samples[i].f > maxF) maxF = samples[i].f;
  }
  if (!isFinite(minF)) minF = 0;
  if (!isFinite(maxF) || maxF === minF) maxF = minF + 1;

  return { mode, position: pos, samples, minF, maxF, minIndex, axisLabel, startLabel, endLabel, fixedLabel };
}
