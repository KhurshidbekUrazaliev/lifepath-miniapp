// Tests for what the model pipeline does to motions and heads. Run with: node scripts/companion-rig.test.mjs
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { CALM, apart, calmAnimation, dropAnimation, partOf, partOfTurn, steadyHead, times, together, turned } from './companion-rig.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ✓', name);
}

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
/** Angles in degrees to one decimal (and no "minus zero"), for comparing lists. */
const degrees = (angles) => angles.map((a) => Math.round(deg(a) * 10) / 10 + 0);
const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const about = (axis, angle) => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];

test('turns: a turn comes apart into nodding, turning and leaning, and goes back together', () => {
  const [nod, turn, lean] = apart(about(X, rad(20)));
  near(deg(nod), 20);
  near(turn, 0);
  near(lean, 0);
  // Nodding forward is positive: the top of the head moves the way the body faces (+z).
  assert.ok(turned(about(X, rad(20)), [0, 1, 0])[2] > 0);
  near(deg(apart(about(Z, rad(-15)))[2]), -15);
  const mixed = together([rad(10), rad(-25), rad(40)]);
  assert.deepEqual(degrees(apart(mixed)), [10, -25, 40]);
  // Turning is taken first: the same as a turn, then a nod, then a lean, each about the body's own line.
  const built = times(times(about(Y, rad(-25)), about(X, rad(10))), about(Z, rad(40)));
  mixed.forEach((v, i) => near(v, built[i]));
});

test('turns: a part of one keeps that much of its nodding, its turning and its leaning', () => {
  const q = together([rad(10), rad(20), rad(40)]);
  assert.deepEqual(degrees(apart(partOfTurn(q, [1, 0.5, 0.25]))), [10, 10, 10]);
  // The same turn written with every sign flipped is the same turn.
  assert.deepEqual(degrees(apart(partOfTurn(q.map((v) => -v), [1, 0.5, 0.25]))), [10, 10, 10]);
  assert.deepEqual(partOfTurn(q, [0, 0, 0]).map((v) => Math.round(v * 1e6) / 1e6 + 0), [0, 0, 0, 1]);
  partOfTurn(q, [1, 1, 1]).forEach((v, i) => near(v, q[i]));
});

test('bones: the body and the head are calmed; the arms, hands and fingers are not', () => {
  assert.deepEqual(['Hips', 'Spine', 'Spine2', 'LeftUpLeg', 'RightLeg', 'LeftFoot', 'RightToeBase'].map(partOf), Array(7).fill('body'));
  assert.deepEqual(['Neck', 'Head'].map(partOf), ['head', 'head']);
  assert.deepEqual(['LeftShoulder', 'RightArm', 'LeftForeArm', 'RightHand', 'LeftHandIndex1', 'HeadTop_End', 'LeftToe_End'].map(partOf), Array(7).fill(null));
});

/**
 * A small rig built like Tripo's: the hips are turned a quarter round at rest, so "leaning" is not about
 * any bone's own z. One leg hangs from the hips, a spine, neck and head stand on them, an arm hangs out.
 */
function rig() {
  const doc = new Document();
  doc.createBuffer();
  const node = (name, at, turn = [0, 0, 0, 1]) => doc.createNode(`mixamorig:${name}`).setTranslation(at).setRotation(turn);
  const quarter = about(Y, rad(-90));
  const back = inverse(quarter);
  // Children's places are given in the world and carried into the hips' turned frame.
  const hips = node('Hips', [0, 1, 0], quarter);
  const leg = node('LeftUpLeg', turned(back, [0.1, 0, 0]), about(X, rad(180)));
  const foot = node('LeftFoot', turned(inverse(times(quarter, about(X, rad(180)))), [0, -1, 0]));
  const spine = node('Spine', turned(back, [0, 0.3, 0]), about(Z, rad(7)));
  const neck = node('Neck', [0, 0.3, 0]);
  const head = node('Head', [0, 0.1, 0]);
  const arm = node('LeftArm', [0.2, 0.2, 0], about(Z, rad(-45)));
  const fore = node('LeftForeArm', [0, 0.3, 0]);
  hips.addChild(leg).addChild(spine);
  leg.addChild(foot);
  spine.addChild(neck).addChild(arm);
  neck.addChild(head);
  arm.addChild(fore);
  doc.createScene().addChild(hips);
  const anim = doc.createAnimation('idle');
  const track = (bone, path, values) => {
    const size = path === 'rotation' ? 4 : 3;
    const count = values.length / size;
    const input = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from({ length: count }, (_, i) => i / 24));
    const output = doc.createAccessor().setType(size === 4 ? 'VEC4' : 'VEC3').setArray(Float32Array.from(values));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output);
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(bone).setTargetPath(path).setSampler(sampler));
  };
  const keys = (bone, path) => {
    const channel = anim.listChannels().find((c) => c.getTargetNode() === bone && c.getTargetPath() === path);
    return Array.from(channel.getSampler().getOutput().getArray());
  };
  return { doc, anim, track, keys, bones: { hips, leg, foot, spine, neck, head, arm, fore } };
}

