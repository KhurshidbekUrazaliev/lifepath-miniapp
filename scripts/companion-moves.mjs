// The companions' own motions. Tripo's ready-made motions are made for someone of ordinary build; on a
// companion with short arms, a wide tunic and a head a third of its height, the hands end up inside the
// body or against an ear, and a simple "yes" comes out as a sideways lean. So only Tripo's calm standing
// (the idle: breathing, a little sway) is kept, and what the arms and the head do on top of it is made
// here, for each companion from its own measurements:
//
//   the arms   reach for a place given in arm's lengths from the shoulder (so a short arm and a long one
//              make the same gesture), elbow pointing where it is told to. Every frame the hand is checked
//              against the body's outline at its height, against the head and against the other hand, and
//              moved out until it is clear, so nothing sinks into a tunic or a hijab whatever the shape.
//   the head   nods and turns in the body's own directions and never leans to a side.
//
// The idle keeps its whole length and gets arms that hang clear of the body. Every other motion is a
// gesture: it is written as the companion standing still (the idle's first moment) with the gesture on
// top, and holds keys only for the bones it moves. The stage plays a gesture over the running idle, as
// the difference from that first moment, so the breathing never stops and nothing jumps when a gesture
// starts, ends or is cut short. scripts/companion-models.mjs runs this on every character; the sums are
// tested in companion-moves.test.mjs.
import { dropAnimation, times, together, turned, unit } from './companion-rig.mjs';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const IDENTITY = [0, 0, 0, 1];
const FRONT = [0, 0, 1];
const { sin, cos } = Math;

// ---------- small sums ----------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaled = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const size = (a) => Math.hypot(a[0], a[1], a[2]);
const along = (a) => {
  const n = size(a);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
const mix = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];
const short = (node) => node.getName().replace(/^mixamorig:?/i, '');

/** A turn of `angle` radians about a line. */
export function about(axis, angle) {
  const s = sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, cos(angle / 2)];
}

/** The shortest turn that carries one direction onto another. */
export function between(a, b) {
  const d = dot(a, b);
  if (d > 0.9999999) return IDENTITY;
  if (d < -0.9999999) {
    let axis = cross(a, [1, 0, 0]);
    if (size(axis) < 1e-3) axis = cross(a, [0, 1, 0]);
    return [...along(axis), 0];
  }
  const c = cross(a, b);
  return unit([c[0], c[1], c[2], 1 + d]);
}

/** The turn that carries a direction and a second one square to it onto two others (also square). */
export function carried(a0, h0, a1, h1) {
  const swing = between(a0, a1);
  const h = turned(swing, h0);
  const angle = Math.atan2(dot(cross(h, h1), a1), dot(h, h1));
  return times(about(a1, angle), swing);
}

/** One direction part of the way round to another, along the shortest arc. */
function arc(a, b, k) {
  const d = clamp(dot(a, b), -1, 1);
  const angle = Math.acos(d);
  if (angle < 1e-5) return a;
  const s = sin(angle);
  if (s < 1e-5) return along(add(scaled(a, 1 - k), scaled(b, k))); // opposite: any way round
  return add(scaled(a, sin((1 - k) * angle) / s), scaled(b, sin(k * angle) / s));
}

// ---------- easing ----------

const ease = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** 0 before a, 1 after b, eased between. */
export const rise = (t, a, b) => ease((t - a) / (b - a));
/** Up between a and b, held, down between c and d. */
export const held = (t, a, b, c, d) => rise(t, a, b) * (1 - rise(t, c, d));
/** A single bump: up from a to its top at b, down again by c. */
export const bump = (t, a, b, c) => (t < b ? rise(t, a, b) : 1 - rise(t, b, c));

// ---------- the motions ----------

/**
 * The arm at ease: hanging a little out from the side with the elbow just bent, swaying with the breath.
 * Whole numbers of sways fit the motion's length (`round`), so it goes round without a seam.
 */
export function hang(t, side, c) {
  const p = side === 'Left' ? 0 : 1.9; // the two arms are not in step
  const k = TAU / c.round;
  return {
    at: [0.2 + 0.02 * sin(4 * k * t + p), -0.955, 0.09 + 0.035 * sin(3 * k * t + 1 + p)],
    pole: [0.45, 0, -1],
    roll: 0,
    wag: 0,
    bend: 0,
  };
}

/** Three little hops, each from the floor and back: 0 on the floor, 1 at the top. */
const hops = (t) => {
  for (const from of [0.28, 0.93, 1.58]) {
    const x = (t - from) / 0.6;
    if (x > 0 && x < 1) return 4 * x * (1 - x);
  }
  return 0;
};

/**
 * What each motion adds to standing. Times are in seconds, angles in degrees.
 *
 *   whole   the standing itself, for as long as Tripo's idle lasts (only the idle)
 *   length  how long a gesture lasts; one with `loop` goes round, so what it does must fit its length
 *           a whole number of times (`c.round` is that length)
 *   arm     where an arm goes: `w` says how far it has left where it hangs (0) for the gesture (1),
 *           `at` is the wrist's place in arm's lengths from the shoulder as [outwards, up, forwards],
 *           `pole` the way the elbow points, `roll` turns the palm up, `wag` waves the hand from the
 *           wrist and `bend` folds it. Nothing for a side leaves that arm hanging.
 *   head    [nodding forward, turning to its left, leaning]: always 0 for the lean
 *   chest   the same for the chest, and `hop` lifts the whole companion (a share of its height)
 */
