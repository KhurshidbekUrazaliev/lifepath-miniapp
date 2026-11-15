// Draws LifePath's logo, a fig cut in half, and puts it everywhere it is used:
//
//   node scripts/make-logo.mjs
//
//   public/icon.svg          the app icon (also the tab icon, the splash and the Story picture's mark)
//   index.html               the copy inside the page, shown before the app has loaded
//   design/bot-avatar.svg    the bot's profile photo: full bleed, because Telegram crops it to a circle
//   design/bot-avatar.jpg    the same as a JPEG, which is what `sh scripts/setup-bot.sh --photo` uploads
//
// Why a fig: it is sworn by in the Qurʼan (At-Tin), and cut open it shows what it is made of, a great
// many small seeds, the way a life is made of small days. Change the numbers or colours here and run it again.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = (n) => Number(n.toFixed(1));

const NIGHT = '#0B1026'; // the app's own dark blue
const SKIN = '#8E6BF2'; // the app's violet
const RIM = '#FFF3DA';
const FLESH = '#E4476A';
const HEART = '#F7A1B4';
const SEED = '#FFCF5C'; // the app's gold
const STEM = '#6FBF73';
const TILT = 10;

/** The fig's outline: a round belly that narrows to a neck. `k` scales it about its middle. */
function body(k, cx, cy) {
  const curves = [
    [44, -150, 154, -80, 154, 18],
    [154, 98, 86, 146, 0, 146],
    [-86, 146, -154, 98, -154, 18],
    [-154, -80, -44, -150, 0, -204],
  ];
  const p = (x, y) => `${f(cx + x * k)} ${f(cy + y * k)}`;
  return `M${p(0, -204)}` + curves.map((c) => `C${p(c[0], c[1])} ${p(c[2], c[3])} ${p(c[4], c[5])}`).join('') + 'Z';
}

/** Two rings of small drops that point to the middle, as in a real fig: [distance, how many, size, turn]. */
function seeds(cx, cy) {
  let out = '';
  for (const [r, n, size, turn] of [[86, 13, 15, 0], [48, 8, 12, 22]]) {
    for (let i = 0; i < n; i++) {
      const drop = `M0 ${size}C${f(-size * 0.7)} ${f(size * 0.3)} ${f(-size * 0.62)} ${f(-size * 0.75)} 0 ${f(-size * 0.9)}C${f(size * 0.62)} ${f(-size * 0.75)} ${f(size * 0.7)} ${f(size * 0.3)} 0 ${size}Z`;
      out += `<path transform="translate(${cx} ${cy}) rotate(${f((i / n) * 360 + turn)}) translate(0 ${-r})" d="${drop}"/>`;
    }
  }
  return `<g fill="${SEED}">${out}</g>`;
}

const cx = 256;
const cy = 306;
const fig = `<g transform="rotate(${TILT} 256 280)"><rect x="${cx - 15}" y="${cy - 236}" width="30" height="52" rx="13" fill="${STEM}"/><path d="${body(1, cx, cy)}" fill="${SKIN}"/><path d="${body(0.86, cx, cy + 6)}" fill="${RIM}"/><path d="${body(0.74, cx, cy + 12)}" fill="${FLESH}"/><ellipse cx="${cx}" cy="${cy + 26}" rx="22" ry="27" fill="${HEART}"/>${seeds(cx, cy + 26)}</g>`;

/** The picture: a square of night blue (rounded for the icon), the fig on it, smaller where a circle will crop it. */
const picture = (round, scale, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${attrs}><rect width="512" height="512"${round ? ` rx="${round}"` : ''} fill="${NIGHT}"/>${scale === 1 ? fig : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${fig}</g>`}</svg>`;

const icon = picture(116, 1);
const avatar = picture(0, 0.8, ' width="640" height="640"');

await writeFile(path.join(ROOT, 'public/icon.svg'), `${icon}\n`);
await writeFile(path.join(ROOT, 'design/bot-avatar.svg'), `${avatar}\n`);
await sharp(Buffer.from(avatar)).resize(640, 640).jpeg({ quality: 92 }).toFile(path.join(ROOT, 'design/bot-avatar.jpg'));

// The page carries its own copy, so the logo shows while the app is still loading.
const page = path.join(ROOT, 'index.html');
const html = await readFile(page, 'utf8');
const inPage = icon.replace(' xmlns="http://www.w3.org/2000/svg"', '').replace('<svg ', '<svg aria-hidden="true" ');
const next = html.replace(/<svg (?:aria-hidden="true" )?viewBox="0 0 512 512"[^>]*>.*?<\/svg>/s, inPage);
if (next === html && !html.includes(inPage)) throw new Error('index.html: the logo inside the page was not found');
await writeFile(page, next);
console.log('Wrote public/icon.svg, design/bot-avatar.svg, design/bot-avatar.jpg and the logo inside index.html.');
