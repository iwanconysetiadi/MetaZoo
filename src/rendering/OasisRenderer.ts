import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CriticalPoint } from '../core/math/Types';

export class OasisRenderer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private oases: THREE.Group;
  private waterMeshes: Map<string, THREE.Mesh> = new Map();
  private vegetationGroups: Map<string, THREE.Group> = new Map();

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.oases = new THREE.Group();
    this.sceneManager.getWaterGroup().add(this.oases);
  }

  rebuild(): void {
    this.clear();
    const minima = this.world.getGlobalMinima();
    minima.forEach((min, i) => this.createOasis(min, i));
  }

  // Deterministic PRNG so placement is irregular but stable across rebuilds.
  private rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  private createOasis(min: CriticalPoint, index: number): void {
    const { x, z } = this.world.optimizationToWorld(min.x1, min.x2);
    const y = this.world.getTerrainHeight(min.x1, min.x2);

    this.createHalo(x, y, z);
    this.createWaterPool(x, y, z, min);
    this.createVegetationRing(x, y, z, index);
    this.createBeacon(x, y, z);
  }

  private createHalo(x: number, y: number, z: number): void {
    // Lush low-cost halo: soft translucent disc + luminous optimum ring.
    const haloGeo = new THREE.CircleGeometry(2.7, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x2fae74,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(x, y + 0.1, z);
    halo.rotation.x = -Math.PI / 2;
    halo.userData = { isHalo: true };
    this.oases.add(halo);

    const ringGeo = new THREE.RingGeometry(1.18, 1.3, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7ef0c4,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, y + 0.12, z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData = { isOptimumRing: true };
    this.oases.add(ring);
  }

  private createWaterPool(x: number, y: number, z: number, min: CriticalPoint): void {
    const geometry = new THREE.CircleGeometry(1.35, 40);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2f97a8,
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    const water = new THREE.Mesh(geometry, material);
    water.position.set(x, y + 0.12, z);
    water.rotation.x = -Math.PI / 2;
    water.userData = { isWater: true, minId: `${min.x1},${min.x2}` };
    this.oases.add(water);
    this.waterMeshes.set(`${min.x1},${min.x2}`, water);

    const rippleGeometry = new THREE.RingGeometry(1.35, 1.95, 40);
    const rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0xa9ecff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
    ripple.position.set(x, y + 0.13, z);
    ripple.rotation.x = -Math.PI / 2;
    ripple.userData = { isRipple: true };
    this.oases.add(ripple);
  }

  private createVegetationRing(x: number, y: number, z: number, index: number): void {
    const vegGroup = new THREE.Group();
    const rand = this.rng(0x9e3779b1 ^ (index * 2654435761));
    const count = 7;

    for (let i = 0; i < count; i++) {
      // Jittered, irregular placement (not a perfect decorative circle).
      const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.9;
      const radius = 2.0 + rand() * 1.5;
      const vx = x + Math.cos(angle) * radius;
      const vz = z + Math.sin(angle) * radius;
      const opt = this.world.worldToOptimization(vx, vz);
      const vy = this.world.getTerrainHeight(opt.x1, opt.x2);

      const treeHeight = 0.8 + rand() * 0.6;
      const trunkGeometry = new THREE.CylinderGeometry(0.05, 0.1, treeHeight * 0.42, 6);
      const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.95 });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(vx, vy + treeHeight * 0.21, vz);
      vegGroup.add(trunk);

      const foliageGeometry = new THREE.ConeGeometry(0.4, treeHeight * 0.62, 7);
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.29 + rand() * 0.06, 0.42, 0.22),
        roughness: 0.9,
      });
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(vx, vy + treeHeight * 0.42 + treeHeight * 0.31, vz);
      foliage.rotation.y = rand() * Math.PI;
      vegGroup.add(foliage);
    }

    this.oases.add(vegGroup);
    this.vegetationGroups.set(`${index}`, vegGroup);
  }

  private createBeacon(x: number, y: number, z: number): void {
    // Exact-point precision cue: small bright marker + short, faint beam.
    const markerGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xeafff4 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, y + 0.35, z);
    marker.userData = { isBeacon: true };
    this.oases.add(marker);

    const beamHeight = 1.8;
    const geometry = new THREE.CylinderGeometry(0.04, 0.12, beamHeight, 10, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color: 0xbff5d6,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(geometry, material);
    beam.position.set(x, y + beamHeight / 2, z);
    this.oases.add(beam);
  }

  clear(): void {
    this.waterMeshes.clear();
    this.vegetationGroups.clear();
    while (this.oases.children.length > 0) {
      const child = this.oases.children[0];
      this.oases.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      } else if (child instanceof THREE.PointLight) {
        child.dispose();
      } else if (child instanceof THREE.Group) {
        child.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
  }

  update(_deltaTime: number): void {
    const t = Date.now() * 0.001;
    for (const child of this.oases.children) {
      if (child instanceof THREE.Mesh && child.userData.isRipple) {
        const s = 1 + Math.sin(t * 1.5) * 0.12;
        child.scale.setScalar(s);
        (child.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 1.5) * 0.05;
      }
    }
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getWaterGroup().remove(this.oases);
  }
}
