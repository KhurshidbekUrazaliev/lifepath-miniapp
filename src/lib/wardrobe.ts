// Wardrobe: things the companion can wear or keep near, bought with Sparks.
// Items with a `model` are 3D files made in Tripo; the shop only offers them once the file exists
// (see src/companion/models.json). Skies are drawn in CSS behind the 3D stage, and hijab colours
// recolour the girl's ivory hijab (companion/scene.ts; the flat picture draws them too).
import type { Gender } from './companion';
import type { Checks, Page, Profile } from './types';
import { writtenDays } from './journal';

export type Slot = 'head' | 'color' | 'face' | 'neck' | 'back' | 'hold' | 'pet' | 'place' | 'sky';

/**
 * Where a 3D item goes. What is worn is fitted to the companion's own measurements (companion/fit.ts),
 * because a toddler's head is almost half its height and a grown-up's under a third:
 * - head: a cap. It comes to rest where the head is as wide as its opening; lengths are in head widths.
 * - face: between the eyes, on the front of the face; lengths are in head widths.
 * - neck, chest, back: the base of the neck, the front of the chest, the surface of the back; lengths are
 *   in chest widths.
 * - ground: beside the companion; the size is in stage units (the grown companion is 1 tall) and the
 *   offset in platform radii.
 * - base: under the companion in place of the platform, with its floor at the platform's height.
 */
export interface Placement {
  anchor: 'head' | 'face' | 'neck' | 'chest' | 'back' | 'ground' | 'base';
  /** The item's longest side. */
  size: number;
  /** A cap's opening, as a share of its longest side. */
  opening?: number;
  /**
   * The point of the item that is put on the anchor, measured from the middle of its underside in units
   * of its longest side (a scarf's is the middle of its ring, a backpack's the side with the straps).
   */
  pivot?: [number, number, number];
  offset?: [number, number, number];
  rotation?: [number, number, number];
  /** How an animal standing by the companion moves (companion/pets.ts). */
  motion?: PetMotion;
}

/** Each animal's way of moving: its idle, and the little things it does now and then. */
export type PetMotion = 'hop' | 'bounce' | 'peck' | 'sway' | 'stretch' | 'rock' | 'nod';

export interface Item {
  id: string;
  slot: Slot;
  price: number; // Sparks; 0 is free only when there is no deed to earn it
  earn?: { by: 'fajr' | 'quran' | 'journal'; n: number };
  color: string; // swatch colours (skies, hijab colours) or the tile tint
  color2?: string;
  minStage?: number; // growth stage needed to buy: 0 little, 1 kid, 2 teen, 3 grown
  gender?: Gender; // only for this companion
  model?: string; // key in models.json
  place?: Placement;
  emoji?: string; // tile picture until the 3D thumbnail exists
}

export const SLOTS: { id: Slot; emoji: string }[] = [
  { id: 'head', emoji: '🧢' },
  { id: 'color', emoji: '🧕' },
  { id: 'face', emoji: '👓' },
  { id: 'neck', emoji: '🧣' },
  { id: 'back', emoji: '🎒' },
  { id: 'hold', emoji: '📖' },
  { id: 'pet', emoji: '🐱' },
  { id: 'place', emoji: '🏝️' },
  { id: 'sky', emoji: '🌅' },
];

// Each worn item's numbers come from its own shape: the kufi's rim is above a rounded underside, the
// graduation cap's tassel pulls its middle to one side, the scarf's ring sits above its two ends.
const KUFI: Placement = { anchor: 'head', size: 0.86, opening: 1, pivot: [0, 0.2, 0] };
const DOPPI: Placement = { anchor: 'head', size: 0.9, opening: 0.97, pivot: [0, 0.04, 0] };
const GRAD_CAP: Placement = { anchor: 'head', size: 1, opening: 0.8, pivot: [0.03, 0.1, 0] };
const CAP: Placement = { anchor: 'head', size: 1.42, opening: 0.69, pivot: [0, 0.035, -0.15], offset: [0, -0.1, 0.02] };
const GLASSES: Placement = { anchor: 'face', size: 0.64, pivot: [0, 0.25, 0.132] };
const SCARF: Placement = { anchor: 'neck', size: 1.15, pivot: [-0.03, 0.67, 0], offset: [0, -0.05, 0.1], rotation: [-0.35, 0, 0] };
const MEDAL: Placement = { anchor: 'chest', size: 0.6, pivot: [0, 0.5, 0], offset: [0, 0.05, 0] };
const BACKPACK: Placement = { anchor: 'back', size: 1.1, pivot: [0, 0.45, -0.42], offset: [0, -0.18, 0.06], rotation: [0, Math.PI, 0] };
const NEAR: Placement = { anchor: 'ground', size: 0.24, offset: [-0.68, 0, 0.3] };
const PET: Placement = { anchor: 'ground', size: 0.3, offset: [0.66, 0, 0.26], rotation: [0, -0.45, 0] };
const BASE: Placement = { anchor: 'base', size: 1.2 };

