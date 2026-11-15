// Shared between the lazy three.js stage and the React side (so React never imports three).
import type { Placement } from '../lib/wardrobe';

export type Clip = 'idle' | 'wave' | 'talk' | 'cheer' | 'think' | 'nod' | 'read' | 'dua';
export type TapPart = 'head' | 'body';

/** A wardrobe item drawn in 3D: its file, and where it goes (see Placement in lib/wardrobe.ts). */
export type PropSpec = Placement & { id: string; url: string };

export interface StageOptions {
  modelUrl: string;
  /** The companion's height relative to the grown stage (younger stages stand smaller). */
  scale: number;
  /** Turn the model around if it was exported facing away from the camera. */
  faceBack?: boolean;
  accent: string;
  lowPower: boolean;
  onTap?: (part: TapPart) => void;
  onReady?: () => void;
  onError?: (e: unknown) => void;
}

export interface StageController {
  /** Plays a motion; one-shot motions return to idle. False when the model has no such motion. */
  play: (clip: Clip, o?: { loop?: boolean }) => boolean;
  has: (clip: Clip) => boolean;
  setAccent: (hex: string) => void;
  setProps: (props: PropSpec[]) => void;
  /** Recolours the girl's ivory hijab (null puts the ivory back). */
  setTint: (hex: string | null) => void;
  /** A still picture of the stage (for the small avatar elsewhere in the app). */
  snapshot: (size: number) => string | null;
  dispose: () => void;
}