export const MOVES = {
  idle: { whole: true, loop: true },

  // A hand up and out to the side, well clear of the head, waving from the elbow with the wrist a beat behind.
  wave: {
    length: 2.7,
    arm(t, side) {
      if (side !== 'Right') return null;
      const going = held(t, 0.4, 0.7, 1.85, 2.1);
      const swing = sin(TAU * 2.3 * (t - 0.5)) * going;
      return {
        w: held(t, 0.05, 0.5, 2.0, 2.6),
        at: [0.56 + 0.17 * swing, 0.56 - 0.05 * swing * swing, 0.3],
        pole: [0.7, -1, -0.3],
        roll: 0,
        wag: 16 * sin(TAU * 2.3 * (t - 0.5) - 1) * going,
        bend: 0,
      };
    },
    head: (t) => [-3 * held(t, 0.1, 0.5, 2.0, 2.6), 0, 0],
  },

  // Yes: two nods, the second smaller, the chest going along a little. Nothing else moves.
  nod: {
    length: 1.8,
    head: (t) => [15 * bump(t, 0.08, 0.32, 0.62) + 10 * bump(t, 0.62, 0.86, 1.25), 0, 0],
    chest: (t) => [2.5 * bump(t, 0.08, 0.34, 0.66) + 1.5 * bump(t, 0.62, 0.88, 1.3), 0, 0],
  },

  // Both arms up in a wide V and three little hops.
  cheer: {
    length: 2.8,
    arm(t, side) {
      return {
        w: held(t, 0, 0.3, 2.15, 2.7),
        at: [0.56, 0.72 + 0.05 * hops(t), 0.12],
        pole: [1, -0.5, -0.3],
        roll: 0,
        wag: 12 * sin(TAU * 4 * t + (side === 'Left' ? 0 : 1.3)) * held(t, 0.3, 0.5, 2.0, 2.2),
        bend: 0,
      };
    },
    head: (t) => [-6 * held(t, 0, 0.3, 2.15, 2.7), 0, 0],
    hop: (t) => 0.035 * hops(t),
  },

  // A hand up towards the chin, the head turned a little aside and up.
  think: {
    length: 3.2,
    arm(t, side, c) {
      if (side !== 'Right') return null;
      const w = held(t, 0, 0.42, 2.6, 3.15);
      return { w, at: c.chin, pole: [0.35, -1, 0.2], roll: 20, wag: 0, bend: 5 * sin(TAU * 1.1 * t) * w };
    },
    head: (t) => {
      const w = held(t, 0.05, 0.5, 2.5, 3.1);
      return [-5 * w, 8 * w, 0];
    },
  },

  // Speaking: both hands out in front, open, rising and falling with the words, the head going along.
  talk: {
    length: 6,
    loop: true,
    arm(t, side, c) {
      const k = TAU / c.round;
      const p = side === 'Left' ? 0 : 2.1;
      const beat = 0.6 * sin(3 * k * t + p) + 0.4 * sin(5 * k * t + 1.7 * p);
      return {
        w: 1,
        at: [0.34 + 0.05 * sin(k * t + p + 0.5), -0.42 + 0.11 * beat, 0.52 + 0.04 * sin(2 * k * t + p)],
        pole: [0.5, -1, -0.5],
        roll: 45 + 15 * beat,
        wag: 0,
        bend: 8 * beat,
      };
    },
    head: (t, c) => {
      const k = TAU / c.round;
      return [2.5 * sin(3 * k * t + 0.4) + 1.5 * sin(5 * k * t), 3 * sin(k * t), 0];
    },
  },

  // Reading: both hands held up in front as if with an open book, the eyes going along the lines.
  read: {
    length: 8,
    loop: true,
    arm(t, side, c) {
      const k = TAU / c.round;
      const p = side === 'Left' ? 0 : 1.2;
      return { w: 1, at: [c.mid(0.6), -0.3 + 0.012 * sin(2 * k * t + p), 0.6], pole: [0.8, -0.8, -0.3], roll: 70, wag: 0, bend: 10 };
    },
    head: (t, c) => {
      const k = TAU / c.round;
      return [9 + 1.2 * sin(2 * k * t), 3 * sin(3 * k * t), 0];
    },
  },

  // A dua: both hands raised in front, palms up, below the chin; the head a little bowed.
  dua: {
    length: 4.2,
    arm(t, side, c) {
      return {
        w: held(t, 0, 0.6, 3.5, 4.15),
        at: [c.mid(0.5), -0.12 + 0.015 * sin(TAU * 0.4 * t), 0.6],
        pole: [0.7, -0.9, -0.2],
        roll: 80,
        wag: 0,
        bend: 12,
      };
    },
    head: (t) => [7 * held(t, 0.1, 0.7, 3.4, 4.1), 0, 0],
  },
};

// ---------- reaching ----------

/**
 * An arm of two bones reaching from the shoulder S for a place T, the elbow pointing `pole`'s way. An arm
 * is never quite straightened, and a place out of reach is reached for as far as the arm goes.
 * Returns the elbow, the wrist, the way each bone points, and the line the elbow bends about.
 */
