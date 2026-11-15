// Tests for the motions the model pipeline makes itself. Run with: node scripts/companion-moves.test.mjs
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { apart, times, turned } from './companion-rig.mjs';
import { MOVES, Outline, about, between, bump, carried, held, makeMoves, measure, reach, rise, standing } from './companion-moves.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scaled = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const size = (a) => Math.hypot(...a);
const along = (a) => scaled(a, 1 / size(a));

// ---------- the sums ----------

test('turns: the shortest way from one direction to another, and two directions carried at once', () => {
  const q = between(X, Y);
  turned(q, X).forEach((v, i) => near(v, Y[i]));
  turned(between(X, [-1, 0, 0]), X).forEach((v, i) => near(v, [-1, 0, 0][i])); // right round, any way
  assert.deepEqual(between(Z, Z), [0, 0, 0, 1]);
  // An arm pointing left with its elbow's line pointing down, carried to point forward with that line pointing left.
  const c = carried(X, [0, -1, 0], Z, X);
  turned(c, X).forEach((v, i) => near(v, Z[i]));
  turned(c, [0, -1, 0]).forEach((v, i) => near(v, X[i]));
});

test('easing: a rise, a hold and a bump start and end flat', () => {
  assert.equal(rise(0, 1, 2), 0);
  assert.equal(rise(3, 1, 2), 1);
  near(rise(1.5, 1, 2), 0.5);
  assert.ok(rise(1.01, 1, 2) < 0.001, 'a soft start');
  assert.equal(held(0, 0.5, 1, 2, 3), 0);
  assert.equal(held(1.5, 0.5, 1, 2, 3), 1);
  assert.equal(held(3.5, 0.5, 1, 2, 3), 0);
  assert.equal(bump(1, 0, 1, 2), 1);
  assert.equal(bump(2, 0, 1, 2), 0);
});

test('reaching: both bones keep their length, the wrist gets there and the elbow points where it is told', () => {
  const S = [0.2, 1.3, 0], T = [0.35, 1.1, 0.2];
  const got = reach(S, T, [0, 0, -1], 0.2, 0.25);
  near(size(sub(got.elbow, S)), 0.2);
  near(size(sub(got.wrist, got.elbow)), 0.25);
  got.wrist.forEach((v, i) => near(v, T[i]));
  const middle = scaled(add(S, T), 0.5);
  assert.ok(sub(got.elbow, middle)[2] < 0, 'the elbow is behind the line from shoulder to wrist');
  // The line the elbow bends about is square to both bones.
  near(dot(got.hinge, got.upper), 0);
  near(dot(got.hinge, got.fore), 0);
  near(size(got.hinge), 1);
});

test('reaching: a place too far is reached for with an arm that is not quite straight', () => {
  const S = [0, 1, 0];
  const got = reach(S, [3, 1, 0], [0, -1, 0], 0.2, 0.2);
  near(size(sub(got.wrist, S)), 0.4 * 0.985);
  near(got.wrist[1], 1);
  assert.ok(got.elbow[1] < 1, 'the elbow hangs down a little');
  assert.ok(dot(got.upper, got.fore) < 0.9999 && dot(got.upper, got.fore) > 0.9);
  // The same place as the shoulder, or a pole along the arm, is still an answer.
  for (const v of [...reach(S, S, [0, 0, -1], 0.2, 0.2).elbow, ...reach(S, [0, 0, 0], [0, -1, 0], 0.2, 0.2).elbow]) assert.ok(Number.isFinite(v));
});

