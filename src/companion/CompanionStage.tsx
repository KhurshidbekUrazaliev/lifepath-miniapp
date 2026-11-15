// The companion on screen: the 3D stage when a model exists for it, the flat picture on a phone that
// cannot draw 3D. three.js loads when this component mounts, unless the app has warmed it up already
// (see warm.ts).
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { lowPerf } from '../tg/telegram';
import { Gender, STAGE_SCALE, modelKey, nearestModel } from '../lib/companion';
import { Mood } from '../lib/echo';
import { Outfit, hijabTint, itemById, wornOutfit } from '../lib/wardrobe';
import { EchoAvatar } from '../ui/EchoAvatar';
import { cx } from '../ui/kit';
import { MANIFEST, modelUrl, propsFor, webglAvailable } from './models';
import type { Clip, StageController, TapPart } from './types';

export interface CompanionHandle {
  play: (clip: Clip) => boolean;
  has: (clip: Clip) => boolean;
}

interface Props {
  gender: Gender;
  stage: number;
  accent: string;
  outfit?: Outfit;
  mood?: Mood;
  skin?: number;
  hair?: number;
  height: number;
  onTap?: (part: TapPart) => void;
  onState?: (state: StageState) => void;
  children?: ReactNode; // overlays (speech bubble, effects)
  className?: string;
}

export type StageState = 'loading' | 'ready' | 'flat';

const SNAP_KEY = 'lp:companion:snap';

interface Snapshot {
  key: string; // whose picture it is: "girl-2"
  url: string;
  look?: string; // everything that shows in it: the model's file, the colours, what is worn
}

/** The last picture of the 3D companion, for small avatars elsewhere. */
export function companionSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

/** Keeps a picture of the stage. Phones that cannot write WebP would keep a heavy PNG, so theirs is smaller. */
function keepSnapshot(picture: HTMLCanvasElement, key: string, look: string): void {
  try {
    let url = picture.toDataURL('image/webp', 0.86);
    if (!url.startsWith('data:image/webp')) {
      const small = document.createElement('canvas');
      small.width = 260;
      small.height = Math.round((260 * picture.height) / picture.width);
      small.getContext('2d')!.drawImage(picture, 0, 0, small.width, small.height);
      url = small.toDataURL('image/png');
    }
    localStorage.setItem(SNAP_KEY, JSON.stringify({ key, url, look } satisfies Snapshot));
  } catch {
    // storage full or blocked: the picture from before stays
  }
}

export const CompanionStage = forwardRef<CompanionHandle, Props>(function CompanionStage(
  { gender, stage, accent, outfit, mood = 'content', skin, hair, height, onTap, onState, children, className },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const ctl = useRef<StageController | null>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const worn = useMemo(() => wornOutfit(outfit, gender), [outfit, gender]);
  const sky = itemById(worn.sky)!;
  const tint = hijabTint(worn, gender);
  const props3d = useMemo(() => propsFor(worn), [worn]);
  const pick = useMemo(() => nearestModel(new Set(Object.keys(MANIFEST)), gender, stage), [gender, stage]);
  const info = pick ? MANIFEST[pick.key] : null;
  const [state, setState] = useState<StageState>(() => (info && webglAvailable() ? 'loading' : 'flat'));

  // Everything that shows in the stage's first frame. The companion always starts in the same pose, so when
  // all of this is as it was last time, last time's first frame stands in while the stage gets going.
  const look = info ? [info.file, accent, tint ?? '', ...props3d.map((p) => p.url)].join('|') : '';
  const poster = useMemo(() => {
    if (state !== 'loading') return null;
    const last = companionSnapshot();
    return last?.look === look ? last.url : null;
  }, [state, look]);
  const now = useRef({ accent, tint, props3d, look });
  now.current = { accent, tint, props3d, look };

  useEffect(() => onState?.(state), [state, onState]);

  useEffect(() => {
    if (!pick || !info || !webglAvailable()) {
      setState('flat');
      return;
    }
    let alive = true;
    setState('loading');
    void import('./scene').then(({ createStage }) => {
      if (!alive || !box.current) return;
      const start = now.current;
      ctl.current = createStage(box.current, {
        modelUrl: modelUrl(info),
        scale: STAGE_SCALE[pick.stage] ?? 1,
        faceBack: info.faceBack,
        accent: start.accent,
        lowPower: lowPerf,
        onTap: (part) => tapRef.current?.(part),
        onReady: () => {
          if (!alive) return;
          // The first frame, for the small avatars and for next time. Copied now, while it is the first
          // frame, and written a moment later, when it no longer competes with the stage starting up.
          const picture = ctl.current?.still(480);
          if (picture) setTimeout(() => keepSnapshot(picture, modelKey(gender, stage), start.look), 700);
          setState('ready');
        },
        onError: () => alive && setState('flat'),
      });
      ctl.current.setProps(start.props3d);
      ctl.current.setTint(start.tint);
      // Development only: lets the preview play motions from the console.
      if (import.meta.env.DEV) (window as unknown as { __lpStage?: StageController | null }).__lpStage = ctl.current;
    });
    return () => {
      alive = false;
      ctl.current?.dispose();
      ctl.current = null;
    };
    // The stage is rebuilt only when the model changes; colours and items update in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.key]);

  useEffect(() => ctl.current?.setAccent(accent), [accent]);
  useEffect(() => ctl.current?.setProps(props3d), [props3d]);
  useEffect(() => ctl.current?.setTint(tint), [tint]);

  useImperativeHandle(ref, () => ({
    play: (clip) => ctl.current?.play(clip) ?? false,
    has: (clip) => ctl.current?.has(clip) ?? false,
  }), []);

  const skyStyle = sky.id === 'bg-none'
    ? { background: `radial-gradient(60% 55% at 50% 58%, ${accent}38 0%, transparent 72%)` }
    : { background: `linear-gradient(180deg, ${sky.color} 0%, ${sky.color2 ?? sky.color} 100%)` };

  return (
    <div className={cx('cstage', state === 'ready' && 'live', poster && 'still', className)} style={{ height }}>
      <div className="cstage-sky" style={skyStyle} />
      <div ref={box} className="cstage-gl" />
      {state === 'loading' ? (
        poster ? (
          <img className="cstage-poster" src={poster} alt="" draggable={false} />
        ) : (
          <div className="cstage-wait" style={{ color: accent }} />
        )
      ) : null}
      {state === 'flat' ? (
        <div
          className="cstage-flat"
          onClick={(ev) => {
            // The flat picture's head is in the upper half of the stage.
            const r = ev.currentTarget.getBoundingClientRect();
            tapRef.current?.((ev.clientY - r.top) / r.height < 0.48 ? 'head' : 'body');
          }}
        >
          <EchoAvatar size={Math.round(height * 0.62)} skin={skin} hair={hair} stage={stage} mood={mood} outfit={outfit} accent={accent} gender={gender} bare />
        </div>
      ) : null}
      {children}
    </div>
  );
});
