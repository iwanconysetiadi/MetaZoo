import { describe, expect, it } from 'vitest';
import { squareToIsland, islandToSquare, islandEdgeRadius } from '../src/core/world/IslandProjection';
import { OptimizationWorld, createDefaultConfig } from '../src/core/world/OptimizationWorld';

describe('organic island coordinate presentation', () => {
  it('round-trips the entire domain including corners, axes and center', () => {
    for (let i=0;i<=20;i++) for(let j=0;j<=20;j++) {
      const s=i/10-1, t=j/10-1;
      const p=squareToIsland(s,t), restored=islandToSquare(p.x,p.z);
      expect(restored.s).toBeCloseTo(s,10); expect(restored.t).toBeCloseTo(t,10);
    }
  });

  it('maps every domain edge onto the organic coastline without clipping corners', () => {
    for(let i=0;i<=40;i++) for(const [s,t] of [[-1,i/20-1],[1,i/20-1],[i/20-1,-1],[i/20-1,1]]) {
      const p=squareToIsland(s,t);
      expect(Math.hypot(p.x,p.z)).toBeCloseTo(islandEdgeRadius(Math.atan2(p.z,p.x)),10);
    }
  });

  it('keeps interior agents inside the shoreline and preserves objective coordinates', () => {
    const config=createDefaultConfig(); config.domain={x1Min:-3,x1Max:7,x2Min:-9,x2Max:2};
    const world=new OptimizationWorld(config);
    for(let i=0;i<=10;i++) for(let j=0;j<=10;j++) {
      const x1=-3+i, x2=-9+j*1.1;
      const p=world.optimizationToWorld(x1,x2), q=world.worldToOptimization(p.x,p.z);
      expect(q.x1).toBeCloseTo(x1,9); expect(q.x2).toBeCloseTo(x2,9);
      expect(world.evaluate(q.x1,q.x2)).toBeCloseTo(world.evaluate(x1,x2),8);
      expect(Math.hypot(p.x/90,p.z/90)).toBeLessThanOrEqual(islandEdgeRadius(Math.atan2(p.z,p.x))+1e-9);
    }
  });
});
