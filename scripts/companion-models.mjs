// Prepares the Tripo exports in design/companion/models/ for the app:
//
//   node scripts/companion-models.mjs            all files
//   node scripts/companion-models.mjs boy-2 kufi only these
//
// Characters (boy-1 ... girl-4): the main file plus any one-motion files (boy-2-idle.glb) become one
// GLB. Of Tripo's motions only the idle is kept (calmed, and with arms that hang clear of the body); the
// wave, the nod and the others are made here for each character's own body (companion-moves.mjs), and
// everything above the neck is tied to the head bone (companion-rig.mjs). Items, pets and bases are
// optimised as they are. Textures become WebP (1024 px for characters, 512 for the rest) and the geometry
// is meshopt-compressed. Each output name carries a content hash, so phones never keep a stale copy, and
// src/companion/models.json lists what exists: the list is built into the app, which offers only those.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { calmAnimation, dropAnimation, steadyHead } from './companion-rig.mjs';
import { makeMoves } from './companion-moves.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MODELS_SRC ?? path.join(ROOT, 'design/companion/models'); // overridable for tests
const OUT = process.env.MODELS_OUT ?? path.join(ROOT, 'public/companion');
const MANIFEST = process.env.MODELS_OUT ? path.join(OUT, 'models.json') : path.join(ROOT, 'src/companion/models.json');
const CLIPS = ['idle', 'wave', 'talk', 'cheer', 'think', 'nod', 'read', 'dua'];
const CHARACTER = /^(boy|girl)-([1-4])(?:-([a-z]+))?\.glb$/;

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const only = new Set(process.argv.slice(2));
const files = (await readdir(SRC).catch(() => [])).filter((f) => f.toLowerCase().endsWith('.glb')).sort();
if (!files.length) {
  console.log(`No .glb files in ${path.relative(ROOT, SRC)} yet.`);
  process.exit(0);
}

// Group the files: a character's main file and its one-motion files go together.
const jobs = new Map(); // key -> { kind, main?, clips: Map<clip, file> }
for (const file of files) {
  const m = file.match(CHARACTER);
  const key = m ? `${m[1]}-${m[2]}` : file.replace(/\.glb$/i, '');
  if (only.size && !only.has(key)) continue;
  const job = jobs.get(key) ?? { kind: m ? 'character' : 'item', clips: new Map() };
  if (m?.[3]) {
    if (!CLIPS.includes(m[3])) console.warn(`  ! ${file}: "${m[3]}" is not a motion the app uses (${CLIPS.join(', ')})`);
    else job.clips.set(m[3], file);
  } else job.main = file;
  jobs.set(key, job);
}

// Tripo's ready-made motions go by their own names (its "agree" is our nod), and a motion made from a
// text prompt is named by the start of that prompt. Its "greet" walks off the platform, so it is not used.
// (Only the idle ends up in the app; the others are named so that the ones made here take their place.
// A rig the motion maker does not understand keeps Tripo's, calmed.)
const ALIASES = {
  wave: ['raises the right hand', 'waving'],
  nod: ['agree'],
  read: ['open book'],
  dua: ['raises both hands', 'prayer'],
};

// A one-off motion that runs too long keeps only this stretch of it, in seconds.
const TRIM = { cheer: [1, 5] };
const FINGER = /Hand(Index|Middle|Ring|Pinky|Thumb)\d/i;

/** Which of our motions an exported animation is, from its name ("Armature|Wave" -> wave). */
const clipOf = (name) => {
  const n = name.toLowerCase();
  return CLIPS.find((c) => n.includes(c) || ALIASES[c]?.some((alias) => n.includes(alias)));
};

/** The longest animation in a document (one-motion exports sometimes carry an empty extra). */
function longest(doc) {
  const span = (a) => Math.max(0, ...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0));
  return doc.getRoot().listAnimations().sort((a, b) => span(b) - span(a))[0];
}

/** Copies an animation from another export of the same rig, matching the bones by name. */
function copyAnimation(doc, anim, name) {
  const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const buffer = doc.getRoot().listBuffers()[0];
  const copies = new Map();
  const copy = (a) => {
    if (!copies.has(a)) {
      copies.set(a, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()).setBuffer(buffer));
    }
    return copies.get(a);
  };
  const out = doc.createAnimation(name);
  let missing = 0;
  for (const channel of anim.listChannels()) {
    const target = nodes.get(channel.getTargetNode()?.getName());
    if (!target) {
      missing++;
      continue;
    }
    const s = channel.getSampler();
    const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
    out.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(channel.getTargetPath()).setSampler(sampler));
  }
  if (missing) console.warn(`  ! ${name}: ${missing} channels had no bone of the same name (a different rig?)`);
  return out;
}

/**
 * Motions come with keys for every bone's place and size and for each finger joint. Only the hips travel,
 * nothing changes size and the hands are mittens, so those keys go: they are most of a motion's weight.
 */
function slimAnimation(anim) {
  for (const channel of anim.listChannels()) {
    const bone = channel.getTargetNode()?.getName() ?? '';
    const kind = channel.getTargetPath();
    const keep = kind === 'rotation' ? !FINGER.test(bone) : kind === 'translation' && /hips$/i.test(bone);
    if (keep) continue;
    const sampler = channel.getSampler();
    channel.dispose();
    if (sampler && !sampler.listParents().some((parent) => parent.propertyType === 'AnimationChannel')) sampler.dispose();
  }
}

