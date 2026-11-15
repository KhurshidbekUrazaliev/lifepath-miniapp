// Fitting what the companion wears. Every character has its own proportions (a toddler's head is almost
// half its height, a grown-up's under a third), so worn items are not placed by fixed numbers: the stage
// measures the character once, standing in its rest pose, and an item says where it goes on that body.
// Nothing here knows about three.js: arrays in, numbers out, so it can be tested without a browser.

export type Vec3 = [x: number, y: number, z: number];

/** A place on the body, and the length that items worn there are sized by. */
export interface Anchor {
  x: number;
  y: number;
  z: number;
  unit: number;
}

/** A thin level of the head: how far it reaches sideways and front to back at that height. */
export interface Slice {
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Body {
  /** The head from the top down (hair or hijab included), its full width and its highest point. */
  head: { slices: Slice[]; width: number; top: number };
  /** Between the eyes, on the front of the face. The unit is the head's width. */
  face: Anchor;
  /** The base of the neck. The unit here and below is the chest's width. */
  neck: Anchor;
  /** The middle of the chest's front surface. */
  chest: Anchor;
  /** The middle of the back's surface. */
  back: Anchor;
}

/** Where the bones stand at rest. */
export interface Joints {
  head: Vec3;
  neck: Vec3;
  chest: Vec3;
  hips: Vec3;
}

export const PART_OTHER = 0;
export const PART_HEAD = 1;
export const PART_TORSO = 2;

/** Which part of the body a bone moves, from its name (Hips, Spine2, Neck, Head, LeftForeArm...). */
export function partOf(boneName: string): number {
  if (/head/i.test(boneName)) return PART_HEAD;
  return /hips|spine|neck|shoulder/i.test(boneName) ? PART_TORSO : PART_OTHER;
}

const SLICES = 32;
/** How far up the head these characters' eyes are, from the base of the skull to the top of the hair. */
const EYES = 0.29;

/**
 * Measures a character from its vertices: `pos` holds x, y, z for each (feet on the ground, facing +z)
 * and `part` says which part of the body moves each one, so that arms held out do not count as chest.
 */
export function measureBody(pos: ArrayLike<number>, part: ArrayLike<number>, joints: Joints): Body {
  const count = Math.floor(pos.length / 3);
  let top = joints.head[1];
  for (let i = 0; i < count; i++) top = Math.max(top, pos[i * 3 + 1]);

  // The head, in thin levels from its bone (the base of the skull) up to the top.
  const from = joints.head[1];
  const step = Math.max(1e-6, (top - from) / SLICES);
  const levels: (Slice | undefined)[] = new Array(SLICES).fill(undefined);
  const rigged = hasPart(part, count, PART_HEAD);
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1];
    if (y < from || (rigged && part[i] !== PART_HEAD)) continue;
    const at = Math.min(SLICES - 1, Math.floor((y - from) / step));
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const level = (levels[at] ??= { y: from + (at + 0.5) * step, x0: x, x1: x, z0: z, z1: z });
    level.x0 = Math.min(level.x0, x);
    level.x1 = Math.max(level.x1, x);
    level.z0 = Math.min(level.z0, z);
    level.z1 = Math.max(level.z1, z);
  }
  const slices = levels.filter((l): l is Slice => !!l).reverse();
  const width = slices.reduce((w, l) => Math.max(w, l.x1 - l.x0), 0);
  // The face: the front of the head at the height of the eyes.
  const eyes = from + (top - from) * EYES;
  const brow = slices.reduce<Slice | undefined>((best, l) => (!best || Math.abs(l.y - eyes) < Math.abs(best.y - eyes) ? l : best), undefined);
  const face = brow
    ? { x: (brow.x0 + brow.x1) / 2, y: eyes, z: brow.z1, unit: width }
    : { x: joints.head[0], y: eyes, z: joints.head[2], unit: width };

  // The chest: a band around the chest bone, a fifth of the torso tall.
  const torso = Math.max(1e-6, joints.neck[1] - joints.hips[1]);
  const lo = joints.chest[1] - torso * 0.1;
  const hi = joints.chest[1] + torso * 0.1;
  const band = (only: boolean) => {
    const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 };
    for (let i = 0; i < count; i++) {
      const y = pos[i * 3 + 1];
      if (y < lo || y > hi || (only && part[i] !== PART_TORSO)) continue;
      b.x0 = Math.min(b.x0, pos[i * 3]);
      b.x1 = Math.max(b.x1, pos[i * 3]);
      b.z0 = Math.min(b.z0, pos[i * 3 + 2]);
      b.z1 = Math.max(b.z1, pos[i * 3 + 2]);
      b.n++;
    }
    return b;
  };
  let chest = band(true);
  if (chest.n < 8) chest = band(false); // no rig to tell the arms apart: everything at that height
  if (chest.n < 8) {
    // Nothing there at all: a guess from the bones, so that an item still lands on the body.
    const half = torso * 0.3;
    chest = { x0: joints.chest[0] - half, x1: joints.chest[0] + half, z0: joints.chest[2] - half, z1: joints.chest[2] + half, n: 0 };
  }
  const unit = chest.x1 - chest.x0;
  const mid = (chest.x0 + chest.x1) / 2;
  return {
    head: { slices, width, top },
    face,
    neck: { x: joints.neck[0], y: joints.neck[1], z: joints.neck[2], unit },
    chest: { x: mid, y: joints.chest[1], z: chest.z1, unit },
    back: { x: mid, y: joints.chest[1], z: chest.z0, unit },
  };
}

function hasPart(part: ArrayLike<number>, count: number, wanted: number): boolean {
  for (let i = 0; i < count; i++) if (part[i] === wanted) return true;
  return false;
}

/**
 * Where a cap comes to rest: it slides down the head until the head is as wide as its opening.
 * `depth` is how deep the head is there compared with its width, so a round cap can be stretched to cover
 * a head that is longer front to back.
 */
export function restCap(head: Body['head'], opening: number): { x: number; y: number; z: number; depth: number } | null {
  const { slices } = head;
  if (!slices.length) return null;
  const wide = (l: Slice) => l.x1 - l.x0;
  // A cap wider than the whole head stops at the widest level instead of falling over the face.
  let at = slices.findIndex((l) => wide(l) >= opening);
  if (at < 0) at = slices.reduce((best, l, i) => (wide(l) > wide(slices[best]) ? i : best), 0);
  const level = slices[at];
  const above = slices[at - 1];
  // Between two levels the rim sits in proportion to how far the opening is between their widths.
  const share = above && wide(level) > wide(above) ? clamp01((wide(level) - opening) / (wide(level) - wide(above))) : 0;
  const mix = (a: number, b: number) => a + (b - a) * share;
  const here = (l: Slice) => ({ x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, deep: l.z1 - l.z0 });
  const a = here(level);
  const b = above ? here(above) : a;
  const width = Math.max(1e-6, mix(wide(level), above ? wide(above) : wide(level)));
  return { x: mix(a.x, b.x), y: mix(level.y, above ? above.y : level.y), z: mix(a.z, b.z), depth: mix(a.deep, b.deep) / width };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
