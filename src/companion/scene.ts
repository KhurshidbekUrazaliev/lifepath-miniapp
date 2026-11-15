// The 3D companion stage. three.js is big, so this file is only loaded by the screens that show the
// companion (it becomes its own chunk). Everything here is imperative: React talks to it through the
// small controller that createStage returns.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { measureBody, partOf, restCap, type Body, type Vec3 } from './fit';
import type { Clip, PropSpec, StageController, StageOptions, TapPart } from './types';

const LOOPING = new Set<Clip>(['idle', 'talk', 'read']);
/** World height of a grown companion; younger stages are scaled down from it. */
const FULL_HEIGHT = 1;
const PLATFORM_R = 0.5;
/**
 * How far the head turns after a finger, a glance or the viewer (radians each way), how far it looks up
 * and down, and the share of each that the neck takes: a head that turns alone twists out of its collar.
 */
const LOOK_TURN = 0.42;
const LOOK_UP = 0.2;
const LOOK_DOWN = 0.24;
const LOOK_NECK = 0.35;
/** Seconds a gesture takes to come in over the idle (one that goes round takes longer) and to go again. */
const GESTURE_IN = 0.15;
const GESTURE_IN_LOOP = 0.35;
const GESTURE_OUT = 0.3;

// ---------- loading (shared by every stage on the page) ----------

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

/** Starts downloading a model before a stage needs it (for example while the screen animates in). */
export function preload(url: string): void {
  void loadGltf(url).catch(() => undefined);
}

/** Clip names as exported can be anything ("Armature|wave", "mixamo.com"); keep the last word. */
function clipName(name: string): string {
  const last = name.split(/[|/:]/).pop() ?? name;
  return last.trim().toLowerCase().replace(/[^a-z]/g, '');
}

type Motions = { idle: THREE.AnimationClip | null; gestures: Map<string, THREE.AnimationClip[]> };
const motions = new WeakMap<GLTF, Motions>();

/**
 * A model's motions, sorted out once for every stage that shows it. The idle is played as it is. Every
 * other motion is a gesture laid over the running idle: it is kept as what it adds to the idle's first
 * moment, so the breathing goes on underneath and nothing jumps when a gesture starts, ends or is cut
 * short. There are two copies of each, so that one can start again while its last run is still fading.
 */
function motionsOf(gltf: GLTF): Motions {
  let made = motions.get(gltf);
  if (made) return made;
  const named = new Map<string, THREE.AnimationClip>();
  for (const clip of gltf.animations) {
    const name = clipName(clip.name);
    if (!named.has(name)) named.set(name, clip);
  }
  const idle = named.get('idle') ?? gltf.animations[0] ?? null;
  made = { idle, gestures: new Map() };
  if (idle) {
    const standing = new Set(idle.tracks.map((track) => track.name));
    for (const [name, clip] of named) {
      if (clip === idle) continue;
      made.gestures.set(
        name,
        [0, 1].map(() => {
          const copy = clip.clone();
          copy.tracks = copy.tracks.filter((track) => standing.has(track.name)); // only what the idle moves can be told apart from it
          return THREE.AnimationUtils.makeClipAdditive(copy, 0, idle);
        }),
      );
    }
  }
  motions.set(gltf, made);
  return made;
}

// ---------- item thumbnails (one small shared renderer for the whole shop) ----------

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbs = new Map<string, Promise<string>>();

/** A transparent picture of a 3D item, for its shop tile. */
export function itemThumb(url: string, size = 160): Promise<string> {
  let p = thumbs.get(url);
  if (p) return p;
  p = loadGltf(url).then((gltf) => {
    thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    const r = thumbRenderer;
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2ff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 3);
    scene.add(key);
    const obj = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    obj.position.sub(center);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.set(0.35, -0.6, 0);
    scene.add(holder);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    cam.position.set(0, 0, (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02);
    cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    return r.domElement.toDataURL('image/png');
  });
  thumbs.set(url, p);
  p.catch(() => thumbs.delete(url));
  return p;
}