export function reach(S, T, pole, upper, fore) {
  const to = sub(T, S);
  const n = size(to) > 1e-9 ? along(to) : [0, -1, 0];
  const d = clamp(size(to), Math.abs(upper - fore) + 1e-4 * (upper + fore), (upper + fore) * 0.985);
  const a = (upper * upper - fore * fore + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  let u = sub(pole, scaled(n, dot(pole, n)));
  if (size(u) < 1e-6) u = cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  u = along(u);
  const elbow = add(S, add(scaled(n, a), scaled(u, h)));
  const wrist = add(S, scaled(n, d));
  return { elbow, wrist, upper: along(sub(elbow, S)), fore: along(sub(wrist, elbow)), hinge: cross(u, n) };
}

// ---------- measuring a companion ----------

/**
 * The body's outline: its points as they stand in one frame, sorted by height, to ask how deep a place is
 * inside the body at that place's height (seen from above, measured from the middle of the body there).
 */
export class Outline {
  constructor(points, height, floor) {
    this.p = points;
    this.band = 0.02 * height;
    this.slack = 0.012 * height;
    this.step = 0.01 * height;
    this.floor = floor;
    const n = points.length / 3;
    const bin = new Int32Array(n);
    let top = 0;
    for (let i = 0; i < n; i++) {
      bin[i] = Math.max(0, Math.floor((points[i * 3 + 1] - floor) / this.step));
      if (bin[i] > top) top = bin[i];
    }
    this.start = new Int32Array(top + 2);
    for (let i = 0; i < n; i++) this.start[bin[i] + 1]++;
    for (let b = 0; b <= top; b++) this.start[b + 1] += this.start[b];
    this.order = new Int32Array(n);
    const next = this.start.slice(0, top + 1);
    for (let i = 0; i < n; i++) this.order[next[bin[i]]++] = i;
    this.top = top;
  }

  /** How deep `at` is inside (negative: that far outside), and the way out. Nothing of the body at that height: null. */
  sink(at) {
    const { p, band, order, start } = this;
    const from = clamp(Math.floor((at[1] - band - this.floor) / this.step), 0, this.top);
    const to = clamp(Math.floor((at[1] + band - this.floor) / this.step), 0, this.top);
    let cx = 0, cz = 0, n = 0;
    for (let k = start[from]; k < start[to + 1]; k++) {
      const i = order[k] * 3;
      if (Math.abs(p[i + 1] - at[1]) > band) continue;
      cx += p[i];
      cz += p[i + 2];
      n++;
    }
    if (n < 6) return null;
    cx /= n;
    cz /= n;
    const dx = at[0] - cx, dz = at[2] - cz;
    const far = Math.hypot(dx, dz) || 1e-9;
    const ux = dx / far, uz = dz / far;
    let edge = 0;
    for (let k = start[from]; k < start[to + 1]; k++) {
      const i = order[k] * 3;
      if (Math.abs(p[i + 1] - at[1]) > band) continue;
      const vx = p[i] - cx, vz = p[i + 2] - cz;
      const out = vx * ux + vz * uz;
      if (out <= edge) continue;
      if (Math.abs(vx * uz - vz * ux) > out * 0.45 + this.slack) continue; // within some 25 degrees of that way
      edge = out;
    }
    return { depth: edge - far, way: [ux, 0, uz] };
  }
}

/**
 * Everything the motions need to know about a character: its skeleton at rest, its arms, the points of
 * its body (to find its outline in any pose) and its head as an egg shape. Null for a rig this was not
 * made for (bones missing or scaled, or not facing forwards).
 */
export function measure(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) return null;
  const joints = skin.listJoints();
  const names = joints.map(short);
  const J = Object.fromEntries(names.map((name, i) => [name, i]));
  const sides = ['Left', 'Right'];
  const needed = ['Hips', 'Spine2', 'Neck', 'Head', ...sides.flatMap((s) => [`${s}Shoulder`, `${s}Arm`, `${s}ForeArm`, `${s}Hand`])];
  if (needed.some((name) => J[name] === undefined)) return null;
  if (joints.some((joint) => joint.getWorldScale().some((s) => Math.abs(s - 1) > 1e-3))) return null;

  const index = new Map(joints.map((joint, i) => [joint, i]));
  const parent = joints.map((joint) => index.get(joint.getParentNode()) ?? -1);
  const order = [];
  const seen = new Set();
  const visit = (k) => {
    if (seen.has(k)) return;
    if (parent[k] >= 0) visit(parent[k]);
    seen.add(k);
    order.push(k);
  };
  joints.forEach((_, k) => visit(k));
  const rest = { rot: joints.map((joint) => unit(joint.getRotation())), pos: joints.map((joint) => joint.getTranslation()) };
  // What stands above the skeleton (the armature) is taken as it is.
  const above = joints.map((joint, k) => {
    if (parent[k] >= 0) return null;
    const node = joint.getParentNode();
    return node ? { rot: unit(node.getWorldRotation()), pos: node.getWorldTranslation() } : { rot: IDENTITY, pos: [0, 0, 0] };
  });

  /** Where every bone is and how it is turned in the world, from each bone's own turn (and the hips' place). */
  function stand(rot, hips) {
    const wr = new Array(joints.length), wp = new Array(joints.length);
    for (const k of order) {
      const base = parent[k] >= 0 ? { rot: wr[parent[k]], pos: wp[parent[k]] } : above[k];
      wr[k] = unit(times(base.rot, rot[k]));
      wp[k] = add(base.pos, turned(base.rot, k === J.Hips && hips ? hips : rest.pos[k]));
    }
    return { wr, wp };
  }
  const still = stand(rest.rot, null);

  // The body faces +z with its left at +x, as Tripo exports it.
  const leftward = along(sub(still.wp[J.LeftArm], still.wp[J.RightArm]));
  if (leftward[0] < 0.9) return null;
  if (J.LeftToeBase !== undefined && J.LeftFoot !== undefined && still.wp[J.LeftToeBase][2] <= still.wp[J.LeftFoot][2]) return null;

  // The skin: every vertex, and which bones hold it.
  const bindOf = skin.getInverseBindMatrices();
  const bind = joints.map((_, k) => (bindOf ? bindOf.getElement(k, new Array(16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  const seenBy = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  const isArm = names.map((name) => /^(Left|Right)(Arm|ForeArm|Hand)/.test(name));
  const isHead = names.map((name) => /^Head/.test(name));
  const vertices = [];
  const done = new Set();
  for (const node of doc.getRoot().listNodes()) {
    if (node.getSkin() !== skin) continue;
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      if (!P || !JJ || !W || done.has(P)) continue;
      done.add(P);
      const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, p);
        JJ.getElement(i, j);
        W.getElement(i, w);
        const sum = w[0] + w[1] + w[2] + w[3];
        if (!(sum > 0)) continue;
        vertices.push({ p: [p[0], p[1], p[2]], j: [j[0], j[1], j[2], j[3]], w: w.map((x) => x / sum) });
      }
    }
  }
  if (vertices.length < 50) return null;
  let floor = Infinity, top = -Infinity;
  for (const v of vertices) {
    floor = Math.min(floor, v.p[1]);
    top = Math.max(top, v.p[1]);
  }
  const height = top - floor;
  const shareOf = (v, which) => v.j.reduce((n, joint, k) => n + (which[joint] ? v.w[k] : 0), 0);
  const strongest = (v) => v.j[v.w.indexOf(Math.max(...v.w))];

  // The body without its arms and head: every other vertex is plenty for an outline. A vertex that an arm
  // holds a little follows the chest instead, since the body's outline is asked for before the arms are placed.
  const trunkOf = vertices.filter((v) => shareOf(v, isArm) <= 0.33 && shareOf(v, isHead) <= 0.5).filter((_, i) => i % 2 === 0);
  const trunk = {
    count: trunkOf.length,
    joint: new Uint16Array(trunkOf.length * 4),
    weight: new Float32Array(trunkOf.length * 4),
    seen: new Float32Array(trunkOf.length * 12), // the vertex as each of its bones sees it
  };
  trunkOf.forEach((v, i) => {
    for (let k = 0; k < 4; k++) {
      const joint = isArm[v.j[k]] ? J.Spine2 : v.j[k];
      trunk.joint[i * 4 + k] = joint;
      trunk.weight[i * 4 + k] = v.w[k];
      trunk.seen.set(seenBy(bind[joint], v.p), i * 12 + k * 3);
    }
  });
  /** The body's outline with the bones standing as given. */
  function outline(wr, wp) {
    const out = new Float32Array(trunk.count * 3);
    for (let i = 0; i < trunk.count; i++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const w = trunk.weight[i * 4 + k];
        if (!w) continue;
        const joint = trunk.joint[i * 4 + k];
        const o = i * 12 + k * 3;
        const v = turned(wr[joint], [trunk.seen[o], trunk.seen[o + 1], trunk.seen[o + 2]]);
        x += w * (v[0] + wp[joint][0]);
        y += w * (v[1] + wp[joint][1]);
        z += w * (v[2] + wp[joint][2]);
      }
      out[i * 3] = x;
      out[i * 3 + 1] = y;
      out[i * 3 + 2] = z;
    }
    return new Outline(out, height, floor);
  }

  // The head as an egg: the box of everything the head bone holds above the neck (the chin and the jaw
  // hang lower than the skull's base, and a hand must keep clear of them too), carried by the head bone.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of vertices) {
    if (v.p[1] < still.wp[J.Neck][1] || shareOf(v, isHead) <= 0.5) continue;
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], v.p[a]);
      hi[a] = Math.max(hi[a], v.p[a]);
    }
  }
  if (!(hi[1] > lo[1])) return null;
  const headMiddle = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const head = {
    radii: [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2],
    middle: headMiddle,
    seen: turned(inverse(still.wr[J.Head]), sub(headMiddle, still.wp[J.Head])), // its middle as the head bone sees it
  };

  const arms = {};
  for (const side of sides) {
    const kS = J[`${side}Shoulder`], kA = J[`${side}Arm`], kF = J[`${side}ForeArm`], kH = J[`${side}Hand`];
    const S = still.wp[kA], E = still.wp[kF], W = still.wp[kH];
    const upper = size(sub(E, S)), fore = size(sub(W, E));
    const a1 = along(sub(E, S)), a2 = along(sub(W, E));
    const knuckle = J[`${side}HandMiddle1`];
    const a3 = knuckle !== undefined && size(sub(still.wp[knuckle], W)) > 1e-6 ? along(sub(still.wp[knuckle], W)) : a2;
    // The hand's length along its own line and how thick it is around it; the same for the forearm.
    const own = (bone) => vertices.filter((v) => names[strongest(v)].startsWith(bone));
    const spread = (list, from, line, share) => {
      const far = list.map((v) => {
        const d = sub(v.p, from);
        return size(sub(d, scaled(line, dot(d, line))));
      }).sort((a, b) => a - b);
      return far.length ? far[Math.min(far.length - 1, Math.floor(far.length * share))] : 0;
    };
    const handVertices = own(`${side}Hand`);
    const handLength = handVertices.reduce((n, v) => Math.max(n, dot(sub(v.p, W), a3)), 0) || fore * 0.6;
    // Where the fingers and the thumb end, as the hand bone sees them: a thumb sticks out to the side of
    // the hand's own line, and it is the first thing to go into a tunic. A rig without finger bones gets
    // the one place where the hand's line ends.
    const ends = ['Thumb4', 'Index4', 'Middle4', 'Ring4', 'Pinky4'].map((finger) => J[`${side}Hand${finger}`]).filter((k) => k !== undefined);
    const fromWrist = (at) => turned(inverse(still.wr[kH]), sub(at, W));
    arms[side] = {
      side,
      sign: side === 'Left' ? 1 : -1,
      kS, kA, kF, kH,
      upper, fore,
      length: upper + fore,
      a1, a2, a3,
      // the line each bone's joint bends about when the arm is as it was modelled
      h1: along(cross(a1, FRONT)),
      h2: along(cross(a2, FRONT)),
      shoulder: S,
      hand: handLength,
      tips: ends.length ? ends.map((k) => fromWrist(still.wp[k])) : [fromWrist(add(W, scaled(a3, handLength * 0.95)))],
      handRound: spread(handVertices, W, a3, 0.7) || handLength * 0.35,
      armRound: spread(own(`${side}ForeArm`), E, a2, 0.6) || fore * 0.25,
    };
  }

  return { joints, names, J, parent, rest, still, stand, outline, head, arms, height, floor };
}

