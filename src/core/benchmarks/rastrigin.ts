import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const A = 10;
const TWO_PI = 2 * Math.PI;

const rastriginDefinition: CostFunctionDefinition = {
  id: 'rastrigin',
  name: "Rastrigin's Function",
  shortName: 'Rastrigin',
  dimension: 2,
  evaluate: (x1: number, x2: number) => A * 2 + x1 * x1 - A * Math.cos(TWO_PI * x1) + x2 * x2 - A * Math.cos(TWO_PI * x2),
  gradient: (x1: number, x2: number): Vector2 => ({
    x: 2 * x1 + A * TWO_PI * Math.sin(TWO_PI * x1),
    y: 2 * x2 + A * TWO_PI * Math.sin(TWO_PI * x2),
  }),
  domain: { x1Min: -5.12, x1Max: 5.12, x2Min: -5.12, x2Max: 5.12 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', hessianEigenvalues: [2 + A * TWO_PI * TWO_PI, 2 + A * TWO_PI * TWO_PI], gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Highly multimodal with many regularly spaced local minima. Classic test for global optimization.',
    difficulty: 'Hard',
    topologyNotes: 'Regular lattice of local minima offset slightly from integer coordinates. Global minimum f=0 at the origin; local minima rise with distance from it.',
  },
};

// NOTE: Rastrigin's local minima are NOT located at integer coordinates.
// The 1-D stationary points satisfy 2x + 20*pi*sin(2*pi*x) = 0, whose non-zero
// minima sit near x ~= n * 0.99496 (n != 0). Hard-coding integers here produced
// invalid critical points, so the local minima are now discovered and validated
// by the numerical critical-point pipeline in LandscapeSampler instead.

export class RastriginFunction extends CostFunction {
  readonly definition = rastriginDefinition;
}

globalRegistry.register(new RastriginFunction());
export default RastriginFunction;