// ---------- drawing helpers ----------

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(10,8,30,0.55)');
  grad.addColorStop(0.55, 'rgba(10,8,30,0.22)');
  grad.addColorStop(1, 'rgba(10,8,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft mid-tone of the accent for the platform top (pastel glows too much under the key light). */
function platformColor(accent: string): THREE.Color {
  return new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.18).multiplyScalar(0.72);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 0 to 1 with a soft start and a soft stop. */
const eased = (v: number) => v * v * (3 - 2 * v);
/** Angle folded into (-PI, PI]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- measuring a model ----------

/**
 * Every vertex of a model where it stands now (x, y, z in a row), and which part of the body moves each
 * one. A rigged model's vertices are where its bones put them, so this is read before any motion plays.
 */
function restShape(root: THREE.Object3D): { pos: Float32Array; part: Uint8Array } {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.attributes.position) meshes.push(mesh);
  });
  const total = meshes.reduce((n, mesh) => n + mesh.geometry.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const part = new Uint8Array(total);
  const v = new THREE.Vector3();
  let at = 0;
  for (const mesh of meshes) {
    const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
    const skinned = mesh as THREE.SkinnedMesh;
    const parts = skinned.isSkinnedMesh && skinIndex && skinWeight ? skinned.skeleton.bones.map((bone) => partOf(bone.name)) : null;
    for (let i = 0; i < position.count; i++, at++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).toArray(pos, at * 3);
      if (!parts) continue;
      // The bone that pulls this vertex hardest says which part of the body it belongs to.
      let strongest = 0;
      for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, strongest)) strongest = k;
      part[at] = parts[skinIndex.getComponent(i, strongest)] ?? 0;
    }
  }
  return { pos, part };
}

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * The height of a base's floor in the middle, where the companion stands: its walls, lamps and shelves
 * reach higher than that. Looks straight down at five spots under the feet and takes the middle one, so
 * a single blade of grass does not count as the floor.
 */
function floorOf(obj: THREE.Object3D, box: THREE.Box3): number {
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.06;
  const found: number[] = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ray.set(from.set(cx + dx * r, box.max.y + 1, cz + dz * r), DOWN);
    const hit = ray.intersectObject(obj, true)[0];
    if (hit) found.push(hit.point.y);
  }
  found.sort((a, b) => a - b);
  return found.length ? found[found.length >> 1] : box.max.y;
}

// ---------- recolouring the hijab ----------

// The girl is modelled in an ivory-cream hijab so that it can take other colours: texels that are warm
// yellow and gently saturated take the chosen colour and keep their light and shade. Measured on the
// models: the hijab sits at hue 32-48 with saturation 0.15-0.25 (lit or in shade), skin at hue 16-30 with
// saturation 0.40 and up, the sage dress at hue 110-140, and the eye whites have no saturation at all.
type Tint = { color: { value: THREE.Color }; on: { value: number } };
const TINT_GLSL = /* glsl */ `
if (uTintOn > 0.5) {
  vec3 lin = max(diffuseColor.rgb, vec3(0.0));
  vec3 c = pow(lin, vec3(1.0 / 2.2));
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float sat = hi > 0.0 ? (hi - lo) / hi : 0.0;
  float d = hi - lo + 1e-5;
  float hue = 60.0 * (hi == c.r ? mod((c.g - c.b) / d, 6.0) : hi == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0);
  float warm = smoothstep(30.0, 36.0, hue) * (1.0 - smoothstep(58.0, 70.0, hue));
  float cream = smoothstep(0.05, 0.10, sat) * (1.0 - smoothstep(0.31, 0.39, sat));
  float light = smoothstep(0.22, 0.36, hi);
  float mask = warm * cream * light;
  float shade = clamp(max(lin.r, max(lin.g, lin.b)) / 0.80, 0.0, 1.15);
  diffuseColor.rgb = mix(diffuseColor.rgb, uTint * shade, mask);
}
`;

function addTint(m: THREE.MeshStandardMaterial, tint: Tint): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = tint.color;
    shader.uniforms.uTintOn = tint.on;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uTintOn;')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${TINT_GLSL}`);
  };
  m.customProgramCacheKey = () => 'lp-tint';
  m.needsUpdate = true;
}

// ---------- the stage ----------

