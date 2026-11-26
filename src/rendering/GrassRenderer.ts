import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ENVIRONMENT_QUALITY } from './VisualTheme';

/** Sparse instanced grass, derived from the sampled surface without displacement. */
export class GrassRenderer {
  private mesh: THREE.InstancedMesh | null = null;
  constructor(private world: OptimizationWorld, private group: THREE.Group) {}

  rebuild(): void {
    this.dispose();
    const config = this.world.getConfig();
    if (config.viewMode !== 'natural') return;
    const sanctuary = config.functionId === 'sphere';
    const limit = Math.round((sanctuary ? 2.4 : 1) * ENVIRONMENT_QUALITY[config.visualQuality].grass * (window.innerWidth < 700 ? .3 : 1));
    const buffers = this.world.getLandscapeBuffers();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -.10, 0, 0, .10, 0, 0, .03, .36, 0,
      0, 0, -.10, 0, 0, .10, 0, .28, .03,
    ], 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: sanctuary ? 0xffffff : 0x557654, roughness: .94, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, limit);
    const transform = new THREE.Object3D();
    let count = 0;
    let seed = 71923;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const domain = config.domain;
    const oasisCenters = this.world.getGlobalMinima().map(min => this.world.optimizationToWorld(min.x1, min.x2));
    for (let i = 0; i < limit * 4 && count < limit; i++) {
      const u = random(), v = random();
      const edge = sanctuary ? Math.max(Math.abs(u-.5)*2,Math.abs(v-.5)*2) : Math.hypot((u - .5) * 2, (v - .5) * 2);
      if (edge > .96 || (sanctuary && random() < Math.max(0,(edge-.66)/.35))) continue;
      const row = Math.round(v * (buffers.resolution - 1));
      const col = Math.round(u * (buffers.resolution - 1));
      const idx = row * buffers.resolution + col;
      if (sanctuary ? buffers.normalizedCostBuffer[idx] > .94 : buffers.normalizedCostBuffer[idx] > .62 || buffers.gradientMagnitudeBuffer[idx] > 7) continue;
      const x1 = domain.x1Min + v * (domain.x1Max - domain.x1Min);
      const x2 = domain.x2Min + u * (domain.x2Max - domain.x2Min);
      // Keep grass out of every optimum pool, including off-center and multiple oases.
      const point = this.world.projectAgentToTerrain(x1, x2, .025);
      if (oasisCenters.some(center => Math.hypot(point.x - center.x, point.z - center.z) < (sanctuary ? 8.2 : 4.2))) continue;
      transform.position.set(point.x, point.y, point.z);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      transform.scale.setScalar((sanctuary ? .35 : 1) * (.65 + random() * .8));
      transform.updateMatrix(); mesh.setMatrixAt(count, transform.matrix);
      if (sanctuary) mesh.setColorAt(count, new THREE.Color().setHSL(.37+random()*.035,.24+random()*.12,.30+random()*.12));
      count++;
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'presentation-grass'; mesh.userData.isEnvironment = true;
    this.group.add(mesh); this.mesh = mesh;
  }

  dispose(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh); this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose(); this.mesh = null;
  }
}
