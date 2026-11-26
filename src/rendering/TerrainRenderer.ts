import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { LandscapeBuffers } from '../core/math/Types';
import { TerrainMaterial } from './TerrainMaterial';

export class TerrainRenderer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private terrainMesh: THREE.Mesh | null = null;
  private wireframeMesh: THREE.Mesh | null = null;
  private material: TerrainMaterial;
  private wireframeMaterial: THREE.MeshBasicMaterial;
  private resolution: number;
  private geometry: THREE.BufferGeometry | null = null;
  private wireframeGeometry: THREE.BufferGeometry | null = null;
  private skirtMesh: THREE.Mesh | null = null;
  private skirtGeometry: THREE.BufferGeometry | null = null;
  private currentBuffers: LandscapeBuffers | null = null;

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.resolution = world.getConfig().resolution;

    this.material = new TerrainMaterial();
    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });

    this.buildTerrain();
  }

  private buildTerrain(): void {
    this.resolution = this.world.getConfig().resolution;
    const buffers = this.world.getLandscapeBuffers();
    if (!buffers) return;

    this.currentBuffers = buffers;

    const { x1Min, x1Max, x2Min, x2Max } = buffers.domain;
    const domainWidth = x1Max - x1Min;
    const domainHeight = x2Max - x2Min;
    const worldWidth = 100;
    const worldDepth = 100;

    const positions = new Float32Array(this.resolution * this.resolution * 3);
    const normals = new Float32Array(this.resolution * this.resolution * 3);
    const uvs = new Float32Array(this.resolution * this.resolution * 2);
    const costs = new Float32Array(this.resolution * this.resolution);
    const normalizedCosts = new Float32Array(this.resolution * this.resolution);
    const slopes = new Float32Array(this.resolution * this.resolution);
    const curvatures = new Float32Array(this.resolution * this.resolution);
    const basinIds = new Float32Array(this.resolution * this.resolution);

    for (let i = 0; i < this.resolution; i++) {
      const x1 = x1Min + (i / (this.resolution - 1)) * domainWidth;
      const v = i / (this.resolution - 1);
      for (let j = 0; j < this.resolution; j++) {
        const x2 = x2Min + (j / (this.resolution - 1)) * domainHeight;
        const u = j / (this.resolution - 1);
        const idx = i * this.resolution + j;

        const { x, z } = this.world.optimizationToWorld(x1, x2);
        const y = buffers.normalizedCostBuffer[idx] * this.world.getConfig().verticalScale * 10;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;

        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;

        costs[idx] = buffers.costBuffer[idx];
        normalizedCosts[idx] = buffers.normalizedCostBuffer[idx];
        slopes[idx] = Math.atan(buffers.gradientMagnitudeBuffer[idx] * 0.1);
        curvatures[idx] = buffers.curvatureBuffer[idx];
        basinIds[idx] = buffers.basinIdBuffer[idx];
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < this.resolution - 1; i++) {
      for (let j = 0; j < this.resolution - 1; j++) {
        const a = i * this.resolution + j;
        const b = i * this.resolution + j + 1;
        const c = (i + 1) * this.resolution + j;
        const d = (i + 1) * this.resolution + j + 1;
        indices.push(a, b, d, a, d, c);
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setAttribute('cost', new THREE.BufferAttribute(costs, 1));
    this.geometry.setAttribute('normalizedCost', new THREE.BufferAttribute(normalizedCosts, 1));
    this.geometry.setAttribute('slope', new THREE.BufferAttribute(slopes, 1));
    this.geometry.setAttribute('curvature', new THREE.BufferAttribute(curvatures, 1));
    this.geometry.setAttribute('basinId', new THREE.BufferAttribute(basinIds, 1));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();

    this.wireframeGeometry = this.geometry.clone();

    this.terrainMesh = new THREE.Mesh(this.geometry, this.material);
    this.terrainMesh.castShadow = true;
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.frustumCulled = true;
    this.terrainMesh.userData.isTerrain = true;
    this.sceneManager.getTerrainGroup().add(this.terrainMesh);

    this.wireframeMesh = new THREE.Mesh(this.wireframeGeometry, this.wireframeMaterial);
    this.wireframeMesh.visible = false;
    this.sceneManager.getTerrainGroup().add(this.wireframeMesh);

    this.buildSkirt(positions, this.resolution, -4.5);

    this.updateMaterialUniforms();
    this.applyOverlays();
  }

  /**
   * Rendering-only side walls that give the domain physical thickness and kill
   * the "floating sheet" read. Carries no objective meaning and is not
   * raycast for probing (terrainMesh is tagged with userData.isTerrain).
   */
  private buildSkirt(positions: Float32Array, res: number, baseY: number): void {
    const verts: number[] = [];
    const indices: number[] = [];

    const pushWall = (edge: Array<[number, number]>): void => {
      const topStart = verts.length / 3;
      const n = edge.length;
      for (const [i, j] of edge) {
        const k = (i * res + j) * 3;
        verts.push(positions[k], positions[k + 1], positions[k + 2]);
      }
      for (const [i, j] of edge) {
        const k = (i * res + j) * 3;
        verts.push(positions[k], baseY, positions[k + 2]);
      }
      const botStart = topStart + n;
      for (let s = 0; s < n - 1; s++) {
        const t0 = topStart + s;
        const t1 = topStart + s + 1;
        const b0 = botStart + s;
        const b1 = botStart + s + 1;
        indices.push(t0, b0, b1, t0, b1, t1);
      }
    };

    const edgeA: Array<[number, number]> = [];
    for (let j = 0; j < res; j++) edgeA.push([0, j]);
    const edgeB: Array<[number, number]> = [];
    for (let j = res - 1; j >= 0; j--) edgeB.push([res - 1, j]);
    const edgeC: Array<[number, number]> = [];
    for (let i = res - 1; i >= 0; i--) edgeC.push([i, 0]);
    const edgeD: Array<[number, number]> = [];
    for (let i = 0; i < res; i++) edgeD.push([i, res - 1]);

    pushWall(edgeA);
    pushWall(edgeB);
    pushWall(edgeC);
    pushWall(edgeD);

    this.skirtGeometry = new THREE.BufferGeometry();
    this.skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.skirtGeometry.setIndex(indices);
    this.skirtGeometry.computeVertexNormals();

    const skirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x111c26,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.skirtMesh = new THREE.Mesh(this.skirtGeometry, skirtMaterial);
    this.skirtMesh.userData.isSkirt = true;
    this.sceneManager.getTerrainGroup().add(this.skirtMesh);
  }

  applyOverlays(): void {
    const config = this.world.getConfig();
    const contours = config.overlays.contours;
    this.material.uniforms.uContourEnabled.value = contours ? 1 : 0;
    this.material.uniforms.uContourCount.value = config.contourCount;
    this.material.uniforms.uContourThickness.value = 0.09;
    this.material.uniforms.uContourOpacity.value = 0.42;
    this.material.uniforms.uCurvatureOverlayEnabled.value = config.overlays.curvature ? 1 : 0;
    this.material.uniforms.uBasinOverlayEnabled.value = 0;
    this.material.uniforms.uVisualizationMode.value = 0;
  }

  private updateMaterialUniforms(): void {
    const config = this.world.getConfig();
    this.material.uniforms.uVerticalScale.value = config.verticalScale;
    this.material.uniforms.uHeightMapping.value = this.getHeightMappingIndex(config.heightMapping);
    this.material.uniforms.uTime.value = 0;
    this.material.uniforms.uDomainMin.value.set(
      config.domain.x1Min,
      config.domain.x2Min
    );
    this.material.uniforms.uDomainMax.value.set(
      config.domain.x1Max,
      config.domain.x2Max
    );
  }

  private getHeightMappingIndex(mode: string): number {
    const modes = { raw: 0, linear: 1, log: 2, quantile: 3, 'clamped-percentile': 4 };
    return modes[mode as keyof typeof modes] ?? 1;
  }

  rebuild(): void {
    this.dispose();
    this.buildTerrain();
  }

  update(deltaTime: number): void {
    this.material.uniforms.uTime.value += deltaTime;
  }

  setWireframeVisible(visible: boolean): void {
    if (this.wireframeMesh) this.wireframeMesh.visible = visible;
  }

  setContourParams(enabled: boolean, count: number, thickness: number, opacity: number): void {
    this.material.uniforms.uContourEnabled.value = enabled ? 1 : 0;
    this.material.uniforms.uContourCount.value = count;
    this.material.uniforms.uContourThickness.value = thickness;
    this.material.uniforms.uContourOpacity.value = opacity;
  }

  setBasinOverlay(enabled: boolean, basinMap: any): void {
    this.material.uniforms.uBasinOverlayEnabled.value = enabled ? 1 : 0;
    if (enabled && basinMap) {
      this.material.setBasinTexture(basinMap);
    }
  }

  setGradientOverlay(enabled: boolean): void {
    this.material.uniforms.uGradientOverlayEnabled.value = enabled ? 1 : 0;
  }

  setCurvatureOverlay(enabled: boolean): void {
    this.material.uniforms.uCurvatureOverlayEnabled.value = enabled ? 1 : 0;
  }

  setVisualizationMode(mode: 'surface' | 'slope' | 'gradient' | 'curvature' | 'basins'): void {
    const modes = { surface: 0, slope: 1, gradient: 2, curvature: 3, basins: 4 };
    this.material.uniforms.uVisualizationMode.value = modes[mode];
  }

  updateBasinColors(basinColors: Float32Array): void {
    this.material.updateBasinColors(basinColors);
  }

  getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMesh;
  }

  getMaterial(): TerrainMaterial {
    return this.material;
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.sceneManager.getTerrainGroup().remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh = null;
    }
    if (this.wireframeMesh) {
      this.sceneManager.getTerrainGroup().remove(this.wireframeMesh);
      this.wireframeMesh.geometry.dispose();
      this.wireframeMesh = null;
    }
    if (this.skirtMesh) {
      this.sceneManager.getTerrainGroup().remove(this.skirtMesh);
      this.skirtMesh.geometry.dispose();
      (this.skirtMesh.material as THREE.Material).dispose();
      this.skirtMesh = null;
    }
    if (this.skirtGeometry) {
      this.skirtGeometry.dispose();
      this.skirtGeometry = null;
    }
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.wireframeGeometry) {
      this.wireframeGeometry.dispose();
      this.wireframeGeometry = null;
    }
  }
}