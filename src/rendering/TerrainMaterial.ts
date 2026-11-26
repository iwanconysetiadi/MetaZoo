import * as THREE from 'three';
import { VISUAL } from './VisualTheme';

const vertexShader = `
  attribute float cost;
  attribute float normalizedCost;
  attribute float slope;
  attribute float curvature;
  attribute float basinId;

  varying float vCost;
  varying float vNormalizedCost;
  varying float vSlope;
  varying float vCurvature;
  varying float vBasinId;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vCost = cost;
    vNormalizedCost = normalizedCost;
    vSlope = slope;
    vCurvature = curvature;
    vBasinId = basinId;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform int uVisualizationMode;
  uniform float uIslandMaskEnabled;
  uniform float uViewStyle;
  uniform float uSanctuary;
  uniform vec3 uLowland; uniform vec3 uMoss; uniform vec3 uGrass; uniform vec3 uDry;
  uniform vec3 uRock; uniform vec3 uRockLight;

  uniform int uContourEnabled;
  uniform float uContourCount;
  uniform float uContourThickness;
  uniform float uContourOpacity;

  uniform int uBasinOverlayEnabled;
  uniform int uCurvatureOverlayEnabled;
  uniform int uGradientOverlayEnabled;

  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform float uHazeDensity;
  uniform float uHazeStrength;

  varying float vCost;
  varying float vNormalizedCost;
  varying float vSlope;
  varying float vCurvature;
  varying float vBasinId;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  // ---- microdetail noise --------------------------------------------
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    return vnoise(p) * 0.6 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.1;
  }

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }
  vec3 getBasinColor(float basinId) {
    float t = fract(basinId * 0.618034);
    return mix(vec3(.31,.48,.43), vec3(.58,.66,.68), t);
  }

  // ---- layered natural palette --------------------------------------
  // Best region -> lush lowland; rising cost -> grass, earth, rock, alpine.
  vec3 naturalPalette(float h, float slope, vec2 wp) {
    vec3 lowland = uLowland;
    vec3 moss    = uMoss;
    vec3 grass   = uGrass;
    vec3 dry     = uDry;
    vec3 earth   = uRockLight;
    vec3 rock    = uRock;
    vec3 alpine  = vec3(.56,.61,.60);
    vec3 snow    = vec3(.81,.85,.82);

    vec3 color;
    if (h < 0.12) {
      color = mix(lowland, moss, smoothstep(0.0, 0.12, h));
    } else if (h < 0.32) {
      color = mix(moss, grass, smoothstep(0.12, 0.32, h));
    } else if (h < 0.52) {
      color = mix(grass, dry, smoothstep(0.32, 0.52, h));
    } else if (h < 0.70) {
      color = mix(grass, dry, smoothstep(0.52, 0.70, h));
    } else if (h < 0.85) {
      color = mix(dry, mix(grass, rock, .5), smoothstep(0.70, 0.85, h));
    } else if (h < 0.95) {
      color = mix(mix(grass, rock, .5), alpine, smoothstep(0.85, 0.95, h) * .55);
    } else {
      color = mix(mix(grass, alpine, .55), snow, smoothstep(0.95, 1.0, h) * .25);
    }

    // Steep faces shed vegetation -> exposed rock.
    float rockiness = smoothstep(0.42, 0.9, slope);
    color = mix(color, rock * 0.92, rockiness * 0.7);

    // Sparse vegetation tint clustered in low, flat regions.
    float veg = (1.0 - smoothstep(0.0, 0.30, h)) * (1.0 - smoothstep(0.12, 0.45, slope));
    float forest = smoothstep(0.60, 0.9, vnoise(wp * 0.16));
    color = mix(color, moss * 0.92, veg * forest * 0.12);

    float edgeDistance = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
    float edgeBand = 1.0-smoothstep(0.0,.035,edgeDistance);
    color = mix(color, mix(moss, rock, .4), edgeBand * .22);
    vec3 sanctuary = mix(pow(vec3(.129,.306,.227),vec3(2.2)),pow(vec3(.31,.459,.333),vec3(2.2)),smoothstep(.04,.94,h));
    sanctuary *= .94 + vnoise(wp * .19) * .12;
    color = mix(color,sanctuary,uSanctuary * .97 * (1.0-rockiness*.5));
    return color;
  }

  float contourLine(float h) {
    float c = h * uContourCount;
    float tri = abs(fract(c) - 0.5) * 2.0;
    return 1.0 - smoothstep(0.0, uContourThickness, tri);
  }

  void main() {
    // All modes share the same presentation silhouette. Objective sampling remains rectangular internally.
    if (uIslandMaskEnabled > 0.5) {
      vec2 edgeUv = (vUv - 0.5) * 2.0;
      float angle = atan(edgeUv.y, edgeUv.x);
      float islandEdge = 0.965
        + 0.035 * sin(angle * 3.0 + 0.45)
        + 0.022 * sin(angle * 5.0 - 1.1)
        + 0.012 * sin(angle * 9.0 + 0.8);
      if (length(edgeUv) > islandEdge) discard;
    }

    vec3 color = vec3(0.0);
    float alpha = 1.0;

    vec2 wp = vWorldPosition.xz;

    if (uVisualizationMode == 0) {
      color = naturalPalette(vNormalizedCost, vSlope, wp);
      // microdetail albedo break-up (does NOT affect geometry)
      float d1 = fbm(wp * 0.35) - 0.5;
      float d2 = vnoise(wp * 1.7) - 0.5;
      color *= 1.0 + d1 * 0.08 + d2 * 0.035;
    } else if (uVisualizationMode == 1) {
      color = vec3(clamp(vSlope, 0.0, 1.0)) * 0.9;
    } else if (uVisualizationMode == 2) {
      color = vec3(vNormalizedCost);
    } else if (uVisualizationMode == 3) {
      color = vec3(clamp(vCurvature * 0.5 + 0.5, 0.0, 1.0));
    } else if (uVisualizationMode == 4) {
      color = getBasinColor(vBasinId);
    }

    if (uContourEnabled == 1) {
      float line = contourLine(vNormalizedCost);
      float level = floor(vNormalizedCost * uContourCount);
      float major = 1.0 - step(.5, mod(level, 5.0));
      color = mix(color, mix(vec3(.92,.94,.92), vec3(.96,.94,.86), major),
        line * mix(.24, .55, major));
    }
    if (uBasinOverlayEnabled == 1) {
      color = mix(color, getBasinColor(vBasinId), 0.30);
    }
    if (uCurvatureOverlayEnabled == 1) {
      float curvVis = clamp(vCurvature * 0.5 + 0.5, 0.0, 1.0);
      vec3 curvTint = mix(vec3(0.34, 0.48, 0.60), vec3(.48,.61,.54), curvVis);
      color = mix(color, curvTint, 0.22);
    }

    float luminance = dot(color, vec3(.2126,.7152,.0722));
    color = mix(color, vec3(luminance), uViewStyle > .5 ? .22 : 0.0);

    // ---- micro-normal perturbation (shader-only; geometry untouched) ----
    vec3 n = normalize(vNormal);
    float camDist = length(cameraPosition - vWorldPosition);
    {
      float e = 0.75;
      float n0 = fbm(wp);
      float nx = fbm(wp + vec2(e, 0.0));
      float nz = fbm(wp + vec2(0.0, e));
      // amplitude fades with distance so far terrain stays smooth (no shimmer)
      float amp = 0.10 * (1.0 - smoothstep(110.0, 300.0, camDist));
      vec3 gradN = vec3((n0 - nx) / e, 0.0, (n0 - nz) / e) * amp;
      n = normalize(n + gradN);
    }

    // ---- lighting (lower, more directional key light) ----
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(cameraPosition - vWorldPosition);

    float ndl = dot(n, L);
    float diffuse = clamp(ndl, 0.0, 1.0);
    float wrapped = clamp((ndl + 0.28) / 1.28, 0.0, 1.0);
    float hemi = 0.5 + 0.5 * n.y;

    // hemisphere sky fill (cool from above, faint warm bounce from below)
    vec3 skyFill = uSkyColor * (0.15 + 0.26 * hemi);
    vec3 bounce = vec3(0.20, 0.19, 0.17) * (1.0 - hemi) * 0.10;
    vec3 sun = uSunColor * (0.98 * diffuse + 0.13 * wrapped);

    // concave / steep creases darken gently (cheap AO)
    float ao = 1.0
      - 0.26 * smoothstep(0.30, 0.95, vSlope)
      - 0.12 * smoothstep(0.7, 1.8, vCurvature);

    vec3 lighting = (skyFill + sun + bounce + .08) * clamp(ao, .62, 1.0);
    lighting = mix(lighting, vec3(.85) + lighting * .15, step(1.5, uViewStyle));
    color *= lighting;

    // roughness varies by material region; rock reads with a restrained sheen
    float rockMask = smoothstep(0.42, 0.85, vSlope);
    float roughness = 0.94 - 0.20 * rockMask;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 26.0) * (0.11 * rockMask) * (1.0 - roughness);
    color += uSunColor * spec;

    // soft fresnel rim toward sky for depth separation
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.5);
    color += uSkyColor * fres * 0.045;

    color *= 1.05;

    // ---- atmospheric perspective ----
    float dist = length(cameraPosition - vWorldPosition);
    float haze = 1.0 - exp(-dist * uHazeDensity);
    color = mix(color, uHorizonColor, clamp(haze * uHazeStrength, 0.0, 0.6));

    color = clamp(color, 0.0, 1.2);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class TerrainMaterial extends THREE.ShaderMaterial {
  private basinTexture: THREE.DataTexture | null = null;

  constructor() {
    const uniforms = {
      uTime: { value: 0 },
      uViewStyle: { value: 0 },
      uSanctuary: { value: 0 },
      uLowland: { value: new THREE.Color(VISUAL.terrainLow) },
      uMoss: { value: new THREE.Color(VISUAL.terrainMoist) },
      uGrass: { value: new THREE.Color(VISUAL.terrainGrass) },
      uDry: { value: new THREE.Color(VISUAL.terrainDry) },
      uRock: { value: new THREE.Color(VISUAL.rockMid) },
      uRockLight: { value: new THREE.Color(VISUAL.rockLight) },
      uIslandMaskEnabled: { value: 0 },
      uVerticalScale: { value: 1.0 },
      uHeightMapping: { value: 1 },
      uVisualizationMode: { value: 0 },
      uContourEnabled: { value: 0 },
      uContourCount: { value: 14 },
      uContourThickness: { value: 0.07 },
      uContourOpacity: { value: 0.40 },
      uBasinOverlayEnabled: { value: 0 },
      uGradientOverlayEnabled: { value: 0 },
      uCurvatureOverlayEnabled: { value: 0 },
      uDomainMin: { value: new THREE.Vector2(-5, -5) },
      uDomainMax: { value: new THREE.Vector2(5, 5) },
      uBasinTexture: { value: null },
      uBasinColors: { value: null },
      uSunDir: { value: new THREE.Vector3(-.55, .70, -.45).normalize() },
      uSunColor: { value: new THREE.Color(0xffd7a6) },
      uSkyColor: { value: new THREE.Color(0xb8d0dc) },
      uHorizonColor: { value: new THREE.Color(0xafc5d2) },
      uHazeDensity: { value: 0.0014 },
      uHazeStrength: { value: 0.30 },
    };

    super({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
    });
  }

  setAtmosphere(horizon: THREE.Color, hazeStrength: number): void {
    (this.uniforms.uHorizonColor.value as THREE.Color).copy(horizon);
    this.uniforms.uHazeStrength.value = hazeStrength;
  }

  setBasinTexture(basinMap: any): void {
    if (!basinMap) return;

    const { basinIds, basins, resolution } = basinMap;
    const data = new Uint8Array(resolution * resolution * 4);
    const color = new THREE.Color();

    for (let i = 0; i < resolution * resolution; i++) {
      const basinIdx = basinIds[i];
      if (basinIdx >= 0 && basinIdx < basins.length) {
        color.set(basins[basinIdx].color);
        data[i * 4] = Math.round(color.r * 255);
        data[i * 4 + 1] = Math.round(color.g * 255);
        data[i * 4 + 2] = Math.round(color.b * 255);
        data[i * 4 + 3] = 255;
      } else {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 0;
      }
    }

    if (this.basinTexture) {
      this.basinTexture.dispose();
    }

    this.basinTexture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
    this.basinTexture.needsUpdate = true;
    this.basinTexture.magFilter = THREE.NearestFilter;
    this.basinTexture.minFilter = THREE.NearestFilter;
    this.uniforms.uBasinTexture.value = this.basinTexture;
  }

  updateBasinColors(basinColors: Float32Array): void {
    this.uniforms.uBasinColors.value = basinColors;
  }

  dispose(): void {
    if (this.basinTexture) {
      this.basinTexture.dispose();
      this.basinTexture = null;
    }
    super.dispose();
  }
}
