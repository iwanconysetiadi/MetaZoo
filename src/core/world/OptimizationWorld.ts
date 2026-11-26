import { CostFunction } from '../math/CostFunction';
import { globalRegistry } from '../math/CostFunction';
import '../benchmarks';
import { CoordinateMapper } from './CoordinateMapper';
import { LandscapeSampler } from './LandscapeSampler';
import { WorldConfiguration, WorldSample, ProbeData, CriticalPoint, Vector2, NormalizationMode, ResolutionLevel, RESOLUTION_LEVELS, ViewMode } from '../math/Types';

export class OptimizationWorld {
  private currentFunction: CostFunction;
  private mapper: CoordinateMapper;
  private sampler: LandscapeSampler;
  private config: WorldConfiguration;
  private revision = 0;

  constructor(config: WorldConfiguration) {
    this.config = config;
    const fn = globalRegistry.get(config.functionId);
    if (!fn) {
      throw new Error(`Function ${config.functionId} not found in registry`);
    }
    this.currentFunction = fn;

    this.mapper = new CoordinateMapper(config, this.currentFunction, 100, 100, config.verticalScale);
    this.sampler = new LandscapeSampler(this.currentFunction, this.mapper, config.resolution);
    this.sampler.setNormalizationMode(config.normalizationMode);
  }

  getFunction(): CostFunction {
    return this.currentFunction;
  }

  getConfig(): WorldConfiguration {
    return { ...this.config };
  }

  /** Increments whenever the objective or its domain changes. */
  getRevision(): number {
    return this.revision;
  }

  private bumpRevision(): void {
    this.revision++;
  }

  setFunction(functionId: string): void {
    const fn = globalRegistry.get(functionId);
    if (!fn) throw new Error(`Function ${functionId} not found`);
    this.currentFunction = fn;
    this.config.functionId = functionId;
    this.mapper.setFunction(fn);
    this.sampler = new LandscapeSampler(fn, this.mapper, this.config.resolution);
    this.sampler.setNormalizationMode(this.config.normalizationMode);
    this.bumpRevision();
  }

  setResolution(resolution: number): void {
    this.config.resolution = resolution;
    this.sampler.setResolution(resolution);
  }

  setNormalizationMode(mode: NormalizationMode): void {
    this.config.normalizationMode = mode;
    this.sampler.setNormalizationMode(mode);
  }

  setVerticalScale(scale: number): void {
    this.config.verticalScale = scale;
    this.mapper.setVerticalScale(scale);
  }

  setDomain(domain: WorldConfiguration['domain']): void {
    this.config.domain = domain;
    this.mapper.setConfig(this.config);
    this.sampler = new LandscapeSampler(this.currentFunction, this.mapper, this.config.resolution);
    this.sampler.setNormalizationMode(this.config.normalizationMode);
    this.bumpRevision();
  }

  /** Install a pre-built objective (custom function or composed challenge). */
  setObjective(fn: CostFunction, domain: WorldConfiguration['domain']): void {
    this.currentFunction = fn;
    this.config.functionId = fn.definition.id;
    this.config.domain = { ...domain };
    this.mapper.setFunction(fn);
    this.mapper.setConfig(this.config);
    this.sampler = new LandscapeSampler(fn, this.mapper, this.config.resolution);
    this.sampler.setNormalizationMode(this.config.normalizationMode);
    this.bumpRevision();
  }

  isFeasible(x1: number, x2: number): boolean {
    const fn = this.currentFunction as unknown as { isFeasible?: (a: number, b: number) => boolean };
    return fn.isFeasible ? fn.isFeasible(x1, x2) : true;
  }

  constraintViolation(x1: number, x2: number): number {
    const fn = this.currentFunction as unknown as { constraintViolation?: (a: number, b: number) => number };
    return fn.constraintViolation ? fn.constraintViolation(x1, x2) : 0;
  }

  evaluateTrue(x1: number, x2: number): number {
    const fn = this.currentFunction as unknown as { evaluateTrue?: (a: number, b: number) => number };
    return fn.evaluateTrue ? fn.evaluateTrue(x1, x2) : this.currentFunction.evaluate(x1, x2);
  }

  evaluateObserved(x1: number, x2: number): number {
    const fn = this.currentFunction as unknown as { evaluateObserved?: (a: number, b: number) => number };
    return fn.evaluateObserved ? fn.evaluateObserved(x1, x2) : this.currentFunction.evaluate(x1, x2);
  }

  setSimTime(time: number): void {
    const fn = this.currentFunction as unknown as { setTime?: (t: number) => void };
    fn.setTime?.(time);
    this.sampler.invalidate();
  }

  getSimTime(): number {
    const fn = this.currentFunction as unknown as { getTime?: () => number };
    return fn.getTime ? fn.getTime() : 0;
  }

