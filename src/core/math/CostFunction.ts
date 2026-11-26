import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from './Types';
import { computeGradient } from './NumericalGradient';
import { computeHessian, computeEigenvalues } from './HessianEstimator';

export abstract class CostFunction {
  abstract readonly definition: CostFunctionDefinition;

  evaluate(x1: number, x2: number): number {
    return this.definition.evaluate(x1, x2);
  }

  gradient(x1: number, x2: number): Vector2 {
    if (this.definition.gradient) {
      return this.definition.gradient(x1, x2);
    }
    return computeGradient(this.definition.evaluate.bind(this.definition), x1, x2);
  }

  hessian(x1: number, x2: number): Matrix2 {
    if (this.definition.hessian) {
      return this.definition.hessian(x1, x2);
    }
    return computeHessian(this.definition.evaluate.bind(this.definition), x1, x2);
  }

  getDomain() {
    return this.definition.domain;
  }

  getGlobalMinima(): CriticalPoint[] {
    return this.definition.knownGlobalMinima;
  }

  getLocalMinima(): CriticalPoint[] {
    return this.definition.knownLocalMinima ?? [];
  }

  getAllKnownCriticalPoints(): CriticalPoint[] {
    return [...this.definition.knownGlobalMinima, ...(this.definition.knownLocalMinima ?? [])];
  }

  isInsideDomain(x1: number, x2: number): boolean {
    const { x1Min, x1Max, x2Min, x2Max } = this.definition.domain;
    return x1 >= x1Min && x1 <= x1Max && x2 >= x2Min && x2 <= x2Max;
  }

  clampToDomain(x1: number, x2: number): { x1: number; x2: number } {
    const { x1Min, x1Max, x2Min, x2Max } = this.definition.domain;
    return {
      x1: Math.max(x1Min, Math.min(x1Max, x1)),
      x2: Math.max(x2Min, Math.min(x2Max, x2)),
    };
  }

  detectCriticalPointAt(x1: number, x2: number, gradientTolerance: number = 1e-4): CriticalPoint | null {
    const grad = this.gradient(x1, x2);
    const gradMag = Math.hypot(grad.x, grad.y);

    if (!isFinite(gradMag) || gradMag > gradientTolerance) {
      return null;
    }

    const hess = this.hessian(x1, x2);
    const eigenvalues = computeEigenvalues(hess);
    const type = this.classifyCriticalPoint(eigenvalues, gradMag);

    const known = this.getAllKnownCriticalPoints();
    let matchedKnown: CriticalPoint | null = null;
    for (const k of known) {
      const dist = Math.hypot(k.x1 - x1, k.x2 - x2);
      if (dist < 1e-3) {
        matchedKnown = k;
        break;
      }
    }

    return {
      x1,
      x2,
      value: this.evaluate(x1, x2),
      type,
      hessianEigenvalues: eigenvalues,
      gradientMagnitude: gradMag,
      basinId: matchedKnown?.basinId,
    };
  }

  private classifyCriticalPoint(eigenvalues: [number, number], gradMag: number): CriticalPoint['type'] {
    const [lambda1, lambda2] = eigenvalues;
    const tol = 1e-6;

    if (gradMag > tol) return 'saddle';

    const bothPos = lambda1 > tol && lambda2 > tol;
    const bothNeg = lambda1 < -tol && lambda2 < -tol;
    const opposite = (lambda1 > tol && lambda2 < -tol) || (lambda1 < -tol && lambda2 > tol);

    if (bothPos) return 'local-minimum';
    if (bothNeg) return 'local-maximum';
    if (opposite) return 'saddle';
    return 'saddle';
  }
}

export class CostFunctionRegistry {
  private functions = new Map<string, CostFunction>();
  private definitions = new Map<string, CostFunctionDefinition>();

  register(fn: CostFunction): void {
    this.functions.set(fn.definition.id, fn);
    this.definitions.set(fn.definition.id, fn.definition);
  }

  get(id: string): CostFunction | undefined {
    return this.functions.get(id);
  }

  getDefinition(id: string): CostFunctionDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): CostFunctionDefinition[] {
    return Array.from(this.definitions.values());
  }

  getAllIds(): string[] {
    return Array.from(this.definitions.keys());
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  remove(id: string): boolean {
    this.functions.delete(id);
    return this.definitions.delete(id);
  }

  clear(): void {
    this.functions.clear();
    this.definitions.clear();
  }
}

export const globalRegistry = new CostFunctionRegistry();