/** A bone's turn that makes it stand `change` (a turn in the world's directions) away from rest. */
const posed = (bone, change) => {
  const parent = bone.getParentNode();
  const above = parent ? parent.getWorldRotation() : [0, 0, 0, 1];
  return times(times(times(inverse(above), change), above), bone.getRotation());
};
/** The other way: what a bone's turn does beyond rest, in the world's directions. */
const change = (bone, q) => {
  const parent = bone.getParentNode();
  const above = parent ? parent.getWorldRotation() : [0, 0, 0, 1];
  return times(times(times(above, q), inverse(bone.getRotation())), inverse(above));
};

test('motions: a lean is cut to its part whichever way the rig turns its bones, and a nod is kept', () => {
  const { doc, anim, track, keys, bones } = rig();
  track(bones.hips, 'rotation', [...posed(bones.hips, together([rad(10), 0, rad(20)])), ...bones.hips.getRotation()]);
  track(bones.spine, 'rotation', posed(bones.spine, together([0, rad(30), rad(-20)])));
  calmAnimation(doc, anim, 'idle', { body: [1, 0.5, 0.3], head: [1, 1, 1] });
  const hips = keys(bones.hips, 'rotation');
  assert.deepEqual(degrees(apart(change(bones.hips, hips.slice(0, 4)))), [10, 0, 6]);
  // A key at rest stays at rest.
  hips.slice(4).forEach((v, i) => near(Math.abs(v), Math.abs(bones.hips.getRotation()[i]), 1e-6));
  assert.deepEqual(degrees(apart(change(bones.spine, keys(bones.spine, 'rotation')))), [0, 15, -6]);
});

test('motions: the head takes its own numbers, and the arms are left as they are', () => {
  const { doc, anim, track, keys, bones } = rig();
  const bow = together([rad(50), rad(10), rad(-30)]);
  track(bones.head, 'rotation', posed(bones.head, bow));
  track(bones.neck, 'rotation', posed(bones.neck, bow));
  const up = posed(bones.arm, about(Z, rad(120)));
  track(bones.arm, 'rotation', up);
  track(bones.fore, 'rotation', about(X, rad(90)));
  calmAnimation(doc, anim, 'idle', { body: [1, 1, 1], head: [0.4, 0.5, 0.3] });
  for (const bone of [bones.head, bones.neck]) {
    assert.deepEqual(degrees(apart(change(bone, keys(bone, 'rotation')))), [20, 5, -9]);
  }
  assert.deepEqual(keys(bones.arm, 'rotation').map((v) => Math.round(v * 1e4)), up.map((v) => Math.round(v * 1e4)));
  assert.deepEqual(keys(bones.fore, 'rotation').map((v) => Math.round(v * 1e4)), about(X, rad(90)).map((v) => Math.round(v * 1e4)));
});