export function createStage(container: HTMLElement, opts: StageOptions): StageController {
  const lowPower = opts.lowPower;
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'pan-y'; // vertical drags still scroll the screen
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  const lookTarget = new THREE.Vector3(0, 0.5, 0);

  // Lights: a warm key from the front right, a cool rim from behind so the outline glows on dark
  // backgrounds, and a soft sky/ground fill.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2ff, 0.9));
  const key = new THREE.DirectionalLight(0xfff1e2, 2.1);
  key.position.set(1.6, 3, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d6ff, 1.7);
  rim.position.set(-2.2, 2.4, -2.6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-2, 1, 2);
  scene.add(fill);

  // The default platform: a soft pastel disc with a glowing rim and a contact shadow.
  const platformMat = new THREE.MeshStandardMaterial({ color: platformColor(opts.accent), roughness: 0.85, metalness: 0 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R + 0.04, 0.07, 72), platformMat);
  platform.position.y = -0.036;
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.35, metalness: 0, emissive: new THREE.Color(opts.accent), emissiveIntensity: 0.45,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R, 0.011, 10, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.001;
  const shadowTex = shadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  const ground = new THREE.Group();
  ground.add(platform, ring, shadow);
  scene.add(ground);

  // The character turns on this pivot (dragging), centred on the platform.
  const pivot = new THREE.Group();
  scene.add(pivot);

  let model: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let idle: THREE.AnimationAction | null = null;
  const gestures = new Map<string, THREE.AnimationAction[]>();
  // The gestures that are showing: how much of each is laid over the idle now (0 to 1) and where that is heading.
  let layers: { action: THREE.AnimationAction; level: number; goal: number; rounds: boolean }[] = [];
  let head: THREE.Bone | null = null;
  let neck: THREE.Bone | null = null;
  let spine: THREE.Bone | null = null;
  // What worn items are fitted to: the companion's measurements at rest, and how to see a place on the
  // resting body from each bone, so that an item put on in the middle of a motion still lands right.
  let body: Body | null = null;
  const fromRest = new Map<THREE.Bone, THREE.Matrix4>();
  // Each stage has its own hijab colour (the shop tries colours on without touching other stages).
  const tint: Tint = { color: { value: new THREE.Color(1, 1, 1) }, on: { value: 0 } };
  // The neck and head as the motion left them, put back before the next frame's motion is worked out.
  const looking: { bone: THREE.Bone; share: number; last: boolean; rest: THREE.Quaternion; saved: boolean }[] = [];
  let height = FULL_HEIGHT;
  let width = 0.5;
  let disposed = false;
  const ownMaterials: THREE.Material[] = [];

  // ---------- camera framing ----------

  let viewW = 1;
  let viewH = 1;
  function frameCamera(): void {
    const aspect = viewW / Math.max(1, viewH);
    camera.aspect = aspect;
    // Room above the head and below the platform: the speech card overlaps the stage's bottom edge.
    const fit = (FULL_HEIGHT + 0.5) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const fitW = (PLATFORM_R * 2 + 0.3) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
    const dist = Math.max(fit, fitW);
    camera.position.set(0, 0.56, dist);
    lookTarget.set(0, FULL_HEIGHT * 0.4, 0);
    camera.lookAt(lookTarget);
    camera.updateProjectionMatrix();
  }

  function resize(): void {
    const r = container.getBoundingClientRect();
    viewW = Math.max(1, Math.round(r.width));
    viewH = Math.max(1, Math.round(r.height));
    renderer.setSize(viewW, viewH, false);
    frameCamera();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---------- model ----------

  function setup(gltf: GLTF): void {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // a skinned mesh's bounds do not follow its animation
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const fresh = list.map((m) => {
        const copy = m.clone();
        const std = copy as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          std.metalness = 0; // a soft, toy-like look
          std.roughness = Math.max(std.roughness, 0.55);
          std.envMapIntensity = 0.8;
          addTint(std, tint);
        }
        ownMaterials.push(copy);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? fresh : fresh[0];
    });

    // Feet on the platform, centred, scaled to the stage's size. The model is read as it stands at rest,
    // before any motion plays.
    root.updateMatrixWorld(true);
    const shape = restShape(root);
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let i = 0; i < shape.pos.length; i += 3) box.expandByPoint(point.fromArray(shape.pos, i));
    if (box.isEmpty()) box.setFromObject(root);
    const h = Math.max(1e-6, box.max.y - box.min.y);
    const s = (FULL_HEIGHT * clamp(opts.scale, 0.3, 1)) / h;
    const turn = opts.faceBack ? -1 : 1; // a model exported facing away is turned to face the viewer
    root.scale.setScalar(s);
    root.rotation.y = opts.faceBack ? Math.PI : 0;
    root.position.set(-turn * ((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -turn * ((box.min.z + box.max.z) / 2) * s);
    root.updateMatrixWorld(true);
    height = h * s;
    width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
    // The same move for the points that were read, so that they are in the stage's own measure.
    for (let i = 0; i < shape.pos.length; i += 3) {
      shape.pos[i] = turn * shape.pos[i] * s + root.position.x;
      shape.pos[i + 1] = shape.pos[i + 1] * s + root.position.y;
      shape.pos[i + 2] = turn * shape.pos[i + 2] * s + root.position.z;
    }

    // Bones to hang things on. Mixamo calls them "mixamorig:Head", "mixamorig:Neck", "mixamorig:Spine2",
    // and the loader drops the colon ("mixamorigHead"); the tip of the head is "HeadTop_End", not the head.
    const spines: Record<string, THREE.Bone> = {};
    let hips: THREE.Bone | null = null;
    root.traverse((o) => {
      const bone = o as THREE.Bone;
      if (!bone.isBone) return;
      const name = bone.name.replace(/[_.]/g, '');
      if (!head && /head$/i.test(name)) head = bone;
      if (!neck && /neck$/i.test(name)) neck = bone;
      if (!hips && /hips$/i.test(name)) hips = bone;
      const m = /spine(\d?)$/i.exec(name);
      if (m) spines[m[1] ?? ''] ??= bone;
    });
    spine = spines['2'] ?? spines['1'] ?? spines[''] ?? null;
    if (head && neck) looking.push({ bone: neck, share: LOOK_NECK, last: false, rest: new THREE.Quaternion(), saved: false });
    if (head) looking.push({ bone: head, share: 1, last: true, rest: new THREE.Quaternion(), saved: false });

    // Measure the body for what it will wear. A bone the model lacks is guessed from the one above it.
    const where = (bone: THREE.Bone | null, guess: Vec3): Vec3 => (bone ? (bone.getWorldPosition(point).toArray() as Vec3) : guess);
    const headAt = where(head, [0, height * 0.7, 0]);
    const neckAt = where(neck, [headAt[0], headAt[1] - height * 0.05, headAt[2]]);
    const chestAt = where(spine, [neckAt[0], neckAt[1] - height * 0.08, neckAt[2]]);
    const hipsAt = where(hips, [chestAt[0], chestAt[1] - height * 0.15, chestAt[2]]);
    body = measureBody(shape.pos, shape.part, { head: headAt, neck: neckAt, chest: chestAt, hips: hipsAt });
    for (const bone of [head, neck, spine] as (THREE.Bone | null)[]) {
      if (bone) fromRest.set(bone, bone.matrixWorld.clone().invert());
    }
    pivot.add(root);
    model = root;

    const made = motionsOf(gltf);
    const playing = (mixer = new THREE.AnimationMixer(root));
    if (made.idle) idle = playing.clipAction(made.idle).play();
    for (const [name, pair] of made.gestures) gestures.set(name, pair.map((clip) => playing.clipAction(clip)));
    playing.addEventListener('finished', (e) => {
      // A gesture that has run its course is back where it began: let go of it.
      const done = layers.find((l) => l.action === (e as unknown as { action: THREE.AnimationAction }).action);
      if (done) done.goal = 0;
    });
    playing.update(0); // into the idle's first pose, so the first frame is not the arms-out pose it was modelled in
    look.nextGlance = performance.now() + 2600; // it looks at the viewer first, and only then around
    applyProps();
  }

  /**
   * Plays a gesture over the idle. 'idle' ends a gesture that goes round (talking, reading); one that is
   * played once is short and runs its course, so a wave is not cut off because a line of speech ended.
   */
  function play(clip: Clip, o: { loop?: boolean } = {}): boolean {
    if (!mixer) return false;
    if (clip === 'idle') {
      for (const l of layers) if (l.rounds) l.goal = 0;
      return !!idle;
    }
    const pair = gestures.get(clip);
    if (!pair) return false;
    const rounds = o.loop ?? LOOPING.has(clip);
    const showing = layers.find((l) => l.goal > 0 && pair.includes(l.action));
    if (showing && rounds && showing.rounds) return true; // it is going round already
    for (const l of layers) l.goal = 0;
    // The copy that is free starts from the beginning (the other may still be fading out from its last run).
    const action = pair.find((a) => !layers.some((l) => l.action === a)) ?? pair.find((a) => a !== showing?.action) ?? pair[0];
    layers = layers.filter((l) => l.action !== action);
    action.reset();
    action.setLoop(rounds ? THREE.LoopRepeat : THREE.LoopOnce, rounds ? Infinity : 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    action.play();
    layers.push({ action, level: 0, goal: 1, rounds });
    return true;
  }

  // ---------- props (wardrobe items with a 3D model) ----------

  let props: PropSpec[] = [];
  const propObjects = new Map<string, THREE.Object3D>();
  /** The items asked for last, each settled once it is on the companion (or could not be loaded). */
  let arriving: Promise<void>[] = [];

  /** The bone a worn item moves with: a missing neck or spine falls back to the one above it. */
  function boneFor(anchor: PropSpec['anchor']): THREE.Bone | null {
    if (anchor === 'head' || anchor === 'face') return head;
    if (anchor === 'neck') return neck ?? head;
    return anchor === 'chest' || anchor === 'back' ? spine ?? neck ?? head : null;
  }

  function placeProp(spec: PropSpec, obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1e-6);
    const [px, py, pz] = spec.pivot ?? [0, 0, 0];
    const [ox, oy, oz] = spec.offset ?? [0, 0, 0];
    const [rx, ry, rz] = spec.rotation ?? [0, 0, 0];
    // The point of the item that is put on its place: the middle of its underside unless it names another.
    const grip = new THREE.Vector3((box.min.x + box.max.x) / 2 + px * longest, box.min.y + py * longest, (box.min.z + box.max.z) / 2 + pz * longest);
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let bone: THREE.Bone | null = null;
    if (spec.anchor === 'ground' || spec.anchor === 'base') {
      // On the stage at its own size: next to the companion, or under it in place of the platform, with
      // the floor it stands on at the platform's height.
      if (spec.anchor === 'base') grip.y = floorOf(obj, box);
      at.set(ox * PLATFORM_R, oy, oz * PLATFORM_R);
      scale.setScalar(spec.size / longest);
    } else {
      bone = boneFor(spec.anchor);
      const rest = bone && fromRest.get(bone);
      if (!bone || !rest || !body) return;
      if (spec.anchor === 'head') {
        // A cap comes to rest where the head is as wide as its opening, stretched if the head is deeper...
        const unit = body.head.width;
        const seat = restCap(body.head, (spec.opening ?? 1) * spec.size * unit);
        if (!seat) return;
        at.set(seat.x + ox * unit, seat.y + oy * unit, seat.z + oz * unit);
        scale.setScalar((spec.size * unit) / longest);
        scale.z *= clamp(seat.depth, 0.9, 1.25);
        // ...and made taller if a tuft of hair would otherwise poke through its top.
        const reach = (box.max.y - grip.y) * scale.y;
        scale.y *= clamp((body.head.top + unit * 0.07 - at.y) / Math.max(1e-6, reach), 1, 1.6);
      } else {
        const place = body[spec.anchor];
        at.set(place.x + ox * place.unit, place.y + oy * place.unit, place.z + oz * place.unit);
        scale.setScalar((spec.size * place.unit) / longest);
      }
    }
    // Where the item goes on the stage (or on the companion standing at rest)...
    const m = new THREE.Matrix4()
      .compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), scale)
      .multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
    // ...and for a worn one, the same place as its bone sees it, so that it moves with the bone.
    if (bone) m.premultiply(fromRest.get(bone)!);
    m.decompose(obj.position, obj.quaternion, obj.scale);
    (bone ?? scene).add(obj);
  }

  /** The platform shows until a place to stand on has really arrived (its file may be slow, or fail). */
  function showGround(): void {
    ground.visible = !props.some((p) => p.anchor === 'base' && propObjects.get(p.id)?.parent);
  }

  function applyProps(): void {
    const wanted = new Set(props.map((p) => p.id));
    for (const [id, obj] of propObjects) {
      if (!wanted.has(id)) {
        obj.removeFromParent();
        propObjects.delete(id);
      }
    }
    showGround();
    if (!model) return;
    arriving = [];
    for (const spec of props) {
      if (propObjects.has(spec.id)) continue;
      arriving.push(
        loadGltf(spec.url)
          .then((g) => {
            if (disposed || propObjects.has(spec.id) || !props.some((p) => p.id === spec.id)) return;
            const obj = g.scene.clone(true);
            propObjects.set(spec.id, obj);
            placeProp(spec, obj);
            showGround();
          })
          .catch((e) => {
            // An item that cannot be shown is left out; the companion stays as it is.
            if (import.meta.env.DEV) console.warn('companion item', spec.id, e);
          }),
      );
    }
  }

  // ---------- pointer: drag to turn, tap to react, the head follows the finger ----------

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let downAt = 0;
  let yaw = 0;
  let yawVel = 0;
  let lastTouch = 0;
  const look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, nextGlance: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pointerToNdc(e: PointerEvent): void {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function aimHead(): void {
    look.tYaw = clamp(ndc.x * 0.4, -0.36, 0.36);
    look.tPitch = clamp(-(ndc.y - 0.15) * 0.3, -LOOK_UP, LOOK_DOWN);
    look.nextGlance = performance.now() + 2500;
  }

  const hitPoint = new THREE.Vector3();
  const headWorld = new THREE.Vector3();
  function hitPart(): TapPart | null {
    raycaster.setFromCamera(ndc, camera);
    // Where the ray crosses the companion's middle plane, which faces the camera.
    const { origin, direction } = raycaster.ray;
    if (Math.abs(direction.z) < 1e-6) return null;
    const t = -origin.z / direction.z;
    if (t <= 0) return null;
    const p = raycaster.ray.at(t, hitPoint);
    if (Math.abs(p.x) > width / 2 + 0.04 || p.y < 0 || p.y > height + 0.04) return null;
    // The head bone sits at the base of the skull, so everything above it is the head.
    const neck = head ? head.getWorldPosition(headWorld).y - height * 0.03 : height * 0.7;
    return p.y > neck ? 'head' : 'body';
  }

  const onDown = (e: PointerEvent) => {
    dragging = true;
    startX = lastX = e.clientX;
    startY = e.clientY;
    downAt = lastT = performance.now();
    yawVel = 0;
    pointerToNdc(e);
    aimHead();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // the pointer may already be gone
    }
  };
  const onMove = (e: PointerEvent) => {
    pointerToNdc(e);
    if (e.pointerType === 'mouse' || dragging) aimHead();
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    yaw += dx * 0.013;
    yawVel = (dx * 0.013 * 16) / Math.max(8, now - lastT);
    lastX = e.clientX;
    lastT = now;
    lastTouch = now;
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    lastTouch = performance.now();
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (moved < 8 && performance.now() - downAt < 450) {
      pointerToNdc(e);
      const part = hitPart();
      if (part) opts.onTap?.(part);
    }
  };
  const onCancel = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // ---------- the loop ----------

  const timer = new THREE.Timer();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const bodyQ = new THREE.Quaternion();
  const aboveQ = new THREE.Quaternion();
  const partQ = new THREE.Quaternion();
  let raf = 0;
  let onScreen = true;
  let frameSkip = false;

  function tick(): void {
    raf = requestAnimationFrame(tick);
    if (lowPower) {
      frameSkip = !frameSkip; // 30 fps on slow phones
      if (frameSkip) return;
    }
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const now = performance.now();

    // Turning: momentum after a flick, then a slow return to face the viewer.
    if (!dragging) {
      yaw += yawVel;
      yawVel *= 0.9;
      if (Math.abs(yawVel) < 0.0004) yawVel = 0;
      if (now - lastTouch > 2200) yaw = wrap(yaw) * 0.95;
    }
    pivot.rotation.y = yaw;

    // Glance around now and then when nobody is touching.
    if (now > look.nextGlance) {
      look.tYaw = (Math.random() - 0.5) * 0.5;
      look.tPitch = (Math.random() - 0.45) * 0.16;
      look.nextGlance = now + 1800 + Math.random() * 2600;
    }
    look.yaw += (look.tYaw - look.yaw) * Math.min(1, dt * 5);
    look.pitch += (look.tPitch - look.pitch) * Math.min(1, dt * 5);

    for (const l of looking) if (l.saved) l.bone.quaternion.copy(l.rest);
    // Gestures come in and go out softly over the idle.
    for (const l of layers) {
      const step = dt / (l.goal > l.level ? (l.rounds ? GESTURE_IN_LOOP : GESTURE_IN) : GESTURE_OUT);
      l.level = l.goal > l.level ? Math.min(l.goal, l.level + step) : Math.max(l.goal, l.level - step);
      l.action.setEffectiveWeight(eased(l.level));
      if (l.goal === 0 && l.level === 0) l.action.stop();
    }
    if (layers.some((l) => l.goal === 0 && l.level === 0)) layers = layers.filter((l) => l.goal > 0 || l.level > 0);
    mixer?.update(dt);
    if (looking.length && model) {
      // Keep looking at the viewer while the body turns away (within the neck's reach).
      // (the sine eases it back to straight ahead as the body turns its back, instead of snapping across)
      const towardViewer = clamp(-Math.sin(yaw) * 0.5, -0.4, 0.4);
      const turnTo = clamp(look.yaw + towardViewer, -LOOK_TURN, LOOK_TURN);
      model.getWorldQuaternion(bodyQ).invert();
      for (const l of looking) {
        l.rest.copy(l.bone.quaternion);
        l.saved = true;
        // The turn is the companion's own left-right and up-down, whichever way the rig's bones point:
        // seen from the bone above, carried into that bone's directions, done, and carried back.
        l.bone.parent!.getWorldQuaternion(aboveQ).premultiply(bodyQ);
        tmpQ.setFromEuler(tmpE.set(look.pitch * l.share, turnTo * l.share, 0, 'YXZ'));
        // The head finishes what the neck began, so the two together are a turn and a nod and never a lean.
        if (l.last && looking.length > 1) {
          tmpQ.multiply(partQ.setFromEuler(tmpE.set(look.pitch * LOOK_NECK, turnTo * LOOK_NECK, 0, 'YXZ')).invert());
        }
        l.bone.quaternion.premultiply(aboveQ).premultiply(tmpQ).premultiply(aboveQ.invert());
      }
    }
    if (!idle && model) {
      model.scale.y = model.scale.x * (1 + Math.sin(now / 520) * 0.01); // breathing when there is no idle clip
    }
    renderer.render(scene, camera);
  }

  function start(): void {
    if (raf || disposed || !onScreen || document.hidden) return;
    timer.update(); // the time spent paused is not a frame
    raf = requestAnimationFrame(tick);
  }
  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((en) => en.isIntersecting);
    if (onScreen) start();
    else stop();
  });
  io.observe(container);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    opts.onError?.(new Error('webgl context lost'));
  };
  canvas.addEventListener('webglcontextlost', onLost);

  loadGltf(opts.modelUrl)
    .then(async (gltf) => {
      if (disposed) return;
      setup(gltf);
      // The first frame shows the companion in everything it wears, so nothing pops on a moment later.
      // An item whose file is slower than this arrives when it arrives.
      await Promise.race([Promise.all(arriving), new Promise((done) => setTimeout(done, 1500))]);
      if (disposed) return;
      renderer.render(scene, camera);
      opts.onReady?.();
      start();
    })
    .catch((e) => {
      if (!disposed) opts.onError?.(e);
    });

  function still(size: number): HTMLCanvasElement | null {
    if (!model) return null;
    try {
      renderer.render(scene, camera);
      const out = document.createElement('canvas');
      out.width = size;
      out.height = Math.round((size * viewH) / viewW);
      out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height);
      return out;
    } catch {
      return null;
    }
  }

  return {
    play,
    has: (clip) => (clip === 'idle' ? !!idle : gestures.has(clip)),
    setAccent(hex) {
      platformMat.color.copy(platformColor(hex));
      ringMat.emissive.set(hex);
    },
    setProps(next) {
      props = next;
      applyProps();
    },
    setTint(hex) {
      if (hex) tint.color.value.set(hex);
      tint.on.value = hex ? 1 : 0;
    },
    still,
    snapshot(size) {
      try {
        return still(size)?.toDataURL('image/webp', 0.86) ?? null;
      } catch {
        return null;
      }
    },
    dispose() {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('webglcontextlost', onLost);
      mixer?.stopAllAction();
      for (const m of ownMaterials) m.dispose();
      platform.geometry.dispose();
      ring.geometry.dispose();
      shadow.geometry.dispose();
      platformMat.dispose();
      ringMat.dispose();
      (shadow.material as THREE.Material).dispose();
      shadowTex.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
