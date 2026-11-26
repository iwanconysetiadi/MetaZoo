import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { islandEdgeRadius } from '../core/world/IslandProjection';

/** Ancient structural details attached to the render rig, never to objective logic. */
export class IslandPresentation {
  readonly group = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private clean = false;
  setCleanMode(clean: boolean): void { this.clean = clean; for (const child of this.group.children) if (child.userData.minorDecoration) child.visible = !clean; }
  constructor(private world: OptimizationWorld) { this.group.name = 'IslandPresentation'; }

  rebuild(): void {
    this.dispose();
    const config = this.world.getConfig();
    const performance = config.visualQuality === 'performance';
    const cinematic = config.visualQuality === 'presentation' || config.visualQuality === 'ultra';
    const worldId = config.functionId;
    const fractured = worldId === 'rastrigin' || worldId === 'schwefel';
    const sanctuary = worldId === 'sphere';
    const majorCount = performance ? 3 : cinematic ? 5 : 4;
    const tongueCount = performance ? 3 : cinematic ? 10 : 7;
    const debrisCount = performance ? 6 : cinematic ? 15 : 12;
    const rockGeometry = new THREE.IcosahedronGeometry(1,1);
    const points = rockGeometry.getAttribute('position');
    for(let i=0;i<points.count;i++) {
      const x=points.getX(i), y=points.getY(i), z=points.getZ(i);
      const fracture=1+Math.sin(x*7+z*4+y*3)*.19;
      points.setXYZ(i,x*fracture*(y<0?.68:1),y*(y<0?1.15:.8),z*fracture);
    }
    rockGeometry.computeVertexNormals();
    const rockMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,flatShading:true});
    const mass=new THREE.InstancedMesh(rockGeometry,rockMaterial,majorCount+tongueCount+debrisCount);
    const transform=new THREE.Object3D();
    const colors=[0x59645f,0x475252,0x344044,0x3d4c50];
    const majorAngles=[.02,.57,1.16,2.55,4.45];
    for(let i=0;i<mass.count;i++) {
      const major=i<majorCount, tongue=i>=majorCount&&i<majorCount+tongueCount;
      const angle=major?majorAngles[i]:.25+i*2.39996+Math.sin(i*1.7)*.4;
      const edge=islandEdgeRadius(angle)*90;
      const radius=major?edge*(.50+.10*(i%3)):tongue?edge*(.84+.04*Math.sin(i)):edge*(.5+.24*Math.sin(i*.8));
      const width=major?15+(i*7%11):tongue?7+(i*5%7):1.6+(i*11%7)*.52;
      const height=major?34+(i%3)*9:tongue?15+(i%4)*4:width*1.4;
      transform.position.set(Math.cos(angle)*radius,major?-62-(i%3)*6:tongue?-43-(i%3)*7:-113-(i*7%22),Math.sin(angle)*radius);
      transform.rotation.set(Math.sin(i)*.16,angle,Math.cos(i*2.1)*.17);
      transform.scale.set(width,height,width*.82);
      transform.updateMatrix();mass.setMatrixAt(i,transform.matrix);
      mass.setColorAt(i,new THREE.Color(colors[i%colors.length]));
    }
    mass.instanceMatrix.needsUpdate = true; mass.castShadow = true; mass.receiveShadow = true;
    mass.userData.isEnvironment = true; this.group.add(mass);
    this.geometries.push(rockGeometry); this.materials.push(rockMaterial);

    const roots: THREE.BufferGeometry[] = [], timbers: THREE.BufferGeometry[] = [], ropes: THREE.BufferGeometry[] = [], vines: THREE.BufferGeometry[] = [];
    const curve = (target: THREE.BufferGeometry[], points: THREE.Vector3[], radius: number, sides = 5): void => {
      target.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, radius, sides, false));
    };
    const locate = (angle: number, radius: number, y: number): THREE.Vector3 => new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const rootCount = performance ? 2 : cinematic ? 4 : 3;
    for (let i = 0; i < rootCount; i++) {
      const angle = [.22,1.42,3.65,5.15][i];
      const radius = islandEdgeRadius(angle) * 90;
      const sourceRadius = radius;
      const opt = this.world.worldToOptimization(Math.cos(angle) * sourceRadius, Math.sin(angle) * sourceRadius);
      const top = this.world.getTerrainSurfaceHeight(opt.x1, opt.x2);
      const start = locate(angle, radius, top - .3);
      const mid = locate(angle + .018, radius * 1.005, -18);
      const bend = locate(angle - .025, radius * .94, -42);
      const end = locate(angle + .04, radius * .78, -78 - i % 3 * 3);
      curve(roots, [start,mid,bend,end], 1.15 + (i % 3) * .3, 7);
      curve(roots, [mid, locate(angle - .04, radius * .99, -28), locate(angle - .07, radius * .85, -61)], .5, 6);
      curve(vines, [start.clone().add(new THREE.Vector3(1,0,1)), mid.clone().add(new THREE.Vector3(2,0,-1)), end.clone().add(new THREE.Vector3(4,-8,2))], .12, 4);
    }
    const anchorCount = performance ? 1 : cinematic ? 4 : 2;
    for (let i = 0; i < anchorCount; i++) {
      const angle = .65 + i * 2.28;
      const center = locate(angle, islandEdgeRadius(angle)*90*1.005, -22 - i * 4);
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const left = center.clone().addScaledVector(tangent,-8), right = center.clone().addScaledVector(tangent,8);
      curve(timbers, [left, center.clone().add(new THREE.Vector3(0,-.8,0)), right], 1.0, 4);
      curve(timbers, [left.clone().add(new THREE.Vector3(0,6,0)), center.clone().add(new THREE.Vector3(0,-11,0)), right.clone().add(new THREE.Vector3(0,6,0))], .7, 4);
      // Bindings and pegs lock the braces into the cliff shelf.
      for (const end of [left,right]) {
        for (let wrap = 0; wrap < 3; wrap++) {
          const ring = new THREE.TorusGeometry(1.16,.13,4,10);
          ring.rotateY(angle); ring.translate(end.x, end.y + wrap * .4, end.z); ropes.push(ring);
        }
        curve(timbers,[end.clone().add(new THREE.Vector3(0,-1,0)),end.clone().add(new THREE.Vector3(0,4,0))],.35,5);
      }
      if (!performance) curve(ropes,[left,center.clone().add(new THREE.Vector3(0,-8,0)),right],.13,4);
    }
    const addMerged = (parts: THREE.BufferGeometry[], color: number): void => {
      if (!parts.length) return;
      const geometry = mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g)); parts.forEach(g => g.dispose());
      if (!geometry) return;
      const material = new THREE.MeshStandardMaterial({color,roughness:.98,metalness:0});
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.isEnvironment = true; mesh.userData.minorDecoration = true; this.group.add(mesh);
      this.geometries.push(geometry); this.materials.push(material);
    };
    // Art-directed hero terraces: sparse gardens left, an old water shelf right.
    const shelves: THREE.BufferGeometry[] = [], moss: THREE.BufferGeometry[] = [], caveStone: THREE.BufferGeometry[] = [], lanterns: THREE.BufferGeometry[] = [];
    const box = (target: THREE.BufferGeometry[], x: number, y: number, z: number, width: number, height: number, depth: number, rotation = 0): void => {
      const g = new THREE.BoxGeometry(width,height,depth); g.rotateY(rotation); g.translate(x,y,z); target.push(g);
    };
    if (!performance) {
      const terraceCount = worldId === 'himmelblau' ? 4 : cinematic ? 4 : 2;
      for (let i = 0; i < terraceCount; i++) {
        const angle = .05 + i * .66;
        const center = locate(angle, islandEdgeRadius(angle)*90*.98, -27 - i * 10);
        const shelf = new THREE.IcosahedronGeometry(1,1);
        shelf.scale(9 + i,2.7,5.5); shelf.rotateY(angle); shelf.translate(center.x,center.y,center.z); shelves.push(shelf);
        const cap = new THREE.IcosahedronGeometry(1,1);
        cap.scale(7.5, .6, 4.2); cap.rotateY(angle);cap.translate(center.x,center.y+2.2,center.z); moss.push(cap);
        for (let j=0;j<3;j++) {
          const start = center.clone().add(new THREE.Vector3((j-1)*3,1.8,2));
          curve(vines,[start,start.clone().add(new THREE.Vector3(.4,-4,1)),start.clone().add(new THREE.Vector3(-.7,-10-j*2,.5))],.11,4);
          const shrub = new THREE.IcosahedronGeometry(1,0);shrub.scale(1.1,1.5,.9);shrub.translate(start.x,start.y+1.2,start.z);moss.push(shrub);
        }
      }
      // A small rope walkway connects two near ledges, never the search surface.
      if (!fractured) {
        const center = locate(.52,islandEdgeRadius(.52)*90*.99,-31);
        for (let i=0;i<9;i++) box(timbers,center.x+(i-4)*1.1,center.y-Math.sin(i/8*Math.PI)*.65,center.z,.9,.24,2.5,.04*Math.sin(i));
        for (const side of [-1,1]) curve(ropes,[center.clone().add(new THREE.Vector3(-5,1.5,side*1.4)),center.clone().add(new THREE.Vector3(0,.6,side*1.4)),center.clone().add(new THREE.Vector3(5,1.5,side*1.4))],.10,4);
        // Tiny anchored platform and one warm lantern establish human scale.
        box(timbers,center.x+5.5,center.y,center.z,3,.4,3);
        curve(timbers,[center.clone().add(new THREE.Vector3(5.5,0,0)),center.clone().add(new THREE.Vector3(5.5,3.2,0))],.15,5);
        box(lanterns,center.x+5.5,center.y+2.8,center.z,.45,.65,.45);
      }
      // Broken stone arch suggests a recessed cavern; keep its interior blue-gray.
      if (worldId === 'ackley' || cinematic) {
        const c = locate(.93,95,-28);
        const opening = new THREE.CircleGeometry(4.5,9);opening.rotateY(.93);opening.translate(c.x,c.y,c.z);
        caveStone.push(opening);
        const arch = new THREE.TorusGeometry(4.6,.9,5,11,Math.PI*1.4);
        arch.rotateY(.93);arch.translate(c.x,c.y,c.z);shelves.push(arch);
      }
    }
    addMerged(shelves,0x59645f); addMerged(moss,0x365f47); addMerged(caveStone,0x28343a);
    const beforeLantern = this.group.children.length;
    addMerged(lanterns,0xd6bd88);
    const lantern = this.group.children[beforeLantern] as THREE.Mesh | undefined;
    if (lantern && lantern.material instanceof THREE.MeshStandardMaterial) {
      lantern.material.emissive.setHex(0xc5a56a); lantern.material.emissiveIntensity=.5;
    }
    addMerged(roots, 0x4a3a2c); addMerged(timbers,0x5b4937); addMerged(ropes,0x746954); addMerged(vines,0x365f47);
    this.group.traverse(obj => { obj.userData.semanticLayer = 'ISLAND_DECORATION'; });
    this.setCleanMode(this.clean);
  }

  dispose(): void {
    this.group.clear(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
    this.geometries=[]; this.materials=[];
  }
}
