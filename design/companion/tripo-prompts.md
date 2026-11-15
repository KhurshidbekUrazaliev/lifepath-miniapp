# LifePath companion: how the 3D models were made

The companion grows with your level through four stages, as a boy or a girl: 8 characters, each rigged
with 8 motions. The Sparks shop adds 19 things in 3D: caps, glasses, a scarf, a medal, a backpack, things
kept nearby, pets and places to stand on.

Everything was made in Tripo Studio (studio.tripo3d.ai) on 15 November 2026, except the glasses, which a
script draws. The Tripo exports are in `models/` next to this file. That folder is 44 MB and is not in
git: the exports stay on this Mac and can be downloaded again from the Tripo account. `npm run models`
turns them into the small files the app loads (`public/companion/`, which is in git). This page is for
remaking one or adding another.

## Rules

- **Every model is Private in Tripo.** The privacy box goes back to "Sharing Only" each time the page
  loads, so check it reads "Private" before every Generate. A private model on a paid plan is yours to
  use commercially, and LifePath sells Plus.
- Prompts are in English.
- A file's name is its key in the app: `boy-1.glb` to `girl-4.glb`, and for an item the `model` it has in
  `src/lib/wardrobe.ts` (`kufi.glb`, `base-garden.glb`).

## What it cost

Prices as the studio showed them. The account started at 3,035 credits and has 720 left.

| Step | Credits |
| --- | --- |
| Pictures (Generate Image, Edit Image) | free, 100 a month |
| Smart Mesh P2.0, from a picture (1, 2 or 4 variants) | 100 |
| Smart Mesh P1.0 Fast, from a picture or from text | 35 |
| Texture | 20 |
| Auto Rig (Humanoid, Mixamo) | 20 |
| A motion from a text prompt | 20 |
| A ready-made motion, or reusing a saved one | free |

- Characters: 1,160. Seven meshes at 100 (the first used a free trial), nine textures and nine rigs (one
  for an early test that was not cute enough and is not used), five motions.
- Items: 1,155. Nineteen at 55 each (mesh 35, texture 20), and the doppi and the camel made a second time.

## A character

1. **Generate Image** with the prompt below, aspect 3:4. Pick a clear front view in an A-pose.
2. **Generate Smart Mesh** from that picture: model **P2.0**, Topology **Quad**, polycount **20,000**,
   Private. It makes four variants; take the one whose face and hands came out cleanest.
3. **Texture**, then **Rig**: Auto Rig, **Humanoid**, skeleton **Mixamo**. All eight use the same
   skeleton, so one set of motions fits them all.
4. **Animate**: under *Preset* add `idle`. It is the only motion the app takes from Tripo (see Motions
   below), so nothing from *AI Animation* is needed, and no credits are spent on motions.
5. **Export**: GLB, texture 2k, with the skeleton, Number of Animations → Select All. Move the download to
   `models/<key>.glb` and run `npm run models`.

The eight prompts are one text with a few parts changed:

```
Super cute chibi 3D character of {who}, designed like an adorable collectible vinyl toy and kawaii animated mascot. {proportions} {face} {head} Light warm skin. {clothes} Smooth rounded shapes, soft matte clay-like materials, clean simple textures, warm pastel colours, soft studio lighting. Full body, standing in an A-pose: arms straight and angled 45 degrees down, clearly away from the body, {legs} slightly apart, facing forward, symmetrical. {no}, no props, empty hands, no base, no ground, no text, no logos. Plain light-grey background.
```

| | Boy | Girl |
| --- | --- | --- |
| `{head}` | Fluffy rounded short dark-brown hair. | Neatly wrapped ivory-cream hijab covering all the hair, the ears and the neck and softly framing the face. |
| `{clothes}` | Long-sleeve ivory-white tunic to the knees, loose olive-green trousers, simple rounded brown shoes. | Loose long-sleeve ankle-length dress in dusty sage green, simple rounded brown shoes peeking out. |
| `{legs}` | legs | feet |
| `{no}` | No hat | No visible hair |

The girl's eyes also have "and small lashes" after "glossy highlights". Write "his" or "her" to match.

