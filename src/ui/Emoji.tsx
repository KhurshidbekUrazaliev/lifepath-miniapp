// An emoji drawn as its Fluent 3D picture (public/emoji/, see scripts/fetch-emoji.mjs) or, when there
// is none (a flag, an emoji someone typed), as text. It is sized in em, so it takes the place of the
// text emoji it replaces without any layout changes.
import { EMOJI_FILES } from './emojiMap';

export const emojiFile = (e: string): string | undefined => EMOJI_FILES[e.replace(/️/g, '')];

export function Emoji({ e, size, className }: { e: string; size?: number; className?: string }) {
  const file = emojiFile(e);
  if (!file) return <>{e}</>;
  return (
    <img
      className={className ? `emoji3d ${className}` : 'emoji3d'}
      src={`/emoji/${file}.webp`}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      style={size ? { width: size, height: size } : undefined}
    />
  );
}
