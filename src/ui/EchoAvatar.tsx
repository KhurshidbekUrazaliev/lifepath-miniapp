import { HAIR_COLORS, Mood, SKIN_TONES } from '../lib/echo';
import { Outfit, hijabTint, itemById, wornOutfit } from '../lib/wardrobe';
import type { Gender } from '../lib/companion';

/** A small four-point sparkle. */
const star = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`;

const SPARKLES: [number, number, number][] = [
  [30, 40, 9], [172, 56, 7], [24, 130, 6], [176, 140, 9], [100, 14, 7],
];

/**
 * The flat picture of the companion: shown while the 3D model loads, where WebGL is missing, and
 * before a 3D model exists for its stage. Same props as the 3D stage, so the two can swap freely.
 */
export function EchoAvatar({
  size = 200,
  skin = 1,
  hair = 0,
  stage = 0,
  mood = 'content',
  outfit,
  accent = '#8B82FF',
  gender = 'boy',
  bare = false,
}: {
  size?: number;
  skin?: number;
  hair?: number;
  stage?: number;
  mood?: Mood;
  outfit?: Outfit;
  accent?: string;
  gender?: Gender;
  bare?: boolean; // no background: the 3D stage draws the sky behind it
}) {
  const skinColor = SKIN_TONES[skin % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[hair % HAIR_COLORS.length];
  const shade = 'rgba(0,0,0,0.08)';
  const worn = wornOutfit(outfit, gender);
  const sky = itemById(worn.sky)!;
  const hasSky = sky.id !== 'bg-none';
  const girl = gender === 'girl';
  const cloth = girl ? '#9DB59A' : '#F4F1EA';
  const scarf = hijabTint(worn, gender) ?? '#F1E9DA';

  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 200 240" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${sky.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.color} />
          <stop offset="1" stopColor={sky.color2 ?? sky.color} />
        </linearGradient>
      </defs>

      {bare ? null : hasSky ? (
        <rect x="0" y="0" width="200" height="240" rx="28" fill={`url(#sky-${sky.id})`} />
      ) : (
        <circle cx="100" cy="125" r="96" fill={accent} opacity={0.14} />
      )}
      {SPARKLES.slice(0, Math.min(stage + 1, 5)).map(([x, y, r], i) => (
        <path key={i} d={star(x, y, r)} fill={accent} opacity={0.9} />
      ))}

      {/* Body: a tunic for the boy, a long dress for the girl */}
      <path d="M38 240 C38 192 68 172 100 172 C132 172 162 192 162 240Z" fill={cloth} />
      {girl ? null : <path d="M100 176 L100 214" stroke="#D9D2C2" strokeWidth="3" strokeLinecap="round" />}

      {/* Neck (covered by the hijab for the girl) */}
      {girl ? null : (
        <>
          <rect x="90" y="150" width="20" height="28" rx="8" fill={skinColor} />
          <rect x="90" y="150" width="20" height="14" rx="6" fill={shade} />
        </>
      )}

      {/* Behind the head: hair, or the hijab falling over the shoulders */}
      {girl ? (
        <path d="M44 118 C44 52 156 52 156 118 C156 150 150 168 140 182 C126 196 74 196 60 182 C50 168 44 150 44 118Z" fill={scarf} />
      ) : (
        <path d="M50 112 C50 54 150 54 150 112 C150 140 142 154 136 160 L64 160 C58 154 50 140 50 112Z" fill={hairColor} />
      )}

      {/* Ears and head */}
      {girl ? null : (
        <>
          <circle cx="53" cy="118" r="8" fill={skinColor} />
          <circle cx="147" cy="118" r="8" fill={skinColor} />
        </>
      )}
      <ellipse cx="100" cy="114" rx={girl ? 41 : 47} ry={girl ? 45 : 50} fill={skinColor} />

      {/* Face */}
      <circle cx="70" cy="130" r="8" fill="#FF8FA3" opacity={0.35} />
      <circle cx="130" cy="130" r="8" fill="#FF8FA3" opacity={0.35} />
      {mood === 'radiant' ? (
        <g>
          <path d="M70 118 Q80 106 90 118" fill="none" stroke="#231A2E" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M110 118 Q120 106 130 118" fill="none" stroke="#231A2E" strokeWidth="4.5" strokeLinecap="round" />
        </g>
      ) : mood === 'resting' ? (
        <g>
          <path d="M70 116 Q80 125 90 116" fill="none" stroke="#231A2E" strokeWidth="4" strokeLinecap="round" />
          <path d="M110 116 Q120 125 130 116" fill="none" stroke="#231A2E" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <ellipse cx="80" cy="118" rx="9" ry="11" fill="#231A2E" />
          <ellipse cx="120" cy="118" rx="9" ry="11" fill="#231A2E" />
          <circle cx="83" cy="113" r="3.2" fill="#FFFFFF" />
          <circle cx="123" cy="113" r="3.2" fill="#FFFFFF" />
        </g>
      )}
      {mood === 'radiant' ? (
        <path d="M90 138 Q100 152 110 138Z" fill="#B04A5A" stroke="#B04A5A" strokeWidth="2" strokeLinejoin="round" />
      ) : (
        <path d="M92 140 Q100 146 108 140" fill="none" stroke="#B04A5A" strokeWidth="3.5" strokeLinecap="round" />
      )}

      {/* Front: the hijab framing the face, or the boy's fringe */}
      {girl ? (
        <path d="M52 112 C52 62 148 62 148 112 C146 84 128 70 100 70 C72 70 54 84 52 112Z" fill={scarf} />
      ) : (
        <path d="M52 108 C54 60 146 60 148 108 C134 86 114 80 100 90 C86 80 66 86 52 108Z" fill={hairColor} />
      )}
    </svg>
  );
}
