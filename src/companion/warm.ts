// Gets the 3D companion ready before a screen shows it. three.js and the companion's model are the two
// big downloads of the app. Started once the app is up, they are in memory by the time the companion's
// screen opens, so the screen does not wait for the network.
import { Gender, nearestModel } from '../lib/companion';
import { Outfit, wornOutfit } from '../lib/wardrobe';
import { MANIFEST, modelUrl, propsFor, webglAvailable } from './models';

/** Someone who asked their phone to save data gets nothing ahead of time. */
const savingData = (): boolean => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * Loads three.js, and for someone who has a companion its model and the 3D things it wears.
 * Safe to call again when the companion grows or changes clothes: what is already there is not fetched twice.
 */
export function warmCompanion(gender: Gender | undefined, stage: number, outfit: Outfit | undefined): void {
  if (savingData() || !webglAvailable()) return;
  const pick = gender ? nearestModel(new Set(Object.keys(MANIFEST)), gender, stage) : null;
  const urls = pick && gender ? [modelUrl(MANIFEST[pick.key]), ...propsFor(wornOutfit(outfit, gender)).map((p) => p.url)] : [];
  void import('./scene').then(({ preload }) => urls.forEach(preload)).catch(() => undefined);
}