test('the outline: how deep a place is inside the body at its height, and the way out', () => {
  // A drum: radius 0.3 from 0 up to 1.
  const points = [];
  for (let y = 0; y <= 1.0001; y += 0.02) for (let a = 0; a < 48; a++) points.push(0.3 * Math.cos((a * Math.PI) / 24), y, 0.3 * Math.sin((a * Math.PI) / 24));
  const drum = new Outline(Float32Array.from(points), 1, 0);
  const inside = drum.sink([0.1, 0.5, 0]);
  near(inside.depth, 0.2, 0.01);
  inside.way.forEach((v, i) => near(v, X[i], 1e-6));
  near(drum.sink([0, 0.5, -0.45]).depth, -0.15, 0.01);
  near(drum.sink([0.2, 0.5, 0.2]).way[2], Math.SQRT1_2, 1e-6);
  assert.equal(drum.sink([0.1, 1.4, 0]), null, 'above the body there is nothing to be inside of');
});

// ---------- a small companion ----------

/**
 * A rig named and turned like Tripo's (the hips a quarter round at rest, other bones every which way),
 * arms out and down as modelled, with a skin: a body that widens like a tunic below the chest (0.3 to
 * each side under y 1, where an arm hanging straight down would be inside it), legs, a round head and arms.
 */
