import { Vector2, Matrix2 } from './Types';
import { computeGradient } from './NumericalGradient';

export interface HessianOptions {
  epsilon?: number;
}

const DEFAULT_EPSILON = 1e-4;

export function computeHessian(
  f: (x1: number, x2: number) => number,
  x1: number,
  x2: number,
  options: HessianOptions = {}
): Matrix2 {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;

  const f_xx = (f(x1 + epsilon, x2) - 2 * f(x1, x2) + f(x1 - epsilon, x2)) / (epsilon * epsilon);
  const f_yy = (f(x1, x2 + epsilon) - 2 * f(x1, x2) + f(x1, x2 - epsilon)) / (epsilon * epsilon);
  const f_xy = (f(x1 + epsilon, x2 + epsilon) - f(x1 + epsilon, x2 - epsilon) - f(x1 - epsilon, x2 + epsilon) + f(x1 - epsilon, x2 - epsilon)) / (4 * epsilon * epsilon);

  return {
    m11: isFinite(f_xx) ? f_xx : 0,
    m12: isFinite(f_xy) ? f_xy : 0,
    m21: isFinite(f_xy) ? f_xy : 0,
    m22: isFinite(f_yy) ? f_yy : 0,
  };
}

export function computeHessianFromGradient(
  gradientFn: (x1: number, x2: number) => Vector2,
  x1: number,
  x2: number,
  epsilon: number = DEFAULT_EPSILON
): Matrix2 {
  const g = gradientFn(x1, x2);
  const g_x1_plus = gradientFn(x1 + epsilon, x2);
  const g_x1_minus = gradientFn(x1 - epsilon, x2);
  const g_x2_plus = gradientFn(x1, x2 + epsilon);
  const g_x2_minus = gradientFn(x1, x2 - epsilon);

  const f_xx = (g_x1_plus.x - g_x1_minus.x) / (2 * epsilon);
  const f_xy = (g_x1_plus.y - g_x1_minus.y) / (2 * epsilon);
  const f_yx = (g_x2_plus.x - g_x2_minus.x) / (2 * epsilon);
  const f_yy = (g_x2_plus.y - g_x2_minus.y) / (2 * epsilon);

  return {
    m11: isFinite(f_xx) ? f_xx : 0,
    m12: isFinite(f_xy) ? f_xy : 0,
    m21: isFinite(f_yx) ? f_yx : 0,
    m22: isFinite(f_yy) ? f_yy : 0,
  };
}

export function computeEigenvalues(matrix: Matrix2): [number, number] {
  const { m11, m12, m21, m22 } = matrix;
  const trace = m11 + m22;
  const det = m11 * m22 - m12 * m21;
  const discriminant = trace * trace - 4 * det;

  if (discriminant < 0) {
    return [trace / 2, trace / 2];
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const lambda1 = (trace + sqrtDisc) / 2;
  const lambda2 = (trace - sqrtDisc) / 2;

  return [lambda1, lambda2];
}

export function classifyCriticalPoint(eigenvalues: [number, number], gradientMagnitude: number, tolerance: number = 1e-6): 'minimum' | 'maximum' | 'saddle' | 'degenerate' {
  const [lambda1, lambda2] = eigenvalues;

  if (gradientMagnitude > tolerance) {
    return 'degenerate';
  }

  const bothPositive = lambda1 > tolerance && lambda2 > tolerance;
  const bothNegative = lambda1 < -tolerance && lambda2 < -tolerance;
  const oppositeSigns = (lambda1 > tolerance && lambda2 < -tolerance) || (lambda1 < -tolerance && lambda2 > tolerance);

  if (bothPositive) return 'minimum';
  if (bothNegative) return 'maximum';
  if (oppositeSigns) return 'saddle';
  return 'degenerate';
}

export function computeCurvature(matrix: Matrix2): number {
  const [lambda1, lambda2] = computeEigenvalues(matrix);
  return Math.max(Math.abs(lambda1), Math.abs(lambda2));
}

export function computeGaussianCurvature(matrix: Matrix2): number {
  const det = matrix.m11 * matrix.m22 - matrix.m12 * matrix.m21;
  return det;
}

export function computeMeanCurvature(matrix: Matrix2): number {
  return (matrix.m11 + matrix.m22) / 2;
}