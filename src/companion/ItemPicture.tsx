// The picture on a wardrobe tile: the sky's colours, a hijab colour, a render of the 3D item once its
// file exists, or a placeholder until then.
import { useEffect, useState } from 'react';
import type { Item } from '../lib/wardrobe';
import { Manifest, modelUrl } from './models';
import { Emoji } from '../ui/Emoji';

const thumbs = new Map<string, string>();

export function ItemPicture({ item, manifest }: { item: Item; manifest: Manifest | null }) {
  const info = item.model ? manifest?.[item.model] : undefined;
  const [thumb, setThumb] = useState<string | null>(info ? thumbs.get(info.file) ?? null : null);

  useEffect(() => {
    if (!info || thumbs.has(info.file)) return;
    let alive = true;
    import('./scene')
      .then(({ itemThumb }) => itemThumb(modelUrl(info)))
      .then((url) => {
        thumbs.set(info.file, url);
        if (alive) setThumb(url);
      })
      .catch(() => undefined); // the placeholder stays
    return () => {
      alive = false;
    };
  }, [info]);

  if (item.slot === 'sky') {
    const bg = item.id === 'bg-none'
      ? 'radial-gradient(circle at 50% 60%, rgba(139,130,255,.55), rgba(139,130,255,.08) 70%)'
      : `linear-gradient(160deg, ${item.color}, ${item.color2 ?? item.color})`;
    return <span className="item-pic sky" style={{ background: bg }} />;
  }
  if (item.slot === 'color') {
    return (
      <span className="item-pic plain">
        <span className="item-swatch" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 55%), ${item.color}` }} />
      </span>
    );
  }
  if (thumb) return <img className="item-pic" src={thumb} alt="" draggable={false} />;
  return (
    <span className="item-pic plain" style={{ background: `${item.color}26` }}>
      {item.emoji ? <Emoji e={item.emoji} /> : null}
    </span>
  );
}
