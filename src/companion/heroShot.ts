// The companion for a story picture. Home's stage draws it fresh and sharp while it is there; otherwise
// the last picture kept of it stands in (see CompanionStage's snapshots), or nothing when there is none.
import { companionSnapshot } from './CompanionStage';

type Shoot = (width: number) => HTMLCanvasElement | null;
let shoot: Shoot | null = null;

/** Home's hero offers its stage while it is mounted; it passes null when it goes. */
export function offerHeroShot(f: Shoot | null): void {
  shoot = f;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The companion whose model key is `key` ("girl-2"), as large as `width` allows. */
export async function companionPicture(key: string, width: number): Promise<HTMLCanvasElement | HTMLImageElement | null> {
  const fresh = shoot?.(width);
  if (fresh) return fresh;
  const snap = [companionSnapshot('home'), companionSnapshot()].find((s) => s?.key === key);
  return snap ? loadImage(snap.url) : null;
}
