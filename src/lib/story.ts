// The picture for a Telegram Story: 1080×1920, drawn on a canvas from the app's logo, a Fluent 3D emoji
// and the numbers to show. Telegram needs it at a public address, so it is sent to the bot's server
// (POST /api/story), which keeps it for a day (worker/src/stories.ts).
import { emojiFile } from '../ui/Emoji';

export interface StoryStat {
  value: string;
  label: string;
}

export interface StoryCard {
  emoji: string;
  title: string;
  sub: string;
  stats: StoryStat[]; // up to three
  footer: string;
  link: string; // shown under the footer, e.g. "t.me/lifepath_bot"
}

const W = 1080;
const H = 1920;
const FONT = '"Manrope Variable", Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Telegram draws its own header over the top of a story and the reply field over the bottom: nothing
// important goes above TOP or below BOTTOM.
const TOP = 250;
const BOTTOM = 1660;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function emojiImage(e: string): Promise<HTMLImageElement | null> {
  const file = emojiFile(e);
  if (!file) return null;
  return (await loadImage(`/emoji/256/${file}.webp`)) ?? loadImage(`/emoji/${file}.webp`);
}

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/** The largest size (down to `min`) at which the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number): number {
  let size = max;
  ctx.font = font(weight, size);
  while (size > min && ctx.measureText(text).width > width) {
    size -= 4;
    ctx.font = font(weight, size);
  }
  return size;
}

/** Splits text into at most `lines` lines that fit the width; the last one ends in "…" if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  let last = `${kept[lines - 1]}…`;
  while (ctx.measureText(last).width > width && last.length > 2) last = `${last.slice(0, -2)}…`;
  kept[lines - 1] = last;
  return kept;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the story picture and returns it as a JPEG. */
export async function drawStory(card: StoryCard): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  const [logo, emoji] = await Promise.all([
    loadImage('/icon.svg'),
    emojiImage(card.emoji),
    document.fonts?.load(font(800, 100)).catch(() => undefined),
    document.fonts?.load(font(600, 50)).catch(() => undefined),
  ]);

  // The logo's night blue, deepening downwards, with a soft violet light (the fig's skin) behind the emoji.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#232E73');
  bg.addColorStop(0.55, '#141B4A');
  bg.addColorStop(1, '#0B1026');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 700, 0, W / 2, 700, 560);
  glow.addColorStop(0, 'rgba(142, 107, 242, 0.46)');
  glow.addColorStop(1, 'rgba(142, 107, 242, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Logo and name, centred.
  const mark = 104;
  ctx.font = font(800, 60);
  const wordWidth = ctx.measureText('LifePath').width;
  const rowWidth = (logo ? mark + 26 : 0) + wordWidth;
  let x = (W - rowWidth) / 2;
  if (logo) {
    ctx.save();
    roundRect(ctx, x, TOP, mark, mark, 26);
    ctx.clip();
    ctx.drawImage(logo, x, TOP, mark, mark);
    ctx.restore();
    x += mark + 26;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('LifePath', x, TOP + mark / 2 + 21);

  // The emoji (or, without a picture, the emoji as text).
  const size = 340;
  if (emoji) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(emoji, (W - size) / 2, 700 - size / 2, size, size);
  } else {
    ctx.textAlign = 'center';
    ctx.font = `${size * 0.8}px ${FONT}`;
    ctx.fillText(card.emoji, W / 2, 700 + size * 0.3);
  }

  // Title and the line under it.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  fit(ctx, card.title, 800, 132, 64, 940);
  ctx.fillText(card.title, W / 2, 1010);
  ctx.font = font(600, 50);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  wrap(ctx, card.sub, 900, 2).forEach((line, i) => ctx.fillText(line, W / 2, 1092 + i * 66));

  // Up to three numbers in tiles.
  const stats = card.stats.slice(0, 3);
  if (stats.length) {
    const gap = 24;
    const tileW = Math.min(300, (940 - gap * (stats.length - 1)) / stats.length);
    const tileH = 212;
    const top = 1250;
    let left = (W - (tileW * stats.length + gap * (stats.length - 1))) / 2;
    for (const s of stats) {
      roundRect(ctx, left, top, tileW, tileH, 40);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      fit(ctx, s.value, 800, 76, 40, tileW - 40);
      ctx.fillText(s.value, left + tileW / 2, top + 108);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      fit(ctx, s.label, 600, 34, 22, tileW - 36);
      ctx.fillText(s.label, left + tileW / 2, top + 164);
      left += tileW + gap;
    }
  }

  // Where to find it.
  ctx.fillStyle = '#FFFFFF';
  fit(ctx, card.footer, 700, 46, 30, 940);
  ctx.fillText(card.footer, W / 2, BOTTOM - 70);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = font(600, 38);
  ctx.fillText(card.link, W / 2, BOTTOM - 14);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/jpeg', 0.9),
  );
}
