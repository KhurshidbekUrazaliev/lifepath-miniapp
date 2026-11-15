// Which 3D files exist. scripts/companion-models.mjs writes models.json (next to this file) when it
// processes the Tripo exports. The list is built into the app, so it always matches the files deployed
// with it and nothing has to be fetched before the companion can start loading.
import { ITEMS, Slot, itemById } from '../lib/wardrobe';
import list from './models.json';
import type { PropSpec } from './types';

export interface ModelInfo {
  file: string; // path under /companion/
  bytes: number;
  clips?: string[]; // characters: the motions inside
  faceBack?: boolean; // exported facing away from the camera
}

export type Manifest = Record<string, ModelInfo>;

export const MANIFEST: Manifest = list;

export const modelUrl = (info: ModelInfo): string => `/companion/${info.file}`;

/** The 3D items worn now, as the stage wants them (only those whose file exists). */
export function propsFor(worn: Record<Slot, string>, manifest: Manifest = MANIFEST): PropSpec[] {
  const out: PropSpec[] = [];
  for (const id of Object.values(worn)) {
    const item = itemById(id);
    if (!item?.model || !item.place) continue;
    const info = manifest[item.model];
    if (!info) continue;
    out.push({ id: item.id, url: modelUrl(info), ...item.place });
  }
  return out;
}

/** Whether the 3D file for an item exists (items without a file are not offered yet). */
export const itemAvailable = (id: string, manifest: Manifest = MANIFEST): boolean => {
  const item = ITEMS.find((i) => i.id === id);
  return !!item && (!item.model || !!manifest[item.model]);
};

let webgl: boolean | null = null;

/** WebGL is there and not blocked (some Android WebViews and privacy modes refuse it). */
export function webglAvailable(): boolean {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
