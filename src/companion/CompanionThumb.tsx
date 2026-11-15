// A small still of the companion for cards elsewhere: the last 3D snapshot when it is of the same
// companion at the same age, otherwise the flat picture. It never loads three.js.
import { modelKey } from '../lib/companion';
import { useEcho } from '../store/echo';
import { EchoAvatar } from '../ui/EchoAvatar';
import { companionSnapshot } from './CompanionStage';

export function CompanionThumb({ size }: { size: number }) {
  const e = useEcho();
  if (!e.echo) return null;
  const snap = companionSnapshot();
  if (snap && snap.key === modelKey(e.gender, e.growth.index)) {
    return <img className="companion-thumb" src={snap.url} width={size} height={size} alt="" draggable={false} />;
  }
  return (
    <EchoAvatar size={size} skin={e.echo.skin} hair={e.echo.hair} stage={e.growth.index} mood={e.mood} outfit={e.outfit} accent={e.accent} gender={e.gender} />
  );
}
