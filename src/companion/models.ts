// Which 3D files exist. scripts/companion-models.mjs writes public/companion/models.json when it
// processes the Tripo exports, so the app only ever asks for files that are really there.
export interface ModelInfo {
  file: string; // path under /companion/
  bytes: number;
  clips?: string[]; // characters: the motions inside
  faceBack?: boolean; // exported facing away from the camera
}

export type Manifest = Record<string, ModelInfo>;

let pending: Promise<Manifest> | null = null;
let known: Manifest | null = null;

export function loadManifest(): Promise<Manifest> {
  pending ??= fetch('/companion/models.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}))
    .then((m) => {
      known = m;
      return m;
    });
  return pending;
}

/** The manifest if it has loaded already (for render-time checks), otherwise null. */
export const manifestNow = (): Manifest | null => known;

export const modelUrl = (info: ModelInfo): string => `/companion/${info.file}`;

/** WebGL is there and not blocked (some Android WebViews and privacy modes refuse it). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
