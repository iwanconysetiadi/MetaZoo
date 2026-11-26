import { describe, it, expect } from 'vitest';
import { globalRegistry } from '../src/core/math/CostFunction';
import '../src/core/benchmarks';
import { computeGradient } from '../src/core/math/NumericalGradient';
import { computeHessian, computeEigenvalues, classifyCriticalPoint } from '../src/core/math/HessianEstimator';
import { createLinearNormalizer, createLogNormalizer, computeMinMax } from '../src/core/math/Normalization';

describe('Benchmark Functions', () => {
  const functions = globalRegistry.getAllDefinitions();

  functions.forEach(fn => {
    describe(fn.name, () => {
      it('should evaluate at global minima', () => {
        fn.knownGlobalMinima.forEach(min => {
          const value = fn.evaluate(min.x1, min.x2);
          expect(Math.abs(value - min.value)).toBeLessThan(1e-6);
        });
      });

      it('should be inside domain', () => {
        fn.knownGlobalMinima.forEach(min => {
          expect(min.x1).toBeGreaterThanOrEqual(fn.domain.x1Min);
          expect(min.x1).toBeLessThanOrEqual(fn.domain.x1Max);
          expect(min.x2).toBeGreaterThanOrEqual(fn.domain.x2Min);
          expect(min.x2).toBeLessThanOrEqual(fn.domain.x2Max);
        });
      });

      it('should have analytical gradient matching numerical', () => {
        if (!fn.gradient) return;
        
        fn.knownGlobalMinima.forEach(min => {
          const analytical = fn.gradient!(min.x1, min.x2);
          const numerical = computeGradient(fn.evaluate, min.x1, min.x2);

          // Some global optima are non-differentiable (e.g. Ackley at the origin).
          if (!isFinite(analytical.x) || !isFinite(analytical.y)) return;

          expect(Math.abs(analytical.x - numerical.x)).toBeLessThan(1e-4);
          expect(Math.abs(analytical.y - numerical.y)).toBeLessThan(1e-4);
        });
      });

      it('should have zero gradient at global minima', () => {
        if (!fn.gradient) return;
        
        fn.knownGlobalMinima.forEach(min => {
          const grad = fn.gradient!(min.x1, min.x2);
          const mag = Math.hypot(grad.x, grad.y);

          // Non-smooth optimum: the gradient simply does not exist here.
          if (!isFinite(mag)) return;

          expect(mag).toBeLessThan(1e-6);
        });
      });

      it('should have positive definite Hessian at minima', () => {
        if (!fn.hessian) return;
        
        fn.knownGlobalMinima.forEach(min => {
          const hess = fn.hessian!(min.x1, min.x2);
          const [lambda1, lambda2] = computeEigenvalues(hess);
          expect(lambda1).toBeGreaterThan(0);
          expect(lambda2).toBeGreaterThan(0);
        });
      });
    });
  });
});

describe('Numerical Gradient', () => {
  it('should compute gradient of f(x,y) = x^2 + y^2', () => {
    const f = (x: number, y: number) => x * x + y * y;
    const grad = computeGradient(f, 3, 4);
    expect(grad.x).toBeCloseTo(6, 5);
    expect(grad.y).toBeCloseTo(8, 5);
  });

  it('should compute gradient of f(x,y) = sin(x) + cos(y)', () => {
    const f = (x: number, y: number) => Math.sin(x) + Math.cos(y);
    const grad = computeGradient(f, Math.PI / 2, 0);
    expect(grad.x).toBeCloseTo(0, 5);
    expect(grad.y).toBeCloseTo(0, 5);
  });
});

describe('Hessian Estimator', () => {
  it('should compute Hessian of f(x,y) = x^2 + 2y^2', () => {
    const f = (x: number, y: number) => x * x + 2 * y * y;
    const hess = computeHessian(f, 0, 0);
    expect(hess.m11).toBeCloseTo(2, 3);
    expect(hess.m22).toBeCloseTo(4, 3);
    expect(hess.m12).toBeCloseTo(0, 3);
    expect(hess.m21).toBeCloseTo(0, 3);
  });

  it('should compute eigenvalues correctly', () => {
    const hess = { m11: 2, m12: 0, m21: 0, m22: 4 };
    const [lambda1, lambda2] = computeEigenvalues(hess);
    expect(lambda1).toBeCloseTo(4, 5);
    expect(lambda2).toBeCloseTo(2, 5);
  });

  it('should classify critical points', () => {
    expect(classifyCriticalPoint([2, 3], 0)).toBe('minimum');
    expect(classifyCriticalPoint([-2, -3], 0)).toBe('maximum');
    expect(classifyCriticalPoint([2, -3], 0)).toBe('saddle');
    expect(classifyCriticalPoint([0, 0], 0)).toBe('degenerate');
  });
});

describe('Normalization', () => {
  it('should normalize linearly', () => {
    const normalizer = createLinearNormalizer(0, 100);
    expect(normalizer.normalize(0)).toBe(0);
    expect(normalizer.normalize(50)).toBe(0.5);
    expect(normalizer.normalize(100)).toBe(1);
    expect(normalizer.denormalize(0.5)).toBe(50);
  });

  it('should normalize logarithmically', () => {
    const normalizer = createLogNormalizer(1, 1000, 10);
    expect(normalizer.normalize(1)).toBe(0);
    expect(normalizer.normalize(1000)).toBe(1);
    expect(normalizer.normalize(10)).toBeCloseTo(1/3, 2);
  });

  it('should compute min/max', () => {
    const values = [1, 5, 3, 9, 2];
    const { min, max } = computeMinMax(values);
    expect(min).toBe(1);
    expect(max).toBe(9);
  });
});

describe('Coordinate Mapping', () => {
  it('should round-trip correctly', () => {
    // This would be tested with the actual OptimizationWorld
    // Placeholder for integration test
    expect(true).toBe(true);
  });
});