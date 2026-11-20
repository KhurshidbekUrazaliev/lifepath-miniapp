// The animals by the companion are single meshes without bones, so they move as a whole: they breathe,
// each has an idle of its own (the bear sways, the camel rocks, the scholar nods), and now and then they
// do something (the bunny hops twice, the dove pecks, the kitten stretches). They hop along when the
// companion cheers, and jump when touched. Pure: `petPose` turns a moment into a pose, so it can be tested.
import type { PetMotion } from '../lib/wardrobe';

/** Something an animal does for a moment, over its idle. */
export type PetAct = 'hop' | 'hop2' | 'bounce3' | 'peck' | 'flutter' | 'stretch' | 'turn' | 'shake';

/** How the animal stands now, relative to where it was put: lifted, tilted, turned and squashed. */
export interface PetPose {
  y: number; // lift, in stage units
  pitch: number; // forward (+) and back, radians
  yaw: number; // turn, radians (+ toward the companion)
  roll: number; // side to side, radians
  sy: number; // height scale
  sxz: number; // width and depth scale
}

/** What each kind does now and then, and how high its hop is (stage units; the animals are 0.3 long). */
const KINDS: Record<PetMotion, { acts: PetAct[]; hop: number }> = {
  hop: { acts: ['hop2', 'hop2', 'turn', 'shake'], hop: 0.085 },
  bounce: { acts: ['bounce3', 'hop', 'turn'], hop: 0.06 },
  peck: { acts: ['peck', 'peck', 'flutter', 'turn'], hop: 0.07 },
  sway: { acts: ['turn', 'hop', 'shake'], hop: 0.035 },
  stretch: { acts: ['stretch', 'hop', 'turn'], hop: 0.07 },
  rock: { acts: ['turn', 'shake'], hop: 0.02 },
  nod: { acts: ['peck', 'hop', 'turn'], hop: 0.04 },
};

/** How long each act lasts, in seconds. */
export const ACT_SECONDS: Record<PetAct, number> = {
  hop: 0.6,
  hop2: 1.05,
  bounce3: 1.2,
  peck: 0.8,
  flutter: 0.9,
  stretch: 1.6,
  turn: 2.6,
  shake: 0.7,
};

/** The animal's way of picking its next act (the happy one when it joins in). */
export function nextAct(kind: PetMotion, roll: number): PetAct {
  const acts = KINDS[kind].acts;
  return acts[Math.min(acts.length - 1, Math.floor(roll * acts.length))];
}

/** The act an animal does to join in when the companion cheers or is touched. */
export const happyAct = (kind: PetMotion): PetAct => (kind === 'rock' ? 'shake' : kind === 'hop' ? 'hop2' : kind === 'bounce' ? 'bounce3' : kind === 'peck' ? 'flutter' : 'hop');

const ease = (u: number) => u * u * (3 - 2 * u);
const bump = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));

/** One hop over u in 0..1: a crouch, the jump (stretched), a squash on landing. */
function hop(u: number, h: number): { y: number; s: number } {
  if (u < 0.15) return { y: 0, s: 1 - 0.14 * bump(u / 0.15) };
  if (u < 0.82) {
    const a = (u - 0.15) / 0.67;
    return { y: h * bump(a), s: 1 + 0.08 * bump(a) };
  }
  return { y: 0, s: 1 - 0.1 * bump((u - 0.82) / 0.18) };
}

/**
 * The pose at time `t` (seconds). `phase` keeps two animals from moving in step; `act` is what it is
 * doing, begun `since` seconds ago (none, or one that is over, leaves only the idle).
 */
export function petPose(kind: PetMotion, t: number, phase: number, act: PetAct | null, since: number): PetPose {
  const k = KINDS[kind];
  const breath = Math.sin(t * 2.3 + phase) * 0.018;
  const p: PetPose = { y: 0, pitch: 0, yaw: 0, roll: 0, sy: 1 + breath, sxz: 1 - breath * 0.5 };

  // Its own idle.
  switch (kind) {
    case 'sway':
      p.roll = Math.sin(t * 1.3 + phase) * 0.07;
      p.yaw = Math.sin(t * 0.55 + phase) * 0.08;
      break;
    case 'rock':
      p.pitch = Math.sin(t * 1.5 + phase) * 0.035;
      p.y = Math.abs(Math.sin(t * 1.5 + phase)) * 0.006;
      p.yaw = Math.sin(t * 0.4 + phase) * 0.1;
      break;
    case 'nod':
      p.pitch = Math.max(0, Math.sin(t * 1.2 + phase)) * 0.09;
      break;
    case 'peck':
      p.y = Math.abs(Math.sin(t * 2.6 + phase)) * 0.005;
      p.roll = Math.sin(t * 1.7 + phase) * 0.03;
      break;
    case 'stretch':
      p.roll = Math.sin(t * 0.9 + phase) * 0.035;
      p.yaw = Math.sin(t * 0.5 + phase) * 0.06;
      break;
    case 'hop':
    case 'bounce':
      p.y = Math.max(0, Math.sin(t * 3.1 + phase)) * 0.004; // a twitch of readiness
      p.pitch = Math.sin(t * 1.4 + phase) * 0.025;
      break;
  }

  if (!act) return p;
  const u = since / ACT_SECONDS[act];
  if (u < 0 || u >= 1) return p;
  switch (act) {
    case 'hop': {
      const j = hop(u, k.hop);
      p.y += j.y;
      p.sy *= j.s;
      p.sxz /= Math.sqrt(j.s);
      break;
    }
    case 'hop2':
    case 'bounce3': {
      const n = act === 'hop2' ? 2 : 3;
      const i = Math.min(n - 1, Math.floor(u * n));
      const j = hop(u * n - i, k.hop * (i === 0 ? 1 : act === 'hop2' ? 0.7 : 0.8));
      p.y += j.y;
      p.sy *= j.s;
      p.sxz /= Math.sqrt(j.s);
      p.pitch += -0.12 * bump(u * n - i); // nose up in the air
      break;
    }
    case 'peck': {
      // Two quick dips forward.
      const i = Math.floor(u * 2);
      p.pitch += 0.42 * bump(u * 2 - i);
      break;
    }
    case 'flutter': {
      const j = hop(u, k.hop);
      p.y += j.y;
      p.roll += Math.sin(u * Math.PI * 14) * 0.12 * bump(u);
      p.sy *= j.s;
      break;
    }
    case 'stretch': {
      // Long and low, then back.
      const s = bump(u);
      p.sy *= 1 - 0.14 * s;
      p.sxz *= 1 + 0.1 * s;
      p.pitch += -0.1 * s;
      break;
    }
    case 'turn': {
      // A look over at the companion, held, then back.
      const s = u < 0.3 ? ease(u / 0.3) : u > 0.7 ? ease((1 - u) / 0.3) : 1;
      p.yaw += 0.55 * s;
      break;
    }
    case 'shake':
      p.roll += Math.sin(u * Math.PI * 8) * 0.1 * bump(u);
      break;
  }
  return p;
}
