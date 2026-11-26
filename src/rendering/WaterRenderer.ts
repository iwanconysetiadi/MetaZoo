import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';

export class WaterRenderer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private waterPlane: THREE.Mesh | null = null;
  private visible = false;
  private atmosphereValue = 0;
  private atmosphereTarget = 0;
  private readonly goldenWater = new THREE.Color(0x568f8b);
  private readonly twilightWater = new THREE.Color(0x194e68);

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible && !this.waterPlane) {
      this.createWaterPlane();
    } else if (!visible && this.waterPlane) {
      this.removeWaterPlane();
    }
    if (this.waterPlane) this.waterPlane.visible = visible;
  }

  private createWaterPlane(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    const corners = [
      this.world.optimizationToWorld(x1Min, x2Min),
      this.world.optimizationToWorld(x1Max, x2Min),
      this.world.optimizationToWorld(x1Max, x2Max),
      this.world.optimizationToWorld(x1Min, x2Max),
    ];

    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    const minZ = Math.min(...corners.map(c => c.z));
    const maxZ = Math.max(...corners.map(c => c.z));

    const width = maxX - minX;
    const depth = maxZ - minZ;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const waterLevel = -2;

    const geometry = new THREE.PlaneGeometry(width * 1.1, depth * 1.1, 64, 64);
    const material = new THREE.MeshPhysicalMaterial({
      color: this.goldenWater,
      metalness: 0.0,
      roughness: 0.1,
      transmission: 0.8,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
    });

    this.waterPlane = new THREE.Mesh(geometry, material);
    this.waterPlane.position.set(centerX, waterLevel, centerZ);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.receiveShadow = true;
    this.sceneManager.getWaterGroup().add(this.waterPlane);
  }

  private removeWaterPlane(): void {
    if (this.waterPlane) {
      this.sceneManager.getWaterGroup().remove(this.waterPlane);
      this.waterPlane.geometry.dispose();
      (this.waterPlane.material as THREE.Material).dispose();
      this.waterPlane = null;
    }
  }

  update(deltaTime: number): void {
    this.atmosphereValue += (this.atmosphereTarget - this.atmosphereValue) * (1 - Math.exp(-Math.max(0, deltaTime) / 0.9));
    if (this.waterPlane) {
      const material = this.waterPlane.material as THREE.MeshPhysicalMaterial;
      material.color.lerpColors(this.goldenWater, this.twilightWater, this.atmosphereValue);
    }
    if (!this.waterPlane) return;
    
    const t = Date.now() * 0.001;
    const positions = this.waterPlane.geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const wave = Math.sin(x * 0.1 + t) * Math.cos(z * 0.1 + t * 0.7) * 0.15;
      positions.setY(i, wave);
    }
    positions.needsUpdate = true;
    this.waterPlane.geometry.computeVertexNormals();
  }

  setAtmosphere(mode: 'golden-hour' | 'twilight'): void {
    this.atmosphereTarget = mode === 'twilight' ? 1 : 0;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.atmosphereValue = this.atmosphereTarget;
    }
  }

  dispose(): void {
    this.removeWaterPlane();
  }
}
