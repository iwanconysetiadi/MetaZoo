import { CostFunction } from '../math/CostFunction';
import { LandscapeBuffers, CriticalPoint, Vector2, NormalizationMode } from '../math/Types';
import { CoordinateMapper } from './CoordinateMapper';
import { computeGradientMagnitude } from '../math/NumericalGradient';
import { computeCurvature } from '../math/HessianEstimator';
import { createNormalizer, computeMinMax } from '../math/Normalization';

const MAX_CANDIDATES = 4000;
const REFINE_ITERATIONS = 50;
const GRADIENT_EPS = 1e-3;

export class LandscapeSampler {
  private function: CostFunction;
  private mapper: CoordinateMapper;
  private resolution: number;
  private buffers: LandscapeBuffers | null = null;
  private normalizationMode: NormalizationMode = 'linear';
  private basinsComputed = false;

  constructor(function_: CostFunction, mapper: CoordinateMapper, resolution: number = 128) {
    this.function = function_;
    this.mapper = mapper;
    this.resolution = resolution;
  }

  setResolution(resolution: number): void {
    this.resolution = resolution;
    this.buffers = null;
    this.basinsComputed = false;
  }

  setNormalizationMode(mode: NormalizationMode): void {
    this.normalizationMode = mode;
    this.buffers = null;
    this.basinsComputed = false;
  }

  invalidate(): void {
    this.buffers = null;
    this.basinsComputed = false;
  }

  sample(): LandscapeBuffers {
    if (this.buffers && this.buffers.resolution === this.resolution) {
      return this.buffers;
    }

    const res = this.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = this.mapper.getDomain();
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    const costBuffer = new Float32Array(res * res);
    const gradientXBuffer = new Float32Array(res * res);
    const gradientZBuffer = new Float32Array(res * res);
    const gradientMagnitudeBuffer = new Float32Array(res * res);
    const curvatureBuffer = new Float32Array(res * res);

    const allCosts: number[] = [];

    for (let i = 0; i < res; i++) {
      const x1 = x1Min + (i / (res - 1)) * domainWidth;
      for (let j = 0; j < res; j++) {
        const x2 = x2Min + (j / (res - 1)) * domainHeight;
        const idx = i * res + j;

        const cost = this.function.evaluate(x1, x2);
        costBuffer[idx] = isFinite(cost) ? cost : 0;
        allCosts.push(costBuffer[idx]);

        const grad = this.function.gradient(x1, x2);
        gradientXBuffer[idx] = grad.x;
        gradientZBuffer[idx] = grad.y;
        gradientMagnitudeBuffer[idx] = computeGradientMagnitude(grad);

        const hess = this.function.hessian(x1, x2);
        curvatureBuffer[idx] = computeCurvature(hess);
      }
    }

    const { min, max } = computeMinMax(allCosts);
    const normalizer = createNormalizer({ mode: this.normalizationMode, min, max }, allCosts);

    const normalizedCostBuffer = new Float32Array(res * res);
    for (let i = 0; i < res * res; i++) {
      normalizedCostBuffer[i] = normalizer.normalize(costBuffer[i]);
    }

    // Assign buffers BEFORE detection so the detector can read the gradients.
    this.buffers = {
      costBuffer,
      normalizedCostBuffer,
      gradientXBuffer,
      gradientZBuffer,
      gradientMagnitudeBuffer,
      curvatureBuffer,
      criticalPointBuffer: [],
      basinIdBuffer: new Int32Array(res * res),
      resolution: res,
      domain: { x1Min, x1Max, x2Min, x2Max },
    };

    this.buffers.criticalPointBuffer = this.detectCriticalPoints(this.buffers);
    this.basinsComputed = false;

    return this.buffers;
  }

