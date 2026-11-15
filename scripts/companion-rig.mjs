// Makes Tripo's characters behave on the stage. Two things in its exports do not suit small companions
// whose head is a third of their height or more:
//
//   the standing  is made for someone of ordinary build. On a companion it leans, sways and sidesteps too
//                 far. calmAnimation keeps a part of it (the numbers are in CALM below).
//   the head      is held by its bone only by two thirds on the girls: the rest is shared between the neck
//                 and the shoulders, so the face and the hijab slide apart when the head turns or an arm
//                 lifts. steadyHead ties everything above the neck to the head bone alone.
//
// What the arms and the head do on top of standing is not Tripo's at all: companion-moves.mjs makes it for
// each companion's own body. scripts/companion-models.mjs runs all of it on every character. The sums here
// are tested in companion-rig.test.mjs.

/**
 * How much of a motion of Tripo's is kept, 1 being all of it and 0 none, as [nodding, turning, leaning]:
 *
 *   body  the hips, legs and spine. The hips' travel shrinks by the same numbers, so feet that were
 *         planted stay planted.
 *   head  the neck and head: what they do on top of the body.
 *
 * The arms are not in it: they are placed anew for every companion (companion-moves.mjs).
 */
export const CALM = { body: [0.6, 0.5, 0.3], head: [0.6, 0.6, 0.35] };

/**
 * Takes a motion out of a model together with its keys. (An animation that is only disposed of leaves its
 * samplers behind, and with them all its keys, which are then written into the file for nothing.)
 */
export function dropAnimation(anim) {
  for (const channel of anim.listChannels()) channel.dispose();
  for (const sampler of anim.listSamplers()) sampler.dispose();
  anim.dispose();
}

/** A bone's name without the rig's prefix ("mixamorig:LeftArm" -> "LeftArm"). */
const short = (node) => node.getName().replace(/^mixamorig:?/i, '');

/** Which of CALM's parts a bone belongs to. The arms, hands and fingers are left as they are. */
export function partOf(bone) {
  if (/^(hips|spine\d?|(left|right)(upleg|leg|foot|toebase))$/i.test(bone)) return 'body';
  if (/^(neck|head)$/i.test(bone)) return 'head';
  return null;
}

// ---------- turns, as [x, y, z, w] ----------

const IDENTITY = [0, 0, 0, 1];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const negated = (q) => [-q[0], -q[1], -q[2], -q[3]];
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];

export function unit(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 1e-9 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1];
}

/** One turn after another: b first, then a. */
export function times(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** A point turned by q. */
export function turned(q, [x, y, z]) {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}

/**
 * A turn taken apart, for someone standing upright (y up) and facing +z: [nodding, turning, leaning], the
 * angles about x, y and z in radians, with nodding forward counted as positive. Put back together as
 * turning, then nodding, then leaning.
 */
export function apart(q) {
  const [x, y, z, w] = q;
  const m23 = 2 * (y * z - w * x);
  const nod = Math.asin(-Math.min(1, Math.max(-1, m23)));
  if (Math.abs(m23) > 0.9999999) return [nod, Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z)), 0];
  return [nod, Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)), Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z))];
}

/** The turn that `apart` takes apart. */
export function together([nod, turn, lean]) {
  const c1 = Math.cos(nod / 2), c2 = Math.cos(turn / 2), c3 = Math.cos(lean / 2);
  const s1 = Math.sin(nod / 2), s2 = Math.sin(turn / 2), s3 = Math.sin(lean / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
}

/** Part of a turn: that much of its nodding, of its turning and of its leaning. */
export function partOfTurn(q, keep) {
  const [nod, turn, lean] = apart(q[3] < 0 ? negated(q) : q);
  return together([nod * keep[0], turn * keep[1], lean * keep[2]]);
}

// ---------- the motions ----------

/**
 * Keeps a part of a motion (see CALM). Each bone's turn is measured from how it stands at rest, in the
 * directions of the standing body, so "leaning" means leaning whichever way the rig's own bones point.
 */
export function calmAnimation(doc, anim, clip, keep = CALM) {
  const buffer = doc.getRoot().listBuffers()[0];
  const fresh = (values, type) => doc.createAccessor().setType(type).setArray(values).setBuffer(buffer);
  for (const channel of anim.listChannels()) {
    const node = channel.getTargetNode();
    let sampler = channel.getSampler();
    const path = channel.getTargetPath();
    const part = node && partOf(short(node));
    if (!part || !sampler || keep[part].every((k) => k === 1)) continue;
    const isHips = /^hips$/i.test(short(node));
    if (path !== 'rotation' && !(path === 'translation' && isHips)) continue;
    if (sampler.getInterpolation() === 'CUBICSPLINE') {
      console.warn(`  ! ${clip}: ${node.getName()} moves along a curve, left as it is`);
      continue;
    }
    // A sampler that moves more than one bone gets a copy, so that each is changed for itself.
    if (sampler.listParents().filter((p) => p.propertyType === 'AnimationChannel').length > 1) {
      sampler = sampler.clone();
      anim.addSampler(sampler);
      channel.setSampler(sampler);
    }
    const output = sampler.getOutput();
    const parent = node.getParentNode();
    const above = parent ? unit(parent.getWorldRotation()) : IDENTITY; // how the bone above stands at rest
    const back = inverse(above);
    const count = output.getCount();
    if (path === 'translation') {
      // Travel: sideways shrinks with the leaning, up-down and forward-back with the nodding.
      const [nod, , lean] = keep[part];
      const rest = node.getTranslation();
      const values = new Float32Array(count * 3);
      const v = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        output.getElement(i, v);
        const moved = turned(above, [v[0] - rest[0], v[1] - rest[1], v[2] - rest[2]]);
        const kept = turned(back, [moved[0] * lean, moved[1] * nod, moved[2] * nod]);
        values.set([rest[0] + kept[0], rest[1] + kept[1], rest[2] + kept[2]], i * 3);
      }
      sampler.setOutput(fresh(values, 'VEC3'));
      continue;
    }
    const rest = unit(node.getRotation());
    const fromRest = inverse(rest);
    const values = new Float32Array(count * 4);
    const v = [0, 0, 0, 1];
    let last = null;
    for (let i = 0; i < count; i++) {
      output.getElement(i, v);
      // What the bone does beyond standing at rest, as the standing body sees it...
      const change = times(times(times(above, unit(v)), fromRest), back);
      // ...a part of it, and back to the bone's own way of counting.
      let q = unit(times(times(times(back, partOfTurn(change, keep[part])), above), rest));
      if (last && dot(last, q) < 0) q = negated(q);
      values.set(q, i * 4);
      last = q;
    }
    sampler.setOutput(fresh(values, 'VEC4'));
  }
}

