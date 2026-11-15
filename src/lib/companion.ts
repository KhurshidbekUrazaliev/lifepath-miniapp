// The 3D companion grows up with your level: little, kid, teen, grown. Pure rules, unit tested.
import { levelInfo, xpForLevel } from './gamify';

export type Gender = 'boy' | 'girl';

/** The level at which each growth stage begins. */
export const GROWTH_LEVELS = [1, 5, 10, 20] as const;
export const GROWTH_IDS = ['little', 'kid', 'teen', 'grown'] as const;
export type GrowthId = (typeof GROWTH_IDS)[number];

/** How tall each stage stands next to the grown one (the camera never moves, so growing shows). */
export const STAGE_SCALE = [0.6, 0.76, 0.9, 1] as const;

export interface Growth {
  index: number; // 0 little ... 3 grown
  id: GrowthId;
  level: number;
  nextLevel?: number; // level of the next stage
  ratio: number; // XP progress from this stage to the next (1 when grown)
  xpToNext: number; // XP still needed for the next stage (0 when grown)
}

export function growthFor(xp: number): Growth {
  const level = levelInfo(xp).level;
  let index = 0;
  while (index + 1 < GROWTH_LEVELS.length && level >= GROWTH_LEVELS[index + 1]) index++;
  const last = index === GROWTH_LEVELS.length - 1;
  const start = xpForLevel(GROWTH_LEVELS[index]);
  const end = last ? start : xpForLevel(GROWTH_LEVELS[index + 1]);
  return {
    index,
    id: GROWTH_IDS[index],
    level,
    nextLevel: last ? undefined : GROWTH_LEVELS[index + 1],
    ratio: last ? 1 : Math.min(1, Math.max(0, (xp - start) / (end - start))),
    xpToNext: last ? 0 : Math.max(0, end - xp),
  };
}

/** The model file for a companion: "boy-1" ... "girl-4". */
export const modelKey = (gender: Gender, stage: number): string => `${gender}-${stage + 1}`;

/**
 * The model to show when the exact one is not there yet: the nearest stage of the same gender,
 * preferring a younger one (a companion should never look older than it is), then any stage.
 */
export function nearestModel(available: Set<string>, gender: Gender, stage: number): { key: string; stage: number } | null {
  const order: number[] = [stage];
  for (let d = 1; d < GROWTH_LEVELS.length; d++) order.push(stage - d, stage + d);
  for (const s of order) {
    if (s < 0 || s >= GROWTH_LEVELS.length) continue;
    const key = modelKey(gender, s);
    if (available.has(key)) return { key, stage: s };
  }
  return null;
}