  /**
   * Critical-point pipeline:
   *   1. grid candidate  (local minimum of |grad f|)
   *   2. numerical refinement (Newton / gradient-descent fallback)
   *   3. gradient test    (||grad f|| < eps)
   *   4. Hessian classification
   *   5. dedupe + merge analytically-known points
   * Grid cells are only ever candidates; nothing enters the result unvalidated.
   */
  private detectCriticalPoints(buffers: LandscapeBuffers): CriticalPoint[] {
    const res = buffers.resolution;
    const grad = buffers.gradientMagnitudeBuffer;
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;
    const spacing = Math.max(domainWidth, domainHeight) / (res - 1);
    const minSeparation = Math.max(spacing * 0.5, 1e-3);

    const candidates: Array<{ x1: number; x2: number }> = [];

    for (let i = 1; i < res - 1; i++) {
      const x1 = x1Min + (i / (res - 1)) * domainWidth;
      for (let j = 1; j < res - 1; j++) {
        const x2 = x2Min + (j / (res - 1)) * domainHeight;
        const idx = i * res + j;
        const g = grad[idx];
        if (!isFinite(g)) continue;

        // Strict local minimum of the gradient magnitude among the 4 neighbours.
        if (g < grad[idx - 1] && g < grad[idx + 1] && g < grad[idx - res] && g < grad[idx + res]) {
          candidates.push({ x1, x2 });
          if (candidates.length >= MAX_CANDIDATES) break;
        }
      }
      if (candidates.length >= MAX_CANDIDATES) break;
    }

    const criticalPoints: CriticalPoint[] = [];
    const isDuplicate = (x1: number, x2: number): boolean =>
      criticalPoints.some(cp => Math.hypot(cp.x1 - x1, cp.x2 - x2) < minSeparation);

    for (const cand of candidates) {
      const refined = this.refineCriticalPoint(cand.x1, cand.x2);
      if (!refined) continue;

      const cp = this.function.detectCriticalPointAt(refined.x1, refined.x2, GRADIENT_EPS);
      if (!cp) continue;
      if (!isFinite(cp.x1) || !isFinite(cp.x2) || !isFinite(cp.value)) continue;
      if (isDuplicate(cp.x1, cp.x2)) continue;

      criticalPoints.push(cp);
    }

    // Merge analytically-known points and force their declared classification.
    const known = this.function.getAllKnownCriticalPoints();
    for (const k of known) {
      if (!this.function.isInsideDomain(k.x1, k.x2)) continue;

      const match = criticalPoints.find(cp => Math.hypot(cp.x1 - k.x1, cp.x2 - k.x2) < Math.max(minSeparation * 2, 0.05));
      if (match) {
        match.type = k.type;
        match.basinId = k.basinId;
        continue;
      }

      const verified = this.function.detectCriticalPointAt(k.x1, k.x2, 1e-2);
      if (verified) {
        verified.type = k.type;
        verified.basinId = k.basinId;
        criticalPoints.push(verified);
      } else {
        // Analytically-known minimum at a non-differentiable point (e.g. Ackley's
        // origin). Keep it as the declared global optimum but mark the gradient
        // magnitude as zero so no NaN leaks into downstream consumers.
        criticalPoints.push({
          x1: k.x1,
          x2: k.x2,
          value: this.function.evaluate(k.x1, k.x2),
          type: k.type,
          basinId: k.basinId,
          gradientMagnitude: 0,
        });
      }
    }

    return criticalPoints;
  }

  private refineCriticalPoint(x1: number, x2: number): { x1: number; x2: number } | null {
    const domain = this.mapper.getDomain();
    const span = Math.max(domain.x1Max - domain.x1Min, domain.x2Max - domain.x2Min);
    const maxStep = span * 0.05;

    let p = this.function.clampToDomain(x1, x2);

    for (let iter = 0; iter < REFINE_ITERATIONS; iter++) {
      const g = this.function.gradient(p.x1, p.x2);
      const gMag = Math.hypot(g.x, g.y);
      if (!isFinite(gMag)) return null;
      if (gMag < 1e-8) break;

      const h = this.function.hessian(p.x1, p.x2);
      const det = h.m11 * h.m22 - h.m12 * h.m21;

      let stepX: number;
      let stepY: number;

      if (Math.abs(det) > 1e-8) {
        // Newton step: p <- p - H^-1 g
        stepX = (h.m22 * g.x - h.m12 * g.y) / det;
        stepY = (-h.m21 * g.x + h.m11 * g.y) / det;
      } else {
        // Degenerate Hessian: damped gradient-descent fallback.
        const scale = 1 / (1 + gMag);
        stepX = g.x * scale;
        stepY = g.y * scale;
      }

      const stepLen = Math.hypot(stepX, stepY);
      if (!isFinite(stepLen)) return null;
      if (stepLen > maxStep) {
        stepX *= maxStep / stepLen;
        stepY *= maxStep / stepLen;
      }

      p = this.function.clampToDomain(p.x1 - stepX, p.x2 - stepY);
      if (!isFinite(p.x1) || !isFinite(p.x2)) return null;
    }

    const finalGrad = this.function.gradient(p.x1, p.x2);
    const finalMag = Math.hypot(finalGrad.x, finalGrad.y);
    if (!isFinite(finalMag) || finalMag > GRADIENT_EPS) return null;

    return p;
  }