export const ITEMS: Item[] = [
  // On the head (the girl's hijab stays; caps are for the boy, the graduation cap for both)
  { id: 'head-none', slot: 'head', price: 0, color: '#8B82FF', emoji: '🙂' },
  { id: 'kufi', slot: 'head', price: 60, color: '#F4F1EA', gender: 'boy', model: 'kufi', place: KUFI, emoji: '🧶' },
  { id: 'cap', slot: 'head', price: 80, color: '#5BB8F5', gender: 'boy', model: 'cap', place: CAP, emoji: '🧢' },
  { id: 'doppi', slot: 'head', price: 90, color: '#22232B', color2: '#F4F1EA', gender: 'boy', model: 'doppi', place: DOPPI, emoji: '🎩' },
  { id: 'grad-cap', slot: 'head', price: 220, color: '#24346B', color2: '#F2C14E', minStage: 2, model: 'grad-cap', place: GRAD_CAP, emoji: '🎓' },
  // The girl's hijab colour (ivory is the model's own)
  { id: 'color-ivory', slot: 'color', price: 0, color: '#F1E9DA' },
  { id: 'color-rose', slot: 'color', price: 40, color: '#E2A3B3', gender: 'girl' },
  { id: 'color-sky', slot: 'color', price: 40, color: '#9DC4E6', gender: 'girl' },
  { id: 'color-lilac', slot: 'color', price: 50, color: '#BEA7DD', gender: 'girl' },
  { id: 'color-sand', slot: 'color', price: 60, color: '#D7BE97', gender: 'girl' },
  { id: 'color-teal', slot: 'color', price: 70, color: '#4E9F9C', gender: 'girl' },
  { id: 'color-navy', slot: 'color', price: 90, color: '#2F3B63', gender: 'girl', minStage: 1 },
  { id: 'color-plum', slot: 'color', price: 90, color: '#7A3E62', gender: 'girl', minStage: 1 },
  { id: 'color-black', slot: 'color', price: 120, color: '#2B2B31', gender: 'girl', minStage: 2 },
  // Face
  { id: 'face-none', slot: 'face', price: 0, color: '#8B82FF', emoji: '🙂' },
  { id: 'glasses', slot: 'face', price: 50, color: '#E3B341', model: 'glasses', place: GLASSES, emoji: '👓' },
  // Around the neck (the girl's hijab covers hers, so the scarf is the boy's)
  { id: 'neck-none', slot: 'neck', price: 0, color: '#8B82FF', emoji: '🙂' },
  { id: 'scarf', slot: 'neck', price: 70, color: '#D9534F', color2: '#F4EBDD', gender: 'boy', model: 'scarf', place: SCARF, emoji: '🧣' },
  { id: 'medal', slot: 'neck', price: 150, color: '#F2C14E', minStage: 1, model: 'medal', place: MEDAL, emoji: '🏅' },
  // On the back
  { id: 'back-none', slot: 'back', price: 0, color: '#8B82FF', emoji: '🙂' },
  { id: 'backpack', slot: 'back', price: 90, color: '#7FD1B9', model: 'backpack', place: BACKPACK, emoji: '🎒' },
  // Kept nearby
  { id: 'hold-none', slot: 'hold', price: 0, color: '#8B82FF', emoji: '✋' },
  { id: 'sprout-pot', slot: 'hold', price: 30, color: '#C8794A', model: 'sprout-pot', place: NEAR, emoji: '🪴' },
  { id: 'book', slot: 'hold', price: 40, color: '#1F8A8A', model: 'book', place: NEAR, emoji: '📗' },
  { id: 'football', slot: 'hold', price: 45, color: '#2D3E8F', color2: '#FFFFFF', model: 'football', place: NEAR, emoji: '⚽' },
  { id: 'tasbih', slot: 'hold', price: 50, color: '#8A5A3C', model: 'tasbih', place: NEAR, emoji: '📿' },
  { id: 'notebook', slot: 'hold', price: 0, earn: { by: 'journal', n: 7 }, color: '#8B3FE0', model: 'notebook', place: NEAR, emoji: '📓' },
  { id: 'piyola', slot: 'hold', price: 60, color: '#2F6FD6', color2: '#FFFFFF', model: 'piyola', place: NEAR, emoji: '🍵' },
  { id: 'lantern', slot: 'hold', price: 80, color: '#D9A441', model: 'lantern', place: NEAR, emoji: '🏮' },
  { id: 'rehal', slot: 'hold', price: 0, earn: { by: 'quran', n: 100 }, color: '#B5713A', color2: '#F4EBDD', model: 'rehal', place: NEAR, emoji: '📖' },
  // Pets
  { id: 'pet-none', slot: 'pet', price: 0, color: '#8B82FF', emoji: '🐾' },
  { id: 'scholar', slot: 'pet', price: 120, color: '#F3E2B8', color2: '#E0762B', model: 'scholar', place: { ...PET, motion: 'nod' }, emoji: '🤓' },
  { id: 'dove', slot: 'pet', price: 140, color: '#F5F5F5', model: 'dove', place: { ...PET, motion: 'peck' }, emoji: '🕊️' },
  { id: 'bear', slot: 'pet', price: 160, color: '#C98A4B', model: 'bear', place: { ...PET, motion: 'sway' }, emoji: '🐻' },
  { id: 'kitten', slot: 'pet', price: 180, color: '#F2A65A', model: 'kitten', place: { ...PET, motion: 'stretch' }, emoji: '🐱' },
  { id: 'lamb', slot: 'pet', price: 200, color: '#F4F1EA', model: 'lamb', place: { ...PET, motion: 'bounce' }, emoji: '🐑' },
  { id: 'bunny', slot: 'pet', price: 220, color: '#D9DCE3', model: 'bunny', place: { ...PET, motion: 'hop' }, emoji: '🐰' },
  { id: 'camel', slot: 'pet', price: 260, color: '#D8B27C', minStage: 1, model: 'camel', place: { ...PET, rotation: [0, -1, 0], motion: 'rock' }, emoji: '🐫' },
  // Places to stand on
  { id: 'place-none', slot: 'place', price: 0, color: '#8B82FF', emoji: '⭕' },
  { id: 'base-garden', slot: 'place', price: 150, color: '#7BC86C', model: 'base-garden', place: BASE, emoji: '🌷' },
  { id: 'base-study', slot: 'place', price: 200, color: '#B98A5E', model: 'base-study', place: BASE, emoji: '📚' },
  { id: 'base-masjid', slot: 'place', price: 0, earn: { by: 'fajr', n: 30 }, color: '#C0392B', color2: '#E8C98A', model: 'base-masjid', place: BASE, emoji: '🕌' },
  { id: 'base-bazaar', slot: 'place', price: 240, color: '#D9843B', minStage: 1, model: 'base-bazaar', place: BASE, emoji: '🍉' },
  { id: 'base-courtyard', slot: 'place', price: 250, color: '#2BB5C8', minStage: 1, model: 'base-courtyard', place: BASE, emoji: '🕌' },
  { id: 'base-mountain', slot: 'place', price: 280, color: '#6FBF73', color2: '#FFFFFF', minStage: 1, model: 'base-mountain', place: BASE, emoji: '⛰️' },
  { id: 'base-night', slot: 'place', price: 300, color: '#2A3A7A', minStage: 2, model: 'base-night', place: BASE, emoji: '🌙' },
  // Skies behind the stage
  { id: 'bg-none', slot: 'sky', price: 0, color: '#8B82FF' },
  { id: 'bg-dawn', slot: 'sky', price: 20, color: '#FFD3A5', color2: '#FD6585' },
  { id: 'bg-mint', slot: 'sky', price: 30, color: '#C9F5E4', color2: '#5CC6A7' },
  { id: 'bg-forest', slot: 'sky', price: 60, color: '#9BE7B5', color2: '#2F8F6B' },
  { id: 'bg-ocean', slot: 'sky', price: 80, color: '#9AD8FF', color2: '#2D6CDF' },
  { id: 'bg-night', slot: 'sky', price: 100, color: '#4B3F9E', color2: '#12102E' },
  { id: 'bg-sakura', slot: 'sky', price: 150, color: '#FFD6E6', color2: '#F58CB5' },
  { id: 'bg-desert', slot: 'sky', price: 70, color: '#F8D8A5', color2: '#C8734A' },
  { id: 'bg-lavender', slot: 'sky', price: 90, color: '#EBDDFF', color2: '#8D6BEE' },
  { id: 'bg-turquoise', slot: 'sky', price: 120, color: '#8EE2E7', color2: '#1E6EB1' },
  { id: 'bg-ramadan', slot: 'sky', price: 200, color: '#1D2A6B', color2: '#C9A13B', minStage: 1 },
  { id: 'bg-eid', slot: 'sky', price: 250, color: '#FFF0C1', color2: '#D8991D', minStage: 1 },
  { id: 'bg-aurora', slot: 'sky', price: 300, color: '#5EEAD4', color2: '#7C3AED', minStage: 2 },
];