  getDynamicCenter(): { x1: number; x2: number } | null {
    const fn = this.currentFunction as unknown as { dynamicCenter?: () => { x1: number; x2: number } };
    if (fn.dynamicCenter) {
      const c = fn.dynamicCenter();
      return isFinite(c.x1) ? c : null;
    }
    return null;
  }

  evaluate(x1: number, x2: number): number {
    return this.currentFunction.evaluate(x1, x2);
  }

  gradient(x1: number, x2: number): Vector2 {
    return this.currentFunction.gradient(x1, x2);
  }

  hessian(x1: number, x2: number) {
    return this.currentFunction.hessian(x1, x2);
  }

  getNormalizedCost(x1: number, x2: number): number {
    return this.mapper.getNormalizedCost(x1, x2);
  }

  optimizationToWorld(x1: number, x2: number): { x: number; z: number } {
    return this.mapper.optimizationToWorld(x1, x2);
  }

  worldToOptimization(x: number, z: number): { x1: number; x2: number } {
    return this.mapper.worldToOptimization(x, z);
  }

  getTerrainHeight(x1: number, x2: number): number {
    return this.mapper.getTerrainHeight(x1, x2);
  }

  getSurfaceNormal(x1: number, x2: number): { x: number; y: number; z: number } {
    return this.mapper.getSurfaceNormal(x1, x2);
  }

  getSlope(x1: number, x2: number): number {
    return this.mapper.getSlope(x1, x2);
  }

  getCurvature(x1: number, x2: number): number {
    return this.mapper.getCurvature(x1, x2);
  }

  getBasinId(x1: number, x2: number): number {
    return this.sampler.sampleAt(x1, x2).basinId;
  }

  isInsideDomain(x1: number, x2: number): boolean {
    return this.currentFunction.isInsideDomain(x1, x2);
  }

  projectAgentToSurface(x1: number, x2: number, offset: number = 0): { x: number; y: number; z: number } {
    return this.mapper.projectAgentToSurface(x1, x2, offset);
  }

  /**
   * Height of the rendered terrain surface, sampled from the same normalized
   * cost grid the mesh uses. Cheap enough for per-frame agent placement.
   */
  getTerrainSurfaceHeight(x1: number, x2: number): number {
    const buffers = this.getLandscapeBuffers();
    const res = buffers.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;

    const u = clamp01((x1 - x1Min) / (x1Max - x1Min)) * (res - 1);
    const v = clamp01((x2 - x2Min) / (x2Max - x2Min)) * (res - 1);
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const i1 = Math.min(i0 + 1, res - 1);
    const j1 = Math.min(j0 + 1, res - 1);
    const fx = u - i0;
    const fz = v - j0;

    const b = buffers.normalizedCostBuffer;
    const n00 = b[i0 * res + j0];
    const n10 = b[i1 * res + j0];
    const n01 = b[i0 * res + j1];
    const n11 = b[i1 * res + j1];

    const nx0 = n00 + (n10 - n00) * fx;
    const nx1 = n01 + (n11 - n01) * fx;
    const normalized = nx0 + (nx1 - nx0) * fz;

    return normalized * this.config.verticalScale * 10;
  }

  projectAgentToTerrain(x1: number, x2: number, offset: number = 0): { x: number; y: number; z: number } {
    const { x, z } = this.optimizationToWorld(x1, x2);
    return { x, y: this.getTerrainSurfaceHeight(x1, x2) + offset, z };
  }

  sample(x1: number, x2: number): WorldSample {
    const { x, z } = this.optimizationToWorld(x1, x2);
    const y = this.getTerrainHeight(x1, x2);
    const cost = this.evaluate(x1, x2);
    const normalizedCost = this.getNormalizedCost(x1, x2);
    const grad = this.gradient(x1, x2);
    const normal = this.getSurfaceNormal(x1, x2);
    const slope = this.getSlope(x1, x2);
    const curvature = this.getCurvature(x1, x2);
    const basinId = this.getBasinId(x1, x2);

    return {
      optimizationPosition: { x1, x2 },
      worldPosition: { x, y, z },
      cost,
      normalizedCost,
      gradient: grad,
      surfaceNormal: normal,
      slope,
      curvature,
      basinId,
    };
  }

  probe(x1: number, x2: number): ProbeData {
    const sample = this.sample(x1, x2);
    return {
      x1: sample.optimizationPosition.x1,
      x2: sample.optimizationPosition.x2,
      worldX: sample.worldPosition.x,
      worldZ: sample.worldPosition.z,
      cost: sample.cost,
      normalizedCost: sample.normalizedCost,
      gradientX: sample.gradient.x,
      gradientZ: sample.gradient.y,
      gradientMagnitude: Math.hypot(sample.gradient.x, sample.gradient.y),
      slope: sample.slope,
      curvature: sample.curvature,
      basinId: sample.basinId,
      surfaceNormal: sample.surfaceNormal,
    };
  }

  getCriticalPoints(): CriticalPoint[] {
    return this.sampler.getCriticalPoints();
  }

  getGlobalMinima(): CriticalPoint[] {
    return this.currentFunction.getGlobalMinima();
  }

