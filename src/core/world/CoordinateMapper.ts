import { WorldConfiguration } from '../math/Types';
import { CostFunction } from '../math/CostFunction';

export class CoordinateMapper {
  private config: WorldConfiguration;
  private function: CostFunction;
  private worldWidth: number;
  private worldDepth: number;
  private verticalScale: number;

  constructor(config: WorldConfiguration, function_: CostFunction, worldWidth: number = 100, worldDepth: number = 100, verticalScale: number = 10) {
    this.config = config;
    this.function = function_;
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;
    this.verticalScale = verticalScale;
  }

  setConfig(config: WorldConfiguration): void {
    this.config = config;
  }

  setFunction(function_: CostFunction): void {
    this.function = function_;
  }

  setWorldSize(width: number, depth: number): void {
    this.worldWidth = width;
    this.worldDepth = depth;
  }

  setVerticalScale(scale: number): void {
    this.verticalScale = scale;
  }

  getDomain(): { x1Min: number; x1Max: number; x2Min: number; x2Max: number } {
    return this.config.domain;
  }

  optimizationToWorld(x1: number, x2: number): { x: number; z: number } {
    const { x1Min, x1Max, x2Min, x2Max } = this.config.domain;
    const t1 = (x1 - x1Min) / (x1Max - x1Min);
    const t2 = (x2 - x2Min) / (x2Max - x2Min);
    return {
      x: (t1 - 0.5) * this.worldWidth,
      z: (t2 - 0.5) * this.worldDepth,
    };
  }

  worldToOptimization(x: number, z: number): { x1: number; x2: number } {
    const { x1Min, x1Max, x2Min, x2Max } = this.config.domain;
    const t1 = x / this.worldWidth + 0.5;
    const t2 = z / this.worldDepth + 0.5;
    return {
      x1: x1Min + t1 * (x1Max - x1Min),
      x2: x2Min + t2 * (x2Max - x2Min),
    };
  }

  private applyHeightMapping(value: number, x1: number, x2: number): number {
    const normalized = this.getNormalizedCost(x1, x2);
    return normalized * this.verticalScale * 10;
  }

  getTerrainHeight(x1: number, x2: number): number {
    const value = this.function.evaluate(x1, x2);
    return this.applyHeightMapping(value, x1, x2);
  }

  getNormalizedCost(x1: number, x2: number): number {
    const value = this.function.evaluate(x1, x2);
    const { min, max } = this.estimateValueRange();
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  }

  private estimateValueRange(): { min: number; max: number } {
    const { x1Min, x1Max, x2Min, x2Max } = this.config.domain;
    const samples = 20;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i <= samples; i++) {
      const x1 = x1Min + (i / samples) * (x1Max - x1Min);
      for (let j = 0; j <= samples; j++) {
        const x2 = x2Min + (j / samples) * (x2Max - x2Min);
        const v = this.function.evaluate(x1, x2);
        if (isFinite(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }

    if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
    return { min, max };
  }

  getSurfaceNormal(x1: number, x2: number): { x: number; y: number; z: number } {
    const eps = 1e-4;
    const h = this.getTerrainHeight(x1, x2);
    const hx = this.getTerrainHeight(x1 + eps, x2);
    const hz = this.getTerrainHeight(x1, x2 + eps);

    const dx = (hx - h) / eps;
    const dz = (hz - h) / eps;

    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    return { x: -dx / len, y: 1 / len, z: -dz / len };
  }

  getSlope(x1: number, x2: number): number {
    const grad = this.function.gradient(x1, x2);
    const gradMag = Math.hypot(grad.x, grad.y);
    const { x1Min, x1Max, x2Min, x2Max } = this.config.domain;
    const scaleX = this.worldWidth / (x1Max - x1Min);
    const scaleZ = this.worldDepth / (x2Max - x2Min);
    return Math.atan(gradMag * this.verticalScale * Math.max(scaleX, scaleZ) / 10);
  }

  getCurvature(x1: number, x2: number): number {
    const hess = this.function.hessian(x1, x2);
    const trace = hess.m11 + hess.m22;
    const det = hess.m11 * hess.m22 - hess.m12 * hess.m21;
    return Math.sqrt(trace * trace + 4 * det);
  }

  isInsideDomain(x1: number, x2: number): boolean {
    return this.function.isInsideDomain(x1, x2);
  }

  projectAgentToSurface(x1: number, x2: number, offset: number = 0): { x: number; y: number; z: number } {
    const { x, z } = this.optimizationToWorld(x1, x2);
    const y = this.getTerrainHeight(x1, x2) + offset;
    return { x, y, z };
  }
}