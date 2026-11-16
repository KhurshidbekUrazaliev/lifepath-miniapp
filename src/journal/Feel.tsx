// The five feelings as small round faces. Drawn here, not taken from an emoji set, so the five belong
// together and to the app, stay sharp at any size, and look the same on every phone.
import { CSSProperties, useId } from 'react';
import { Feeling } from '../lib/types';
import { FEEL, FEELINGS } from '../lib/journal';
import { Key, t } from '../i18n';
import { Tap, cx } from '../ui/kit';

export const feelName = (feel: Feeling): string => t(`feel.${FEEL[feel].name}` as Key);

export function Face({ feel, size = 36 }: { feel: Feeling; size?: number }) {
  const id = useId().replace(/:/g, '');
  const { color, light } = FEEL[feel];
  const ink = '#161c38';
  const line = { fill: 'none', stroke: ink, strokeWidth: 2.5, strokeLinecap: 'round' as const };
  const eyes = (y: number) => (
    <>
      <circle cx="14.2" cy={y} r="2.05" fill={ink} />
      <circle cx="25.8" cy={y} r="2.05" fill={ink} />
    </>
  );
  return (
    <svg className="face" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={`face${id}`} cx="0.34" cy="0.26" r="0.9">
          <stop offset="0" stopColor={light} />
          <stop offset="0.6" stopColor={color} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#face${id})`} />
      <circle cx="20" cy="20" r="18.4" fill="none" stroke="#fff" strokeOpacity="0.42" strokeWidth="1.2" />
      {feel === 5 ? (
        <>
          <path d="M11.2 17.6q3-3.8 6 0M22.8 17.6q3-3.8 6 0" {...line} />
          <path d="M12.4 22.6Q20 32.6 27.6 22.6Z" fill={ink} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        </>
      ) : feel === 4 ? (
        <>
          {eyes(16.8)}
          <path d="M13.4 23.4Q20 29.8 26.6 23.4" {...line} />
        </>
      ) : feel === 3 ? (
        <>
          {eyes(17)}
          <path d="M14.6 25.4H25.4" {...line} />
        </>
      ) : feel === 2 ? (
        <>
          {eyes(17.4)}
          <path d="M14.2 27Q20 22.8 25.8 27" {...line} />
        </>
      ) : (
        <>
          {eyes(18.6)}
          <path d="M10.8 15.2l5.4-2.3M29.2 15.2l-5.4-2.3" {...line} strokeWidth={2.1} />
          <path d="M14 28.4Q20 22.4 26 28.4" {...line} />
        </>
      )}
    </svg>
  );
}

/** The five faces in a row. The one picked is ringed and the others step back. */
export function FeelBar({ value, onPick, size = 28 }: { value?: Feeling; onPick: (feel: Feeling) => void; size?: number }) {
  return (
    <div className="feelbar" role="radiogroup" aria-label={t('feel.ask')}>
      {FEELINGS.map((feel) => (
        <Tap
          key={feel}
          className={cx('feel', value === feel && 'on', value !== undefined && value !== feel && 'dim')}
          style={{ '--fc': FEEL[feel].color, width: size + 6, height: size + 6 } as CSSProperties}
          onTap={() => onPick(feel)}
          hap="select"
          label={feelName(feel)}
          scale={0.86}
        >
          <Face feel={feel} size={size} />
        </Tap>
      ))}
    </div>
  );
}
