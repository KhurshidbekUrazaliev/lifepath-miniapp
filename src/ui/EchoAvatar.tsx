import { HAIR_COLORS, Mood, SKIN_TONES } from '../lib/echo';
import { DEFAULT_OUTFIT, Outfit, itemById } from '../lib/wardrobe';

/** A small four-point sparkle. */
const star = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`;

const SPARKLES: [number, number, number][] = [
  [30, 40, 9], [172, 56, 7], [24, 130, 6], [176, 140, 9], [100, 14, 7],
];

/**
 * Placeholder Echo, drawn from simple shapes. The real art replaces this component in 1.0;
 * the props (look, stage, mood, outfit) are what the final character will use too.
 */
export function EchoAvatar({
  size = 200,
  skin = 1,
  hair = 0,
  stage = 0,
  mood = 'content',
  outfit,
  accent = '#8B82FF',
}: {
  size?: number;
  skin?: number;
  hair?: number;
  stage?: number;
  mood?: Mood;
  outfit?: Outfit;
  accent?: string;
}) {
  const skinColor = SKIN_TONES[skin % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[hair % HAIR_COLORS.length];
  const shade = 'rgba(0,0,0,0.08)';
  const o = { ...DEFAULT_OUTFIT, ...(outfit ?? {}) };
  const top = itemById(o.top)!;
  const hat = itemById(o.hat)!;
  const acc = itemById(o.accessory)!;
  const bg = itemById(o.backdrop)!;
  const hasBackdrop = bg.id !== 'bg-none';

  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 200 240">
      <defs>
        <linearGradient id={`bg-${bg.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg.color} />
          <stop offset="1" stopColor={bg.color2 ?? bg.color} />
        </linearGradient>
      </defs>

      {/* Scene */}
      {hasBackdrop ? (
        <rect x="0" y="0" width="200" height="240" rx="28" fill={`url(#bg-${bg.id})`} />
      ) : (
        <circle cx="100" cy="125" r="96" fill={accent} opacity={0.14} />
      )}
      {bg.id === 'bg-night' || bg.id === 'bg-aurora'
        ? SPARKLES.map(([x, y, r], i) => <path key={i} d={star(x, y, r * 0.6)} fill="#FFFFFF" opacity={0.85} />)
        : null}
      {bg.id === 'bg-sakura'
        ? [[28, 50], [170, 80], [40, 170], [160, 190], [100, 30]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="6" ry="3.5" fill="#FFFFFF" opacity={0.8} transform={`rotate(${30 * i} ${x} ${y})`} />
          ))
        : null}
      {bg.id === 'bg-forest'
        ? [[20, 200], [60, 215], [150, 210], [185, 195]].map(([x, y], i) => (
            <path key={i} d={`M${x - 14} 240 L${x} ${y - 70} L${x + 14} 240Z`} fill="#1F6B50" opacity={0.55} />
          ))
        : null}

      {/* Stage sparkles: one more for each stage reached */}
      {SPARKLES.slice(0, Math.min(stage, 5)).map(([x, y, r], i) => (
        <path key={i} d={star(x, y, r)} fill={accent} opacity={0.9} />
      ))}

      {/* Wings sit behind the body */}
      {acc.id === 'acc-wings' ? (
        <g opacity={0.95}>
          <path d="M62 190 C10 170 8 110 30 96 C34 130 54 150 70 160Z" fill={acc.color} stroke={acc.color2} strokeWidth="3" />
          <path d="M138 190 C190 170 192 110 170 96 C166 130 146 150 130 160Z" fill={acc.color} stroke={acc.color2} strokeWidth="3" />
        </g>
      ) : null}

      {/* Hood and cloak go behind the neck */}
      {top.id === 'top-hoodie' ? <path d="M56 196 C50 160 70 146 100 146 C130 146 150 160 144 196Z" fill={top.color2} /> : null}
      {top.id === 'top-cloak' ? <path d="M24 240 C28 180 62 160 100 160 C138 160 172 180 176 240Z" fill={top.color2 ?? top.color} opacity={0.35} /> : null}

      {/* Body */}
      <path d="M38 240 C38 192 68 172 100 172 C132 172 162 192 162 240Z" fill={top.color} />
      {top.id === 'top-bomber' ? (
        <g>
          <path d="M100 172 L100 240" stroke={top.color2} strokeWidth="4" />
          <path d="M38 240 C38 222 40 214 44 206 L52 232Z" fill={top.color2} opacity={0.9} />
          <path d="M162 240 C162 222 160 214 156 206 L148 232Z" fill={top.color2} opacity={0.9} />
        </g>
      ) : null}
      {top.id === 'top-kimono' ? (
        <g>
          <path d="M72 174 L100 214 L128 174" fill="none" stroke={top.color2} strokeWidth="6" strokeLinejoin="round" />
          <rect x="60" y="214" width="80" height="12" fill={top.color2} />
        </g>
      ) : null}
      {top.id === 'top-cloak' ? <circle cx="100" cy="186" r="6" fill={top.color2} /> : null}
      {top.id === 'top-hoodie' ? <path d="M90 176 L90 200 M110 176 L110 200" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity={0.8} /> : null}

      {/* Neck */}
      <rect x="90" y="150" width="20" height="28" rx="8" fill={skinColor} />
      <rect x="90" y="150" width="20" height="14" rx="6" fill={shade} />

      {/* Scarf */}
      {acc.id === 'acc-scarf' ? (
        <g>
          <rect x="76" y="158" width="48" height="16" rx="8" fill={acc.color} />
          <path d="M112 168 L122 200 L106 200Z" fill={acc.color} />
          <path d="M110 182 L120 182" stroke={acc.color2} strokeWidth="3" />
        </g>
      ) : null}

      {/* Hair behind the head */}
      <path d="M50 112 C50 54 150 54 150 112 C150 140 142 154 136 160 L64 160 C58 154 50 140 50 112Z" fill={hairColor} />

      {/* Ears and head */}
      <circle cx="53" cy="118" r="8" fill={skinColor} />
      <circle cx="147" cy="118" r="8" fill={skinColor} />
      <ellipse cx="100" cy="112" rx="47" ry="50" fill={skinColor} />

      {/* Face */}
      <circle cx="68" cy="130" r="8" fill="#FF8FA3" opacity={0.35} />
      <circle cx="132" cy="130" r="8" fill="#FF8FA3" opacity={0.35} />
      {mood === 'radiant' ? (
        <g>
          <path d="M70 118 Q80 106 90 118" fill="none" stroke="#231A2E" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M110 118 Q120 106 130 118" fill="none" stroke="#231A2E" strokeWidth="4.5" strokeLinecap="round" />
        </g>
      ) : mood === 'resting' ? (
        <g>
          {/* Peacefully closed eyes */}
          <path d="M70 116 Q80 125 90 116" fill="none" stroke="#231A2E" strokeWidth="4" strokeLinecap="round" />
          <path d="M110 116 Q120 125 130 116" fill="none" stroke="#231A2E" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <ellipse cx="80" cy="118" rx="9" ry="11" fill="#231A2E" />
          <ellipse cx="120" cy="118" rx="9" ry="11" fill="#231A2E" />
          <circle cx="83" cy="113" r="3.2" fill="#FFFFFF" />
          <circle cx="123" cy="113" r="3.2" fill="#FFFFFF" />
          <circle cx="77" cy="123" r="1.6" fill="#FFFFFF" opacity={0.8} />
          <circle cx="117" cy="123" r="1.6" fill="#FFFFFF" opacity={0.8} />
        </g>
      )}
      {mood === 'radiant' ? (
        <path d="M90 138 Q100 152 110 138Z" fill="#B04A5A" stroke="#B04A5A" strokeWidth="2" strokeLinejoin="round" />
      ) : mood === 'content' ? (
        <path d="M92 140 Q100 146 108 140" fill="none" stroke="#B04A5A" strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <path d="M94 141 Q100 145 106 141" fill="none" stroke="#B04A5A" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* Fringe */}
      <path d="M52 108 C54 60 146 60 148 108 C134 86 114 80 100 90 C86 80 66 86 52 108Z" fill={hairColor} />
      <path d="M70 76 C86 66 112 66 128 76" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity={0.18} />

      {/* Glasses and headphones */}
      {acc.id === 'acc-glasses' ? (
        <g fill="none" stroke={acc.color} strokeWidth="3.5">
          <circle cx="80" cy="118" r="15" />
          <circle cx="120" cy="118" r="15" />
          <path d="M95 116 L105 116" />
        </g>
      ) : null}
      {acc.id === 'acc-headphones' ? (
        <g>
          <path d="M52 112 C48 52 152 52 148 112" fill="none" stroke={acc.color} strokeWidth="8" strokeLinecap="round" />
          <rect x="42" y="102" width="16" height="30" rx="8" fill={acc.color2} />
          <rect x="142" y="102" width="16" height="30" rx="8" fill={acc.color2} />
        </g>
      ) : null}

      {/* Hats */}
      {hat.id === 'hat-cap' ? (
        <g>
          <path d="M54 90 C56 56 144 56 146 90Z" fill={hat.color} />
          <path d="M60 90 L152 90 C160 90 160 98 150 98 L60 98Z" fill={hat.color2} />
        </g>
      ) : null}
      {hat.id === 'hat-beanie' ? (
        <g>
          <path d="M52 92 C52 50 148 50 148 92Z" fill={hat.color} />
          <rect x="50" y="86" width="100" height="14" rx="7" fill={hat.color2} />
          <circle cx="100" cy="48" r="9" fill={hat.color2} />
        </g>
      ) : null}
      {hat.id === 'hat-band' ? <path d="M52 90 C70 78 130 78 148 90 L148 100 C130 88 70 88 52 100Z" fill={hat.color} /> : null}
      {hat.id === 'hat-wizard' ? (
        <g>
          <path d="M100 4 L146 86 L54 86Z" fill={hat.color} />
          <ellipse cx="100" cy="88" rx="62" ry="10" fill={hat.color} />
          <path d="M64 80 L136 80" stroke={hat.color2} strokeWidth="5" />
          <path d={star(100, 46, 8)} fill={hat.color2} />
        </g>
      ) : null}
      {hat.id === 'hat-crown' ? (
        <g>
          <path d="M58 80 L58 52 L78 68 L100 40 L122 68 L142 52 L142 80Z" fill={hat.color} stroke={hat.color2} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="100" cy="62" r="5" fill="#E5484D" />
        </g>
      ) : null}
    </svg>
  );
}
