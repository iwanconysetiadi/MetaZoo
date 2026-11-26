import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const a = 20;
const b = 0.2;
const c = 2 * Math.PI;

const ackleyDefinition: CostFunctionDefinition = {
  id: 'ackley',
  name: "Ackley's Function",
  shortName: 'Ackley',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const sumSq = x1 * x1 + x2 * x2;
    const sumCos = Math.cos(c * x1) + Math.cos(c * x2);
    return -a * Math.exp(-b * Math.sqrt(0.5 * sumSq)) - Math.exp(0.5 * sumCos) + a + Math.E;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const sumSq = x1 * x1 + x2 * x2;
    const sumCos = Math.cos(c * x1) + Math.cos(c * x2);
    const r = Math.sqrt(0.5 * sumSq);
    const exp1 = Math.exp(-b * r);
    const exp2 = Math.exp(0.5 * sumCos);
    const factor = (a * b * exp1) / (2 * r);
    return {
      x: factor * x1 + 0.5 * c * Math.sin(c * x1) * exp2,
      y: factor * x2 + 0.5 * c * Math.sin(c * x2) * exp2,
    };
  },
  domain: { x1Min: -32.768, x1Max: 32.768, x2Min: -32.768, x2Max: 32.768 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Nearly flat outer region with a narrow central hole. Many local minima on the outer ring.',
    difficulty: 'Hard',
    topologyNotes: 'Global minimum at origin in a narrow basin. Outer region has many shallow local minima.',
  },
};

export class AckleyFunction extends CostFunction {
  readonly definition = ackleyDefinition;
}

globalRegistry.register(new AckleyFunction());
export default AckleyFunction;