// ---------- the head ----------

const smooth = (from, to, x) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * Ties the head to the head bone. Everything from a little above the head joint (the base of the skull) up
 * is held by that bone alone; between the neck joint and there the hold eases in, so the neck still bends.
 * Returns how many vertices changed.
 */
export function steadyHead(doc) {
  let changed = 0;
  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints();
    const head = joints.findIndex((j) => /^head$/i.test(short(j)));
    const neck = joints.findIndex((j) => /^neck$/i.test(short(j)));
    if (head < 0 || neck < 0) continue;
    const isHead = joints.map((j) => /^head(top.*)?$/i.test(short(j)));
    const yHead = joints[head].getWorldTranslation()[1];
    const yNeck = joints[neck].getWorldTranslation()[1];
    if (!(yHead > yNeck)) continue;
    const from = yNeck;
    const to = yHead + (yHead - yNeck) * 0.25;

    // Where each joint puts a vertex at rest: its place in the world times its bind matrix (only y is needed).
    const bind = skin.getInverseBindMatrices();
    const rows = joints.map((joint, k) => {
      const w = joint.getWorldMatrix();
      const b = bind ? bind.getElement(k, new Array(16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      // row y of (w * b), both column-major
      const row = (c) => w[1] * b[c * 4] + w[5] * b[c * 4 + 1] + w[9] * b[c * 4 + 2] + w[13] * b[c * 4 + 3];
      return [row(0), row(1), row(2), row(3)];
    });

    const done = new Set();
    for (const node of doc.getRoot().listNodes()) {
      if (node.getSkin() !== skin) continue;
      for (const prim of node.getMesh()?.listPrimitives() ?? []) {
        const P = prim.getAttribute('POSITION');
        const J = prim.getAttribute('JOINTS_0');
        const W = prim.getAttribute('WEIGHTS_0');
        if (!P || !J || !W || done.has(W)) continue;
        done.add(W);
        if (prim.getAttribute('JOINTS_1')) console.warn('  ! a mesh with more than four bones to a vertex: the extra ones are not looked at');
        const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
        for (let i = 0; i < P.getCount(); i++) {
          P.getElement(i, p);
          J.getElement(i, j);
          W.getElement(i, w);
          const sum = w[0] + w[1] + w[2] + w[3];
          if (!(sum > 0)) continue;
          let y = 0;
          let held = 0;
          for (let k = 0; k < 4; k++) {
            const share = w[k] / sum;
            if (!share) continue;
            const r = rows[j[k]];
            y += share * (r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3]);
            if (isHead[j[k]]) held += share;
          }
          const lift = smooth(from, to, y);
          if (lift <= 0 || held >= 0.9995) continue; // below the neck, or the head's alone already
          const next = held + (1 - held) * lift;
          if (next >= 0.9995) {
            set(J, W, i, [head, 0, 0, 0], [1, 0, 0, 0]);
            changed++;
            continue;
          }
          // The head bone takes `next`; the other bones share what is left as they shared it before.
          const others = [];
          for (let k = 0; k < 4; k++) if (w[k] > 0 && !isHead[j[k]]) others.push([j[k], w[k] / sum]);
          others.sort((a, b) => b[1] - a[1]);
          others.length = Math.min(others.length, 3);
          const rest = others.reduce((n, o) => n + o[1], 0);
          const joints4 = [head, 0, 0, 0];
          const weights4 = [next, 0, 0, 0];
          others.forEach(([joint, share], k) => {
            joints4[k + 1] = joint;
            weights4[k + 1] = ((1 - next) * share) / rest;
          });
          set(J, W, i, joints4, weights4);
          changed++;
        }
      }
    }
  }
  return changed;
}

function set(J, W, i, joints, weights) {
  J.setElement(i, joints);
  W.setElement(i, weights);
}