test('motions: a foot that was planted stays planted when the sway shrinks', () => {
  const { doc, anim, track, keys, bones } = rig();
  const footAt = (hipsPlace, hipsTurn, legTurn) => {
    const hipsWorld = hipsTurn;
    const legAt = turned(hipsWorld, bones.leg.getTranslation()).map((v, i) => v + hipsPlace[i]);
    const legWorld = times(hipsWorld, legTurn);
    return turned(legWorld, bones.foot.getTranslation()).map((v, i) => v + legAt[i]);
  };
  const rest = footAt(bones.hips.getTranslation(), bones.hips.getRotation(), bones.leg.getRotation());
  assert.deepEqual(rest.map((v) => Math.round(v * 1e6) / 1e6 + 0), [0.1, 0, 0]);
  // A sway: the hips tip 12 degrees and the leg swings 9 the other way (in the world), with the hips placed so
  // that the foot does not move at all.
  const frames = [0, 0.5, 1].map((t) => {
    const hipsTurn = posed(bones.hips, about(Z, rad(12 * t)));
    const legWorld = times(about(Z, rad(-9 * t)), bones.leg.getWorldRotation());
    const legTurn = times(inverse(hipsTurn), legWorld);
    const off = footAt([0, 0, 0], hipsTurn, legTurn);
    return { hipsTurn, legTurn, place: [0.1 - off[0], -off[1], -off[2]] };
  });
  frames.forEach((f) => footAt(f.place, f.hipsTurn, f.legTurn).forEach((v, i) => near(v, rest[i], 1e-6)));
  assert.ok(Math.abs(frames[2].place[0]) > 0.15, 'the hips really travel sideways');
  track(bones.hips, 'translation', frames.flatMap((f) => f.place));
  track(bones.hips, 'rotation', frames.flatMap((f) => f.hipsTurn));
  track(bones.leg, 'rotation', frames.flatMap((f) => f.legTurn));
  calmAnimation(doc, anim, 'idle', { body: [0.3, 0.3, 0.3], head: [1, 1, 1] });
  const place = keys(bones.hips, 'translation'), hipsTurn = keys(bones.hips, 'rotation'), legTurn = keys(bones.leg, 'rotation');
  near(place[6], frames[2].place[0] * 0.3, 1e-6); // the travel shrinks with the lean
  for (let i = 0; i < 3; i++) {
    const foot = footAt(place.slice(i * 3, i * 3 + 3), hipsTurn.slice(i * 4, i * 4 + 4), legTurn.slice(i * 4, i * 4 + 4));
    // Within a hundredth of the leg's length of where it stood. Keeping the hips in place while the legs
    // swing as before (what the stage used to do) moves it twenty times as far.
    assert.ok(Math.hypot(foot[0] - rest[0], foot[1] - rest[1], foot[2] - rest[2]) < 0.01, `frame ${i}: the foot moved to ${foot}`);
  }
  const old = footAt(frames[0].place, frames[2].hipsTurn, frames[2].legTurn);
  assert.ok(Math.hypot(old[0] - rest[0], old[1] - rest[1]) > 0.15);
});

test('motions: travel shrinks sideways with the lean and otherwise with the nod; other bones keep theirs', () => {
  const { doc, anim, track, keys, bones } = rig();
  const [x, y, z] = bones.hips.getTranslation();
  track(bones.hips, 'translation', [x + 0.2, y - 0.1, z + 0.05]);
  track(bones.spine, 'translation', [9, 9, 9]);
  calmAnimation(doc, anim, 'idle', { body: [0.6, 0.5, 0.25], head: [1, 1, 1] });
  keys(bones.hips, 'translation').forEach((v, i) => near(v, [x + 0.05, y - 0.06, z + 0.03][i], 1e-6));
  assert.deepEqual(keys(bones.spine, 'translation'), [9, 9, 9]);
});

test('motions: what is kept of each is between nothing and everything', () => {
  assert.deepEqual(Object.keys(CALM), ['body', 'head']);
  for (const k of [...CALM.body, ...CALM.head]) assert.ok(k >= 0 && k <= 1, String(k));
});

test('motions: one that is dropped takes its keys with it', () => {
  const { doc, anim, track, bones } = rig();
  track(bones.hips, 'rotation', [0, 0, 0, 1, 0, 0, 0, 1]);
  track(bones.hips, 'translation', [0, 1, 0, 0, 1, 0]);
  const keys = anim.listSamplers().flatMap((sampler) => [sampler.getInput(), sampler.getOutput()]);
  assert.equal(keys.length, 4);
  dropAnimation(anim);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  // Nothing holds the keys any more (but the document itself), so pruning takes them out of the file.
  for (const accessor of keys) assert.deepEqual(accessor.listParents().map((parent) => parent.propertyType), ['Root']);
});

