import { CostFunction } from '../math/CostFunction';
import { Vector2 } from '../math/Types';

export interface FlowLine {
  points: Array<{ x1: number; x2: number; cost: number }>;
  seedX: number;
  seedY: number;
}

export interface FlowFieldOptions {
  stepSize?: number;
  maxSteps?: number;
  tolerance?: number;
  density?: number;
  jitter?: number;
}

const DEFAULT_OPTIONS: Required<FlowFieldOptions> = {
  stepSize: 0.05,
  maxSteps: 200,
  tolerance: 1e-4,
  density: 20,
  jitter: 0.1,
};

export class GradientFlowSolver {
  private function: CostFunction;
  private options: Required<FlowFieldOptions>;

  constructor(function_: CostFunction, options: FlowFieldOptions = {}) {
    this.function = function_;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  generateFlowLines(
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number },
    count?: number
  ): FlowLine[] {
    const numLines = count ?? this.options.density;
    const lines: FlowLine[] = [];
    const { x1Min, x1Max, x2Min, x2Max } = domain;

    for (let i = 0; i < numLines; i++) {
      const jitterX = (Math.random() - 0.5) * this.options.jitter * (x1Max - x1Min);
      const jitterY = (Math.random() - 0.5) * this.options.jitter * (x2Max - x2Min);

      const seedX = x1Min + Math.random() * (x1Max - x1Min) + jitterX;
      const seedY = x2Min + Math.random() * (x2Max - x2Min) + jitterY;

      const clampedSeed = this.function.clampToDomain(seedX, seedY);
      const line = this.traceFlowLine(clampedSeed.x1, clampedSeed.x2);
      if (line.points.length > 2) {
        lines.push({ ...line, seedX: clampedSeed.x1, seedY: clampedSeed.x2 });
      }
    }

    return lines;
  }

  traceFlowLine(x1: number, x2: number): FlowLine {
    const points: Array<{ x1: number; x2: number; cost: number }> = [];
    let cx = x1;
    let cy = x2;

    for (let step = 0; step < this.options.maxSteps; step++) {
      const cost = this.function.evaluate(cx, cy);
      points.push({ x1: cx, x2: cy, cost });

      const grad = this.function.gradient(cx, cy);
      const gradMag = Math.hypot(grad.x, grad.y);

      if (gradMag < this.options.tolerance) break;

      cx -= this.options.stepSize * grad.x;
      cy -= this.options.stepSize * grad.y;

      if (!this.function.isInsideDomain(cx, cy)) {
        const clamped = this.function.clampToDomain(cx, cy);
        cx = clamped.x1;
        cy = clamped.x2;
        break;
      }
    }

    return { points, seedX: x1, seedY: x2 };
  }

  generateVectorField(
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number },
    resolution: number
  ): Array<{ x1: number; x2: number; vector: Vector2; magnitude: number }> {
    const { x1Min, x1Max, x2Min, x2Max } = domain;
    const field: Array<{ x1: number; x2: number; vector: Vector2; magnitude: number }> = [];

    for (let i = 0; i < resolution; i++) {
      const x1 = x1Min + (i / (resolution - 1)) * (x1Max - x1Min);
      for (let j = 0; j < resolution; j++) {
        const x2 = x2Min + (j / (resolution - 1)) * (x2Max - x2Min);
        const grad = this.function.gradient(x1, x2);
        const mag = Math.hypot(grad.x, grad.y);

        if (mag > 1e-6) {
          field.push({
            x1,
            x2,
            vector: { x: -grad.x / mag, y: -grad.y / mag },
            magnitude: mag,
          });
        }
      }
    }

    return field;
  }

  computeStreamlines(
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number },
    seeds: Array<{ x1: number; x2: number }>
  ): FlowLine[] {
    return seeds.map(seed => this.traceFlowLine(seed.x1, seed.x2));
  }
}