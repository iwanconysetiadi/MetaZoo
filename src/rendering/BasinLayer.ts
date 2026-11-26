import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { LandscapeBuffers, CriticalPoint } from '../core/math/Types';

export class BasinLayer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private basinMesh: THREE.Mesh | null = null;
  private boundaryLines: THREE.Group;
  private currentBuffers: LandscapeBuffers | null = null;
  private visible = false;
  private boundariesVisible = false;

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.boundaryLines = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.boundaryLines);
  }

  rebuild(): void {
    this.clear();
    this.currentBuffers = this.world.getLandscapeBuffers();
    if (!this.currentBuffers || (!this.visible && !this.boundariesVisible)) return;
    
    if (this.visible) this.generateBasinOverlay();
    if (this.boundariesVisible) this.generateBoundaries();
  }

  private generateBasinOverlay(): void {
    const buffers = this.currentBuffers!;
    const res = buffers.resolution;
    const basinMap = this.world.getBasinMap();
    if (!basinMap) return;

    const { basinIds, basins } = basinMap;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(res * res * 3);
    const colors = new Float32Array(res * res * 3);
    const uvs = new Float32Array(res * res * 2);
    const tmpColor = new THREE.Color();

    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;

    for (let i = 0; i < res; i++) {
      const x1 = x1Min + (i / (res - 1)) * domainWidth;
      const v = i / (res - 1);
      for (let j = 0; j < res; j++) {
        const x2 = x2Min + (j / (res - 1)) * domainHeight;
        const u = j / (res - 1);
        const idx = i * res + j;

        const { x, z } = this.world.optimizationToWorld(x1, x2);
        const y = this.world.getTerrainHeight(x1, x2) + 0.05;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;

        const basinIdx = basinIds[idx];
        if (basinIdx >= 0 && basinIdx < basins.length) {
          tmpColor.set(basins[basinIdx].color);
          colors[idx * 3] = tmpColor.r;
          colors[idx * 3 + 1] = tmpColor.g;
          colors[idx * 3 + 2] = tmpColor.b;
        } else {
          colors[idx * 3] = 0;
          colors[idx * 3 + 1] = 0;
          colors[idx * 3 + 2] = 0;
        }
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < res - 1; i++) {
      for (let j = 0; j < res - 1; j++) {
        const a = i * res + j;
        const b = i * res + j + 1;
        const c = (i + 1) * res + j;
        const d = (i + 1) * res + j + 1;
        indices.push(a, b, d, a, d, c);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.basinMesh = new THREE.Mesh(geometry, material);
    this.sceneManager.getOverlayGroup().add(this.basinMesh);
  }

  private generateBoundaries(): void {
    const buffers = this.currentBuffers!;
    const res = buffers.resolution;
    const basinMap = this.world.getBasinMap();
    if (!basinMap) return;

    const { basinIds } = basinMap;
    const boundaryMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    for (let i = 1; i < res - 1; i++) {
      for (let j = 1; j < res - 1; j++) {
        const idx = i * res + j;
        const id = basinIds[idx];

        const neighbors = [
          basinIds[idx - 1],
          basinIds[idx + 1],
          basinIds[idx - res],
          basinIds[idx + res],
        ];

        if (neighbors.some(n => n !== id)) {
          const x1 = buffers.domain.x1Min + (i / (res - 1)) * (buffers.domain.x1Max - buffers.domain.x1Min);
          const x2 = buffers.domain.x2Min + (j / (res - 1)) * (buffers.domain.x2Max - buffers.domain.x2Min);
          
          const { x, z } = this.world.optimizationToWorld(x1, x2);
          const y = this.world.getTerrainHeight(x1, x2) + 0.1;

          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(6);
          const half = 0.35;
          positions[0] = x - half; positions[1] = y; positions[2] = z;
          positions[3] = x + half; positions[4] = y; positions[5] = z;
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          
          const line = new THREE.Line(geometry, boundaryMaterial.clone());
          this.boundaryLines.add(line);
        }
      }
    }
  }

  clear(): void {
    if (this.basinMesh) {
      this.sceneManager.getOverlayGroup().remove(this.basinMesh);
      this.basinMesh.geometry.dispose();
      (this.basinMesh.material as THREE.Material).dispose();
      this.basinMesh = null;
    }
    while (this.boundaryLines.children.length > 0) {
      const child = this.boundaryLines.children[0];
      this.boundaryLines.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.basinMesh) this.basinMesh.visible = visible;
  }

  setBoundariesVisible(visible: boolean): void {
    this.boundariesVisible = visible;
    this.boundaryLines.visible = visible;
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.boundaryLines);
  }
}