/** The idle as a function of time: every bone's turn and the hips' place. Null if it moves along curves. */
export function standing(b, anim) {
  const tracks = [];
  let length = 0;
  for (const channel of anim.listChannels()) {
    const k = b.joints.indexOf(channel.getTargetNode());
    const sampler = channel.getSampler();
    const path = channel.getTargetPath();
    if (k < 0 || !sampler || path === 'scale') continue;
    if (path === 'translation' && k !== b.J.Hips) continue;
    if (sampler.getInterpolation() === 'CUBICSPLINE') return null;
    const times = Array.from(sampler.getInput().getArray());
    const values = Array.from(sampler.getOutput().getArray());
    if (!times.length) continue;
    tracks.push({ k, path, times, values, step: sampler.getInterpolation() === 'STEP', width: path === 'rotation' ? 4 : 3 });
    length = Math.max(length, times[times.length - 1]);
  }
  if (!tracks.some((track) => track.path === 'rotation')) return null;
  const moved = new Set(tracks.filter((track) => track.path === 'rotation').map((track) => track.k));
  function at(t) {
    const rot = b.rest.rot.map((q) => q);
    let hips = null;
    for (const { k, path, times, values, step, width } of tracks) {
      let lo = 0, hi = times.length - 1;
      while (hi - lo > 1) {
        const middle = (lo + hi) >> 1;
        if (times[middle] <= t) lo = middle;
        else hi = middle;
      }
      const span = times[hi] - times[lo];
      const u = step || span <= 0 ? (t >= times[hi] ? 1 : 0) : clamp((t - times[lo]) / span, 0, 1);
      const a = values.slice(lo * width, lo * width + width), z = values.slice(hi * width, hi * width + width);
      if (path === 'rotation') {
        const sign = a[0] * z[0] + a[1] * z[1] + a[2] * z[2] + a[3] * z[3] < 0 ? -1 : 1;
        rot[k] = unit(a.map((v, i) => mix(v, sign * z[i], u)));
      } else hips = a.map((v, i) => mix(v, z[i], u));
    }
    return { rot, hips };
  }
  return { at, length, moved };
}

