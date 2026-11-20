// Tests for how the animals by the companion move: run with `npx tsx src/companion/pets.test.ts` (part of `npm test`).
import assert from 'node:assert/strict';
import { ACT_SECONDS, PetAct, happyAct, nextAct, petPose } from './pets';
import type { PetMotion } from '../lib/wardrobe';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const KINDS: PetMotion[] = ['hop', 'bounce', 'peck', 'sway', 'stretch', 'rock', 'nod'];
const ACTS = Object.keys(ACT_SECONDS) as PetAct[];

test('pets: every kind and act stays in a small, sane range at every moment', () => {
  for (const kind of KINDS) {
    for (const act of [null, ...ACTS]) {
      for (let since = -0.5; since < 3; since += 0.01) {
        const p = petPose(kind, 10 + since, 1.3, act, since);
        for (const v of Object.values(p)) assert.ok(Number.isFinite(v), `${kind} ${act} ${since}`);
        assert.ok(p.y >= 0 && p.y < 0.12, `${kind} ${act}: lift ${p.y}`);
        assert.ok(Math.abs(p.pitch) < 0.6 && Math.abs(p.yaw) < 0.8 && Math.abs(p.roll) < 0.3, `${kind} ${act}: tilt`);
        assert.ok(p.sy > 0.8 && p.sy < 1.15 && p.sxz > 0.85 && p.sxz < 1.15, `${kind} ${act}: squash ${p.sy} ${p.sxz}`);
      }
    }
  }
});

test('pets: an act ends where the idle is, so nothing snaps when it is over', () => {
  for (const kind of KINDS) {
    for (const act of ACTS) {
      const d = ACT_SECONDS[act];
      for (const at of [0, d - 1e-4, d]) {
        const t = 5 + at;
        const a = petPose(kind, t, 0.7, act, at);
        const idle = petPose(kind, t, 0.7, null, 0);
        for (const k of Object.keys(idle) as (keyof typeof idle)[]) assert.ok(Math.abs(a[k] - idle[k]) < 0.01, `${kind} ${act} at ${at}: ${k}`);
      }
    }
  }
});

test('pets: a hop leaves the ground, and a turn looks toward the companion', () => {
  const mid = petPose('hop', 3, 0, 'hop', ACT_SECONDS.hop * 0.48);
  assert.ok(mid.y > 0.06, 'the bunny is in the air');
  const look = petPose('stretch', 3, 0, 'turn', ACT_SECONDS.turn / 2);
  assert.ok(look.yaw - petPose('stretch', 3, 0, null, 0).yaw > 0.5, 'turned');
});

test('pets: each kind has acts of its own and one to join in with', () => {
  for (const kind of KINDS) {
    assert.ok(ACTS.includes(nextAct(kind, 0)) && ACTS.includes(nextAct(kind, 0.999)));
    assert.ok(ACTS.includes(happyAct(kind)));
  }
  assert.equal(happyAct('hop'), 'hop2');
  assert.equal(happyAct('peck'), 'flutter');
});

console.log(`${passed} tests passed`);
