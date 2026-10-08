import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ARENA_RADIUS, HEX_SIZE, SNAKE_COLORS, colorById } from "./constants";
import type { GameMode, PowerKind, Snake, WorldState } from "./types";

export type Quality = "low" | "medium" | "high";

const HEX_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HEX_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uPlayer;
varying vec3 vWorld;
varying vec3 vN;

vec2 hexAx(vec2 p) {
  float q = (1.7320508 / 3.0) * p.x - (1.0 / 3.0) * p.y;
  float r = (2.0 / 3.0) * p.y;
  return vec2(q, r);
}
vec3 cubeRound(vec3 c) {
  vec3 r = round(c);
  vec3 d = abs(r - c);
  if (d.x > d.y && d.x > d.z) r.x = -r.y - r.z;
  else if (d.y > d.z) r.y = -r.x - r.z;
  else r.z = -r.x - r.y;
  return r;
}
float hexD(vec2 p) {
  vec2 a = hexAx(p);
  vec3 cube = cubeRound(vec3(a.x, -a.x - a.y, a.y));
  vec2 c = vec2(cube.x, cube.z);
  vec2 center = vec2(1.7320508 * (c.x + c.y * 0.5), 1.5 * c.y);
  vec2 d = abs(p - center);
  return max(d.x * 0.8660254 + d.y * 0.5, d.y);
}

void main() {
  float size = ${HEX_SIZE.toFixed(2)};
  vec2 p = vWorld.xz / size;
  float hd = hexD(p);
  float edge = smoothstep(0.82, 0.96, hd);
  float inner = 1.0 - smoothstep(0.0, 0.8, hd);
  float pulse = 0.5 + 0.5 * sin(uTime * 0.7 + hd * 6.0);
  float dist = length(vWorld.xz);
  float fog = smoothstep(${(ARENA_RADIUS + 8).toFixed(1)}, 18.0, dist);
  float near = 1.0 - smoothstep(6.0, 28.0, length(vWorld.xz - uPlayer.xz));
  vec3 base = vec3(0.015, 0.02, 0.055);
  vec3 hexFill = mix(vec3(0.035, 0.03, 0.09), vec3(0.06, 0.04, 0.14), inner * 0.5);
  vec3 line = mix(vec3(0.25, 0.08, 0.7), vec3(0.15, 0.55, 1.0), pulse);
  vec3 col = mix(hexFill, line, edge * 0.85);
  col += line * near * 0.18;
  col += vec3(0.25, 0.08, 0.55) * (0.04 + 0.04 * pulse) * inner;
  float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 1.0, 0.0))), 2.0);
  col += vec3(0.2, 0.5, 1.0) * rim * 0.12;
  col *= fog;
  float ring = smoothstep(${(ARENA_RADIUS - 1.2).toFixed(1)}, ${ARENA_RADIUS.toFixed(1)}, dist);
  col = mix(col, vec3(0.55, 0.18, 1.0), ring * 0.65);
  gl_FragColor = vec4(col, 1.0);
}
`;

const BODY_VERT = /* glsl */ `
attribute vec3 instanceColor;
attribute float instanceAlong;
attribute float instancePulse;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vView;
varying float vAlong;
varying float vPulse;
void main() {
  vColor = instanceColor;
  vAlong = instanceAlong;
  vPulse = instancePulse;
  vec3 tpos = position;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(tpos, 1.0);
  vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const BODY_FRAG = /* glsl */ `
varying vec3 vColor;
varying vec3 vN;
varying vec3 vView;
varying float vAlong;
varying float vPulse;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 2.4);
  float ring = smoothstep(0.15, 0.48, abs(fract(vAlong * 1.15) - 0.5));
  vec3 dark = vColor * 0.22;
  vec3 mid = vColor * (0.55 + 0.45 * ndv);
  vec3 col = mix(dark, mid, ring);
  col += vColor * fres * 1.65;
  col += vColor * (0.18 + 0.12 * vPulse);
  float spec = pow(ndv, 28.0) * 0.55;
  col += vec3(spec);
  gl_FragColor = vec4(col, 1.0);
}
`;

type SnakeVisual = {
  body: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
  head: THREE.Group;
  light: THREE.PointLight;
  eyes: THREE.Mesh[];
  label: THREE.Sprite;
  max: number;
};

function hexColor(n: number) {
  return new THREE.Color(n);
}

function makeLabel(text: string, color: string, you: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 512, 128);
  if (you) {
    g.fillStyle = "#ffd166";
    g.font = "700 42px sans-serif";
    g.textAlign = "center";
    g.fillText("♛", 256, 40);
  }
  g.font = you ? "700 44px sans-serif" : "600 40px sans-serif";
  g.textAlign = "center";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(0,0,0,0.65)";
  g.strokeText(text, 256, 96);
  g.fillStyle = color;
  g.fillText(text, 256, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(6.4, 1.6, 1);
  spr.center.set(0.5, 0);
  return spr;
}

function makeHead(color: THREE.Color): { group: THREE.Group; eyes: THREE.Mesh[] } {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.35),
    emissive: color,
    emissiveIntensity: 1.35,
    roughness: 0.22,
    metalness: 0.55,
  });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), mat);
  skull.scale.set(1.05, 0.82, 1.28);
  group.add(skull);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), mat);
  cheek.scale.set(1.35, 0.7, 1.1);
  cheek.position.set(0, -0.05, 0.15);
  group.add(cheek);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 10), mat);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 1.05;
  group.add(snout);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mat);
  jaw.scale.set(1.1, 0.45, 1.4);
  jaw.position.set(0, -0.32, 0.55);
  group.add(jaw);
  const fangMat = new THREE.MeshStandardMaterial({
    color: 0xf8f8ff,
    emissive: 0x88ccff,
    emissiveIntensity: 0.6,
    roughness: 0.2,
  });
  for (const sx of [-0.16, 0.16]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 6), fangMat);
    fang.position.set(sx, -0.22, 1.05);
    fang.rotation.x = Math.PI;
    group.add(fang);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xecfeff });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x7cf7ff,
    transparent: true,
    opacity: 0.45,
  });
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-0.36, 0.36]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), eyeMat);
    eye.position.set(sx, 0.22, 0.72);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), glowMat);
    halo.position.copy(eye.position);
    group.add(eye, halo);
    eyes.push(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.18), mat);
  brow.position.set(0, 0.42, 0.55);
  brow.rotation.x = -0.35;
  group.add(brow);
  return { group, eyes };
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();
const tmpFwd = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpRight = new THREE.Vector3();