// ---------- putting a motion together ----------

const SPIN = [0, 1, 0];
/** A turn in the body's own directions from [nodding, turning, leaning] in degrees. */
const turnOf = ([nod, turn, lean]) => together([nod * RAD, turn * RAD, lean * RAD]);

/** A bone's own turn after the body-wise turn `q` is added to how it stands in the world. */
const withTurn = (own, aboveWorld, q) => unit(times(times(times(inverse(aboveWorld), q), aboveWorld), own));

/**
 * Every frame of one motion: each bone's own turn, and the hips' place, `fps` frames a second. The idle
 * runs for its whole length; a gesture is made on the companion standing still as the idle begins, and
 * `from` is that beginning as the idle was made (its bones' turns and where its arms hang), so that a
 * gesture leaves from exactly there.
 */
export function frames(b, base, move, fps = 24, from = null) {
  const { J } = b;
  const length = move.whole ? base.length : move.length;
  const count = Math.max(2, Math.round(length * fps) + 1);
  const gap = 0.008 * b.height; // the air kept between a hand and what it must not touch
  const round = { round: length };
  const out = [];

  // The body and the head first: the arms hang from them.
  for (let i = 0; i < count; i++) {
    const t = Math.min(length, i / fps);
    const stood = base.at(move.whole ? t : 0);
    const rot = stood.rot;
    let hips = stood.hips ?? b.rest.pos[J.Hips];
    const lift = move.hop ? move.hop(t) * b.height : 0;
    if (lift) hips = [hips[0], hips[1] + lift, hips[2]];
    let { wr } = b.stand(rot, hips);
    if (move.chest && J.Spine1 !== undefined) {
      const [nod, turn, lean] = move.chest(t, round);
      const half = turnOf([nod / 2, turn / 2, lean / 2]);
      rot[J.Spine1] = withTurn(rot[J.Spine1], wr[b.parent[J.Spine1]], half);
      wr = b.stand(rot, hips).wr;
      rot[J.Spine2] = withTurn(rot[J.Spine2], wr[b.parent[J.Spine2]], half);
      wr = b.stand(rot, hips).wr;
    }
    if (move.head) {
      // The neck takes two fifths and the head the rest, so that together they make exactly the turn asked for.
      const whole = move.head(t, round);
      const neck = turnOf(whole.map((v) => v * 0.4));
      rot[J.Neck] = withTurn(rot[J.Neck], wr[b.parent[J.Neck]], neck);
      wr = b.stand(rot, hips).wr;
      rot[J.Head] = withTurn(rot[J.Head], wr[J.Neck], times(turnOf(whole), inverse(neck)));
    }
    const world = b.stand(rot, hips);
    const chest = unit(times(world.wr[J.Spine2], inverse(b.still.wr[J.Spine2]))); // how the chest stands, beyond rest
    out.push({ t, rot, hips, wr: world.wr, wp: world.wp, chest, outline: b.outline(world.wr, world.wp) });
  }

  const middle = (b.arms.Left.shoulder[0] + b.arms.Right.shoulder[0]) / 2;
  const hung = {}; // where each arm ends up hanging in the first frame
  for (const arm of Object.values(b.arms)) {
    if (from && !move.whole && !out.some(({ t }) => move.arm?.(t, arm.side, { round: length, mid: () => 0, chin: [0, 0, 0] })?.w > 0)) {
      // An arm the gesture does not use stays exactly as the idle has it.
      for (const frame of out) for (const k of [arm.kS, arm.kA, arm.kF, arm.kH]) frame.rot[k] = from.rot[k];
      hung[arm.side] = from.hung[arm.side];
      continue;
    }
    const context = {
      round: length,
      // a place this far out from the body's middle line, where 1 is straight under the shoulder
      mid: (share) => ((share - 1) * Math.abs(arm.shoulder[0] - middle)) / arm.length,
      chin: chinFor(b, arm),
    };
    // Where the wrist is asked to be in each frame, in arm's lengths from the shoulder. A gesture leaves
    // from, and comes back to, the arm as it hangs when the idle begins.
    const asked = out.map(({ t }) => {
      const loose = move.whole ? { ...hang(t, arm.side, context), w: 1 } : { ...hang(0, arm.side, { round: base.length }), ...(from ? { at: from.hung[arm.side] } : {}) };
      const made = move.arm?.(t, arm.side, context);
      if (!made || !(made.w > 0)) return move.whole ? loose : { ...loose, w: 0 };
      const w = clamp(made.w, 0, 1);
      // From hanging to the gesture along an arc about the shoulder, the way an arm swings, with the elbow
      // folding on the way: a straight arm swung up like a signpost looks stiff.
      const far = mix(size(loose.at), size(made.at), w) * (1 - 0.26 * sin(Math.PI * w));
      return {
        w,
        at: scaled(arc(along(loose.at), along(made.at), w), far),
        pole: along(add(scaled(along(loose.pole), 1 - w), scaled(along(made.pole), w))),
        roll: mix(loose.roll, made.roll ?? 0, w),
        wag: mix(loose.wag, made.wag ?? 0, w),
        bend: mix(loose.bend, made.bend ?? 0, w),
      };
    });
    // Moved clear of the body and the head. What that takes is smoothed over time (a hand must not twitch
    // as it slides past a hip), then whatever is still touching is moved again, three times over.
    const push = asked.map(() => [0, 0, 0]);
    for (let turnOfThree = 0; turnOfThree < 3; turnOfThree++) {
      const more = out.map((frame, i) => {
        const from = add(asked[i].at, push[i]);
        return sub(clear(b, arm, frame, { ...asked[i], at: from }, gap), from);
      });
      const even = smoothed(more, move.loop);
      // An arm that has not left where it hangs is exactly where the idle has it (that is what lets a
      // gesture begin and end without a jump), and it is moved clear by degrees as it sets off.
      for (let i = 0; i < push.length; i++) push[i] = add(push[i], scaled(even[i], move.whole ? 1 : rise(asked[i].w, 0, 0.06)));
    }
    out.forEach((frame, i) => {
      const placed = place(b, arm, frame, { ...asked[i], at: add(asked[i].at, push[i]) });
      frame.rot[arm.kS] = placed.own.shoulder;
      frame.rot[arm.kA] = placed.own.upper;
      frame.rot[arm.kF] = placed.own.fore;
      frame.rot[arm.kH] = placed.own.hand;
    });
    hung[arm.side] = add(asked[0].at, push[0]);
  }
  return { length, fps, frames: out, hung };
}

