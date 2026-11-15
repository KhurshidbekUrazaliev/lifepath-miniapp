// Draws the companion's glasses and writes them to design/companion/models/glasses.glb:
//
//   node scripts/make-glasses.mjs
//
// Tripo cannot make them (thin frames come out as a blob), and round glasses are simple shapes anyway:
// two rims, a bridge between them, two short arms and a pair of faintly tinted lenses. The rims are
// turned back a little, like a real pair, so that they follow the curve of a round face.
// `npm run models` then prepares the file for the app like any other item.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../design/companion/models/glasses.glb');

const RIM = 0.2; // a rim's radius, to the middle of its tube
const TUBE = 0.034; // half the thickness of the frame
const GAP = 0.1; // between the two rims
const WRAP = (16 * Math.PI) / 180; // how far each rim is turned back
const ARM = 0.24; // length of the arms that go back to the ears

/** Collects triangles; shapes are added in their own place and then moved as a whole. */
class Shape {
  positions = [];
  normals = [];
  indices = [];

  /** Adds a grid of points (rows x cols, each [position, normal]) as a closed or open strip of quads. */
  grid(rows, cols, at, closeRows, closeCols) {
    const base = this.positions.length / 3;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const [p, n] = at(i, j);
        this.positions.push(...p);
        this.normals.push(...n);
      }
    }
    const lastRow = closeRows ? rows : rows - 1;
    const lastCol = closeCols ? cols : cols - 1;
    for (let i = 0; i < lastRow; i++) {
      for (let j = 0; j < lastCol; j++) {
        const a = base + i * cols + j;
        const b = base + ((i + 1) % rows) * cols + j;
        const c = base + ((i + 1) % rows) * cols + ((j + 1) % cols);
        const d = base + i * cols + ((j + 1) % cols);
        this.indices.push(a, b, d, b, c, d);
      }
    }
    return this;
  }

  /** A ring (or part of one) in the x-y plane around `centre`, `from`..`to` in radians. */
  torus(centre, radius, tube, from = 0, to = Math.PI * 2, around = 40, across = 12) {
    const whole = Math.abs(to - from - Math.PI * 2) < 1e-6;
    const rows = whole ? around : around + 1;
    return this.grid(rows, across, (i, j) => {
      const u = from + ((to - from) * i) / around;
      const v = (Math.PI * 2 * j) / across;
      const out = [Math.cos(u), Math.sin(u), 0];
      const n = [out[0] * Math.cos(v), out[1] * Math.cos(v), Math.sin(v)];
      return [[centre[0] + out[0] * radius + n[0] * tube, centre[1] + out[1] * radius + n[1] * tube, centre[2] + n[2] * tube], n];
    }, whole, true);
  }

  /** A rod from `a` straight back along -z for `length`, with rounded ends left open (they sit inside other parts). */
  rod(a, length, radius, around = 10) {
    return this.grid(2, around, (i, j) => {
      const v = (Math.PI * 2 * j) / around;
      const n = [Math.cos(v), Math.sin(v), 0];
      return [[a[0] + n[0] * radius, a[1] + n[1] * radius, a[2] - i * length], n];
    }, false, true);
  }

  /** A flat round pane in the x-y plane, facing +z. */
  disc(centre, radius, around = 40) {
    const base = this.positions.length / 3;
    this.positions.push(...centre);
    this.normals.push(0, 0, 1);
    for (let j = 0; j < around; j++) {
      const u = (Math.PI * 2 * j) / around;
      this.positions.push(centre[0] + Math.cos(u) * radius, centre[1] + Math.sin(u) * radius, centre[2]);
      this.normals.push(0, 0, 1);
    }
    for (let j = 0; j < around; j++) this.indices.push(base, base + 1 + j, base + 1 + ((j + 1) % around));
    return this;
  }

  /** Turns everything about the upright line through x = `pivotX`, z = 0. */
  turn(angle, pivotX) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const list of [this.positions, this.normals]) {
      const shift = list === this.positions ? pivotX : 0;
      for (let i = 0; i < list.length; i += 3) {
        const x = list[i] - shift;
        const z = list[i + 2];
        list[i] = x * c + z * s + shift;
        list[i + 2] = -x * s + z * c;
      }
    }
    return this;
  }

  add(other) {
    const base = this.positions.length / 3;
    this.positions.push(...other.positions);
    this.normals.push(...other.normals);
    this.indices.push(...other.indices.map((i) => i + base));
    return this;
  }
}

// One side of the pair, on the wearer's left (+x): its rim, its arm and its lens, turned back together
// about the rim's inner edge so that the bridge still meets it.
function side(sign) {
  const inner = sign * (GAP / 2);
  const centre = [sign * (GAP / 2 + RIM), 0, 0];
  const frame = new Shape().torus(centre, RIM, TUBE).rod([sign * (GAP / 2 + RIM * 2), 0.03, 0], ARM, TUBE * 0.8);
  const lens = new Shape().disc(centre, RIM);
  const angle = sign * WRAP; // +x side turns its outer edge toward -z
  return { frame: frame.turn(angle, inner), lens: lens.turn(angle, inner) };
}

const left = side(1);
const right = side(-1);
const frame = new Shape()
  .add(left.frame)
  .add(right.frame)
  .add(new Shape().torus([0, 0.02, 0], GAP / 2 + TUBE, TUBE * 0.85, 0, Math.PI, 14, 10)); // the bridge, an arch
const lenses = new Shape().add(left.lens).add(right.lens);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('glasses');
const mesh = doc.createMesh('glasses');
const part = (shape, material) =>
  doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(shape.positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(shape.normals)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(shape.indices)).setBuffer(buffer))
    .setMaterial(material);
// Colours are in linear light, as glTF wants them: a warm amber frame and a pale blue lens you can see through.
mesh.addPrimitive(part(frame, doc.createMaterial('frame').setBaseColorFactor([0.76, 0.45, 0.06, 1]).setMetallicFactor(0).setRoughnessFactor(0.35)));
mesh.addPrimitive(
  part(lenses, doc.createMaterial('lens').setBaseColorFactor([0.62, 0.82, 1, 0.1]).setMetallicFactor(0).setRoughnessFactor(0.08).setAlphaMode('BLEND').setDoubleSided(true)),
);
scene.addChild(doc.createNode('glasses').setMesh(mesh));

await writeFile(OUT, await new NodeIO().writeBinary(doc));

// Where the pair rests on the face, for the placement in src/lib/wardrobe.ts: the back of the bridge,
// from the middle of the underside, in units of the longest side.
const axis = (k) => frame.positions.filter((_, i) => i % 3 === k);
const [xs, ys, zs] = [axis(0), axis(1), axis(2)];
const longest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
const pivot = [0, (0 - Math.min(...ys)) / longest, (-TUBE - (Math.min(...zs) + Math.max(...zs)) / 2) / longest];
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${frame.indices.length / 3 + lenses.indices.length / 3} triangles.`);
console.log(`Lens middle and the back of the bridge are at pivot [${pivot.map((v) => v.toFixed(3)).join(', ')}].`);
