// The companion on screen: the 3D stage when a model exists for it, the flat picture otherwise
// (and while the model loads). three.js only loads when this component mounts.
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { lowPerf } from '../tg/telegram';
import { Gender, STAGE_SCALE, modelKey, nearestModel } from '../lib/companion';
import { Mood } from '../lib/echo';
import { ITEMS, Outfit, Slot, hijabTint, itemById, wornOutfit } from '../lib/wardrobe';
import { EchoAvatar } from '../ui/EchoAvatar';
import { cx } from '../ui/kit';
import { Manifest, loadManifest, manifestNow, modelUrl, webglAvailable } from './models';
import type { Clip, PropSpec, StageController, TapPart } from './types';

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

/** The last picture of the 3D companion, for small avatars elsewhere. */
export function companionSnapshot(): { key: string; url: string } | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as { key: string; url: string }) : null;
  } catch {
    return null;
  }
}

/** The 3D items worn now, as the stage wants them (only those whose file exists). */
export function propsFor(worn: Record<Slot, string>, manifest: Manifest | null): PropSpec[] {
  if (!manifest) return [];
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
export const itemAvailable = (id: string, manifest: Manifest | null): boolean => {
  const item = ITEMS.find((i) => i.id === id);
  return !!item && (!item.model || !!manifest?.[item.model]);
};

export const CompanionStage = forwardRef<CompanionHandle, Props>(function CompanionStage(
  { gender, stage, accent, outfit, mood = 'content', skin, hair, height, onTap, onState, children, className },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const ctl = useRef<StageController | null>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const [state, setState] = useState<StageState>('loading');
  const [manifest, setManifest] = useState<Manifest | null>(manifestNow());
  const worn = useMemo(() => wornOutfit(outfit, gender), [outfit, gender]);
  const sky = itemById(worn.sky)!;
  const tint = hijabTint(worn, gender);

  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);

  const pick = useMemo(
    () => (manifest ? nearestModel(new Set(Object.keys(manifest)), gender, stage) : null),
    [manifest, gender, stage],
  );

  useEffect(() => onState?.(state), [state, onState]);

  useEffect(() => {
    if (!manifest) return;
    if (!pick || !webglAvailable()) {
      setState('flat');
      return;
    }
    let alive = true;
    setState('loading');
    void import('./scene').then(({ createStage }) => {
      if (!alive || !box.current) return;
      const info = manifest[pick.key];
      ctl.current = createStage(box.current, {
        modelUrl: modelUrl(info),
        scale: STAGE_SCALE[pick.stage] ?? 1,
        faceBack: info.faceBack,
        accent,
        lowPower: lowPerf,
        onTap: (part) => tapRef.current?.(part),
        onReady: () => {
          if (!alive) return;
          setState('ready');
          // Keep a still picture for the small avatars (after the first frames have drawn).
          setTimeout(() => {
            const url = ctl.current?.snapshot(240);
            if (!url) return;
            try {
              localStorage.setItem(SNAP_KEY, JSON.stringify({ key: modelKey(gender, stage), url }));
            } catch {
              // storage full: the flat picture stays
            }
          }, 900);
        },
        onError: () => alive && setState('flat'),
      });
      ctl.current.setProps(propsFor(worn, manifest));
      ctl.current.setTint(tint);
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
  }, [manifest, pick?.key]);

  useEffect(() => ctl.current?.setAccent(accent), [accent]);
  useEffect(() => ctl.current?.setProps(propsFor(worn, manifest)), [worn, manifest]);
  useEffect(() => ctl.current?.setTint(tint), [tint]);

  useImperativeHandle(ref, () => ({
    play: (clip) => ctl.current?.play(clip) ?? false,
    has: (clip) => ctl.current?.has(clip) ?? false,
  }), []);

  const skyStyle = sky.id === 'bg-none'
    ? { background: `radial-gradient(60% 55% at 50% 58%, ${accent}38 0%, transparent 72%)` }
    : { background: `linear-gradient(180deg, ${sky.color} 0%, ${sky.color2 ?? sky.color} 100%)` };

  return (
    <div className={cx('cstage', state === 'ready' && 'live', className)} style={{ height }}>
      <div className="cstage-sky" style={skyStyle} />
      <div ref={box} className="cstage-gl" />
      {state !== 'ready' ? (
        <div
          className={cx('cstage-flat', state === 'loading' && 'loading')}
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
