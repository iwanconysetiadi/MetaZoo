import { Vector2 } from './Types';

export interface GradientOptions {
  epsilon?: number;
  method?: 'central' | 'forward' | 'backward';
}

const DEFAULT_EPSILON = 1e-6;
const MIN_EPSILON = 1e-12;

export function computeGradient(
  f: (x1: number, x2: number) => number,
  x1: number,
  x2: number,
  options: GradientOptions = {}
): Vector2 {
  const epsilon = Math.max(options.epsilon ?? DEFAULT_EPSILON, MIN_EPSILON);
  const method = options.method ?? 'central';

  let dx1: number, dx2: number;

  switch (method) {
    case 'central': {
      const f_x1_plus = f(x1 + epsilon, x2);
      const f_x1_minus = f(x1 - epsilon, x2);
      const f_x2_plus = f(x1, x2 + epsilon);
      const f_x2_minus = f(x1, x2 - epsilon);

      dx1 = (f_x1_plus - f_x1_minus) / (2 * epsilon);
      dx2 = (f_x2_plus - f_x2_minus) / (2 * epsilon);
      break;
    }
    case 'forward': {
      const f_x = f(x1, x2);
      dx1 = (f(x1 + epsilon, x2) - f_x) / epsilon;
      dx2 = (f(x1, x2 + epsilon) - f_x) / epsilon;
      break;
    }
    case 'backward': {
      const f_x = f(x1, x2);
      dx1 = (f_x - f(x1 - epsilon, x2)) / epsilon;
      dx2 = (f_x - f(x1, x2 - epsilon)) / epsilon;
      break;
    }
  }

  if (!isFinite(dx1)) dx1 = 0;
  if (!isFinite(dx2)) dx2 = 0;

  return { x: dx1, y: dx2 };
}

export function computeGradientBatch(
  f: (x1: number, x2: number) => number,
  points: Array<{ x1: number; x2: number }>,
  options: GradientOptions = {}
): Vector2[] {
  return points.map(p => computeGradient(f, p.x1, p.x2, options));
}

export function computeGradientMagnitude(gradient: Vector2): number {
  return Math.hypot(gradient.x, gradient.y);
}

export function computeGradientDirection(gradient: Vector2): Vector2 {
  const mag = computeGradientMagnitude(gradient);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: gradient.x / mag, y: gradient.y / mag };
}