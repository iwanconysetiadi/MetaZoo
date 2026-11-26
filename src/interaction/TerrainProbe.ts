import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ProbeData } from '../core/math/Types';
import { SceneManager } from '../rendering/SceneManager';

export class TerrainProbe {
  private world: OptimizationWorld;
  private sceneManager: SceneManager;
  private camera: THREE.Camera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private probeMarker: THREE.Group | null = null;
  private pinnedProbes: Array<{ data: ProbeData; marker: THREE.Group }> = [];
  private hoverCallback: ((data: ProbeData | null) => void) | null = null;
  private pinCallback: ((data: ProbeData) => void) | null = null;
  private enabled = true;

  constructor(world: OptimizationWorld, sceneManager: SceneManager, camera: THREE.Camera) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.raycaster.far = 2000;
  }

  setHoverCallback(callback: (data: ProbeData | null) => void): void {
    this.hoverCallback = callback;
  }

  setPinCallback(callback: (data: ProbeData) => void): void {
    this.pinCallback = callback;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearHoverMarker();
    }
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.enabled) return;

    const canvas = this.sceneManager.getRenderer().domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const terrainMesh = this.getTerrainMesh();
    if (!terrainMesh) {
      this.updateHoverMarker(null);
      return;
    }

    const intersects = this.raycaster.intersectObject(terrainMesh, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      const opt = this.world.worldToOptimization(point.x, point.z);
      const data = this.world.probe(opt.x1, opt.x2);
      data.worldX = point.x;
      data.worldZ = point.z;
      this.updateHoverMarker(data);
      this.hoverCallback?.(data);
    } else {
      this.updateHoverMarker(null);
      this.hoverCallback?.(null);
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.enabled) return;

    const canvas = this.sceneManager.getRenderer().domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const terrainMesh = this.getTerrainMesh();
    if (!terrainMesh) return;

    const intersects = this.raycaster.intersectObject(terrainMesh, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      const opt = this.world.worldToOptimization(point.x, point.z);
      const data = this.world.probe(opt.x1, opt.x2);
      data.worldX = point.x;
      data.worldZ = point.z;
      this.pinProbe(data);
      this.pinCallback?.(data);
    }
  }

  private getTerrainMesh(): THREE.Mesh | null {
    const group = this.sceneManager.getTerrainGroup();
    const tagged = group.children.find(c => c.userData && c.userData.isTerrain) as THREE.Mesh | undefined;
    if (tagged) return tagged;
    return (group.children[0] as THREE.Mesh) ?? null;
  }

  private updateHoverMarker(data: ProbeData | null): void {
    this.clearHoverMarker();
    if (!data) return;

    this.probeMarker = new THREE.Group();
    
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(data.worldX, this.world.getTerrainHeight(data.x1, data.x2) + 0.5, data.worldZ);
    this.probeMarker.add(sphere);

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(6);
    linePositions[0] = data.worldX;
    linePositions[1] = -5;
    linePositions[2] = data.worldZ;
    linePositions[3] = data.worldX;
    linePositions[4] = sphere.position.y;
    linePositions[5] = data.worldZ;
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.probeMarker.add(line);

    this.sceneManager.getMarkerGroup().add(this.probeMarker);
  }

  private clearHoverMarker(): void {
    if (this.probeMarker) {
      this.sceneManager.getMarkerGroup().remove(this.probeMarker);
      this.probeMarker.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.probeMarker = null;
    }
  }

  private pinProbe(data: ProbeData): void {
    const marker = new THREE.Group();
    
    const geometry = new THREE.OctahedronGeometry(0.4, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff00ff,
      emissive: 0xff00ff,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    const shape = new THREE.Mesh(geometry, material);
    shape.position.set(data.worldX, this.world.getTerrainHeight(data.x1, data.x2) + 0.8, data.worldZ);
    marker.add(shape);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ff00ff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Pinned Probe #${this.pinnedProbes.length + 1}`, 128, 20);
    ctx.fillText(`x₁: ${data.x1.toFixed(4)}`, 128, 44);
    ctx.fillText(`x₂: ${data.x2.toFixed(4)}`, 128, 64);
    ctx.fillText(`f: ${data.cost.toFixed(4)}`, 128, 84);
    ctx.fillText(`|∇f|: ${data.gradientMagnitude.toExponential(2)}`, 128, 104);

    const texture = new THREE.CanvasTexture(labelCanvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(data.worldX, shape.position.y + 2, data.worldZ);
    sprite.scale.set(8, 4, 1);
    marker.add(sprite);

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(6);
    linePositions[0] = data.worldX; linePositions[1] = -5; linePositions[2] = data.worldZ;
    linePositions[3] = data.worldX; linePositions[4] = shape.position.y; linePositions[5] = data.worldZ;
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.4 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    marker.add(line);

    this.pinnedProbes.push({ data, marker });
    this.sceneManager.getMarkerGroup().add(marker);
  }

  removePinnedProbe(index: number): void {
    if (index >= 0 && index < this.pinnedProbes.length) {
      const { marker } = this.pinnedProbes[index];
      this.sceneManager.getMarkerGroup().remove(marker);
      marker.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
          if (obj instanceof THREE.Sprite) {
            (obj.material as THREE.SpriteMaterial).map?.dispose();
          }
        }
      });
      this.pinnedProbes.splice(index, 1);
    }
  }

  clearAllPinnedProbes(): void {
    while (this.pinnedProbes.length > 0) {
      this.removePinnedProbe(0);
    }
  }

  getPinnedProbes(): ProbeData[] {
    return this.pinnedProbes.map(p => p.data);
  }

  getPinnedProbeCount(): number {
    return this.pinnedProbes.length;
  }

  dispose(): void {
    this.clearHoverMarker();
    this.clearAllPinnedProbes();
  }
}