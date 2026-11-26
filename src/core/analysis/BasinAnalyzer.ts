import { CostFunction } from '../math/CostFunction';
import { CriticalPoint, Vector2, BasinInfo } from '../math/Types';
import { computeGradient } from '../math/NumericalGradient';

export interface BasinMapResult {
  basinIds: Int32Array;
  basins: BasinInfo[];
  resolution: number;
  domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number };
}

export class BasinAnalyzer {
  private function: CostFunction;
  private stepSize: number;
  private maxSteps: number;
  private tolerance: number;

  constructor(function_: CostFunction, stepSize: number = 0.05, maxSteps: number = 1000, tolerance: number = 1e-4) {
    this.function = function_;
    this.stepSize = stepSize;
    this.maxSteps = maxSteps;
    this.tolerance = tolerance;
  }

  computeBasinMap(
    resolution: number,
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number }
  ): BasinMapResult {
    const { x1Min, x1Max, x2Min, x2Max } = domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    const minima = this.function.getGlobalMinima().concat(this.function.getLocalMinima() ?? []);
    const basinIds = new Int32Array(resolution * resolution);

    for (let i = 0; i < resolution; i++) {
      const x1 = x1Min + (i / (resolution - 1)) * domainWidth;
      for (let j = 0; j < resolution; j++) {
        const x2 = x2Min + (j / (resolution - 1)) * domainHeight;
        const idx = i * resolution + j;

        const basinIdx = this.traceToMinimum(x1, x2, minima);
        basinIds[idx] = basinIdx;
      }
    }

    const basins: BasinInfo[] = minima.map((min, idx) => ({
      id: idx,
      minimum: min,
      size: 0,
      color: this.getBasinColor(idx, minima.length),
    }));

    for (let i = 0; i < basinIds.length; i++) {
      if (basinIds[i] >= 0 && basinIds[i] < basins.length) {
        basins[basinIds[i]].size++;
      }
    }

    return { basinIds, basins, resolution, domain };
  }

  private traceToMinimum(x1: number, x2: number, minima: CriticalPoint[]): number {
    let cx = x1;
    let cy = x2;

    for (let step = 0; step < this.maxSteps; step++) {
      const grad = this.function.gradient(cx, cy);
      const gradMag = Math.hypot(grad.x, grad.y);

      if (gradMag < this.tolerance) {
        break;
      }

      cx -= this.stepSize * grad.x;
      cy -= this.stepSize * grad.y;

      if (!this.function.isInsideDomain(cx, cy)) {
        const clamped = this.function.clampToDomain(cx, cy);
        cx = clamped.x1;
        cy = clamped.x2;
      }
    }

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < minima.length; i++) {
      const dist = Math.hypot(minima[i].x1 - cx, minima[i].x2 - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  traceGradientPath(x1: number, x2: number, maxSteps: number = 200): Array<{ x1: number; x2: number; cost: number }> {
    const path: Array<{ x1: number; x2: number; cost: number }> = [];
    let cx = x1;
    let cy = x2;

    for (let step = 0; step < maxSteps; step++) {
      const cost = this.function.evaluate(cx, cy);
      path.push({ x1: cx, x2: cy, cost });

      const grad = this.function.gradient(cx, cy);
      const gradMag = Math.hypot(grad.x, grad.y);

      if (gradMag < this.tolerance) break;

      cx -= this.stepSize * grad.x;
      cy -= this.stepSize * grad.y;

      if (!this.function.isInsideDomain(cx, cy)) {
        const clamped = this.function.clampToDomain(cx, cy);
        cx = clamped.x1;
        cy = clamped.x2;
      }
    }

    return path;
  }

  getBasinBoundaries(
    basinIds: Int32Array,
    resolution: number
  ): Array<{ x: number; y: number }> {
    const boundaries: Array<{ x: number; y: number }> = [];

    for (let i = 1; i < resolution - 1; i++) {
      for (let j = 1; j < resolution - 1; j++) {
        const idx = i * resolution + j;
        const id = basinIds[idx];

        const neighbors = [
          basinIds[idx - 1],
          basinIds[idx + 1],
          basinIds[idx - resolution],
          basinIds[idx + resolution],
        ];

        if (neighbors.some(n => n !== id)) {
          boundaries.push({ x: i, y: j });
        }
      }
    }

    return boundaries;
  }

  private getBasinColor(index: number, total: number): string {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }
}