export const itemById = (id: string | undefined): Item | undefined => ITEMS.find((i) => i.id === id);

export const DEFAULT_OUTFIT: Record<Slot, string> = {
  head: 'head-none',
  color: 'color-ivory',
  face: 'face-none',
  neck: 'neck-none',
  back: 'back-none',
  hold: 'hold-none',
  pet: 'pet-none',
  place: 'place-none',
  sky: 'bg-none',
};

export type Outfit = Partial<Record<Slot, string>>;

/** What is worn in each slot, falling back to the default when an id is unknown or not for this companion. */
export function wornOutfit(outfit: Outfit | undefined, gender: Gender): Record<Slot, string> {
  const out = { ...DEFAULT_OUTFIT };
  // Before the 3D update the sky was called "backdrop".
  const old = (outfit as { backdrop?: string } | undefined)?.backdrop;
  const saved: Outfit = { ...(old && !outfit?.sky ? { sky: old } : {}), ...(outfit ?? {}) };
  for (const slot of Object.keys(DEFAULT_OUTFIT) as Slot[]) {
    const item = itemById(saved[slot]);
    if (item && item.slot === slot && (!item.gender || item.gender === gender)) out[slot] = item.id;
  }
  return out;
}

/** The hijab colour to draw, or null to keep the model's own ivory (and for the boy). */
export function hijabTint(worn: Record<Slot, string>, gender: Gender): string | null {
  if (gender !== 'girl' || worn.color === DEFAULT_OUTFIT.color) return null;
  return itemById(worn.color)?.color ?? null;
}