| Stage | `{who}` | `{proportions}` | `{face}` |
| --- | --- | --- | --- |
| 1 Little | a happy baby Muslim toddler boy (girl), about 3 years old | Baby chibi proportions: a very large round head, bigger than his whole body, on a tiny round body with very short chubby arms and legs and tiny rounded hands and feet. | Huge round sparkling dark-brown eyes with big glossy highlights, set low and wide apart on the face, tiny button nose, big joyful open smile, soft pink blush on round chubby cheeks. |
| 2 Kid | a happy little Muslim boy (girl), about 8 years old | Oversized round head, nearly half of his total height, on a small soft body with short chubby arms and legs and tiny rounded hands and feet. | The same, with "small joyful open smile". |
| 3 Teen | a happy Muslim teenage boy (girl), about 14 years old | Taller, slimmer chibi proportions: a big round head about one third of his total height, a longer slim body and noticeably longer legs and arms, small rounded hands and feet. | The same, with "small confident happy smile, soft pink blush on the cheeks". |
| 4 Grown | a kind young Muslim man (woman), about 22 years old | Tall grown-up chibi proportions: a big round head a little less than one third of his total height, a long body with broad soft shoulders and long legs and arms, small rounded hands and feet. | Huge round sparkling dark-brown eyes with big glossy highlights, tiny button nose, calm warm smile, soft pink blush on the cheeks. The man also has "a short neat dark-brown beard along the jaw". |

Notes from making them:

- Each stage needs its own picture from its own prompt. Asking Edit Image to "make him older" keeps the
  toddler's proportions, and then the companion does not look as if it grows.
- The hijab is ivory-cream on purpose: the shop sells other colours and the app recolours the ivory
  (`src/companion/scene.ts`). Keep it cream, not pure white, so the whites of the eyes are left alone.
  If any hair shows under the hijab, make the picture again.
- The girl's dress hides her legs, so her proportions leave out "legs" and "feet" ("with very short
  chubby arms and tiny rounded hands"). The grown woman's read "a long graceful body and long arms,
  small rounded hands" in place of the broad shoulders.

## Motions

The app plays `idle`, `wave`, `talk`, `cheer`, `think`, `nod`, `read` and `dua`.

| App motion | Where it comes from |
| --- | --- |
| `idle` | Tripo's ready-made motion of that name: standing, breathing, a little sway. The script calms it and gives it arms that hang clear of the body. |
| `wave`, `talk`, `cheer`, `think`, `nod`, `read`, `dua` | Made by `npm run models` for each character from its own measurements (`scripts/companion-moves.mjs`). |

Tripo's motions are made for someone of ordinary build, and the eight exports still hold them (its
ready-made `cheer` and `agree`, and five made from text prompts on `boy-2`). They are no longer used. On a
companion with short arms, a wide tunic and a head a third of its height, the hands ended up inside the
body or against an ear, "agree" came out as a sideways lean with a hand on the hip, and "thinking" tipped
the head right over.

So only the standing is kept, and the script makes the rest:

- **The idle is calmed.** As made it leans, sways and steps a tenth of the body's height to one side and
  back. `CALM` in `scripts/companion-rig.mjs` says how much of the body's and the head's nodding, turning
  and leaning stays; the hips' travel shrinks with the body, so the feet stay where they stand.
- **The arms reach for places** given in arm's lengths from the shoulder, so a short arm and a long one
  make the same gesture (`MOVES` in `scripts/companion-moves.mjs`). In every frame the hand is checked
  against the body's outline at its height, against the head and against the other hand, and moved out
  until it is clear. Nothing has to be tuned for a new character: its body is measured from its mesh.
- **The head nods and turns but never leans.**
- **A gesture holds keys only for the bones it moves**, written as the companion standing still with the
  gesture on top. The stage plays it over the running idle as the difference from the idle's first
  moment (`src/companion/scene.ts`), so the breathing never stops and nothing jumps when a gesture
  starts, ends, or is started again half way through.

To change a gesture, change its numbers in `MOVES`, run `npm run models` and look at it on the smallest
and on a grown companion, from the front and from the side. `npm test` checks on a small made-up
companion that no hand is ever inside the body or the head and that every gesture begins and ends where
the idle begins.

## Items, pets and places

Most were made from a line of text: **Smart Mesh**, text mode, model **P1.0 - Fast**, Private, then
**Texture**, then **Export** as GLB (no rig). They come out with about 5,000 triangles, the longest side
1 unit long and standing on the origin, which is what the app expects.

The same line ends every item prompt:

```
Cute stylized 3D game prop in a soft animated-film style, smooth rounded shapes, soft matte materials, clean simple textures. Single object, centered, no base, no text, no logos.
```

**To wear**

- `kufi.glb`: A round white knitted kufi prayer cap with a subtle embroidered pattern, slightly domed.
- `grad-cap.glb`: A graduation mortarboard cap in navy blue with a golden tassel.
- `scarf.glb`: A soft knitted winter scarf in warm red with cream stripes, loosely wrapped in a loop. (The boy's: the girl's hijab covers her neck.)
- `medal.glb`: A round gold medal with an embossed star, hanging from a short blue ribbon loop.
- `backpack.glb`: A small rounded school backpack in mint green with an orange zipper and a front pocket.

