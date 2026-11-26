export interface NormalizationParams {
  mode: 'linear' | 'log' | 'quantile' | 'clamped-percentile';
  min?: number;
  max?: number;
  logBase?: number;
  quantileCount?: number;
  percentileLow?: number;
  percentileHigh?: number;
}

export interface Normalizer {
  normalize(value: number): number;
  denormalize(value: number): number;
  getParams(): NormalizationParams;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createLinearNormalizer(min: number, max: number): Normalizer {
  const range = max - min;
  return {
    normalize(value: number) {
      if (range === 0) return 0.5;
      return clamp((value - min) / range, 0, 1);
    },
    denormalize(value: number) {
      return min + clamp(value, 0, 1) * range;
    },
    getParams() {
      return { mode: 'linear', min, max };
    },
  };
}

export function createLogNormalizer(min: number, max: number, base: number = 10): Normalizer {
  const logMin = Math.log(min > 0 ? min : 1e-10) / Math.log(base);
  const logMax = Math.log(max > 0 ? max : 1e-10) / Math.log(base);
  const range = logMax - logMin;

  return {
    normalize(value: number) {
      if (range === 0) return 0.5;
      const logVal = Math.log(value > 0 ? value : 1e-10) / Math.log(base);
      return clamp((logVal - logMin) / range, 0, 1);
    },
    denormalize(value: number) {
      const logVal = logMin + clamp(value, 0, 1) * range;
      return Math.pow(base, logVal);
    },
    getParams() {
      return { mode: 'log', min, max, logBase: base };
    },
  };
}

export function createQuantileNormalizer(values: number[], quantileCount: number = 100): Normalizer {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  function getQuantile(q: number): number {
    const idx = q * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const t = idx - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  const min = getQuantile(0);
  const max = getQuantile(1);

  return {
    normalize(value: number) {
      if (max === min) return 0.5;
      let q = 0;
      for (let i = 0; i < quantileCount; i++) {
        if (value <= getQuantile((i + 1) / quantileCount)) {
          q = (i + 1) / quantileCount;
          break;
        }
      }
      return clamp(q, 0, 1);
    },
    denormalize(value: number) {
      return getQuantile(clamp(value, 0, 1));
    },
    getParams() {
      return { mode: 'quantile', min, max, quantileCount };
    },
  };
}

export function createClampedPercentileNormalizer(
  values: number[],
  lowPercentile: number = 2,
  highPercentile: number = 98
): Normalizer {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const lowIdx = Math.floor((lowPercentile / 100) * (n - 1));
  const highIdx = Math.floor((highPercentile / 100) * (n - 1));
  const min = sorted[lowIdx];
  const max = sorted[highIdx];
  const range = max - min;

  return {
    normalize(value: number) {
      if (range === 0) return 0.5;
      return clamp((value - min) / range, 0, 1);
    },
    denormalize(value: number) {
      return min + clamp(value, 0, 1) * range;
    },
    getParams() {
      return { mode: 'clamped-percentile', min, max, percentileLow: lowPercentile, percentileHigh: highPercentile };
    },
  };
}

export function createNormalizer(params: NormalizationParams, allValues?: number[]): Normalizer {
  const { mode, min = 0, max = 1, logBase = 10, quantileCount = 100, percentileLow = 2, percentileHigh = 98 } = params;

  switch (mode) {
    case 'linear':
      return createLinearNormalizer(min, max);
    case 'log':
      return createLogNormalizer(min, max, logBase);
    case 'quantile':
      if (!allValues || allValues.length === 0) {
        return createLinearNormalizer(min, max);
      }
      return createQuantileNormalizer(allValues, quantileCount);
    case 'clamped-percentile':
      if (!allValues || allValues.length === 0) {
        return createLinearNormalizer(min, max);
      }
      return createClampedPercentileNormalizer(allValues, percentileLow, percentileHigh);
    default:
      return createLinearNormalizer(min, max);
  }
}

export function computeMinMax(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}