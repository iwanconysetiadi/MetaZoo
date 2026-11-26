import { CostFunction } from '../math/CostFunction';
import { CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { computeGradient } from '../math/NumericalGradient';
import { computeHessian, computeEigenvalues, classifyCriticalPoint } from '../math/HessianEstimator';

export class CriticalPointAnalyzer {
  private function: CostFunction;
  private gradientTolerance: number;
  private hessianTolerance: number;

  constructor(function_: CostFunction, gradientTolerance: number = 1e-4, hessianTolerance: number = 1e-6) {
    this.function = function_;
    this.gradientTolerance = gradientTolerance;
    this.hessianTolerance = hessianTolerance;
  }

  analyzeAt(x1: number, x2: number): CriticalPoint | null {
    const grad = this.function.gradient(x1, x2);
    const gradMag = Math.hypot(grad.x, grad.y);

    if (gradMag > this.gradientTolerance) {
      return null;
    }

    const hess = this.function.hessian(x1, x2);
    const eigenvalues = computeEigenvalues(hess);
    const classification = classifyCriticalPoint(eigenvalues, gradMag, this.hessianTolerance);
    const type: CriticalPoint['type'] =
      classification === 'minimum' ? 'local-minimum'
        : classification === 'maximum' ? 'local-maximum'
          : 'saddle';

    const known = this.function.getAllKnownCriticalPoints();
    let basinId: number | undefined;
    for (let i = 0; i < known.length; i++) {
      const k = known[i];
      const dist = Math.hypot(k.x1 - x1, k.x2 - x2);
      if (dist < 0.05) {
        basinId = i;
        break;
      }
    }

    return {
      x1,
      x2,
      value: this.function.evaluate(x1, x2),
      type,
      hessianEigenvalues: eigenvalues,
      gradientMagnitude: gradMag,
      basinId,
    };
  }

  findCriticalPointsInRegion(
    x1Min: number, x1Max: number,
    x2Min: number, x2Max: number,
    samples: number = 50
  ): CriticalPoint[] {
    const points: CriticalPoint[] = [];
    const seen = new Set<string>();

    for (let i = 0; i <= samples; i++) {
      const x1 = x1Min + (i / samples) * (x1Max - x1Min);
      for (let j = 0; j <= samples; j++) {
        const x2 = x2Min + (j / samples) * (x2Max - x2Min);
        const cp = this.analyzeAt(x1, x2);
        if (cp) {
          const key = `${cp.x1.toFixed(4)},${cp.x2.toFixed(4)}`;
          if (!seen.has(key)) {
            seen.add(key);
            points.push(cp);
          }
        }
      }
    }

    const known = this.function.getAllKnownCriticalPoints();
    for (const k of known) {
      const exists = points.some(p => Math.hypot(p.x1 - k.x1, p.x2 - k.x2) < 0.05);
      if (!exists) {
        points.push({ ...k });
      }
    }

    return points;
  }

  classifyAllKnown(): CriticalPoint[] {
    const known = this.function.getAllKnownCriticalPoints();
    return known.map(k => {
      const grad = this.function.gradient(k.x1, k.x2);
      const gradMag = Math.hypot(grad.x, grad.y);
      const hess = this.function.hessian(k.x1, k.x2);
      const eigenvalues = computeEigenvalues(hess);
    const type = classifyCriticalPoint(eigenvalues, gradMag, this.hessianTolerance) as any;
      return { ...k, type, hessianEigenvalues: eigenvalues, gradientMagnitude: gradMag };
    });
  }

  findSaddlePoints(
    x1Min: number, x1Max: number,
    x2Min: number, x2Max: number,
    samples: number = 30
  ): CriticalPoint[] {
    const all = this.findCriticalPointsInRegion(x1Min, x1Max, x2Min, x2Max, samples);
    return all.filter(cp => cp.type === 'saddle');
  }

  findLocalMinima(
    x1Min: number, x1Max: number,
    x2Min: number, x2Max: number,
    samples: number = 30
  ): CriticalPoint[] {
    const all = this.findCriticalPointsInRegion(x1Min, x1Max, x2Min, x2Max, samples);
    return all.filter(cp => cp.type === 'local-minimum' || cp.type === 'global-minimum');
  }

  findLocalMaxima(
    x1Min: number, x1Max: number,
    x2Min: number, x2Max: number,
    samples: number = 30
  ): CriticalPoint[] {
    const all = this.findCriticalPointsInRegion(x1Min, x1Max, x2Min, x2Max, samples);
    return all.filter(cp => cp.type === 'local-maximum');
  }

  getCriticalPointInfo(cp: CriticalPoint): string {
    const lines = [
      `Type: ${cp.type}`,
      `x₁: ${cp.x1.toFixed(6)}`,
      `x₂: ${cp.x2.toFixed(6)}`,
      `f(x): ${cp.value.toFixed(6)}`,
      `|∇f|: ${cp.gradientMagnitude?.toExponential(2) ?? 'N/A'}`,
    ];
    if (cp.hessianEigenvalues) {
      lines.push(`λ₁: ${cp.hessianEigenvalues[0].toFixed(4)}`);
      lines.push(`λ₂: ${cp.hessianEigenvalues[1].toFixed(4)}`);
    }
    if (cp.basinId !== undefined) {
      lines.push(`Basin: ${cp.basinId}`);
    }
    return lines.join('\n');
  }
}