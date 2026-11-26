export interface Vector2 {
  x: number;
  y: number;
}

export interface Matrix2 {
  m11: number; m12: number;
  m21: number; m22: number;
}

export interface CriticalPoint {
  x1: number;
  x2: number;
  value: number;
  type: 'global-minimum' | 'local-minimum' | 'local-maximum' | 'saddle';
  hessianEigenvalues?: [number, number];
  gradientMagnitude?: number;
  basinId?: number;
}

export interface CostFunctionDefinition {
  id: string;
  name: string;
  shortName: string;
  dimension: 2;
  evaluate: (x1: number, x2: number) => number;
  gradient?: (x1: number, x2: number) => Vector2;
  hessian?: (x1: number, x2: number) => Matrix2;
  domain: {
    x1Min: number;
    x1Max: number;
    x2Min: number;
    x2Max: number;
  };
  knownGlobalMinima: CriticalPoint[];
  knownLocalMinima?: CriticalPoint[];
  functionClass: 'convex' | 'nonconvex' | 'multimodal' | 'separable' | 'nonseparable';
  source?: 'builtin' | 'custom' | 'challenge';
  referenceSource?: 'builtin' | 'user' | 'estimated';
  metadata: {
    description: string;
    difficulty: string;
    topologyNotes: string;
  };
}

export type ViewMode = 'natural' | 'scientific' | 'topographic';

export interface WorldConfiguration {
  functionId: string;
  resolution: number;
  verticalScale: number;
  viewMode: ViewMode;
  normalizationMode: 'linear' | 'log' | 'quantile' | 'clamped-percentile';
  contourMode: 'linear' | 'log' | 'quantile';
  contourCount: number;
  domain: {
    x1Min: number;
    x1Max: number;
    x2Min: number;
    x2Max: number;
  };
  cameraPreset: string;
  overlays: {
    contours: boolean;
    gradientField: boolean;
    basins: boolean;
    basinBoundaries: boolean;
    criticalPoints: {
      globalMinima: boolean;
      localMinima: boolean;
      localMaxima: boolean;
      saddlePoints: boolean;
    };
    gradientFlow: boolean;
    curvature: boolean;
    crossSection: {
      enabled: boolean;
      mode: 'x' | 'z' | 'custom';
      position: number;
      customLine?: { x1: number; x2: number }[];
    };
  };
  visualQuality: 'performance' | 'balanced' | 'presentation' | 'ultra';
  heightMapping: 'raw' | 'linear' | 'log' | 'quantile' | 'clamped-percentile';
}

export interface LandscapeBuffers {
  costBuffer: Float32Array;
  normalizedCostBuffer: Float32Array;
  gradientXBuffer: Float32Array;
  gradientZBuffer: Float32Array;
  gradientMagnitudeBuffer: Float32Array;
  curvatureBuffer: Float32Array;
  criticalPointBuffer: CriticalPoint[];
  basinIdBuffer: Int32Array;
  resolution: number;
  domain: { x1Min: number; x1Max: number; x2Min: number; x2Max: number };
}

export interface WorldSample {
  optimizationPosition: { x1: number; x2: number };
  worldPosition: { x: number; y: number; z: number };
  cost: number;
  normalizedCost: number;
  gradient: Vector2;
  surfaceNormal: { x: number; y: number; z: number };
  slope: number;
  curvature: number;
  basinId?: number;
}

export interface CrossSectionProfile {
  parameter: Float32Array;
  cost: Float32Array;
  gradientMagnitude: Float32Array;
  slope: Float32Array;
}

export interface ProbeData {
  x1: number;
  x2: number;
  worldX: number;
  worldZ: number;
  cost: number;
  normalizedCost: number;
  gradientX: number;
  gradientZ: number;
  gradientMagnitude: number;
  slope: number;
  curvature: number;
  basinId?: number;
  surfaceNormal: { x: number; y: number; z: number };
}

export interface DistanceMeasurement {
  pointA: ProbeData;
  pointB: ProbeData;
  optimizationDistance: number;
  costDifference: number;
  worldDistance: number;
}

export type NormalizationMode = 'linear' | 'log' | 'quantile' | 'clamped-percentile';
export type ContourMode = 'linear' | 'log' | 'quantile';
export type HeightMappingMode = 'raw' | 'linear' | 'log' | 'quantile' | 'clamped-percentile';
export type VisualQuality = 'performance' | 'balanced' | 'presentation' | 'ultra';
export type CameraPreset = 'orbit' | 'top-down' | 'valley-view' | 'low-flyover' | 'minimum-focus' | 'saddle-focus' | 'cross-section' | 'cinematic' | 'overview';
export type CrossSectionMode = 'x' | 'z' | 'custom';

export interface ResolutionLevel {
  name: string;
  resolution: number;
  description: string;
}

export const RESOLUTION_LEVELS: ResolutionLevel[] = [
  { name: 'Preview', resolution: 64, description: 'Fast interaction' },
  { name: 'Standard', resolution: 128, description: 'Balanced quality' },
  { name: 'High', resolution: 256, description: 'High detail' },
  { name: 'Ultra', resolution: 512, description: 'Maximum detail' },
];

export interface BasinInfo {
  id: number;
  minimum: CriticalPoint;
  size: number;
  color: string;
}