**Kept nearby**

- `book.glb`: A small closed hardcover book with a teal cover and golden geometric corner ornaments.
- `lantern.glb`: A traditional brass Ramadan lantern (fanous) with coloured glass panels and a warm glow inside.
- `tasbih.glb`: A loop of round wooden prayer beads (tasbih) with a small tassel, lying in a circle.
- `piyola.glb`: A small Uzbek tea bowl (piyola) with the blue-and-white cotton-boll pattern.
- `sprout-pot.glb`: A small terracotta pot with a young green sprout that has two rounded leaves.

**Pets**

- `kitten.glb`: A cute fluffy orange-and-white kitten sitting upright with big round eyes.
- `dove.glb`: A cute small white dove standing with its wings folded.

**Places (the companion stands on these)**

- `base-garden.glb`: A round floating-island diorama base: flat grassy top with tiny white flowers and a few pebbles, layered brown soil underneath, open empty center.
- `base-courtyard.glb`: A round diorama platform tiled with turquoise and blue Samarkand-style geometric mosaic, a short low wall with one small pointed arch along the back edge, open empty center.
- `base-study.glb`: A round wooden-floor diorama platform with a woven rug, a low bookshelf with books along the back edge and a floor cushion, open empty center.
- `base-night.glb`: A round diorama platform of soft desert sand with small dunes and a brass lantern at the edge, deep blue night mood, open empty center.

### Made from a picture instead

Text alone gave a plain black box for the doppi and a bear cub for the camel. For a shape Tripo does not
know, make a picture first (Generate Image, aspect 1:1), open it, press **Generate Smart Mesh**, and
choose **P1.0 - Fast** and Private there.

`doppi.glb`:

```
A single Uzbek doppi, the traditional Chust tubeteika skullcap, as a cute stylized 3D toy object. Only the cap, nothing else, no head, no person. Rounded square base. Four gently sloping black velvet panels meet at a soft low point on top, like a shallow pyramid with rounded edges. Each of the four top panels carries one large white embroidered almond-shaped bodom paisley motif. A band of small white arch ornaments runs all around the lower rim. Low and wide: about half as tall as it is wide. Smooth matte toy materials, clean shapes, soft studio lighting, plain light grey background, three-quarter view from slightly above, whole object in frame.
```

`camel.glb`:

```
A super cute chibi baby camel as an adorable collectible vinyl toy, kawaii mascot style. Clearly a camel: one rounded hump on its back, a long curved neck, long slender legs with soft padded feet, a small tufted tail, a long gentle muzzle and small round ears. Warm sandy beige fur with a lighter cream belly. Big round sparkling dark-brown eyes with long eyelashes, rosy cheeks and a tiny happy smile. A small saddle blanket over the hump with a simple red, teal and gold Central Asian pattern. Standing on all four legs, whole body in frame, seen from the front three-quarter side. Smooth matte toy materials, simple rounded shapes, soft studio lighting, plain light grey background.
```

### Drawn by a script

`glasses.glb` comes from `node scripts/make-glasses.mjs`. Tripo turns thin frames into a blob (it made a
round creature wearing glasses), and round glasses are simple shapes: two rims, a bridge, two short arms
and faintly tinted lenses. Change the numbers at the top of the script and run it again to reshape them.

## From an export to the app

`npm run models` (or `node scripts/companion-models.mjs kufi camel` for a few) reads `models/` and writes
`public/companion/`:

- a character's idle is kept and calmed, keys the app does not need (finger joints, bones changing size)
  are dropped, and the other motions are made for its own body (above): a character goes from about
  3.8 MB to about 0.7 MB;
- everything above its neck is tied to the head bone alone. Tripo ties a girl's head and hijab to the
  head bone by about two thirds and shares the rest between the neck and the shoulders, so the face and
  the cloth slid apart when the head turned or an arm went up;
- the caps are made lower and the garden's earth shallower (`RESHAPE` in the script);
- textures become WebP (1024 px for characters, 512 for items) and the geometry is compressed;
- each file's name carries a hash of its contents, so phones can keep it for good (`public/_headers`),
  and `src/companion/models.json` lists what exists. The list is built into the app; the shop only
  offers an item whose file is listed there.

How an item sits on the companion is its `place` in `src/lib/wardrobe.ts`. The stage measures each
character as it loads (`src/companion/fit.ts`): how wide the head is at each height, where the eyes are,
how wide the chest is and where its front and back are. A cap comes to rest where the head is as wide
as its opening, so the same numbers fit the toddler and the grown-up. After adding or changing an item,
look at it in the shop on a small and a grown companion, from the front and from the side.