/** Where a wrist goes for the hand to come up under the chin, in arm's lengths from the shoulder. */
function chinFor(b, arm) {
  const { middle, radii } = b.head;
  const chin = add(middle, [arm.sign * 0.28 * radii[0], -0.86 * radii[1], 0.74 * radii[2]]);
  const wrist = add(chin, scaled([arm.sign * 0.25, -0.85, -0.1], arm.hand * 0.6));
  const from = sub(wrist, arm.shoulder);
  return [(arm.sign * from[0]) / arm.length, from[1] / arm.length, from[2] / arm.length];
}

/** The frame `step` frames on from frame i: going round the ends for a motion that repeats (its last frame is its first again). */
const frameAt = (i, step, n, loop) => (loop ? (((i + step) % (n - 1)) + (n - 1)) % (n - 1) : clamp(i + step, 0, n - 1));

/**
 * What it takes to keep a hand clear, evened out over time. Each frame first takes the most that any
 * frame within an eighth of a second of it needs (so that evening out never leaves a hand short), then
 * a running average (a bell seven frames wide) takes the corners off.
 */
function smoothed(list, loop) {
  const bell = [0.06, 0.12, 0.2, 0.24, 0.2, 0.12, 0.06];
  const n = list.length;
  const most = list.map((_, i) => {
    let best = list[i];
    for (let step = -3; step <= 3; step++) {
      const near = list[frameAt(i, step, n, loop)];
      if (size(near) > size(best)) best = near;
    }
    return best;
  });
  return most.map((_, i) => {
    const sum = [0, 0, 0];
    bell.forEach((weight, k) => {
      const near = most[frameAt(i, k - 3, n, loop)];
      for (let a = 0; a < 3; a++) sum[a] += near[a] * weight;
    });
    return sum;
  });
}

