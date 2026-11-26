import { CostFunction, globalRegistry } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { parseExpression } from '../expression';
import { SearchDomain, estimateOptimum } from './ReferenceOptimum';

export type ConstraintShape =
  | { kind: 'circle'; cx: number; cz: number; r: number }
  | { kind: 'rect'; x1Min: number; x1Max: number; x2Min: number; x2Max: number }
  | { kind: 'polygon'; points: Array<[number, number]> };

export interface ConstraintDef {
  id: string;
  shape: ConstraintShape;
  mode: 'allowed' | 'forbidden';
}

export interface SyntheticBasin {
  x1: number;
  x2: number;
  depth: number;
  radius: number;
  radiusX2?: number;
  rotation?: number;
}

export interface TransformDef {
  translationX: number;
  translationX2: number;
  rotation: number;
  scaleX1: number;
  scaleX2: number;
}

export interface NoiseDef {
  enabled: boolean;
  sigma: number;
  seed: number;
}

export interface DynamicDef {
  enabled: boolean;
  mode: 'linear' | 'circular' | 'oscillating';
  amplitude: number;
  speed: number;
  depth: number;
  radius: number;
  centerX?: number;
  centerZ?: number;
}

export interface CustomObjectiveDefinition {
  expression: string;
  variables: ['x1', 'x2'];
  domain: SearchDomain;
  name: string;
  description?: string;
  userReferenceOptimum?: { x1: number; x2: number; value: number };
}

export type ChallengeBase =
  | { kind: 'builtin'; id: string }
  | { kind: 'custom'; definition: CustomObjectiveDefinition };

export interface ChallengeDefinition {
  schemaVersion: number;
  id: string;
  name: string;
  base: ChallengeBase;
  transform: TransformDef;
  syntheticBasins: SyntheticBasin[];
  constraints: ConstraintDef[];
  noise?: NoiseDef;
  dynamics?: DynamicDef;
  seed: number;
  constraintMode?: 'hard' | 'penalty';
  penaltyLambda?: number;
  referenceOptimum?: { x1: number; x2: number; value: number };
  metadata: { description?: string; learningObjective?: string; tags: string[] };
}

export const SCHEMA_VERSION = 1;

export const IDENTITY_TRANSFORM: TransformDef = {
  translationX: 0, translationX2: 0, rotation: 0, scaleX1: 1, scaleX2: 1,
};

// ---------------------------------------------------------------- helpers
function hash01(seed: number, step: number, x1: number, x2: number, salt: number): number {
  let h = 2166136261 >>> 0;
  const s0 = seed | 0;
  const s1 = step | 0;
  const s2 = Math.round(x1 * 100000) | 0;
  const s3 = Math.round(x2 * 100000) | 0;
  h = Math.imul(h ^ s0, 16777619) >>> 0;
  h = Math.imul(h ^ s1, 16777619) >>> 0;
  h = Math.imul(h ^ s2, 16777619) >>> 0;
  h = Math.imul(h ^ s3, 16777619) >>> 0;
  h = Math.imul(h ^ salt, 16777619) >>> 0;
  return (h >>> 0) / 4294967296;
}