/** A stick of a body with a skin: hips, neck (y 1), head (y 1.2) and a shoulder, and vertices up its height. */
function skinned(vertices) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const hips = doc.createNode('mixamorig:Hips');
  const neck = doc.createNode('mixamorig:Neck').setTranslation([0, 1, 0]);
  const head = doc.createNode('mixamorig:Head').setTranslation([0, 0.2, 0]);
  const top = doc.createNode('mixamorig:HeadTop_End').setTranslation([0, 0.3, 0]);
  const shoulder = doc.createNode('mixamorig:LeftShoulder').setTranslation([0.2, 0.9, 0]);
  hips.addChild(neck).addChild(shoulder);
  neck.addChild(head);
  head.addChild(top);
  const joints = [hips, neck, head, top, shoulder];
  const bind = new Float32Array(joints.length * 16);
  joints.forEach((joint, i) => {
    const [x, y, z] = joint.getWorldTranslation();
    bind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], i * 16);
  });
  const skin = doc.createSkin().setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(bind).setBuffer(buffer));
  joints.forEach((joint) => skin.addJoint(joint));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(vertices.flatMap((v) => [0, v.y, 0]))).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(Uint8Array.from(vertices.flatMap((v) => v.joints))).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Float32Array.from(vertices.flatMap((v) => v.weights))).setBuffer(buffer));
  const body = doc.createNode('body').setMesh(doc.createMesh().addPrimitive(prim)).setSkin(skin);
  doc.createScene().addChild(hips).addChild(body);
  const at = (i) => ({
    joints: prim.getAttribute('JOINTS_0').getElement(i, []),
    weights: prim.getAttribute('WEIGHTS_0').getElement(i, []).map((w) => Math.round(w * 1e4) / 1e4),
  });
  return { doc, at };
}

test('the head: everything above the base of the skull is held by the head bone alone', () => {
  const HIPS = 0, NECK = 1, HEAD = 2, TOP = 3, SHOULDER = 4;
  const { doc, at } = skinned([
    { y: 1.6, joints: [HEAD, SHOULDER, NECK, HIPS], weights: [0.67, 0.2, 0.13, 0] }, // a hijab's top, as Tripo ties it
    { y: 1.3, joints: [SHOULDER, TOP, HEAD, NECK], weights: [0.3, 0.2, 0.4, 0.1] },
    { y: 1.3, joints: [SHOULDER, NECK, HIPS, HIPS], weights: [0.7, 0.3, 0, 0] }, // never the head's before
    { y: 0.8, joints: [SHOULDER, NECK, HEAD, HIPS], weights: [0.5, 0.3, 0.2, 0] }, // below the neck: left alone
    { y: 1.4, joints: [HEAD, HIPS, HIPS, HIPS], weights: [1, 0, 0, 0] }, // the head's alone already
  ]);
  assert.equal(steadyHead(doc), 3);
  for (const i of [0, 1, 2]) assert.deepEqual(at(i), { joints: [HEAD, 0, 0, 0], weights: [1, 0, 0, 0] });
  assert.deepEqual(at(3), { joints: [SHOULDER, NECK, HEAD, HIPS], weights: [0.5, 0.3, 0.2, 0] });
  assert.deepEqual(at(4), { joints: [HEAD, HIPS, HIPS, HIPS], weights: [1, 0, 0, 0] });
  assert.equal(steadyHead(doc), 0, 'a second pass finds nothing left to do');
});

test('the head: between the neck and the skull the hold eases in, and the other bones keep their shares', () => {
  const HIPS = 0, NECK = 1, HEAD = 2, SHOULDER = 4;
  // The neck joint is at 1 and the head joint at 1.2, so the hold eases in from 1 to 1.25: half way at 1.125.
  const { doc, at } = skinned([
    { y: 1.125, joints: [SHOULDER, NECK, HEAD, HIPS], weights: [0.6, 0.2, 0.2, 0] },
    { y: 1.125, joints: [SHOULDER, NECK, HIPS, HIPS], weights: [0.75, 0.25, 0, 0] },
    { y: 1.125, joints: [SHOULDER, NECK, HIPS, HEAD], weights: [0.4, 0.3, 0.2, 0.1] },
    { y: 1.05, joints: [NECK, HEAD, HIPS, HIPS], weights: [0.5, 0.5, 0, 0] },
  ]);
  steadyHead(doc);
  // 0.2 of the head and half of the rest: 0.6. The shoulder and neck share the other 0.4 three to one.
  assert.deepEqual(at(0), { joints: [HEAD, SHOULDER, NECK, 0], weights: [0.6, 0.3, 0.1, 0] });
  assert.deepEqual(at(1), { joints: [HEAD, SHOULDER, NECK, 0], weights: [0.5, 0.375, 0.125, 0] });
  // Four bones already: the head takes its place and the three strongest others stay.
  assert.deepEqual(at(2), { joints: [HEAD, SHOULDER, NECK, HIPS], weights: [0.55, 0.2, 0.15, 0.1] });
  const low = at(3);
  assert.ok(low.weights[0] > 0.5 && low.weights[0] < 0.6, 'a little above the neck the head gains a little');
  near(low.weights.reduce((a, b) => a + b, 0), 1, 1e-3);
});

console.log(`\n${passed} tests passed`);