// ---------- Owning and buying ----------

/**
 * Sparks you can spend. `profile.sparks` is everything ever earned and only grows; what you have bought
 * is the sum of the prices of the items you own, so two devices that each buy something merge correctly.
 * Items that left the catalog cost nothing, so retiring an item gives its Sparks back.
 * `gift` is Sparks the bot's owner gave on top (the server keeps that number, not the profile).
 */
export function sparkBalance(profile: { sparks: number; owned?: string[] }, gift = 0): number {
  const spent = (profile.owned ?? []).reduce((sum, id) => sum + (itemById(id)?.price ?? 0), 0);
  return Math.max(0, profile.sparks + gift - spent);
}

export const isOwned = (profile: { owned?: string[] }, item: Item): boolean =>
  (!item.earn && item.price === 0) || (profile.owned ?? []).includes(item.id);

export type BuyCheck = { ok: true } | { ok: false; reason: 'owned' | 'poor' | 'stage' | 'gender' | 'unknown' | 'earned' };

export function canBuy(profile: { sparks: number; owned?: string[] }, itemId: string, stageIndex: number, gender?: Gender, gift = 0): BuyCheck {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'unknown' };
  if (isOwned(profile, item)) return { ok: false, reason: 'owned' };
  if (item.earn) return { ok: false, reason: 'earned' };
  if (item.gender && gender && item.gender !== gender) return { ok: false, reason: 'gender' };
  if ((item.minStage ?? 0) > stageIndex) return { ok: false, reason: 'stage' };
  if (sparkBalance(profile, gift) < item.price) return { ok: false, reason: 'poor' };
  return { ok: true };
}


type EarnData = { profile: Pick<Profile, 'owned' | 'quranPages'>; worship: Checks; pages: Page[] };

/** Progress toward a deed item. Duplicate diary pages count as one day; notes do not count. */
export function earnProgress(d: EarnData, item: Item): { have: number; need: number } | null {
  if (!item.earn) return null;
  let have = 0;
  if (item.earn.by === 'quran') have = d.profile.quranPages ?? 0;
  else if (item.earn.by === 'journal') have = writtenDays(d.pages).size;
  else for (const month of Object.values(d.worship)) {
    for (let bits = (month.fajr ?? 0) & 0x7fffffff; bits; bits &= bits - 1) have++;
  }
  return { have, need: item.earn.n };
}

/** Only items not already owned are due, so later unticking cannot take a gift back. */
export function earnedItems(d: EarnData): string[] {
  return ITEMS.filter((item) => {
    const p = earnProgress(d, item);
    return p && p.have >= p.need && !isOwned(d.profile, item);
  }).map((item) => item.id);
}