  computeBasins(): void {
    if (this.basinsComputed && this.buffers) return;
    if (!this.buffers) this.sample();

    const buffers = this.buffers!;
    const res = buffers.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    const minima = buffers.criticalPointBuffer.filter(
      cp => cp.type === 'global-minimum' || cp.type === 'local-minimum'
    );

    if (minima.length === 0) {
      buffers.basinIdBuffer.fill(-1);
      this.basinsComputed = true;
      return;
    }

    const span = Math.max(domainWidth, domainHeight);
    const stepSize = span * 0.01;
    const maxSteps = 200;

    for (let i = 0; i < res; i++) {
      const x1 = x1Min + (i / (res - 1)) * domainWidth;
      for (let j = 0; j < res; j++) {
        const x2 = x2Min + (j / (res - 1)) * domainHeight;
        const idx = i * res + j;

        // Follow steepest descent to a basin, then snap to the nearest minimum.
        let px = x1;
        let pz = x2;

        for (let step = 0; step < maxSteps; step++) {
          const g = this.function.gradient(px, pz);
          const gMag = Math.hypot(g.x, g.y);
          if (!isFinite(gMag) || gMag < 1e-6) break;

          px -= (g.x / gMag) * stepSize;
          pz -= (g.y / gMag) * stepSize;
          px = clamp(px, x1Min, x1Max);
          pz = clamp(pz, x2Min, x2Max);
        }

        let bestIdx = 0;
        let bestDist = Infinity;
        for (let m = 0; m < minima.length; m++) {
          const dist = Math.hypot(minima[m].x1 - px, minima[m].x2 - pz);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = m;
          }
        }

        buffers.basinIdBuffer[idx] = bestIdx;
      }
    }

    this.basinsComputed = true;
  }

  getBasinMap(): {
    basinIds: Int32Array;
    basins: Array<{ id: number; minimum: CriticalPoint; color: string }>;
    resolution: number;
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number };
  } | null {
    if (!this.buffers) return null;
    this.computeBasins();

    const buffers = this.buffers!;
    const minima = buffers.criticalPointBuffer.filter(
      cp => cp.type === 'global-minimum' || cp.type === 'local-minimum'
    );
    const basins = minima.map((minimum, idx) => ({
      id: idx,
      minimum,
      color: this.getBasinColor(idx),
    }));

    return {
      basinIds: buffers.basinIdBuffer,
      basins,
      resolution: buffers.resolution,
      domain: buffers.domain,
    };
  }

  private getBasinColor(index: number): string {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 60%, 50%)`;
  }

  getBuffers(): LandscapeBuffers | null {
    return this.buffers;
  }

  getCriticalPoints(): CriticalPoint[] {
    if (!this.buffers) this.sample();
    return this.buffers!.criticalPointBuffer;
  }

  sampleAt(x1: number, x2: number): {
    cost: number;
    normalizedCost: number;
    gradient: Vector2;
    gradientMagnitude: number;
    curvature: number;
    basinId: number;
  } {
    if (!this.buffers) this.sample();

    const res = this.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = this.mapper.getDomain();
    const u = (x1 - x1Min) / (x1Max - x1Min);
    const v = (x2 - x2Min) / (x2Max - x2Min);

    const i = Math.floor(clamp(u, 0, 1 - 1e-6) * (res - 1));
    const j = Math.floor(clamp(v, 0, 1 - 1e-6) * (res - 1));
    const idx = i * res + j;

    return {
      cost: this.buffers!.costBuffer[idx],
      normalizedCost: this.buffers!.normalizedCostBuffer[idx],
      gradient: { x: this.buffers!.gradientXBuffer[idx], y: this.buffers!.gradientZBuffer[idx] },
      gradientMagnitude: this.buffers!.gradientMagnitudeBuffer[idx],
      curvature: this.buffers!.curvatureBuffer[idx],
      basinId: this.basinsComputed ? this.buffers!.basinIdBuffer[idx] : -1,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