function companion({ idle = true } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const world = new Map(); // name -> { at, turn } in the world
  const nodes = new Map();
  const bone = (name, above, at, turn = [0, 0, 0, 1]) => {
    const up = above ? world.get(above) : { at: [0, 0, 0], turn: [0, 0, 0, 1] };
    const node = doc.createNode(`mixamorig:${name}`).setTranslation(turned(inverse(up.turn), sub(at, up.at))).setRotation(times(inverse(up.turn), turn));
    world.set(name, { at, turn });
    nodes.set(name, node);
    if (above) nodes.get(above).addChild(node);
    return node;
  };
  const quarter = about(Y, rad(-90));
  bone('Hips', null, [0, 0.9, 0], quarter);
  bone('Spine', 'Hips', [0, 1.0, 0], quarter);
  bone('Spine1', 'Spine', [0, 1.1, 0], times(quarter, about(X, rad(5))));
  bone('Spine2', 'Spine1', [0, 1.2, 0], about(Y, rad(-74)));
  bone('Neck', 'Spine2', [0, 1.4, 0], about(Y, rad(-99)));
  bone('Head', 'Neck', [0, 1.5, 0], about(Y, rad(-99)));
  bone('HeadTop_End', 'Head', [0, 1.95, 0]);
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    const out = [s * Math.SQRT1_2, -Math.SQRT1_2, 0]; // the way the arm points as modelled
    const shoulder = [s * 0.2, 1.33, 0];
    bone(`${side}Shoulder`, 'Spine2', [s * 0.08, 1.35, 0], about(Z, rad(s * 80)));
    bone(`${side}Arm`, `${side}Shoulder`, shoulder, about(Z, rad(s * -135)));
    bone(`${side}ForeArm`, `${side}Arm`, add(shoulder, scaled(out, 0.2)), about(X, rad(30)));
    bone(`${side}Hand`, `${side}ForeArm`, add(shoulder, scaled(out, 0.4)), about(Y, rad(s * 40)));
    bone(`${side}HandMiddle1`, `${side}Hand`, add(shoulder, scaled(out, 0.43)));
    bone(`${side}UpLeg`, 'Hips', [s * 0.1, 0.85, 0], about(X, rad(180)));
    bone(`${side}Leg`, `${side}UpLeg`, [s * 0.1, 0.45, 0], about(X, rad(180)));
    bone(`${side}Foot`, `${side}Leg`, [s * 0.1, 0.08, 0]);
    bone(`${side}ToeBase`, `${side}Foot`, [s * 0.1, 0.02, 0.12]);
  }
  const names = [...nodes.keys()];
  const joints = names.map((name) => nodes.get(name));
  const J = Object.fromEntries(names.map((name, i) => [name, i]));
  const bind = new Float32Array(joints.length * 16);
  names.forEach((name, k) => {
    const { at, turn } = world.get(name);
    const back = inverse(turn);
    const place = scaled(turned(back, at), -1);
    bind.set([...turned(back, X), 0, ...turned(back, Y), 0, ...turned(back, Z), 0, ...place, 1], k * 16);
  });
  const skin = doc.createSkin().setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(bind).setBuffer(buffer));
  joints.forEach((joint) => skin.addJoint(joint));

  const vertices = []; // [x, y, z, bone]
  const ring = (middle, rx, rz, name, n = 24) => {
    for (let a = 0; a < n; a++) vertices.push([middle[0] + rx * Math.cos((a * 2 * Math.PI) / n), middle[1], middle[2] + rz * Math.sin((a * 2 * Math.PI) / n), name]);
  };
  for (let step = 0; step <= 30; step++) {
    const y = 0.55 + step * 0.025;
    ring([0, y, 0], y < 1 ? 0.3 : 0.17, y < 1 ? 0.24 : 0.13, y < 0.95 ? 'Hips' : 'Spine2');
  }
  for (const s of [1, -1]) for (let y = 0; y < 0.55; y += 0.05) ring([s * 0.1, y, 0], 0.06, 0.06, s > 0 ? 'LeftUpLeg' : 'RightUpLeg', 8);
  for (let lat = -80; lat <= 80; lat += 10) {
    const r = 0.25 * Math.cos(rad(lat));
    ring([0, 1.72 + 0.25 * Math.sin(rad(lat)), 0.02], r, r, 'Head', 16);
  }
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    const out = [s * Math.SQRT1_2, -Math.SQRT1_2, 0];
    const from = [s * 0.2, 1.33, 0];
    for (let step = 0; step <= 24; step++) {
      const d = step * 0.02; // the hand is the last 0.08
      const name = d < 0.2 ? `${side}Arm` : d < 0.4 ? `${side}ForeArm` : `${side}Hand`;
      const at = add(from, scaled(out, d));
      // a small ring around the arm's own line
      for (let a = 0; a < 6; a++) {
        const round = add(scaled([out[1], -out[0], 0], 0.03 * Math.cos(a)), scaled(Z, 0.03 * Math.sin(a)));
        vertices.push([...add(at, round), name]);
      }
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(vertices.flatMap((v) => v.slice(0, 3)))).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(Uint8Array.from(vertices.flatMap((v) => [J[v[3]], 0, 0, 0]))).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Float32Array.from(vertices.flatMap(() => [1, 0, 0, 0]))).setBuffer(buffer));
  const body = doc.createNode('body').setMesh(doc.createMesh().addPrimitive(prim)).setSkin(skin);
  doc.createScene().addChild(nodes.get('Hips')).addChild(body);

  if (idle) {
    // Two seconds of standing: at rest, a small sway half way, at rest again. Every bone that stands has keys.
    const anim = doc.createAnimation('idle');
    const input = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from([0, 1, 2])).setBuffer(buffer);
    const track = (name, path, values) => {
      const output = doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(Float32Array.from(values)).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output);
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(name)).setTargetPath(path).setSampler(sampler));
    };
    for (const name of names) {
      if (/Hand|HeadTop|ToeBase/.test(name)) continue;
      const own = nodes.get(name).getRotation();
      const swayed = name === 'Spine' ? times(own, about(X, rad(2))) : own; // the hips are turned, so this is a lean
      track(name, 'rotation', [...own, ...swayed, ...own]);
    }
    const at = nodes.get('Hips').getTranslation();
    track('Hips', 'translation', [...at, at[0] + 0.01, at[1], at[2], ...at]);
  }
  return { doc, nodes, names };
}

