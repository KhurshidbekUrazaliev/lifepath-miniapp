// A small still of the companion for cards elsewhere: the last 3D snapshot when it is of the same
// companion at the same age (from its own screen, or else the one Home takes at every start),
// otherwise the flat picture. It never loads three.js.
import { modelKey } from '../lib/companion';
import { useEcho } from '../store/echo';
import { EchoAvatar } from '../ui/EchoAvatar';
import { companionSnapshot } from './CompanionStage';

export function CompanionThumb({ size }: { size: number }) {
  const e = useEcho();
  if (!e.echo) return null;
  const key = modelKey(e.gender, e.growth.index);
  const snap = [companionSnapshot(), companionSnapshot('home')].find((s) => s?.key === key);
  if (snap) {
    return <img className="companion-thumb" src={snap.url} width={size} height={size} alt="" draggable={false} />;
  }
  return (
    <EchoAvatar size={size} skin={e.echo.skin} hair={e.echo.hair} stage={e.growth.index} mood={e.mood} outfit={e.outfit} accent={e.accent} gender={e.gender} />
  );
}
