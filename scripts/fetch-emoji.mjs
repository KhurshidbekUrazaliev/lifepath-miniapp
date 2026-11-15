// Fetches the 3D pictures (Microsoft Fluent Emoji, MIT licence) for the emoji the app shows as icons:
//
//   node scripts/fetch-emoji.mjs <work-dir>
//
// It finds the emoji in src/ (not in the translations: an emoji inside a sentence stays text), takes
// only those pictures from github.com/microsoft/fluentui-emoji (a sparse clone into <work-dir>),
// writes 128 px WebP files to public/emoji/ and the glyph -> file list to src/ui/emojiMap.ts. The few
// drawn big on Story pictures (src/lib/story.ts) also get a 256 px copy in public/emoji/256/.
// Emoji without a Fluent picture (flags, symbols) keep showing as text.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.argv[2];
if (!WORK) {
  console.error('usage: node scripts/fetch-emoji.mjs <work-dir>');
  process.exit(1);
}
const OUT = path.join(ROOT, 'public/emoji');
const MAP = path.join(ROOT, 'src/ui/emojiMap.ts');
const SIZE = 128;
const LARGE = new Set(['⭐', '🔥', '📖', '🏆', '🏁', '🎯', '🕌']);
// Fluent draws these nearly black, which vanishes on the dark theme: show a light one that means the same.
const ALIASES = { '🗣': '💬', '👣': '👟' };
const git = (...args) => execFileSync('git', ['-C', WORK, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const bare = (s) => s.replace(/️/g, '');

// 1. The emoji the code uses.
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|tsx)$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`) && !e.name.endsWith('.test.ts') && p !== MAP) out.push(p);
  }
  return out;
}
const EMOJI = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
const wanted = new Set();
for (const file of await walk(path.join(ROOT, 'src'))) {
  for (const m of (await readFile(file, 'utf8')).matchAll(EMOJI)) wanted.add(bare(m[0]));
}

// 2. Fluent's metadata (glyph -> folder), from a clone that holds only the small JSON files.
if (!existsSync(path.join(WORK, '.git'))) {
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', 'https://github.com/microsoft/fluentui-emoji.git', WORK], { stdio: 'inherit' });
}
git('sparse-checkout', 'set', '--no-cone', '/assets/*/metadata.json', '/LICENSE');
git('checkout');
const folders = new Map();
for (const dir of await readdir(path.join(WORK, 'assets'))) {
  const file = path.join(WORK, 'assets', dir, 'metadata.json');
  if (!existsSync(file)) continue;
  const meta = JSON.parse(await readFile(file, 'utf8'));
  if (meta.glyph) folders.set(bare(meta.glyph), dir);
}

// 3. The 3D picture of each wanted emoji (the default skin tone where there are several).
const tree = git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'assets').split('\n');
const picks = new Map(); // glyph -> repo path
const missing = [];
for (const glyph of wanted) {
  const dir = folders.get(ALIASES[glyph] ?? glyph);
  const pngs = dir ? tree.filter((p) => p.startsWith(`assets/${dir}/`) && /\/3D\/[^/]+\.png$/.test(p)) : [];
  const png = pngs.find((p) => p.includes('/Default/3D/')) ?? pngs[0];
  if (png) picks.set(glyph, png);
  else missing.push(glyph);
}
git('sparse-checkout', 'add', ...[...picks.values()].map((p) => `/${p}`));
git('checkout');

// 4. Small WebP copies named by code point, and the map the app reads.
await mkdir(path.join(OUT, '256'), { recursive: true });
const map = {};
for (const [glyph, png] of [...picks].sort(([a], [b]) => a.localeCompare(b))) {
  const name = [...(ALIASES[glyph] ?? glyph)].map((c) => c.codePointAt(0).toString(16)).join('-');
  const write = (size, file) =>
    sharp(path.join(WORK, png)).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(file);
  await write(SIZE, path.join(OUT, `${name}.webp`));
  if (LARGE.has(glyph)) await write(256, path.join(OUT, '256', `${name}.webp`));
  map[glyph] = name;
}
await copyFile(path.join(WORK, 'LICENSE'), path.join(OUT, 'LICENSE.txt'));
const body = Object.entries(map).map(([g, n]) => `  '${g}': '${n}',`).join('\n');
await writeFile(MAP, `// Written by scripts/fetch-emoji.mjs: the emoji that have a Fluent 3D picture in public/emoji/.\nexport const EMOJI_FILES: Record<string, string> = {\n${body}\n};\n`);
console.log(`${picks.size} pictures written to public/emoji/; no Fluent picture for: ${missing.join(' ') || 'none'}`);