/** The model put into one frame of a motion the way the stage shows it: the idle's first moment, then the motion's own keys. */
function pose(doc, name, frame) {
  const anims = doc.getRoot().listAnimations();
  const put = (anim, i) => {
    for (const channel of anim.listChannels()) {
      const output = channel.getSampler().getOutput();
      const value = output.getElement(Math.min(i, output.getCount() - 1), []);
      if (channel.getTargetPath() === 'rotation') channel.getTargetNode().setRotation(value);
      else channel.getTargetNode().setTranslation(value);
    }
  };
  put(anims.find((a) => a.getName() === 'idle'), 0);
  if (name !== 'idle' || frame) put(anims.find((a) => a.getName() === name), frame);
}
const framesOf = (doc, name) => doc.getRoot().listAnimations().find((a) => a.getName() === name).listSamplers()[0].getInput().getCount();
const lengthOf = (doc, name) => doc.getRoot().listAnimations().find((a) => a.getName() === name).listSamplers()[0].getInput().getMax([])[0];
const keyed = (doc, name) => doc.getRoot().listAnimations().find((a) => a.getName() === name).listChannels().map((c) => `${c.getTargetNode().getName().replace('mixamorig:', '')}.${c.getTargetPath()}`).sort();
/** How far inside the test companion's body a place is (the tunic below y 1, the chest above): over 1 is outside. */
const outside = ([x, y, z]) => (y < 0.55 || y > 1.3 ? Infinity : Math.hypot(x / (y < 1 ? 0.3 : 0.17), z / (y < 1 ? 0.24 : 0.13)));
const hand = (nodes, side) => {
  const wrist = nodes.get(`${side}Hand`).getWorldTranslation();
  const fingers = along(sub(nodes.get(`${side}HandMiddle1`).getWorldTranslation(), wrist));
  return { wrist, palm: add(wrist, scaled(fingers, 0.04)), tips: add(wrist, scaled(fingers, 0.08)), fingers };
};

test('measuring: the arms, the head and the body are read off the model', () => {
  const { doc } = companion();
  const b = measure(doc);
  near(b.arms.Left.upper, 0.2, 1e-5);
  near(b.arms.Right.fore, 0.2, 1e-5);
  assert.equal(b.arms.Left.sign, 1);
  assert.equal(b.arms.Right.sign, -1);
  near(b.arms.Left.hand, 0.08, 0.005);
  assert.ok(b.arms.Left.handRound > 0.02 && b.arms.Left.handRound < 0.04);
  b.head.radii.forEach((r) => assert.ok(r > 0.2 && r < 0.26, `the head's half-width ${r}`));
  near(b.head.middle[1], 1.74, 0.03);
  near(b.floor, 0, 1e-6);
  near(b.height, 1.97, 0.01);
  // The body's outline, standing at rest: wide at the hips, narrow at the chest, nothing where the head is.
  const outline = b.outline(b.still.wr, b.still.wp);
  near(outline.sink([0.1, 0.8, 0]).depth, 0.2, 0.02);
  near(outline.sink([0.1, 1.15, 0]).depth, 0.07, 0.02);
  assert.equal(outline.sink([0.1, 1.7, 0]), null);
});

test('measuring: a rig that is not like Tripo\'s is left alone', () => {
  const missing = companion();
  missing.nodes.get('LeftForeArm').setName('elbow');
  assert.equal(measure(missing.doc), null);
  const scaledUp = companion();
  scaledUp.nodes.get('Spine').setScale([2, 2, 2]);
  assert.equal(measure(scaledUp.doc), null);
  assert.deepEqual(makeMoves(missing.doc), []);
  assert.deepEqual(makeMoves(companion({ idle: false }).doc), [], 'no idle, nothing to stand the motions on');
  assert.deepEqual(missing.doc.getRoot().listAnimations().map((a) => a.getName()), ['idle'], 'its own motions are kept');
});

test('standing: the idle is read as a function of time', () => {
  const { doc } = companion();
  const b = measure(doc);
  const base = standing(b, doc.getRoot().listAnimations()[0]);
  near(base.length, 2);
  near(base.at(1).hips[0] - base.at(0).hips[0], 0.01, 1e-6);
  near(base.at(0.5).hips[0] - base.at(0).hips[0], 0.005, 1e-6);
  assert.ok(base.moved.has(b.J.Hips) && !base.moved.has(b.J.LeftHand));
  doc.getRoot().listAnimations()[0].listSamplers()[0].setInterpolation('CUBICSPLINE');
  assert.equal(standing(b, doc.getRoot().listAnimations()[0]), null);
});