/** Keeps the keys of a motion between two times and moves them to start at zero. */
function trimAnimation(doc, anim, from, to) {
  const buffer = doc.getRoot().listBuffers()[0];
  const cuts = new Map(); // the old times -> { the new times, first and last key kept }
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (!input || !output) continue;
    let cut = cuts.get(input);
    if (!cut) {
      const times = input.getArray();
      let first = 0;
      while (first < times.length - 1 && times[first] < from) first++;
      let last = times.length - 1;
      while (last > first && times[last] > to) last--;
      const start = times[first];
      const kept = Float32Array.from(times.slice(first, last + 1), (time) => time - start);
      cut = { first, last, input: doc.createAccessor().setType('SCALAR').setArray(kept).setBuffer(buffer) };
      cuts.set(input, cut);
    }
    const perKey = (output.getCount() / input.getCount()) * output.getElementSize();
    const values = output.getArray().slice(cut.first * perKey, (cut.last + 1) * perKey);
    sampler
      .setInput(cut.input)
      .setOutput(doc.createAccessor().setType(output.getType()).setArray(values).setNormalized(output.getNormalized()).setBuffer(buffer));
  }
}

async function character(key, job) {
  const mainFile = job.main ?? job.clips.get('idle');
  if (!mainFile) throw new Error(`${key}: needs ${key}.glb or ${key}-idle.glb`);
  const doc = await io.read(path.join(SRC, mainFile));
  const root = doc.getRoot();

  // Name the main file's own animations by what they are called; a lone unnamed one is the idle.
  // When the main file is boy-2-idle.glb, its longest animation is the idle.
  const own = root.listAnimations();
  const idleFile = !job.main;
  const idleAnim = idleFile ? longest(doc) : undefined;
  const named = new Set();
  for (const anim of own) {
    const clip = idleFile
      ? anim === idleAnim ? 'idle' : undefined
      : clipOf(anim.getName()) ?? (own.length === 1 ? 'idle' : undefined);
    // A one-motion file for the same motion wins over an animation inside the main file.
    if (!clip || named.has(clip) || (!idleFile && job.clips.has(clip))) {
      console.warn(`  ! ${mainFile}: dropped animation "${anim.getName()}"`);
      dropAnimation(anim);
      continue;
    }
    anim.setName(clip);
    named.add(clip);
  }

  // Bring in the one-motion files.
  for (const [clip, file] of job.clips) {
    if (file === mainFile) continue;
    const other = await io.read(path.join(SRC, file));
    const anim = longest(other);
    if (!anim) {
      console.warn(`  ! ${file}: has no animation`);
      continue;
    }
    root.listAnimations().filter((a) => a.getName() === clip).forEach(dropAnimation);
    copyAnimation(doc, anim, clip);
    named.add(clip);
  }
  if (!named.has('idle')) console.warn(`  ! ${key}: no idle motion; the app will use the first one`);
  for (const anim of root.listAnimations()) {
    slimAnimation(anim);
    const stretch = TRIM[anim.getName()];
    if (stretch) trimAnimation(doc, anim, stretch[0], stretch[1]);
    calmAnimation(doc, anim, anim.getName());
  }
  steadyHead(doc);
  // The idle is Tripo's; everything else the companion does is made for its own body.
  for (const clip of makeMoves(doc)) named.add(clip);
  await optimise(doc, 1024);
  return { doc, clips: CLIPS.filter((c) => named.has(c)) };
}

// Tripo makes some things taller than the app wants them: a cap that hugs the head is lower than the one
// it drew, and the garden's earth is deeper than the stage has room for under the companion's feet.
// The numbers stretch an item along x, y and z before anything else is done to it.
const RESHAPE = {
  kufi: [1, 0.6, 1],
  doppi: [1, 0.8, 1],
  'grad-cap': [1, 0.65, 1],
  'base-garden': [1, 0.6, 1],
};

async function item(key, job) {
  const doc = await io.read(path.join(SRC, job.main));
  doc.getRoot().listAnimations().forEach(dropAnimation); // items stand still
  const reshape = RESHAPE[key];
  if (reshape) {
    for (const scene of doc.getRoot().listScenes()) {
      const holder = doc.createNode('reshape').setScale(reshape);
      for (const child of scene.listChildren()) holder.addChild(child); // moves it out of the scene
      scene.addChild(holder);
    }
  }
  await optimise(doc, 512);
  return { doc };
}

async function optimise(doc, size) {
  await doc.transform(
    dedup(),
    resample(),
    weld(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
}

const manifest = only.size ? JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{}')) : {};
await mkdir(OUT, { recursive: true });
const existing = await readdir(OUT);

for (const [key, job] of jobs) {
  try {
    const { doc, clips } = job.kind === 'character' ? await character(key, job) : await item(key, job);
    const bytes = await io.writeBinary(doc);
    const file = `${key}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.glb`;
    for (const old of existing) if (old.startsWith(`${key}.`) && old.endsWith('.glb') && old !== file) await rm(path.join(OUT, old));
    await writeFile(path.join(OUT, file), bytes);
    const tris = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
    manifest[key] = { file, bytes: bytes.byteLength, ...(clips ? { clips } : {}) };
    console.log(`  ✓ ${key.padEnd(16)} ${(bytes.byteLength / 1024).toFixed(0).padStart(5)} KB  ${String(Math.round(tris)).padStart(6)} triangles  ${clips ? clips.join(' ') : ''}`);
  } catch (e) {
    console.error(`  ✗ ${key}: ${e.message}`);
    process.exitCode = 1;
  }
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, MANIFEST)} (${Object.keys(sorted).length} models).`);
