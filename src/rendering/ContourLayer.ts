import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { LandscapeBuffers } from '../core/math/Types';

export class ContourLayer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private contourLines: THREE.Group;
  private currentBuffers: LandscapeBuffers | null = null;
  private contourCount = 20;
  private contourMode: 'linear' | 'log' | 'quantile' = 'linear';
  private thickness = 1;
  private opacity = 0.5;
  private visible = true;

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.contourLines = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.contourLines);
  }

  rebuild(): void {
    this.clear();
    this.currentBuffers = this.world.getLandscapeBuffers();
    if (!this.currentBuffers || !this.visible) return;
    this.generateContours();
  }

  private generateContours(): void {
    const buffers = this.currentBuffers!;
    const res = buffers.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    const levels = this.computeContourLevels(buffers);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.opacity,
      depthWrite: false,
    });

    for (const level of levels) {
      const lines = this.marchingSquares(buffers, level, res);
      for (const line of lines) {
        if (line.length < 2) continue;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(line.length * 3);
        
        for (let i = 0; i < line.length; i++) {
          const { x1, x2 } = line[i];
          const { x, z } = this.world.optimizationToWorld(x1, x2);
          const y = this.world.getTerrainHeight(x1, x2) + 0.1;
          positions[i * 3] = x;
          positions[i * 3 + 1] = y;
          positions[i * 3 + 2] = z;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mesh = new THREE.Line(geometry, material.clone());
        this.contourLines.add(mesh);
      }
    }
  }

  private computeContourLevels(buffers: LandscapeBuffers): number[] {
    const values = Array.from(buffers.normalizedCostBuffer);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const levels: number[] = [];

    if (this.contourMode === 'linear') {
      for (let i = 1; i <= this.contourCount; i++) {
        levels.push(min + (i / (this.contourCount + 1)) * (max - min));
      }
    } else if (this.contourMode === 'log') {
      const logMin = Math.log(min + 1e-10);
      const logMax = Math.log(max + 1e-10);
      for (let i = 1; i <= this.contourCount; i++) {
        const t = i / (this.contourCount + 1);
        levels.push(Math.exp(logMin + t * (logMax - logMin)) - 1e-10);
      }
    } else if (this.contourMode === 'quantile') {
      const sorted = [...values].sort((a, b) => a - b);
      for (let i = 1; i <= this.contourCount; i++) {
        const idx = Math.floor((i / (this.contourCount + 1)) * (sorted.length - 1));
        levels.push(sorted[idx]);
      }
    }

    return levels;
  }

  private marchingSquares(
    buffers: LandscapeBuffers,
    level: number,
    res: number
  ): Array<Array<{ x1: number; x2: number }>> {
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;
    const normals = buffers.normalizedCostBuffer;

    const lines: Array<Array<{ x1: number; x2: number }>> = [];
    const visited = new Set<string>();

    for (let i = 0; i < res - 1; i++) {
      for (let j = 0; j < res - 1; j++) {
        const idx = i * res + j;
        const v0 = normals[idx];
        const v1 = normals[idx + 1];
        const v2 = normals[idx + res];
        const v3 = normals[idx + res + 1];

        const bits = ((v0 > level) ? 1 : 0) |
                     ((v1 > level) ? 2 : 0) |
                     ((v3 > level) ? 4 : 0) |
                     ((v2 > level) ? 8 : 0);

        if (bits === 0 || bits === 15) continue;

        const x1 = x1Min + (i / (res - 1)) * domainWidth;
        const x2 = x1Min + ((i + 1) / (res - 1)) * domainWidth;
        const y1 = x2Min + (j / (res - 1)) * domainHeight;
        const y2 = x2Min + ((j + 1) / (res - 1)) * domainHeight;

        const pts: { x1: number; x2: number }[] = [];

        if ((bits & 1) !== (bits & 2)) {
          const t = (level - v0) / (v1 - v0);
          pts.push({ x1: x1 + t * (x2 - x1), x2: y1 });
        }
        if ((bits & 2) !== (bits & 4)) {
          const t = (level - v1) / (v3 - v1);
          pts.push({ x1: x2, x2: y1 + t * (y2 - y1) });
        }
        if ((bits & 4) !== (bits & 8)) {
          const t = (level - v3) / (v2 - v3);
          pts.push({ x1: x2 - t * (x2 - x1), x2: y2 });
        }
        if ((bits & 8) !== (bits & 1)) {
          const t = (level - v2) / (v0 - v2);
          pts.push({ x1: x1, x2: y2 - t * (y2 - y1) });
        }

        if (pts.length >= 2) {
          const key = `${pts[0].x1.toFixed(3)},${pts[0].x2.toFixed(3)}`;
          if (!visited.has(key)) {
            visited.add(key);
            lines.push(pts);
          }
        }
      }
    }

    return lines;
  }

  clear(): void {
    while (this.contourLines.children.length > 0) {
      const child = this.contourLines.children[0];
      this.contourLines.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.contourLines.visible = visible;
  }

  setParams(count: number, mode: 'linear' | 'log' | 'quantile', thickness: number, opacity: number): void {
    this.contourCount = count;
    this.contourMode = mode;
    this.thickness = thickness;
    this.opacity = opacity;
    this.rebuild();
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.contourLines);
  }
}