const made = companion();
const names = makeMoves(made.doc);

test('the motions: all of them are made, the idle as long as it was and the gestures as long as they say', () => {
  assert.deepEqual([...names].sort(), Object.keys(MOVES).sort());
  assert.deepEqual(made.doc.getRoot().listAnimations().map((a) => a.getName()).sort(), Object.keys(MOVES).sort());
  near(lengthOf(made.doc, 'idle'), 2, 1e-6);
  for (const [name, move] of Object.entries(MOVES)) if (!move.whole) near(lengthOf(made.doc, name), move.length, 1e-6);
  assert.equal(framesOf(made.doc, 'wave'), Math.round(2.7 * 24) + 1);
});

test('the motions: a gesture has keys only for the bones it moves, and all of them are bones the idle moves', () => {
  const idle = new Set(keyed(made.doc, 'idle'));
  assert.ok(idle.has('Hips.translation') && idle.has('LeftArm.rotation') && idle.has('RightHand.rotation') && idle.has('Head.rotation'));
  for (const name of names) for (const key of keyed(made.doc, name)) assert.ok(idle.has(key), `${name}: ${key} is not in the idle`);
  assert.deepEqual(keyed(made.doc, 'nod'), ['Head.rotation', 'Neck.rotation', 'Spine1.rotation', 'Spine2.rotation']);
  const wave = keyed(made.doc, 'wave');
  assert.deepEqual(wave, ['Head.rotation', 'Neck.rotation', 'RightArm.rotation', 'RightForeArm.rotation', 'RightHand.rotation', 'RightShoulder.rotation']);
  assert.ok(keyed(made.doc, 'cheer').includes('Hips.translation'), 'the hops move the hips');
  assert.ok(!keyed(made.doc, 'talk').includes('Hips.translation'));
});

test('the motions: the hands hang clear of a body an arm straight down would be inside of', () => {
  pose(made.doc, 'idle', 0);
  for (const side of ['Left', 'Right']) {
    const h = hand(made.nodes, side);
    // Straight under the shoulder (x 0.2) is 0.1 inside the tunic (0.3). The hand hangs outside it.
    for (const place of [h.wrist, h.palm, h.tips]) assert.ok(outside(place) > 1.02, `${side}: ${place.map((v) => v.toFixed(2))} is inside the body`);
    assert.ok(h.wrist[1] < 1.05, 'and it does hang');
  }
});

test('the motions: in every frame of every gesture the hands are outside the body and the head, each on its own side', () => {
  for (const name of names) {
    if (name === 'idle') continue; // its body sways; the gestures are made on the body standing still
    const count = framesOf(made.doc, name);
    for (let i = 0; i < count; i++) {
      pose(made.doc, name, i);
      const headAt = made.nodes.get('Head').getWorldTranslation();
      for (const [side, s] of [['Left', 1], ['Right', -1]]) {
        const h = hand(made.nodes, side);
        for (const place of [h.wrist, h.palm, h.tips]) {
          assert.ok(outside(place) > 1.01, `${name} frame ${i}, ${side}: ${place.map((v) => v.toFixed(3))} is inside the body`);
          // the head is a ball of 0.25 about a point 0.22 above its joint (and 0.02 in front)
          assert.ok(size(sub(place, add(headAt, [0, 0.22, 0.02]))) > 0.25, `${name} frame ${i}, ${side}: a hand in the head`);
          assert.ok(place[0] * s > 0.015, `${name} frame ${i}, ${side}: across the middle`);
        }
      }
    }
  }
});

