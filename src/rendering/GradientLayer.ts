import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { LandscapeBuffers } from '../core/math/Types';

export type GradientDensity = 'low' | 'medium' | 'high';

const DENSITY_MAP: Record<GradientDensity, number> = {
  low: 8,
  medium: 16,
  high: 32,
};

export class GradientLayer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private arrows: THREE.Group;
  private currentBuffers: LandscapeBuffers | null = null;
  private density: GradientDensity = 'medium';
  private scale = 1.0;
  private visible = false;

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.arrows = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.arrows);
  }

  rebuild(): void {
    this.clear();
    this.currentBuffers = this.world.getLandscapeBuffers();
    if (!this.currentBuffers || !this.visible) return;
    this.generateArrows();
  }

  private generateArrows(): void {
    const buffers = this.currentBuffers!;
    const res = buffers.resolution;
    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    const sampleRate = DENSITY_MAP[this.density];
    const step = Math.max(1, Math.floor(res / sampleRate));

    const arrowGeometry = new THREE.ConeGeometry(0.3, 1, 8);
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0x78b8a4,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    for (let i = 0; i < res; i += step) {
      const x1 = x1Min + (i / (res - 1)) * domainWidth;
      for (let j = 0; j < res; j += step) {
        const x2 = x2Min + (j / (res - 1)) * domainHeight;
        const idx = i * res + j;

        const gx = -buffers.gradientXBuffer[idx];
        const gz = -buffers.gradientZBuffer[idx];
        const mag = Math.hypot(gx, gz);

        if (mag < 1e-4) continue;

        const origin = this.world.optimizationToWorld(x1,x2);
        const eps = Math.min(domainWidth,domainHeight) * 1e-4;
        const along = this.world.optimizationToWorld(x1 + gx/mag*eps, x2 + gz/mag*eps);
        const dirX = along.x-origin.x;
        const dirZ = along.z-origin.z;
        const length = Math.min(mag * this.scale * 2, 5);

        const { x, z } = this.world.optimizationToWorld(x1, x2);
        const y = this.world.getTerrainHeight(x1, x2) + 0.5;

        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.position.set(x, y, z);
        
        const angle = Math.atan2(dirX, dirZ);
        arrow.rotation.y = angle;
        arrow.rotation.x = -Math.PI / 2;
        arrow.scale.set(1, length, 1);
        
        this.arrows.add(arrow);
      }
    }
  }

  clear(): void {
    while (this.arrows.children.length > 0) {
      const child = this.arrows.children[0];
      this.arrows.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.arrows.visible = visible;
    if (visible) this.rebuild();
  }

  setDensity(density: GradientDensity): void {
    this.density = density;
    this.rebuild();
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.rebuild();
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.arrows);
  }
}