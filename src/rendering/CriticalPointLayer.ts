import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CriticalPoint } from '../core/math/Types';

export interface CriticalPointFlags {
  globalMinima: boolean;
  localMinima: boolean;
  localMaxima: boolean;
  saddlePoints: boolean;
}

export class CriticalPointLayer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private markers: THREE.Group;
  private flags: CriticalPointFlags = {
    globalMinima: true,
    localMinima: false,
    localMaxima: false,
    saddlePoints: false,
  };

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.markers = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.markers);
  }

  setFlags(flags: Partial<CriticalPointFlags>): void {
    this.flags = { ...this.flags, ...flags };
  }

  configure(flags: Partial<CriticalPointFlags>): void {
    this.flags = { ...this.flags, ...flags };
    this.rebuild();
  }

  setVisibility(type: keyof CriticalPointFlags, visible: boolean): void {
    this.flags[type] = visible;
    this.rebuild();
  }

  rebuild(): void {
    this.clear();
    const points = this.world.getCriticalPoints();
    for (const cp of points) {
      if (!this.shouldShow(cp)) continue;
      this.createMarker(cp);
    }
  }

  private shouldShow(cp: CriticalPoint): boolean {
    switch (cp.type) {
      case 'global-minimum': return this.flags.globalMinima;
      case 'local-minimum': return this.flags.localMinima;
      case 'local-maximum': return this.flags.localMaxima;
      case 'saddle': return this.flags.saddlePoints;
      default: return false;
    }
  }

  private createMarker(cp: CriticalPoint): void {
    const { x, z } = this.world.optimizationToWorld(cp.x1, cp.x2);
    const y = this.world.getTerrainHeight(cp.x1, cp.x2);

    if (cp.type === 'global-minimum') {
      this.addGlobalRing(x, y, z);
      return;
    }

    let geometry: THREE.BufferGeometry;
    let color: number;
    let offsetY = 0.35;
    let rotationX = 0;

    switch (cp.type) {
      case 'local-minimum':
        geometry = new THREE.ConeGeometry(0.22, 0.5, 8);
        color = 0xe6a23c;
        rotationX = Math.PI;
        break;
      case 'local-maximum':
        geometry = new THREE.ConeGeometry(0.22, 0.5, 8);
        color = 0xd9695f;
        break;
      case 'saddle':
        geometry = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
        color = 0x7f9bd6;
        offsetY = 0.25;
        break;
      default:
        return;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85,
      roughness: 0.6,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y + offsetY, z);
    mesh.rotation.x = rotationX;
    mesh.userData = { criticalPoint: cp, type: cp.type };
    this.markers.add(mesh);
  }

  private addGlobalRing(x: number, y: number, z: number): void {
    const geometry = new THREE.RingGeometry(1.1, 1.25, 40);
    const material = new THREE.MeshBasicMaterial({
      color: 0xcdf5df,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.set(x, y + 0.08, z);
    ring.rotation.x = -Math.PI / 2;
    this.markers.add(ring);
  }

  clear(): void {
    while (this.markers.children.length > 0) {
      const child = this.markers.children[0];
      this.markers.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Sprite) {
        child.material.dispose();
        (child.material as THREE.SpriteMaterial).map?.dispose();
      }
    }
  }

  updateBeacons(_deltaTime: number): void {
    // Static markers; no animation required.
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.markers);
  }
}
