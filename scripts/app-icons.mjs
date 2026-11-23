// Makes the phone app's pictures from public/icon.svg: the launcher icon (adaptive, themed and
// legacy), the splash screen and the small white notification icon. Run with `npm run android:icons`
// after the logo changes; it writes into android/app/src/main/res.
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';
const BG = '#0B1026'; // the logo's own tile
const PAGE = '#070A13'; // the app's background, as on the loading screen

const svg = readFileSync('public/icon.svg', 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/^<rect[^>]*\/>/, '');
const drawing = inner; // the drop, the leaf and the flower, without the tile
const paths = [...drawing.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g)].map((m) => ({ d: m[1], fill: m[2] }));
const leaf = drawing.match(/<rect x="241"[^>]*\/>/)[0];
const petals = drawing.match(/<g fill="#FFCF5C">([\s\S]*?)<\/g>/)[1];
const centre = drawing.match(/<ellipse[^>]*\/>/)[0];
const [outer, ring, heart] = paths;

const wrap = (body, view = '0 0 512 512') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;
/** The drawing placed in the middle of a square `box` units wide, `size` units across. */
const centred = (body, box, size) => {
  const s = size / 512;
  const o = (box - size) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">${body}</g>`;
};

// One colour, for the themed icon (Android 13+) and the notification icon: the drop with the ring cut
// out, and the heart with its petals and centre cut out.
const silhouette = `
  <defs>
    <mask id="ring" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><g transform="rotate(10 256 280)"><path d="${ring.d}" fill="#000"/></g>
    </mask>
    <mask id="flower" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><g transform="rotate(10 256 280)" fill="#000">${petals}${centre.replace(/fill="[^"]+"/, '')}</g>
    </mask>
  </defs>
  <g mask="url(#ring)"><g transform="rotate(10 256 280)" fill="#fff">${leaf.replace(/fill="[^"]+"/, '')}<path d="${outer.d}"/></g></g>
  <g mask="url(#flower)"><g transform="rotate(10 256 280)" fill="#fff"><path d="${heart.d}"/></g></g>`;

const png = (markup, w, h = w) => sharp(Buffer.from(markup), { density: 384 }).resize(w, h).png().toBuffer();
const save = async (path, buf) => {
  mkdirSync(join(RES, path, '..'), { recursive: true });
  writeFileSync(join(RES, path), await buf);
};

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [name, k] of Object.entries(DENSITIES)) {
  // Adaptive layers are 108dp; what is inside the middle 66dp is never cut off by the mask.
  const fg = Math.round(108 * k);
  await save(`mipmap-${name}/ic_launcher_foreground.png`, png(wrap(centred(drawing, 108, 70), '0 0 108 108'), fg));
  await save(`mipmap-${name}/ic_launcher_monochrome.png`, png(wrap(centred(silhouette, 108, 70), '0 0 108 108'), fg));
  // Older launchers: the logo's own rounded tile, and a round one.
  const legacy = Math.round(48 * k);
  await save(`mipmap-${name}/ic_launcher.png`, png(svg, legacy));
  await save(`mipmap-${name}/ic_launcher_round.png`, png(wrap(`<circle cx="256" cy="256" r="256" fill="${BG}"/>${centred(drawing, 512, 400)}`), legacy));
  // Notification icon: 24dp, white on transparent.
  await save(`drawable-${name}/ic_stat_lifepath.png`, png(wrap(centred(silhouette, 512, 488)), Math.round(24 * k)));
  // The splash icon (Android 12+): 240dp, the visible circle is the middle 160dp.
  await save(`drawable-${name}/splash_icon.png`, png(wrap(centred(svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, ''), 240, 150), '0 0 240 240'), Math.round(240 * k)));
}

// Full-screen splash for Android 11 and older: the loading screen's look, the tile in the middle.
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const splash = (w, h) => {
  const size = Math.round(Math.min(w, h) * 0.26);
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.16}"/></filter></defs>
    <rect width="${w}" height="${h}" fill="${PAGE}"/>
    <rect x="${x}" y="${y + size * 0.18}" width="${size}" height="${size}" rx="${size * 0.3}" fill="#8E6BF2" opacity="0.42" filter="url(#glow)"/>
    <g transform="translate(${x} ${y}) scale(${size / 512})">${svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</g>
  </svg>`;
};
for (const [name, [w, h]] of Object.entries(SPLASH)) {
  await save(`drawable-port-${name}/splash.png`, png(splash(w, h), w, h));
  await save(`drawable-land-${name}/splash.png`, png(splash(h, w), h, w));
}
await save('drawable/splash.png', png(splash(480, 800), 480, 800));

writeFileSync(
  join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
writeFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), readFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml')));
writeFileSync(
  join(RES, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
);
console.log('icons, splash and notification icon written to', RES);
