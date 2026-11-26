import * as THREE from 'three';
import { WorldConfiguration } from '../core/math/Types';
import { VISUAL } from './VisualTheme';

/** Render-only cloud layers with bounded instance counts and cool, luminous shading. */
export class CloudSystem {
  readonly group = new THREE.Group();
  private time = 0;
  private layers: THREE.Group[] = [];
  private material = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color('#e7ebea') },
      uLit: { value: new THREE.Color(VISUAL.cloudLight) },
      uShade: { value: new THREE.Color('#c5d3da') },
      uTwilight: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main() {
        mat3 m = mat3(instanceMatrix);
        vec3 scaleSq = vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));
        vNormal = normalize(mat3(modelMatrix) * m * (normal / scaleSq));
        vec3 p = position;
        float billow = sin(p.x * 5.4 + p.y * 3.7) * sin(p.z * 4.1 - p.y * 2.3);
        p += normal * billow * .065;
        vLocal = p;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uBase; uniform vec3 uLit; uniform vec3 uShade; uniform float uTwilight;
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main() {
        vec3 n = normalize(vNormal);
        float light = clamp(dot(n, normalize(vec3(-.55,.70,-.45))), 0.0, 1.0);
        float volume = smoothstep(-.9,.65,vLocal.y);
        vec3 color = mix(uShade * (.72 + .28 * volume), uBase, .10 + .68 * light + .12 * volume);
        color = mix(color, uLit, light * light * .45);
        color = mix(color, mix(uShade, uLit, .44 + .3 * light), uTwilight * .65);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  private geometry = new THREE.SphereGeometry(1, 16, 12);
  instanceCount = 0;

  constructor(quality: WorldConfiguration['visualQuality']) {
    this.group.name = 'CloudSystem';
    this.group.userData.isEnvironment = true;
    this.setQuality(quality);
  }

  setQuality(quality: WorldConfiguration['visualQuality']): void {
    this.group.clear();
    this.layers = [];
    this.instanceCount = 0;
    // Each entry is a cloud mass containing 12-20 overlapping volumes.
    // One foreground bank and deliberately uneven layers leave the hero island clear.
    type Cluster = [number,number,number,number];
    const sea: Cluster[] = [];
    for(let i=0;i<14;i++) {
      const a=i*2.39996;
      const r=70+Math.sqrt((i+.5)/14)*270;
      sea.push([Math.cos(a)*r,-133-Math.sin(i)*8,Math.sin(a)*r,31+(i%3)*7]);
    }
    const banks: Array<{name:string; clusters:Cluster[]; puffs:number}> = [
      {name:'CloudSea',clusters:sea,puffs:14},
      {name:'NearCloudBank',clusters:[[-145,-104,128,23],[-176,-112,146,28],[-121,-117,166,26]],puffs:18},
      {name:'MidCloudLayer',clusters:[[-195,-99,-155,28],[195,-103,-200,33],[30,-113,-265,36]],puffs:16},
      {name:'DistantCloudLayer',clusters:[[-260,-71,-390,39],[220,-70,-400,43]],puffs:12},
      {name:'HighCloudGroups',clusters:[[-260,115,-390,17],[150,135,-420,20],[310,110,-485,18]],puffs:14},
    ];
    const density = quality === 'performance' ? .5 : quality === 'balanced' ? .85 : 1;
    const transform = new THREE.Object3D();
    for(let b=0;b<banks.length;b++) {
      const {name,clusters,puffs}=banks[b];
      const perCluster=Math.max(10,Math.round(puffs*density));
      const active=quality==='performance'&&name==='CloudSea'?clusters.filter((_,i)=>i%2===0):clusters;
      const count=active.length*perCluster;
      const layer=new THREE.Group();layer.name=name;
      const mesh=new THREE.InstancedMesh(this.geometry,this.material,count);
      let instance=0;
      for(let c=0;c<active.length;c++) {
        const [x,y,z,size]=active[c];
        for(let j=0;j<perCluster;j++) {
          const a=j*2.39996+c*.7;
          const spread=Math.sqrt((j+.5)/perCluster)*size*1.05;
          const scale=.50+((j*37+c*19+b*13)%97)/97*.65;
          // Dense overlapping cores, high lobes, and smaller broken shoulders.
          const high=j%5===0;
          transform.position.set(x+Math.cos(a)*spread,
            y+Math.sin(j*1.73)*size*.16+(high?size*.3:0),z+Math.sin(a)*spread*.85);
          transform.scale.set(size*scale*(1.04+.12*Math.sin(j)),size*scale*(high?.94:.68),size*scale);
          transform.rotation.set(Math.sin(j)*.12,a,Math.cos(j)*.10);
          transform.updateMatrix();mesh.setMatrixAt(instance++,transform.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate=true;
      layer.add(mesh);this.group.add(layer);this.layers.push(layer);this.instanceCount+=count;
    }
  }

  update(dt: number, twilight: number, motion: number): void {
    this.time += Math.min(dt, .1) * motion;
    this.material.uniforms.uTwilight.value = twilight;
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].position.x = Math.sin(this.time / 180 + i) * 3.6;
    }
  }

  dispose(): void {
    this.group.clear(); this.geometry.dispose(); this.material.dispose();
  }
}
