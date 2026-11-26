import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const easomDefinition: CostFunctionDefinition = {
  id: 'easom',
  name: 'Easom Function',
  shortName: 'Easom',
  dimension: 2,
  evaluate: (x1: number, x2: number) => -Math.cos(x1) * Math.cos(x2) * Math.exp(-(x1 - Math.PI) * (x1 - Math.PI) - (x2 - Math.PI) * (x2 - Math.PI)),
  gradient: (x1: number, x2: number): Vector2 => {
    const dx1 = x1 - Math.PI;
    const dx2 = x2 - Math.PI;
    const expTerm = Math.exp(-dx1 * dx1 - dx2 * dx2);
    const cos1 = Math.cos(x1);
    const cos2 = Math.cos(x2);
    const sin1 = Math.sin(x1);
    const sin2 = Math.sin(x2);
    return {
      x: expTerm * (sin1 * cos2 - 2 * dx1 * cos1 * cos2),
      y: expTerm * (cos1 * sin2 - 2 * dx2 * cos1 * cos2),
    };
  },
  domain: { x1Min: -100, x1Max: 100, x2Min: -100, x2Max: 100 },
  knownGlobalMinima: [
    { x1: Math.PI, x2: Math.PI, value: -1, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'nonconvex',
  metadata: {
    description: 'Single narrow global minimum at (π, π) surrounded by vast flat region. Extremely deceptive.',
    difficulty: 'Very Hard',
    topologyNotes: 'Global minimum value -1 at (π, π). Function is nearly zero everywhere else. Needle in a haystack.',
  },
};

export class EasomFunction extends CostFunction {
  readonly definition = easomDefinition;
}

globalRegistry.register(new EasomFunction());
export default EasomFunction;