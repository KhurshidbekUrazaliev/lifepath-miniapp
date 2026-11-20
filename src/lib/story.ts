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

// ---------- the day's words, with the companion ----------

export interface QuoteCard {
  label: string; // "Ali · Hadith of the day"
  text: string; // the words, in the app's language
  arabic?: string; // the Arabic above them (an ayah)
  source?: string; // "Sahih al-Bukhari 6464"
  companion: HTMLCanvasElement | HTMLImageElement | null; // drawn on a transparent background
  sky?: [string, string]; // the sky the companion wears; unset: the app's night blue
  accent: string; // the companion's colour, for the light behind it
  footer: string;
  link: string;
}

const FONT_AR = '"Amiri Quran", Amiri, "Noto Naskh Arabic", "Geeza Pro", "Scheherazade New", serif';

/** Lines the text needs at the current font, none cut. */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  return wrap(ctx, text, width, 1000);
}

/** The part of a picture that is not transparent, so a stage's empty room around the companion is not drawn. */
function opaqueBox(img: HTMLCanvasElement | HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const w = img.width;
  const h = img.height;
  const all = { x: 0, y: 0, w, h };
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    let top = h, bottom = -1, left = w, right = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (bottom < 0) return all;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  } catch {
    return all; // a picture the canvas may not read: drawn whole
  }
}

/**
 * A hadith or an ayah as a story: the words on a glass card at the top, the companion as it looks now
 * standing large under its sky below them, and where to find LifePath at the bottom.
 */
export async function drawQuoteStory(card: QuoteCard): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  const [logo] = await Promise.all([
    loadImage('/icon.svg'),
    document.fonts?.load(font(800, 60)).catch(() => undefined),
    document.fonts?.load(font(600, 50)).catch(() => undefined),
    document.fonts?.load(font(700, 34)).catch(() => undefined),
    card.arabic ? document.fonts?.load(`60px ${FONT_AR}`, card.arabic).catch(() => undefined) : undefined,
  ]);

  // The sky: the one the companion wears, or the app's night blue.
  const [top, bottom] = card.sky ?? ['#232E73', '#0B1026'];
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // A soft light of the companion's colour where it stands, and a shade at the top for the words.
  const glow = ctx.createRadialGradient(W / 2, 1250, 0, W / 2, 1250, 640);
  glow.addColorStop(0, `${card.accent}66`);
  glow.addColorStop(1, `${card.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, 0, 900);
  shade.addColorStop(0, 'rgba(8, 10, 30, 0.45)');
  shade.addColorStop(1, 'rgba(8, 10, 30, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, 900);

  // Logo and name, centred, a little smaller than on the other stories.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const mark = 84;
  ctx.font = font(800, 50);
  const wordWidth = ctx.measureText('LifePath').width;
  let x = (W - ((logo ? mark + 22 : 0) + wordWidth)) / 2;
  if (logo) {
    ctx.save();
    roundRect(ctx, x, TOP, mark, mark, 22);
    ctx.clip();
    ctx.drawImage(logo, x, TOP, mark, mark);
    ctx.restore();
    x += mark + 22;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('LifePath', x, TOP + mark / 2 + 18);

  // The words: as large as lets them fit a card no taller than `room`.
  const cardX = 64;
  const cardW = W - cardX * 2;
  const pad = 56;
  const inner = cardW - pad * 2;
  // At most this much text, so the companion keeps most of the picture.
  const room = 600;
  const labelH = 44 + 26;
  const sourceH = card.source ? 26 + 42 : 0;
  const arGap = 46;
  let ar: string[] = [];
  let arSize = 0;
  let tx: string[] = [];
  let txSize = 0;
  const arLine = (s: number) => s * 1.7;
  const txLine = (s: number) => s * 1.38;
  const height = () => labelH + (ar.length ? ar.length * arLine(arSize) + arGap : 0) + tx.length * txLine(txSize) + sourceH;
  const layout = (withArabic: boolean, max: number): boolean => {
    for (let s = max; s >= 34; s -= 2) {
      txSize = s;
      arSize = Math.round(s * 1.15);
      ar = [];
      if (withArabic && card.arabic) {
        ctx.font = `${arSize}px ${FONT_AR}`;
        ar = lines(ctx, card.arabic, inner);
      }
      ctx.font = font(600, txSize);
      tx = lines(ctx, card.text, inner);
      if (height() <= room) return true;
    }
    return false;
  };
  // A long passage drops its Arabic before its translation is cut; Qurʼan is never cut off midway.
  if (!layout(true, 60) && !layout(false, 52)) {
    ctx.font = font(600, txSize);
    tx = wrap(ctx, card.text, inner, Math.max(2, Math.floor((room - labelH - sourceH) / txLine(txSize))));
  }
  const cardY = TOP + mark + 56;
  const cardH = Math.round(height() + pad * 2 - 20);

  // The companion: as large as the space between the card and the footer allows, its feet above the footer.
  const feet = BOTTOM - 150;
  if (card.companion) {
    const box = opaqueBox(card.companion);
    const space = feet - (cardY + cardH - 40);
    let h = Math.min(1180, space);
    let w = (h * box.w) / box.h;
    if (w > 980) {
      w = 980;
      h = (w * box.h) / box.w;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(card.companion, box.x, box.y, box.w, box.h, (W - w) / 2, feet - h, w, h);
  }

  // The card, over the top of the companion's sky.
  roundRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fillStyle = 'rgba(12, 15, 42, 0.62)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  let y = cardY + pad + 30;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(214, 205, 255, 0.95)';
  const label = card.label.toLocaleUpperCase();
  fit(ctx, label, 700, 34, 24, inner);
  ctx.fillText(label, W / 2, y);
  y += 26;

  if (ar.length) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.font = `${arSize}px ${FONT_AR}`;
    ctx.fillStyle = '#FFFFFF';
    for (const line of ar) {
      y += arLine(arSize);
      ctx.fillText(line, W / 2, y - arLine(arSize) * 0.12);
    }
    ctx.restore();
    y += arGap;
  }

  ctx.font = font(600, txSize);
  ctx.fillStyle = card.arabic ? 'rgba(255, 255, 255, 0.86)' : '#FFFFFF';
  for (const line of tx) {
    y += txLine(txSize);
    ctx.fillText(line, W / 2, y - txLine(txSize) * 0.26);
  }

  if (card.source) {
    y += 26 + 34;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    fit(ctx, card.source, 600, 32, 22, inner);
    ctx.fillText(card.source, W / 2, y);
  }

  // Where to find it, on a shade that keeps it readable on a light sky.
  const foot = ctx.createLinearGradient(0, BOTTOM - 190, 0, H);
  foot.addColorStop(0, 'rgba(8, 10, 30, 0)');
  foot.addColorStop(0.45, 'rgba(8, 10, 30, 0.5)');
  foot.addColorStop(1, 'rgba(8, 10, 30, 0.7)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, BOTTOM - 190, W, H - BOTTOM + 190);
  ctx.fillStyle = '#FFFFFF';
  fit(ctx, card.footer, 700, 46, 30, 940);
  ctx.fillText(card.footer, W / 2, BOTTOM - 70);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = font(600, 38);
  ctx.fillText(card.link, W / 2, BOTTOM - 14);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/jpeg', 0.9),
  );
}
