import { describe, it, expect } from 'vitest';
import '../src/core/benchmarks';
import {
  SculptWorldDefinition, SculptFeature, SCULPT_SCHEMA_VERSION, MAX_SCULPT_FEATURES,
  composeSculptEval, buildSculptObjective, makeSculptFeature, SCULPT_PRESETS,
} from '../src/core/sculpt/SculptObjective';

const DOMAIN = { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 };

function def(features: SculptFeature[], base: SculptWorldDefinition['base'] = { kind: 'blank' }): SculptWorldDefinition {
  return { schemaVersion: SCULPT_SCHEMA_VERSION, id: 't', name: 'Test', domain: { ...DOMAIN }, base, features };
}

function feature(kind: SculptFeature['kind'], x1: number, x2: number, amp: number, s1: number, s2: number, rot = 0): SculptFeature {
  const f = makeSculptFeature(kind, x1, x2, DOMAIN);
  f.amplitude = amp; f.sigmaX1 = s1; f.sigmaX2 = s2; f.rotation = rot;
  return f;
}

describe('sculpt composition', () => {
  it('blank world is flat until a feature is added', () => {
    const empty = composeSculptEval(def([]));
    expect(empty(0, 0)).toBe(0);
    expect(empty(3, -2)).toBe(0);

    const v = composeSculptEval(def([feature('valley', 0, 0, -6, 1.8, 1.8)]));
    expect(v(0, 0)).toBeCloseTo(-6, 4);
    expect(Math.abs(v(5, 1))).toBeLessThan(0.2); // far from the valley
  });

  it('mountain raises objective, valley lowers it', () => {
    const m = composeSculptEval(def([feature('mountain', 2, 2, 6, 1.5, 1.5)]));
    expect(m(2, 2)).toBeCloseTo(6, 4);
    const v = composeSculptEval(def([feature('valley', 2, 2, -6, 1.5, 1.5)]));
    expect(v(2, 2)).toBeCloseTo(-6, 4);
  });

  it('combines base objective with sculpt features (formula + sculpt)', () => {
    const base = { kind: 'custom' as const, definition: { expression: 'x1^2 + x2^2', variables: ['x1', 'x2'] as ['x1', 'x2'], domain: DOMAIN, name: 'bowl' } };
    const f = composeSculptEval(def([
      feature('mountain', 2, 2, 6, 1.2, 1.2),
      feature('valley', 0, 0, -3, 1.5, 1.5),
    ], base));
    // base(2,2)=8, mountain≈+6, valley tail contributes a small negative amount
    expect(f(2, 2)).toBeGreaterThan(13.0);
    expect(f(2, 2)).toBeLessThan(13.8);
    // base(0,0)=0, deep valley≈-3, mountain tail a small positive amount
    expect(f(0, 0)).toBeLessThan(-2.2);
    expect(f(0, 0)).toBeGreaterThan(-3.0);
  });

  it('elliptical + rotated valley is anisotropic (rotation is mathematical)', () => {
    const rot = Math.PI / 4;
    const v = composeSculptEval(def([feature('valley', 0, 0, -6, 3, 0.5, rot)]));
    const d = 1.5;
    const along1 = v(Math.cos(rot) * d, Math.sin(rot) * d);
    const along2 = v(Math.cos(rot) * d, -Math.sin(rot) * d);
    const long = Math.min(along1, along2);   // sample nearer the long (sigma=3) axis
    const short = Math.max(along1, along2);  // sample nearer the short (sigma=0.5) axis
    // The valley is much deeper along its long axis than across it => anisotropic.
    expect(long).toBeLessThan(-4);
    expect(short).toBeGreaterThan(-0.3);
  });

  it('plateau has a flat-ish top', () => {
    const f = feature('plateau', 0, 0, 5, 2, 2);
    f.softness = 3;
    const v = composeSculptEval(def([f]));
    expect(v(0, 0)).toBeCloseTo(5, 4);
    expect(v(0.8, 0)).toBeGreaterThan(4.2);       // still near the top
    expect(v(2 * 2, 0)).toBeLessThan(0.6);         // far edge fades
  });

  it('deeper valley becomes the estimated optimum', () => {
    const shallow = feature('valley', -2, -1, -5, 2.2, 2.2);
    const deep = feature('valley', 2, 2, -9, 1.0, 1.0);
    const { objective } = buildSculptObjective(def([shallow, deep]));
    const g = objective.getGlobalMinima()[0];
    expect(Math.hypot(g.x1 - 2, g.x2 - 2)).toBeLessThan(0.6);
    expect(g.value).toBeLessThan(-8.5);
    expect(objective.definition.referenceSource).toBe('estimated');
  });

  it('runs on top of a built-in benchmark as base', () => {
    const { objective } = buildSculptObjective(def([feature('valley', 0, 0, -20, 1.5, 1.5)], { kind: 'builtin', id: 'rastrigin' }));
    // base rastrigin(0,0)=0 plus a deep valley => strongly negative near origin
    expect(objective.evaluate(0, 0)).toBeLessThan(-15);
  });
});

describe('sculpt serialization & presets', () => {
  it('round-trips to JSON and reproduces values', () => {
    const d = def([feature('valley', 1, -1, -5, 1.4, 2.2, 0.5), feature('mountain', -2, 2, 4, 1.1, 1.1)]);
    const round = JSON.parse(JSON.stringify(d)) as SculptWorldDefinition;
    const a = composeSculptEval(d);
    const b = composeSculptEval(round);
    for (const [x1, x2] of [[0, 0], [1.3, -2.1], [-3.7, 4.2], [2, -1]]) {
      expect(b(x1, x2)).toBeCloseTo(a(x1, x2), 9);
    }
  });

  it('exposes teaching presets within the feature cap', () => {
    expect(SCULPT_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of SCULPT_PRESETS) {
      const d = p.build();
      expect(d.features.length).toBeGreaterThan(0);
      expect(d.features.length).toBeLessThanOrEqual(MAX_SCULPT_FEATURES);
      const { objective } = buildSculptObjective(d);
      expect(isFinite(objective.evaluate(0, 0))).toBe(true);
    }
  });
});
