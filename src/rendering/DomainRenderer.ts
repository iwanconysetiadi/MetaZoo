import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ViewMode } from '../core/math/Types';

export class DomainRenderer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private domainBox: THREE.Group;
  private axisLines: THREE.Group;
  private axisLabels: THREE.Group;
  private visible = true;
  private simulationActive = false;
  private mode: ViewMode = 'natural';

  private frameMaterial: THREE.LineBasicMaterial | null = null;
  private xAxisMaterial: THREE.LineBasicMaterial | null = null;
  private zAxisMaterial: THREE.LineBasicMaterial | null = null;
  private labelMaterials: THREE.SpriteMaterial[] = [];

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.domainBox = new THREE.Group();
    this.axisLines = new THREE.Group();
    this.axisLabels = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.domainBox);
    this.sceneManager.getOverlayGroup().add(this.axisLines);
    this.sceneManager.getOverlayGroup().add(this.axisLabels);
    this.build();
  }

  setSimulationActive(active: boolean): void {
    if (this.simulationActive === active) return;
    this.simulationActive = active; this.applyMode();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    const natural = this.mode === 'natural';
    if (this.frameMaterial) this.frameMaterial.opacity = natural ? (this.simulationActive ? .42 : 0) : .5;
    this.axisLines.visible = this.visible && !natural;
    this.axisLabels.visible = this.visible && !natural;
    if (this.xAxisMaterial) this.xAxisMaterial.opacity = 0.5;
    if (this.zAxisMaterial) this.zAxisMaterial.opacity = 0.5;
    for (const m of this.labelMaterials) m.opacity = 0.85;
  }

  private build(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    const corners = [
      this.world.optimizationToWorld(x1Min, x2Min),
      this.world.optimizationToWorld(x1Max, x2Min),
      this.world.optimizationToWorld(x1Max, x2Max),
      this.world.optimizationToWorld(x1Min, x2Max),
    ];

    const y = -3;

    const boxGeometry = new THREE.BufferGeometry();
    const boxPositions: number[] = [];
    const domainCorners = [[x1Min,x2Min],[x1Max,x2Min],[x1Max,x2Max],[x1Min,x2Max]];
    for (let side = 0; side < 4; side++) {
      const from = domainCorners[side], to = domainCorners[(side+1)%4];
      for (let step = 0; step < 80; step++) {
        const t = step/80;
        const a = THREE.MathUtils.lerp(from[0],to[0],t), b = THREE.MathUtils.lerp(from[1],to[1],t);
        const point = this.world.projectAgentToTerrain(a,b,.20);
        boxPositions.push(point.x,point.y,point.z);
      }
    }
    boxGeometry.setAttribute('position', new THREE.Float32BufferAttribute(boxPositions,3));
    const frame = new THREE.LineDashedMaterial({color:0xa8c9dc,transparent:true,opacity:.42,depthWrite:false,dashSize:1.2,gapSize:1});
    this.frameMaterial = frame;
    const boundary = new THREE.LineLoop(boxGeometry,frame);
    boundary.name = 'simulation-x1-x2-boundary'; boundary.computeLineDistances();
    this.domainBox.add(boundary);

    this.createAxisLines(corners, y);
    this.createAxisLabels(corners, y);
    this.applyMode();
  }

  private createAxisLines(corners: Array<{ x: number; z: number }>, y: number): void {
    const config = this.world.getConfig();
    const {x1Min,x1Max,x2Min,x2Max}=config.domain;
    const xPoints: THREE.Vector3[] = [], zPoints: THREE.Vector3[] = [];
    for(let i=0;i<=80;i++) {
      const a=this.world.projectAgentToTerrain(THREE.MathUtils.lerp(x1Min,x1Max,i/80),x2Min,.24);
      const b=this.world.projectAgentToTerrain(x1Min,THREE.MathUtils.lerp(x2Min,x2Max,i/80),.24);
      xPoints.push(new THREE.Vector3(a.x,a.y,a.z));zPoints.push(new THREE.Vector3(b.x,b.y,b.z));
    }
    this.xAxisMaterial = new THREE.LineBasicMaterial({color:0xa8c9dc,opacity:.5,transparent:true,depthWrite:false});
    this.zAxisMaterial = new THREE.LineBasicMaterial({color:0x78b8a4,opacity:.5,transparent:true,depthWrite:false});
    this.axisLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(xPoints),this.xAxisMaterial));
    this.axisLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(zPoints),this.zAxisMaterial));
  }

  private createAxisLabels(corners: Array<{ x: number; z: number }>, y: number): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    this.createLabel(`${x1Min.toFixed(2)}`, corners[0].x, y - 0.6, corners[0].z);
    this.createLabel(`${x1Max.toFixed(2)}`, corners[1].x, y - 0.6, corners[1].z);
    this.createLabel(`${x2Max.toFixed(2)}`, corners[2].x, y - 0.6, corners[2].z);
    this.createLabel(`${x2Min.toFixed(2)}`, corners[3].x, y - 0.6, corners[3].z);

    this.createLabel('x₁', (corners[0].x + corners[1].x) / 2, y - 1.1, (corners[0].z + corners[1].z) / 2, '#d98a8a');
    this.createLabel('x₂', (corners[0].x + corners[3].x) / 2, y - 1.1, (corners[0].z + corners[3].z) / 2, '#7fc9ab');
  }

  private createLabel(text: string, x: number, y: number, z: number, color: string = '#b9c6d4'): void {
    const opt = this.world.worldToOptimization(x,z);
    y = this.world.getTerrainSurfaceHeight(opt.x1,opt.x2) + 1.6;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = color;
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.85 });
    this.labelMaterials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(4, 2, 1);
    this.axisLabels.add(sprite);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.domainBox.visible = visible;
    this.axisLines.visible = visible && this.mode !== 'natural';
    this.axisLabels.visible = visible && this.mode !== 'natural';
  }

  rebuild(): void {
    this.clear();
    this.build();
  }

  clear(): void {
    this.labelMaterials = [];
    [this.domainBox, this.axisLines, this.axisLabels].forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof THREE.LineLoop) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        } else if (child instanceof THREE.Sprite) {
          child.material.dispose();
          (child.material as THREE.SpriteMaterial).map?.dispose();
        }
      }
    });
    this.frameMaterial = null;
    this.xAxisMaterial = null;
    this.zAxisMaterial = null;
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.domainBox);
    this.sceneManager.getOverlayGroup().remove(this.axisLines);
    this.sceneManager.getOverlayGroup().remove(this.axisLabels);
  }
}
