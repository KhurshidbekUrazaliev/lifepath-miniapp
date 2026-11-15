// Home: the focus session on the clock, with the time left. Tapping it goes back to the timer.
import { useFocus, useNowWhile } from '../store/focus';
import { useNav } from '../store/nav';
import { clock, remaining } from '../lib/focus';
import { t } from '../i18n';
import { Card, Ring, Tap } from './kit';
import { Emoji } from './Emoji';

export function FocusCard() {
  const run = useFocus((s) => s.run);
  const push = useNav((s) => s.push);
  const now = useNowWhile(!!run?.endsAt);
  if (!run) return null;
  const left = remaining(run, now);
  const label = t(run.mode === 'break' ? 'focus.label.break' : 'focus.title');
  return (
    <Tap onTap={() => push({ name: 'focus' })} scale={0.98}>
      <Card pad={false} className="prayer-card">
        <span className="prayer-ic"><Emoji e={run.mode === 'break' ? '🍵' : '🎯'} /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{label}</span>
          <span className="t-small muted num">
            {run.endsAt ? t('focus.card.left', { time: clock(left) }) : t('focus.card.paused', { time: clock(left) })}
          </span>
        </span>
        <Ring value={1 - left / (run.minutes * 60_000)} size={38} stroke={4} glow={false} color={run.mode === 'break' ? '#22C55E' : 'var(--blue)'} />
      </Card>
    </Tap>
  );
}
