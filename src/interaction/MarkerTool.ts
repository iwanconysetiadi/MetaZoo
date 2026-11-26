import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ProbeData } from '../core/math/Types';
import { SceneManager } from '../rendering/SceneManager';

export interface Marker {
  id: string;
  data: ProbeData;
  mesh: THREE.Group;
  label: string;
  color: string;
  createdAt: number;
}

export class MarkerTool {
  private world: OptimizationWorld;
  private sceneManager: SceneManager;
  private markers: Map<string, Marker> = new Map();
  private markerGroup: THREE.Group;
  private nextId = 0;
  private colorPalette = [
    '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#ff8800', '#8800ff', '#00ff88', '#ff4444', '#44ff44', '#4444ff',
  ];

  constructor(world: OptimizationWorld, sceneManager: SceneManager) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.markerGroup = new THREE.Group();
    this.sceneManager.getMarkerGroup().add(this.markerGroup);
  }

  addMarker(data: ProbeData, label?: string, color?: string): Marker {
    const id = `marker_${this.nextId++}`;
    const markerColor = color || this.colorPalette[this.markers.size % this.colorPalette.length];
    const markerLabel = label || `Marker ${this.markers.size + 1}`;

    const mesh = this.createMarkerMesh(data, markerColor, markerLabel);
    const marker: Marker = { id, data, mesh, label: markerLabel, color: markerColor, createdAt: Date.now() };
    
    this.markers.set(id, marker);
    this.markerGroup.add(mesh);
    return marker;
  }

  private createMarkerMesh(data: ProbeData, color: string, label: string): THREE.Group {
    const group = new THREE.Group();
    const y = this.world.getTerrainHeight(data.x1, data.x2);

    const geometry = new THREE.OctahedronGeometry(0.5, 0);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.9,
    });
    const shape = new THREE.Mesh(geometry, material);
    shape.position.set(data.worldX, y + 1, data.worldZ);
    group.add(shape);

    const ringGeometry = new THREE.RingGeometry(1, 1.5, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(data.worldX, y + 0.1, data.worldZ);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(6);
    linePositions[0] = data.worldX; linePositions[1] = -5; linePositions[2] = data.worldZ;
    linePositions[3] = data.worldX; linePositions[4] = y + 1; linePositions[5] = data.worldZ;
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.4 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 200, 80);
    ctx.fillStyle = color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 100, 24);
    ctx.font = '12px monospace';
    ctx.fillText(`x₁: ${data.x1.toFixed(4)}`, 100, 44);
    ctx.fillText(`x₂: ${data.x2.toFixed(4)}`, 100, 62);
    ctx.fillText(`f: ${data.cost.toFixed(4)}`, 100, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(data.worldX, y + 3, data.worldZ);
    sprite.scale.set(6, 2.4, 1);
    group.add(sprite);

    group.userData = { markerId: group.uuid };
    return group;
  }

  removeMarker(id: string): boolean {
    const marker = this.markers.get(id);
    if (!marker) return false;

    this.markerGroup.remove(marker.mesh);
    marker.mesh.traverse(obj => {
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
    this.markers.delete(id);
    return true;
  }

  clearMarkers(): void {
    for (const id of this.markers.keys()) {
      this.removeMarker(id);
    }
  }

  getMarker(id: string): Marker | undefined {
    return this.markers.get(id);
  }

  getAllMarkers(): Marker[] {
    return Array.from(this.markers.values());
  }

  getMarkerCount(): number {
    return this.markers.size;
  }

  updateMarkerLabel(id: string, label: string): void {
    const marker = this.markers.get(id);
    if (!marker) return;
    marker.label = label;
    this.removeMarker(id);
    this.addMarker(marker.data, label, marker.color);
  }

  dispose(): void {
    this.clearMarkers();
    this.sceneManager.getMarkerGroup().remove(this.markerGroup);
  }
}