test('the motions: a gesture played once starts and ends as the idle begins; one that goes round ends as it starts', () => {
  const turns = (name, i) => {
    pose(made.doc, name, i);
    return made.names.map((bone) => made.nodes.get(bone).getRotation());
  };
  const same = (a, z, eps, what) => a.forEach((q, k) => assert.ok(Math.abs(dot4(q, z[k])) > 1 - eps, `${what}: ${made.names[k]}`));
  const dot4 = (a, z) => a[0] * z[0] + a[1] * z[1] + a[2] * z[2] + a[3] * z[3];
  const start = turns('idle', 0);
  for (const [name, move] of Object.entries(MOVES)) {
    if (move.whole) continue;
    const last = framesOf(made.doc, name) - 1;
    if (move.loop) same(turns(name, 0), turns(name, last), 1e-7, `${name} goes round`);
    else {
      same(turns(name, 0), start, 1e-7, `${name} starts`);
      same(turns(name, last), start, 1e-7, `${name} ends`);
    }
  }
  same(turns('idle', 0), turns('idle', framesOf(made.doc, 'idle') - 1), 1e-6, 'the idle goes round');
});

test('the motions: the head nods and turns but never leans, in any of them', () => {
  const headTurn = (name, i) => {
    pose(made.doc, name, i);
    return made.nodes.get('Head').getWorldRotation();
  };
  const rest = headTurn('idle', 0);
  let deepest = 0;
  for (const name of names) {
    if (name === 'idle') continue;
    for (let i = 0; i < framesOf(made.doc, name); i++) {
      const [nod, , lean] = apart(times(headTurn(name, i), inverse(rest)));
      near(deg(lean), 0, 0.02);
      if (name === 'nod') deepest = Math.max(deepest, deg(nod));
    }
  }
  near(deepest, 15 + 2.5, 1); // the head's nod and the chest's with it
  const [, turn] = apart(times(headTurn('think', 36), inverse(rest)));
  near(deg(turn), 8, 0.2);
});

test('the motions: a wave lifts the right hand above its shoulder and leaves the left arm alone', () => {
  pose(made.doc, 'wave', 26); // a little over a second in
  const right = hand(made.nodes, 'Right');
  const shoulder = made.nodes.get('RightArm').getWorldTranslation();
  assert.ok(right.wrist[1] > shoulder[1] + 0.1, 'the wrist is up');
  assert.ok(right.wrist[0] < shoulder[0], 'and out to its own side');
  assert.ok(right.fingers[1] > 0.5, 'the fingers point up');
  // The arm's bones are as long as they were.
  near(size(sub(made.nodes.get('RightForeArm').getWorldTranslation(), shoulder)), 0.2, 1e-5);
  near(size(sub(right.wrist, made.nodes.get('RightForeArm').getWorldTranslation())), 0.2, 1e-5);
  pose(made.doc, 'idle', 0);
  const hanging = hand(made.nodes, 'Left').wrist;
  pose(made.doc, 'wave', 26);
  hand(made.nodes, 'Left').wrist.forEach((v, i) => near(v, hanging[i], 1e-9));
});

test('the motions: a cheer leaves the floor and comes back; both hands go up', () => {
  const hipsAt = (i) => {
    pose(made.doc, 'cheer', i);
    return made.nodes.get('Hips').getWorldTranslation()[1];
  };
  const floor = hipsAt(0);
  const heights = Array.from({ length: framesOf(made.doc, 'cheer') }, (_, i) => hipsAt(i) - floor);
  near(Math.max(...heights), 0.035 * 1.97, 0.004);
  near(Math.min(...heights), 0, 1e-6);
  near(heights[heights.length - 1], 0, 1e-6);
  pose(made.doc, 'cheer', 30);
  for (const side of ['Left', 'Right']) assert.ok(hand(made.nodes, side).wrist[1] > made.nodes.get(`${side}Arm`).getWorldTranslation()[1] + 0.1);
});

console.log(`\n${passed} tests passed`);
