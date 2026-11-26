import { CostFunction } from '../math/CostFunction';
import { Matrix2 } from '../math/Types';
import { computeHessian, computeEigenvalues, computeGaussianCurvature, computeMeanCurvature } from '../math/HessianEstimator';

export interface CurvatureData {
  gaussian: number;
  mean: number;
  maxPrincipal: number;
  minPrincipal: number;
  shapeIndex: number;
  curvedness: number;
}

export class CurvatureAnalyzer {
  private function: CostFunction;

  constructor(function_: CostFunction) {
    this.function = function_;
  }

  analyzeAt(x1: number, x2: number): CurvatureData {
    const hess = this.function.hessian(x1, x2);
    return this.analyzeHessian(hess);
  }

  analyzeHessian(hess: Matrix2): CurvatureData {
    const [lambda1, lambda2] = computeEigenvalues(hess);
    const maxPrincipal = Math.max(lambda1, lambda2);
    const minPrincipal = Math.min(lambda1, lambda2);
    const gaussian = computeGaussianCurvature(hess);
    const mean = computeMeanCurvature(hess);

    const shapeIndex = this.computeShapeIndex(maxPrincipal, minPrincipal);
    const curvedness = this.computeCurvedness(maxPrincipal, minPrincipal);

    return {
      gaussian,
      mean,
      maxPrincipal,
      minPrincipal,
      shapeIndex,
      curvedness,
    };
  }

  private computeShapeIndex(k1: number, k2: number): number {
    if (Math.abs(k1 - k2) < 1e-10) return 0;
    return (2 / Math.PI) * Math.atan((k1 + k2) / (k1 - k2));
  }

  private computeCurvedness(k1: number, k2: number): number {
    return Math.sqrt((k1 * k1 + k2 * k2) / 2);
  }

  classifyShape(shapeIndex: number): string {
    if (shapeIndex > 0.875) return 'cup';
    if (shapeIndex > 0.625) return 'rut';
    if (shapeIndex > 0.375) return 'saddle';
    if (shapeIndex > 0.125) return 'ridge';
    if (shapeIndex > -0.125) return 'flat';
    if (shapeIndex > -0.375) return 'ridge';
    if (shapeIndex > -0.625) return 'saddle';
    if (shapeIndex > -0.875) return 'rut';
    return 'cup';
  }

  generateCurvatureField(
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number },
    resolution: number
  ): Float32Array {
    const { x1Min, x1Max, x2Min, x2Max } = domain;
    const field = new Float32Array(resolution * resolution);

    for (let i = 0; i < resolution; i++) {
      const x1 = x1Min + (i / (resolution - 1)) * (x1Max - x1Min);
      for (let j = 0; j < resolution; j++) {
        const x2 = x2Min + (j / (resolution - 1)) * (x2Max - x2Min);
        const idx = i * resolution + j;
        const data = this.analyzeAt(x1, x2);
        field[idx] = data.curvedness;
      }
    }

    return field;
  }

  generateShapeIndexField(
    domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number },
    resolution: number
  ): Float32Array {
    const { x1Min, x1Max, x2Min, x2Max } = domain;
    const field = new Float32Array(resolution * resolution);

    for (let i = 0; i < resolution; i++) {
      const x1 = x1Min + (i / (resolution - 1)) * (x1Max - x1Min);
      for (let j = 0; j < resolution; j++) {
        const x2 = x2Min + (j / (resolution - 1)) * (x2Max - x2Min);
        const idx = i * resolution + j;
        const data = this.analyzeAt(x1, x2);
        field[idx] = (data.shapeIndex + 1) / 2;
      }
    }

    return field;
  }
}