  getLocalMinima(): CriticalPoint[] {
    return this.currentFunction.getLocalMinima();
  }

  getLandscapeBuffers() {
    return this.sampler.sample();
  }

  getBasinMap() {
    this.sampler.sample();
    return this.sampler.getBasinMap();
  }

  getResolutionLevels(): ResolutionLevel[] {
    return RESOLUTION_LEVELS;
  }

  serialize(): string {
    return JSON.stringify(this.config);
  }

  static deserialize(json: string): WorldConfiguration {
    return JSON.parse(json);
  }

  toURLParams(): string {
    const params = new URLSearchParams();
    params.set('function', this.config.functionId);
    params.set('resolution', this.config.resolution.toString());
    params.set('verticalScale', this.config.verticalScale.toString());
    params.set('normalization', this.config.normalizationMode);
    params.set('contourMode', this.config.contourMode);
    params.set('contourCount', this.config.contourCount.toString());
    params.set('view', this.config.cameraPreset);
    params.set('basins', this.config.overlays.basins.toString());
    params.set('gradient', this.config.overlays.gradientField.toString());
    params.set('boundaries', this.config.overlays.basinBoundaries.toString());
    params.set('globalMin', this.config.overlays.criticalPoints.globalMinima.toString());
    params.set('localMin', this.config.overlays.criticalPoints.localMinima.toString());
    params.set('localMax', this.config.overlays.criticalPoints.localMaxima.toString());
    params.set('saddle', this.config.overlays.criticalPoints.saddlePoints.toString());
    params.set('flow', this.config.overlays.gradientFlow.toString());
    params.set('curvature', this.config.overlays.curvature.toString());
    params.set('quality', this.config.visualQuality);
    params.set('heightMapping', this.config.heightMapping);
    params.set('mode', this.config.viewMode);
    return params.toString();
  }

  static fromURLParams(params: URLSearchParams): Partial<WorldConfiguration> {
    const config: Partial<WorldConfiguration> = {};
    if (params.has('function')) config.functionId = params.get('function')!;
    if (params.has('resolution')) config.resolution = parseInt(params.get('resolution')!);
    if (params.has('verticalScale')) config.verticalScale = parseFloat(params.get('verticalScale')!);
    if (params.has('normalization')) config.normalizationMode = params.get('normalization') as NormalizationMode;
    if (params.has('contourMode')) config.contourMode = params.get('contourMode') as WorldConfiguration['contourMode'];
    if (params.has('contourCount')) config.contourCount = parseInt(params.get('contourCount')!);
    if (params.has('view')) config.cameraPreset = params.get('view')!;
    if (params.has('mode')) config.viewMode = params.get('mode') as WorldConfiguration['viewMode'];

    const overlays = createDefaultConfig().overlays;
    if (params.has('contours')) overlays.contours = params.get('contours') === 'true';
    if (params.has('basins')) overlays.basins = params.get('basins') === 'true';
    if (params.has('gradient')) overlays.gradientField = params.get('gradient') === 'true';
    if (params.has('boundaries')) overlays.basinBoundaries = params.get('boundaries') === 'true';
    if (params.has('globalMin')) overlays.criticalPoints.globalMinima = params.get('globalMin') === 'true';
    if (params.has('localMin')) overlays.criticalPoints.localMinima = params.get('localMin') === 'true';
    if (params.has('localMax')) overlays.criticalPoints.localMaxima = params.get('localMax') === 'true';
    if (params.has('saddle')) overlays.criticalPoints.saddlePoints = params.get('saddle') === 'true';
    if (params.has('flow')) overlays.gradientFlow = params.get('flow') === 'true';
    if (params.has('curvature')) overlays.curvature = params.get('curvature') === 'true';
    config.overlays = overlays;

    if (params.has('quality')) config.visualQuality = params.get('quality') as WorldConfiguration['visualQuality'];
    if (params.has('heightMapping')) config.heightMapping = params.get('heightMapping') as WorldConfiguration['heightMapping'];
    return config;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export type { WorldConfiguration } from '../math/Types';

export function createDefaultConfig(): WorldConfiguration {
  return {
    functionId: 'sphere',
    resolution: 128,
    verticalScale: 1.6,
    viewMode: 'natural',
    normalizationMode: 'linear',
    contourMode: 'linear',
    contourCount: 14,
    domain: { x1Min: -5.12, x1Max: 5.12, x2Min: -5.12, x2Max: 5.12 },
    cameraPreset: 'overview',
    overlays: {
      contours: false,
      gradientField: false,
      basins: false,
      basinBoundaries: false,
      criticalPoints: {
        globalMinima: true,
        localMinima: false,
        localMaxima: false,
        saddlePoints: false,
      },
      gradientFlow: false,
      curvature: false,
      crossSection: { enabled: false, mode: 'x', position: 0 },
    },
    visualQuality: 'balanced',
    heightMapping: 'linear',
  };
}