/**
 * One arm in one frame, reaching for `want.at`. Returns each bone's turn in the world and its own turn,
 * and the places that are checked against the body.
 */
export function place(b, arm, frame, want) {
  const { J } = b;
  const { sign } = arm;
  const world = (v) => turned(frame.chest, [sign * v[0], v[1], v[2]]);
  // A raised arm takes its shoulder up with it.
  const high = clamp(want.at[1] / (size(want.at) || 1), 0, 1);
  const shrug = about(turned(frame.chest, FRONT), sign * 14 * RAD * ease((high - 0.1) / 0.8));
  const collar = b.parent[arm.kS]; // the bone the shoulder hangs from (the chest)
  const shoulderWorld = unit(times(shrug, times(frame.wr[collar], b.rest.rot[arm.kS])));
  const S = add(frame.wp[arm.kS], turned(shoulderWorld, b.rest.pos[arm.kA]));
  const T = add(S, scaled(world(want.at), arm.length));
  const got = reach(S, T, world(want.pole), arm.upper, arm.fore);

  // Each bone keeps the side of it that was modelled as the inside of the elbow on the inside of the elbow.
  const roll = about(got.fore, -sign * (want.roll ?? 0) * RAD);
  const upperWorld = unit(times(carried(arm.a1, arm.h1, got.upper, got.hinge), b.still.wr[arm.kA]));
  const foreTurn = carried(arm.a2, arm.h2, got.fore, got.hinge);
  // The palm turns from the wrist; the forearm goes half of the way with it, as a real one does.
  const foreWorld = unit(times(about(got.fore, (-sign * (want.roll ?? 0) * RAD) / 2), times(foreTurn, b.still.wr[arm.kF])));
  const flat = turned(roll, got.hinge); // the line through the palm, square to the hand
  let fingers = turned(times(roll, foreTurn), arm.a3);
  const wag = about(flat, sign * (want.wag ?? 0) * RAD);
  const bend = about(along(cross(fingers, flat)), -sign * (want.bend ?? 0) * RAD);
  const handTurn = times(times(wag, bend), times(roll, foreTurn));
  const handWorld = unit(times(handTurn, b.still.wr[arm.kH]));
  fingers = turned(handTurn, arm.a3);

  return {
    S,
    T,
    elbow: got.elbow,
    wrist: got.wrist,
    fingers,
    world: { shoulder: shoulderWorld, upper: upperWorld, fore: foreWorld, hand: handWorld },
    own: {
      shoulder: unit(times(inverse(frame.wr[collar]), shoulderWorld)),
      upper: unit(times(inverse(shoulderWorld), upperWorld)),
      fore: unit(times(inverse(upperWorld), foreWorld)),
      hand: unit(times(inverse(foreWorld), handWorld)),
    },
    // The places kept clear of the body, each with how far it must stay from it: the middle of the palm,
    // the wrist, the ends of the fingers and the thumb, and the middle of the forearm.
    checks: [
      { at: add(got.wrist, scaled(fingers, arm.hand * 0.5)), room: arm.handRound * 0.55, hand: true },
      { at: got.wrist, room: arm.handRound * 0.5, hand: true },
      ...arm.tips.map((tip) => ({ at: add(got.wrist, turned(handWorld, tip)), room: arm.handRound * 0.3, hand: true })),
      { at: scaled(add(got.wrist, got.elbow), 0.5), room: arm.armRound * 0.3, hand: false },
    ],
  };
}