function insideShape(shape: ConstraintShape, x1: number, x2: number): boolean {
  if (shape.kind === 'circle') {
    const dx = x1 - shape.cx, dz = x2 - shape.cz;
    return dx * dx + dz * dz <= shape.r * shape.r;
  }
  if (shape.kind === 'rect') {
    return x1 >= shape.x1Min && x1 <= shape.x1Max && x2 >= shape.x2Min && x2 <= shape.x2Max;
  }
  // polygon ray-casting
  const pts = shape.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1];
    const xj = pts[j][0], zj = pts[j][1];
    const intersect = (zi > x2) !== (zj > x2) && x1 < ((xj - xi) * (x2 - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isIdentityTransform(t: TransformDef): boolean {
  return t.translationX === 0 && t.translationX2 === 0 && t.rotation === 0 && t.scaleX1 === 1 && t.scaleX2 === 1;
}

// ---------------------------------------------------------------- composed objective
export class ComposedObjective extends CostFunction {
  readonly definition: CostFunctionDefinition;

  private baseEval: (x1: number, x2: number) => number;
  private domain: SearchDomain;
  private transform: TransformDef;
  private basins: SyntheticBasin[];
  private constraints: ConstraintDef[];
  private noise?: NoiseDef;
  private dynamics?: DynamicDef;
  private seed: number;
  private constraintMode: 'hard' | 'penalty';
  private penaltyLambda: number;
  private baseName: string;

  private simTime = 0;
  private simStep = 0;

  constructor(
    baseName: string,
    baseEval: (x1: number, x2: number) => number,
    domain: SearchDomain,
    def: {
      id: string; name: string; source: 'custom' | 'challenge';
      transform: TransformDef; syntheticBasins: SyntheticBasin[]; constraints: ConstraintDef[];
      noise?: NoiseDef; dynamics?: DynamicDef; seed: number;
      constraintMode?: 'hard' | 'penalty'; penaltyLambda?: number;
      referenceOptimum?: { x1: number; x2: number; value: number };
      description?: string; learningObjective?: string; tags?: string[];
      baseHasKnownOptimum?: CriticalPoint[];
    },
  ) {
    super();
    this.baseName = baseName;
    this.baseEval = baseEval;
    this.domain = domain;
    this.transform = def.transform;
    this.basins = def.syntheticBasins;
    this.constraints = def.constraints;
    this.noise = def.noise;
    this.dynamics = def.dynamics;
    this.seed = def.seed;
    this.constraintMode = def.constraintMode ?? 'hard';
    this.penaltyLambda = def.penaltyLambda ?? 10;

    // Resolve reference optimum.
    let ref: { x1: number; x2: number; value: number } | null = null;
    let referenceSource: 'user' | 'builtin' | 'estimated' = 'estimated';

    if (def.referenceOptimum && isFinite(def.referenceOptimum.value)) {
      ref = def.referenceOptimum;
      referenceSource = 'user';
    } else if (isIdentityTransform(def.transform) && def.syntheticBasins.length === 0 &&
               !def.dynamics?.enabled && def.baseHasKnownOptimum && def.baseHasKnownOptimum.length > 0) {
      const g = def.baseHasKnownOptimum[0];
      ref = { x1: g.x1, x2: g.x2, value: g.value };
      referenceSource = 'builtin';
    } else {
      const est = estimateOptimum((a, b) => this.evaluateTrue(a, b), this.domain, (a, b) => this.isFeasible(a, b), 41);
      if (isFinite(est.value)) {
        ref = { x1: est.x1, x2: est.x2, value: est.value };
        referenceSource = 'estimated';
      }
    }

    const globalMinima: CriticalPoint[] = ref
      ? [{
          x1: ref.x1, x2: ref.x2, value: ref.value,
          type: 'global-minimum', gradientMagnitude: 0,
        }]
      : [];

    const tagList = def.tags ?? [];
    const topology = [
      def.syntheticBasins.length > 0 ? 'synthetic basins' : null,
      def.constraints.length > 0 ? 'constrained' : null,
      def.noise?.enabled ? 'noisy' : null,
      def.dynamics?.enabled ? 'dynamic' : null,
    ].filter(Boolean).join(', ');

    this.definition = {
      id: def.id,
      name: def.name,
      shortName: def.name,
      dimension: 2,
      evaluate: (x1, x2) => this.evaluateTrue(x1, x2),
      domain: { ...domain },
      knownGlobalMinima: globalMinima,
      functionClass: (def.syntheticBasins.length > 0 || def.source === 'challenge') ? 'multimodal' : 'nonconvex',
      source: def.source,
      referenceSource,
      metadata: {
        description: def.description ?? 'User-defined optimization objective.',
        difficulty: referenceSource === 'builtin' ? 'Custom' : 'Custom',
        topologyNotes: topology || (tagList.join(', ') || 'custom objective'),
      },
    };
  }

  // -- transforms ---------------------------------------------------------
  private transformCoords(x1: number, x2: number): { x: number; y: number } {
    const t = this.transform;
    const u1 = x1 - t.translationX;
    const u2 = x2 - t.translationX2;
    const c = Math.cos(t.rotation);
    const s = Math.sin(t.rotation);
    const r1 = c * u1 - s * u2;
    const r2 = s * u1 + c * u2;
    return { x: t.scaleX1 * r1, y: t.scaleX2 * r2 };
  }

  private evalBasinAt(cx: number, cz: number, depth: number, radius: number, radiusX2: number, rotation: number, x1: number, x2: number): number {
    let dx = x1 - cx;
    let dz = x2 - cz;
    if (rotation) {
      const c = Math.cos(rotation), s = Math.sin(rotation);
      const nx = c * dx - s * dz;
      const nz = s * dx + c * dz;
      dx = nx; dz = nz;
    }
    const q = (dx * dx) / (radius * radius) + (dz * dz) / (radiusX2 * radiusX2);
    return -depth * Math.exp(-0.5 * q);
  }

  private evalBasins(x1: number, x2: number): number {
    let sum = 0;
    for (const b of this.basins) {
      sum += this.evalBasinAt(b.x1, b.x2, b.depth, b.radius, b.radiusX2 ?? b.radius, b.rotation ?? 0, x1, x2);
    }
    if (this.dynamics?.enabled) {
      const c = this.dynamicCenter();
      const d = this.dynamics;
      sum += this.evalBasinAt(c.x1, c.x2, d.depth, d.radius, d.radius, 0, x1, x2);
    }
    return sum;
  }

  // -- dynamic optimum ----------------------------------------------------
  dynamicCenter(): { x1: number; x2: number } {
    const d = this.dynamics;
    if (!d?.enabled) return { x1: NaN, x2: NaN };
    const cx = d.centerX ?? (this.domain.x1Min + this.domain.x1Max) / 2;
    const cz = d.centerZ ?? (this.domain.x2Min + this.domain.x2Max) / 2;
    const t = this.simTime * d.speed;
    if (d.mode === 'circular') {
      return { x1: cx + d.amplitude * Math.cos(t), x2: cz + d.amplitude * Math.sin(t) };
    }
    if (d.mode === 'oscillating') {
      return { x1: cx, x2: cz + d.amplitude * Math.sin(t) };
    }
    // linear (triangle wave, -1..1)
    const phase = ((t / Math.PI) % 2 + 2) % 2;
    const tri = phase < 1 ? -1 + 2 * phase : 3 - 2 * phase;
    return { x1: cx + d.amplitude * tri, x2: cz };
  }

  // -- evaluation ---------------------------------------------------------
  evaluateTrue(x1: number, x2: number): number {
    const w = this.transformCoords(x1, x2);
    let v = this.baseEval(w.x, w.y);
    if (!isFinite(v)) return NaN;
    v += this.evalBasins(x1, x2);
    if (this.constraintMode === 'penalty' && !this.isFeasible(x1, x2)) {
      v += this.penaltyLambda * Math.pow(this.constraintViolation(x1, x2), 2);
    }
    return v;
  }

  evaluateObserved(x1: number, x2: number): number {
    const base = this.evaluateTrue(x1, x2);
    if (!this.noise?.enabled) return base;
    const u1 = Math.max(1e-9, hash01(this.noise.seed, this.simStep, x1, x2, 1));
    const u2 = hash01(this.noise.seed, this.simStep, x1, x2, 2);
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return base + this.noise.sigma * g;
  }

  // -- constraints --------------------------------------------------------
  isFeasible(x1: number, x2: number): boolean {
    if (this.constraints.length === 0) return true;
    const allowed = this.constraints.filter(c => c.mode === 'allowed');
    const forbidden = this.constraints.filter(c => c.mode === 'forbidden');
    let ok = true;
    if (allowed.length > 0) ok = allowed.some(c => insideShape(c.shape, x1, x2));
    if (ok) ok = !forbidden.some(c => insideShape(c.shape, x1, x2));
    return ok;
  }

  constraintViolation(x1: number, x2: number): number {
    if (this.isFeasible(x1, x2)) return 0;
    return 1;
  }

  // -- simulation ---------------------------------------------------------
  setTime(t: number): void {
    this.simTime = t;
    this.simStep = Math.round(t * 20);
  }

  setStep(step: number): void {
    this.simStep = step;
    this.simTime = step / 20;
  }

  getTime(): number {
    return this.simTime;
  }

  getGradientSafe(x1: number, x2: number): Vector2 {
    return this.gradient(x1, x2);
  }

  getBaseName(): string { return this.baseName; }
}

// ---------------------------------------------------------------- builder
export interface BuildResult {
  objective: ComposedObjective;
  domain: SearchDomain;
  baseName: string;
}

export function buildChallengeObjective(def: ChallengeDefinition, simTime = 0): BuildResult {
  let baseEval: (x1: number, x2: number) => number;
  let domain: SearchDomain;
  let baseName: string;
  let baseKnown: CriticalPoint[] | undefined;

  if (def.base.kind === 'builtin') {
    const fn = globalRegistry.get(def.base.id);
    if (!fn) throw new Error(`Unknown base benchmark "${def.base.id}"`);
    baseEval = (x1, x2) => fn.evaluate(x1, x2);
    const d = fn.definition.domain;
    domain = { x1Min: d.x1Min, x1Max: d.x1Max, x2Min: d.x2Min, x2Max: d.x2Max };
    baseName = fn.definition.shortName || fn.definition.name;
    baseKnown = fn.definition.knownGlobalMinima;
  } else {
    const cd = def.base.definition;
    const parsed = parseExpression(cd.expression);
    baseEval = parsed.evaluate;
    domain = { ...cd.domain };
    baseName = cd.name;
  }

  const isPlainCustom = def.base.kind === 'custom' && (def.metadata.tags ?? []).includes('custom');

  const objective = new ComposedObjective(baseName, baseEval, domain, {
    id: def.id,
    name: def.name,
    source: isPlainCustom ? 'custom' : 'challenge',
    transform: def.transform,
    syntheticBasins: def.syntheticBasins,
    constraints: def.constraints,
    noise: def.noise,
    dynamics: def.dynamics,
    seed: def.seed,
    constraintMode: def.constraintMode,
    penaltyLambda: def.penaltyLambda,
    referenceOptimum: def.referenceOptimum,
    description: def.metadata.description,
    learningObjective: def.metadata.learningObjective,
    tags: def.metadata.tags,
    baseHasKnownOptimum: baseKnown,
  });

  objective.setTime(simTime);
  return { objective, domain, baseName };
}
