import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { islandEdgeRadius } from '../core/world/IslandProjection';

/** Render-only Sphere landmarks. Never changes objective samples or picking geometry. */
export class SphereSanctuary {
  readonly group = new THREE.Group();
  private waterMaterial?: THREE.ShaderMaterial;
  private time = 0;
  constructor(private world: OptimizationWorld) { this.group.name = 'SphereSanctuary'; this.group.userData.isEnvironment = true; }

  private surface(x: number, z: number, offset = 0): THREE.Vector3 {
    const p = this.world.worldToOptimization(x, z);
    return new THREE.Vector3(x, this.world.getTerrainSurfaceHeight(p.x1, p.x2) + offset, z);
  }

  rebuild(): void {
    this.dispose();
    const natural = this.world.getConfig().viewMode === 'natural';
    const trunks: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], moss: THREE.BufferGeometry[] = [];
    const wood: THREE.BufferGeometry[] = [], foliage: Array<{ p: THREE.Vector3; scale: THREE.Vector3; angle: number; color: THREE.Color }> = [];
    let seed = 77819;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const tube = (points: THREE.Vector3[], radius: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 6, false);
    const rock = (target: THREE.BufferGeometry[], p: THREE.Vector3, scale: THREE.Vector3) => {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      geo.scale(scale.x, scale.y, scale.z); geo.rotateY(rand() * Math.PI); geo.translate(p.x, p.y, p.z); target.push(geo);
    };
    const poolRadius = 7;
    let poolY = 0;
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; poolY = Math.max(poolY, this.surface(Math.cos(a) * poolRadius, Math.sin(a) * poolRadius).y); }
    poolY += .22;
    // One irregular stone coping, rather than stacked luminous discs.
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, r = poolRadius + .25 + rand() * .65;
      const p = this.surface(Math.cos(a) * r, Math.sin(a) * r); p.y = Math.max(p.y, poolY) + .1;
      rock(stone, p, new THREE.Vector3(.7 + rand() * .3, .24 + rand() * .12, .5 + rand() * .22));
      if (i % 3 === 0) rock(moss, p.clone().add(new THREE.Vector3(0,.36,0)), new THREE.Vector3(.5,.10,.35));
    }
    const waterGeo = new THREE.CircleGeometry(poolRadius, 96); waterGeo.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uTwilight: { value: 0 } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float uTime; uniform float uTwilight; varying vec3 vPosition;
        void main(){float r=length(vPosition.xz)/7.;float ripple=sin(r*48.-uTime*1.8)*.5+.5;
        vec3 c=mix(vec3(.11,.30,.27),vec3(.32,.55,.46),pow(r,1.4));
        c+=vec3(.11,.16,.13)*pow(ripple,18.)*.23;
        c=mix(c,vec3(.10,.23,.29),uTwilight*.65);gl_FragColor=vec4(c,.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }` });
    this.waterMaterial = material;
    const water = new THREE.Mesh(waterGeo, material); water.position.y = poolY; water.renderOrder = 2; this.group.add(water);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.32,16,12),new THREE.MeshBasicMaterial({color:0xe8f6e9}));
    marker.position.set(0,poolY+.65,0); marker.name='exact-optimum-0-0'; this.group.add(marker);
    // Trees form unequal off-center groups. The center is left completely open.
    const trees = [[-34,-26,19],[26,-23,11],[35,-28,8.5],[-25,21,8],[-32,26,6],[-21,29,5.5],[-94,-19,11],[69,46,8]];
    for (let t=0; t<trees.length; t++) {
      const [x,z,h]=trees[t], base=this.surface(x,z), lean=(rand()-.4)*h*.22;
      trunks.push(tube([base,base.clone().add(new THREE.Vector3(-h*.07,h*.32,h*.035)),base.clone().add(new THREE.Vector3(lean,h*.68,-h*.06)),base.clone().add(new THREE.Vector3(lean*.7,h,0))],h*.035));
      for(let j=0;j<7;j++) {
        const a=j*2.399+rand()*.6, y=h*(.35+j*.082), spread=h*(.38-j*.029)*( .8+rand()*.3);
        const start=base.clone().add(new THREE.Vector3(lean*.5,y,0));
        const end=start.clone().add(new THREE.Vector3(Math.cos(a)*spread,h*.075,Math.sin(a)*spread));
        trunks.push(tube([start,start.clone().lerp(end,.55).add(new THREE.Vector3(0,-h*.04,0)),end],h*.012*(1-j*.065)));
        for(let k=0;k<3;k++) foliage.push({p:end.clone().add(new THREE.Vector3((rand()-.5)*spread*.65,(rand()-.5)*h*.09,(rand()-.5)*spread*.65)),scale:new THREE.Vector3(spread*(.55+rand()*.18),h*(.085+rand()*.045),spread*(.36+rand()*.2)),angle:rand()*Math.PI,color:new THREE.Color(0x164532).lerp(new THREE.Color(0x355f46),rand())});
      }
      for(let j=0;j<4;j++){const a=j*1.8+rand(); const end=this.surface(x+Math.cos(a)*h*.24,z+Math.sin(a)*h*.24,.1);trunks.push(tube([base.clone().add(new THREE.Vector3(0,h*.13,0)),base.clone().lerp(end,.6).add(new THREE.Vector3(0,.25,0)),end],h*.023));}
      if(t===0){const lantern=new THREE.Mesh(new THREE.BoxGeometry(.6,.85,.6),new THREE.MeshStandardMaterial({color:0xbca778,emissive:0xd6b76c,emissiveIntensity:.25}));lantern.position.copy(base).add(new THREE.Vector3(3,4,1));this.group.add(lantern);}
    }
    const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),foliage.length);
    const transform = new THREE.Object3D();
    foliage.forEach((leaf,i)=>{transform.position.copy(leaf.p);transform.rotation.set((rand()-.5)*.16,leaf.angle,(rand()-.5)*.12);transform.scale.copy(leaf.scale);transform.updateMatrix();canopy.setMatrixAt(i,transform.matrix);canopy.setColorAt(i,leaf.color);});
    canopy.instanceMatrix.needsUpdate=true;canopy.castShadow=true;canopy.receiveShadow=true;this.group.add(canopy);
    // Weathered stone groups near trees and a few cliff-edge outcrops.
    for(const [x,z] of [[-19,-16],[20,11],[-40,-24],[37,-22],[-102,16],[82,68],[-60,83]]) {
      for(let j=0;j<3;j++){const p=this.surface(x+rand()*4,z+rand()*3,.3), size=.8+rand()*1.8;rock(stone,p,new THREE.Vector3(size,size*.6,size*.85));if(j===0)rock(moss,p.clone().add(new THREE.Vector3(0,size*.48,0)),new THREE.Vector3(size*.8,.18,size*.65));}
    }
    // A lightly staggered stepping-stone path, following the existing surface.
    for(let i=0;i<24;i++){const t=i/23,x=-8-48*t,z=5+Math.sin(t*2.2)*18;rock(stone,this.surface(x+(rand()-.5),z,.13),new THREE.Vector3(.75,.16,.5));}
    // Small bench at the ancestor tree supplies a human-scale cue.
    const bench=this.surface(-42,-20,.8);
    const seat=new THREE.BoxGeometry(4.2,.35,1.1);seat.translate(bench.x,bench.y,bench.z);wood.push(seat);
    for(const x of [-1.5,1.5]){const leg=new THREE.BoxGeometry(.3,1.2,.8);leg.translate(bench.x+x,bench.y-.6,bench.z);wood.push(leg);}
    // A short coastal rill feeds the spillway, without an uphill river across the convex basin.
    const angle=.62, edge=islandEdgeRadius(angle)*90, positions:number[]=[], indices:number[]=[];
    for(let i=0;i<=32;i++){const t=i/32,r=edge-22+t*22,a=angle+Math.sin(t*Math.PI)*.035;
      for(const side of [-1,1]){const x=Math.cos(a)*r-Math.sin(a)*side*.55,z=Math.sin(a)*r+Math.cos(a)*side*.55,p=this.surface(x,z,.18);positions.push(p.x,p.y,p.z);}
      if(i<32){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}}
    const rillGeo=new THREE.BufferGeometry();rillGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));rillGeo.setIndex(indices);rillGeo.computeVertexNormals();
    this.group.add(new THREE.Mesh(rillGeo,new THREE.MeshStandardMaterial({color:0x719e94,roughness:.25,transparent:true,opacity:.7,side:THREE.DoubleSide})));
    const merge=(geos:THREE.BufferGeometry[],color:number)=>{if(!geos.length)return;const geometry=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.94}));mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);};
    merge(trunks,0x564d42);merge(stone,0x748279);merge(moss,0x355f46);merge(wood,0x605748);
    // Keep environmental context in analysis without hiding the exact center.
    for(const child of this.group.children){child.userData.isEnvironment=true;if(!natural && child!==water && child!==marker)child.visible=this.world.getConfig().viewMode!=='topographic';}
  }

  update(dt:number,twilight:number):void { this.time+=Math.min(dt,.1)*(matchMedia('(prefers-reduced-motion: reduce)').matches?.1:1);if(this.waterMaterial){this.waterMaterial.uniforms.uTime.value=this.time;this.waterMaterial.uniforms.uTwilight.value=twilight;} }
  dispose():void {this.group.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(m=>m.dispose());}});this.group.clear();this.waterMaterial=undefined;}
}