export class ArenaRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.2, 420);
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  private floorMat: THREE.ShaderMaterial;
  private snakes = new Map<string, SnakeVisual>();
  private orbMesh: THREE.InstancedMesh;
  private specialMesh: THREE.InstancedMesh;
  private powerGroup = new THREE.Group();
  private particle: THREE.Points;
  private pVel: Float32Array;
  private trail: THREE.Points;
  private trailGeo: THREE.BufferGeometry;
  private trailPos: Float32Array;
  private trailPtr = 0;
  private crystals: THREE.Mesh[] = [];
  private quality: Quality;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 36, 24);
  private look = new THREE.Vector3();
  private trauma = 0;
  private clock = 0;
  private followId: string | null = null;
  playerPos = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.25));
    this.renderer.setClearColor(0x050510, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.fog = new THREE.FogExp2(0x060614, 0.011);
    this.scene.add(new THREE.AmbientLight(0x3a2a88, 0.55));
    const hemi = new THREE.HemisphereLight(0x7a5cff, 0x041018, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0x8ecbff, 0.55);
    key.position.set(30, 50, 20);
    this.scene.add(key);

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPlayer: { value: new THREE.Vector3() },
      },
      vertexShader: HEX_VERT,
      fragmentShader: HEX_FRAG,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 6, 80), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 0.55, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0xb84dff }),
    );
    rim.rotation.x = Math.PI / 2;
    this.scene.add(rim);
    const rim2 = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS + 1.4, 0.18, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    rim2.rotation.x = Math.PI / 2;
    rim2.position.y = 0.4;
    this.scene.add(rim2);

    this.addWalls();
    this.addCrystals();
    this.scene.add(this.powerGroup);

    const orbGeo = new THREE.SphereGeometry(0.32, 10, 8);
    const orbMat = new THREE.MeshBasicMaterial();
    this.orbMesh = new THREE.InstancedMesh(orbGeo, orbMat, 240);
    this.orbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.scene.add(this.orbMesh);

    const specGeo = new THREE.SphereGeometry(0.55, 14, 10);
    this.specialMesh = new THREE.InstancedMesh(
      specGeo,
      new THREE.MeshStandardMaterial({
        color: 0xff2a2a,
        emissive: 0xff1a1a,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      }),
      16,
    );
    this.scene.add(this.specialMesh);

    const pCount = quality === "low" ? 180 : 420;
    this.pVel = new Float32Array(pCount * 3);
    const pPos = new Float32Array(pCount * 3);
    const pCol = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * ARENA_RADIUS;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = 0.4 + Math.random() * 8;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      this.pVel[i * 3 + 1] = 0.4 + Math.random() * 0.8;
      const c = Math.random() > 0.5 ? [0.55, 0.25, 1] : [0.15, 0.7, 1];
      pCol[i * 3] = c[0]!;
      pCol[i * 3 + 1] = c[1]!;
      pCol[i * 3 + 2] = c[2]!;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    this.particle = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.scene.add(this.particle);

    const tCount = quality === "low" ? 80 : 180;
    this.trailPos = new Float32Array(tCount * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute("position", new THREE.BufferAttribute(this.trailPos, 3));
    this.trail = new THREE.Points(
      this.trailGeo,
      new THREE.PointsMaterial({
        color: 0xb84dff,
        size: 0.22,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.scene.add(this.trail);

    if (quality !== "low") {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(canvas.width, canvas.height),
        quality === "high" ? 0.72 : 0.48,
        0.7,
        0.22,
      );
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.camera.position.copy(this.camPos);
  }

  private addWalls() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0a18,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x140828,
      emissiveIntensity: 0.4,
    });
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = ARENA_RADIUS + 4 + Math.random() * 3;
      const h = 6 + Math.random() * 10;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, h, 5.5), mat);
      mesh.position.set(Math.cos(a) * r, h * 0.5 - 0.4, Math.sin(a) * r);
      mesh.rotation.y = a;
      this.scene.add(mesh);
    }
  }

  private addCrystals() {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mats = [
      new THREE.MeshStandardMaterial({
        color: 0x3a1070,
        emissive: 0xb84dff,
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.5,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x06314a,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.0,
        roughness: 0.25,
        metalness: 0.5,
      }),
    ];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = ARENA_RADIUS - 6 - Math.random() * 18;
      const m = new THREE.Mesh(geo, mats[i % 2]!);
      const s = 1.2 + Math.random() * 2.4;
      m.scale.set(s * 0.55, s * (1.6 + Math.random()), s * 0.55);
      m.position.set(Math.cos(a) * r, s * 0.7, Math.sin(a) * r);
      m.rotation.y = a;
      this.scene.add(m);
      this.crystals.push(m);
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  setFollow(id: string | null) {
    this.followId = id;
  }

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  pointerToHeading(ndcX: number, ndcY: number, fromX: number, fromZ: number): number | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const ok = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!ok) return null;
    return Math.atan2(-(this.hit.x - fromX), -(this.hit.z - fromZ));
  }

  private ensureSnake(s: Snake, you: boolean): SnakeVisual {
    let vis = this.snakes.get(s.id);
    if (vis) return vis;
    const col = colorById(s.colorId);
    const color = hexColor(col.hex);
    const max = this.quality === "low" ? 70 : 140;
    const geo = new THREE.SphereGeometry(1, this.quality === "high" ? 16 : 12, this.quality === "high" ? 12 : 10);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
    });
    const body = new THREE.InstancedMesh(geo, mat, max);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const along = new Float32Array(max);
    const pulse = new Float32Array(max);
    const icol = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      icol[i * 3] = color.r;
      icol[i * 3 + 1] = color.g;
      icol[i * 3 + 2] = color.b;
    }
    body.geometry.setAttribute("instanceAlong", new THREE.InstancedBufferAttribute(along, 1));
    body.geometry.setAttribute("instancePulse", new THREE.InstancedBufferAttribute(pulse, 1));
    body.geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(icol, 3));

    const glowGeo = new THREE.SphereGeometry(1, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const glow = new THREE.InstancedMesh(glowGeo, glowMat, max);
    glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const head = makeHead(color);
    const light = new THREE.PointLight(col.hex, 2.4, 16, 2);
    head.group.add(light);

    const label = makeLabel(you ? "You" : s.name, you ? "#ffd166" : "#e8e6ff", you);
    this.scene.add(body, glow, head.group, label);

    vis = { body, glow, head: head.group, light, eyes: head.eyes, label, max };
    this.snakes.set(s.id, vis);
    return vis;
  }

  private pruneSnakes(world: WorldState) {
    const live = new Set(world.snakes.map((s) => s.id));
    for (const [id, vis] of this.snakes) {
      if (live.has(id)) continue;
      this.scene.remove(vis.body, vis.glow, vis.head, vis.label);
      vis.body.geometry.dispose();
      (vis.body.material as THREE.Material).dispose();
      vis.glow.geometry.dispose();
      (vis.glow.material as THREE.Material).dispose();
      this.snakes.delete(id);
    }
  }

  private syncSnake(s: Snake, you: boolean, time: number) {
    const vis = this.ensureSnake(s, you);
    vis.head.visible = s.alive;
    vis.body.visible = s.alive;
    vis.glow.visible = s.alive;
    vis.label.visible = s.alive;
    if (!s.alive) {
      vis.light.intensity = 0;
      vis.body.count = 0;
      vis.glow.count = 0;
      return;
    }
    const pts = s.points;
    const n = Math.min(vis.max, pts.length);
    const alongAttr = vis.body.geometry.getAttribute("instanceAlong") as THREE.InstancedBufferAttribute;
    const pulseAttr = vis.body.geometry.getAttribute("instancePulse") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const next = pts[Math.max(0, i - 1)]!;
      tmpFwd.set(next.x - p.x, 0, next.z - p.z);
      if (tmpFwd.lengthSq() < 1e-6) tmpFwd.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
      tmpFwd.normalize();
      tmpRight.crossVectors(tmpUp, tmpFwd).normalize();
      tmpObj.position.set(p.x, 0.85, p.z);
      tmpObj.up.copy(tmpUp);
      tmpObj.lookAt(p.x + tmpFwd.x, 0.85, p.z + tmpFwd.z);
      const t = i / Math.max(1, n - 1);
      const rad = (you ? 1.08 : 0.95) * (1.05 - t * 0.62) * (s.ghost > 0 ? 0.85 : 1);
      tmpObj.scale.setScalar(rad);
      tmpObj.updateMatrix();
      vis.body.setMatrixAt(i, tmpObj.matrix);
      tmpObj.scale.setScalar(rad * 1.35);
      tmpObj.updateMatrix();
      vis.glow.setMatrixAt(i, tmpObj.matrix);
      alongAttr.setX(i, i * 0.35);
      pulseAttr.setX(i, 0.5 + 0.5 * Math.sin(time * 4 + i * 0.2));
    }
    vis.body.count = n;
    vis.glow.count = n;
    vis.body.instanceMatrix.needsUpdate = true;
    vis.glow.instanceMatrix.needsUpdate = true;
    alongAttr.needsUpdate = true;
    pulseAttr.needsUpdate = true;

    vis.head.position.set(s.x, 0.95, s.z);
    vis.head.lookAt(s.x - Math.sin(s.yaw), 0.95, s.z - Math.cos(s.yaw));
    vis.head.scale.setScalar(you ? 1.18 : 1.02);
    vis.light.intensity = 2.2 + Math.sin(time * 6) * 0.3;
    vis.light.distance = s.shield > 0 ? 20 : 14;
    if (s.shield > 0) vis.light.color.setHex(0x66f0ff);
    else vis.light.color.setHex(colorById(s.colorId).hex);

    vis.label.position.set(s.x, 3.15, s.z);
    if (you) vis.label.position.y = 3.45;
  }

  private syncOrbs(world: WorldState, time: number) {
    let oi = 0;
    let si = 0;
    const hues = [
      [0.15, 0.85, 1],
      [1, 0.85, 0.2],
      [0.35, 1, 0.45],
      [1, 0.3, 0.85],
      [0.4, 0.5, 1],
    ];
    for (const o of world.orbs) {
      if (o.special ? si >= 16 : oi >= 220) continue;
      const bob = 0.45 + Math.sin(time * 3 + o.pulse) * 0.18;
      tmpObj.position.set(o.x, bob, o.z);
      if (o.special) {
        tmpObj.scale.setScalar(1 + Math.sin(time * 4 + o.pulse) * 0.12);
        tmpObj.updateMatrix();
        this.specialMesh.setMatrixAt(si++, tmpObj.matrix);
      } else {
        tmpObj.scale.setScalar(0.85 + (o.value / 16) * 0.4);
        tmpObj.updateMatrix();
        this.orbMesh.setMatrixAt(oi, tmpObj.matrix);
        const h = hues[Math.floor(o.hue * hues.length) % hues.length]!;
        tmpColor.setRGB(h[0]!, h[1]!, h[2]!);
        this.orbMesh.setColorAt(oi, tmpColor);
        oi++;
      }
    }
    this.orbMesh.count = oi;
    this.specialMesh.count = si;
    this.orbMesh.instanceMatrix.needsUpdate = true;
    this.specialMesh.instanceMatrix.needsUpdate = true;
    if (this.orbMesh.instanceColor) this.orbMesh.instanceColor.needsUpdate = true;
  }

  private powerMeshes = new Map<number, THREE.Group>();

  private syncPowerups(world: WorldState, time: number) {
    const live = new Set(world.powerups.map((p) => p.id));
    for (const [id, g] of this.powerMeshes) {
      if (live.has(id)) continue;
      this.powerGroup.remove(g);
      this.powerMeshes.delete(id);
    }
    const icons: Record<PowerKind, number> = {
      speed: 0x5ce1ff,
      shield: 0x7a5cff,
      magnet: 0xff4ad2,
      multiplier: 0xffd166,
      ghost: 0xb0f0ff,
    };
    for (const p of world.powerups) {
      let g = this.powerMeshes.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const c = icons[p.kind];
        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.7, 0),
          new THREE.MeshBasicMaterial({ color: c }),
        );
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.05, 0.08, 8, 24),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7 }),
        );
        ring.rotation.x = Math.PI / 2;
        g.add(core, ring);
        this.powerGroup.add(g);
        this.powerMeshes.set(p.id, g);
      }
      g.position.set(p.x, 1.2 + Math.sin(time * 3 + p.pulse) * 0.25, p.z);
      g.rotation.y = time * 1.4 + p.pulse;
    }
  }

  private explodePool: THREE.Points[] = [];

  burst(x: number, z: number, color: number) {
    const n = this.quality === "low" ? 24 : 48;
    const pos = new Float32Array(n * 3);
    const vel: number[] = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = 1;
      pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 10;
      vel.push(Math.cos(a) * r, 3 + Math.random() * 8, Math.sin(a) * r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.28, transparent: true, opacity: 1, depthWrite: false }),
    );
    pts.userData = { vel, age: 0 };
    this.scene.add(pts);
    this.explodePool.push(pts);
    this.addTrauma(0.45);
  }

  private stepFx(dt: number) {
    for (let i = this.explodePool.length - 1; i >= 0; i--) {
      const p = this.explodePool[i]!;
      const data = p.userData as { vel: number[]; age: number };
      data.age += dt;
      const pos = p.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        data.vel[k * 3 + 1]! -= 12 * dt;
        pos.setXYZ(
          k,
          pos.getX(k) + data.vel[k * 3]! * dt,
          pos.getY(k) + data.vel[k * 3 + 1]! * dt,
          pos.getZ(k) + data.vel[k * 3 + 2]! * dt,
        );
      }
      pos.needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - data.age / 0.7);
      if (data.age > 0.7) {
        this.scene.remove(p);
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
        this.explodePool.splice(i, 1);
      }
    }
  }

  render(world: WorldState, dt: number, followId: string | null, mode: GameMode) {
    this.clock += dt;
    this.followId = followId;
    this.pruneSnakes(world);
    const you = world.snakes.find((s) => s.id === followId) ?? world.snakes.find((s) => s.human) ?? world.snakes[0];
    for (const s of world.snakes) this.syncSnake(s, !!you && s.id === you.id, this.clock);
    this.syncOrbs(world, this.clock);
    this.syncPowerups(world, this.clock);
    this.stepFx(dt);

    const pos = this.particle.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + this.pVel[i * 3 + 1]! * dt;
      if (y > 9) y = 0.2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;

    if (you) {
      this.playerPos.set(you.x, 0, you.z);
      this.trailPos[this.trailPtr * 3] = you.x;
      this.trailPos[this.trailPtr * 3 + 1] = 0.5;
      this.trailPos[this.trailPtr * 3 + 2] = you.z;
      this.trailPtr = (this.trailPtr + 1) % (this.trailPos.length / 3);
      (this.trailGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      const fx = -Math.sin(you.yaw);
      const fz = -Math.cos(you.yaw);
      const back = mode === "attract" ? 26 : 23;
      const height = mode === "attract" ? 34 : 32;
      this.camPos.set(you.x - fx * back * 0.15, height, you.z + back);
      this.look.set(you.x + fx * 6, 0.4, you.z + fz * 6);
    }

    const k = 1 - Math.exp(-3.2 * dt);
    this.camera.position.lerp(this.camPos, k);
    this.camera.lookAt(this.look);

    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    if (this.trauma > 0.01) {
      const s = this.trauma * this.trauma;
      this.camera.position.x += (Math.random() - 0.5) * s * 1.4;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.8;
    }

    this.floorMat.uniforms.uTime!.value = this.clock;
    (this.floorMat.uniforms.uPlayer!.value as THREE.Vector3).copy(this.playerPos);

    for (const c of this.crystals) c.rotation.y += dt * 0.35;

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.composer?.dispose();
    this.scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}