/** How deep a place is inside the head (as far as it has to move to be `room` clear of it), and the way out. */
function inHead(b, frame, at, room) {
  const { J } = b;
  const { radii, seen } = b.head;
  const middle = add(frame.wp[J.Head], turned(frame.wr[J.Head], seen));
  const turn = unit(times(frame.wr[J.Head], inverse(b.still.wr[J.Head])));
  const d = turned(inverse(turn), sub(at, middle));
  const r = Math.hypot(d[0] / (radii[0] + room), d[1] / (radii[1] + room), d[2] / (radii[2] + room));
  if (r >= 1 || r < 1e-6) return null;
  return { depth: size(d) * (1 / r - 1), way: along(turned(turn, d)) };
}

/**
 * Moves the place an arm reaches for until its hand is clear of the body, the head and the other hand's
 * side (or it has been tried ten times: a hand that cannot get clear stays as near as it got). Returns
 * the new place, in arm's lengths from the shoulder like the one given.
 */
export function clear(b, arm, frame, want, gap) {
  let at = want.at;
  const back = inverse(frame.chest);
  const outward = turned(frame.chest, [arm.sign, 0, 0]);
  const middle = frame.wp[b.J.Spine2];
  for (let tries = 0; tries < 10; tries++) {
    const placed = place(b, arm, frame, { ...want, at });
    let worst = null;
    const worse = (depth, way) => {
      if (depth > (worst?.depth ?? 1e-5)) worst = { depth, way };
    };
    for (const { at: point, room, hand } of placed.checks) {
      const body = frame.outline.sink(point);
      if (body) worse(body.depth + room + gap, body.way);
      const head = inHead(b, frame, point, room + gap);
      if (head) worse(head.depth, head.way);
      // Each hand keeps to its own side of the body's middle, so two hands in front never run into each other.
      if (hand) worse(room + gap / 2 - dot(sub(point, middle), outward), outward);
    }
    if (!worst) break;
    const move = turned(back, scaled(worst.way, worst.depth * 1.05));
    at = add(at, [(arm.sign * move[0]) / arm.length, move[1] / arm.length, move[2] / arm.length]);
  }
  return at;
}

// ---------- writing them into the model ----------

/**
 * Replaces the model's motions with the ones made here, on top of its idle. Returns the names of the
 * motions it made: none when the model has no idle or is not a rig this understands (its own are kept).
 */
export function makeMoves(doc, moves = MOVES, fps = 24) {
  const root = doc.getRoot();
  const idle = root.listAnimations().find((anim) => anim.getName() === 'idle');
  const b = idle && measure(doc);
  const base = b && standing(b, idle);
  if (!base) return [];
  const buffer = root.listBuffers()[0];
  // The idle first: every gesture leaves from its first moment.
  const names = Object.keys(moves).sort((a, z) => Number(!!moves[z].whole) - Number(!!moves[a].whole));
  const made = [];
  let from = null;
  for (const name of names) {
    const move = moves[name];
    const done = frames(b, base, move, fps, from);
    if (move.whole && !from) from = { rot: done.frames[0].rot.slice(), hung: done.hung };
    made.push({ name, whole: !!move.whole, ...done });
  }
  // Bones that can get keys: the ones the idle moved, and the arms, neck and head that are placed here.
  const keyed = new Set(base.moved);
  for (const arm of Object.values(b.arms)) for (const k of [arm.kS, arm.kA, arm.kF, arm.kH]) keyed.add(k);
  keyed.add(b.J.Neck).add(b.J.Head);
  // A gesture is told apart from standing still: the idle's first moment, as it is written here.
  const first = made.find((m) => m.whole)?.frames[0] ?? made[0].frames[0];
  const same = (a, z) => Math.abs(a[0] * z[0] + a[1] * z[1] + a[2] * z[2] + a[3] * z[3]) > 1 - 1e-9;
  for (const { name, whole, length, frames: list } of made) {
    for (const old of root.listAnimations()) if (old.getName() === name) dropAnimation(old);
    const anim = doc.createAnimation(name);
    const last = list.length - 1;
    const input = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(list, (_, i) => (i === last ? length : i / fps))).setBuffer(buffer);
    const track = (node, path, type, values) => {
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(values).setBuffer(buffer)).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    };
    for (const k of keyed) {
      if (!whole && list.every((frame) => same(frame.rot[k], first.rot[k]))) continue; // a bone the gesture leaves alone
      const values = new Float32Array(list.length * 4);
      let before = whole ? null : first.rot[k];
      list.forEach((frame, i) => {
        let q = frame.rot[k];
        if (before && before[0] * q[0] + before[1] * q[1] + before[2] * q[2] + before[3] * q[3] < 0) q = q.map((v) => -v);
        values.set(q, i * 4);
        before = q;
      });
      track(b.joints[k], 'rotation', 'VEC4', values);
    }
    if (whole || list.some((frame) => size(sub(frame.hips, first.hips)) > 1e-7)) {
      track(b.joints[b.J.Hips], 'translation', 'VEC3', Float32Array.from(list.flatMap((frame) => frame.hips)));
    }
  }
  return made.map((m) => m.name);
}
