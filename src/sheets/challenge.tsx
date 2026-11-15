// Starting a friend challenge: what to race in and for how long. The invite opens right after.
import { useState } from 'react';
import { useNav } from '../store/nav';
import { useServer } from '../store/server';
import { useChallenges } from '../store/challenges';
import { CHALLENGE_DAYS, CHALLENGE_KINDS, ChallengeKind, KIND_EMOJI } from '../lib/challenges';
import { haptic } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { Chips, Field, Tap, cx } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { Emoji } from '../ui/Emoji';
import { challengeError, inviteFriends, kindName } from '../ui/challengeText';

export function ChallengeSheet({ onClose }: { onClose: () => void }) {
  const start = useChallenges((s) => s.start);
  const bot = useServer((s) => s.botUsername);
  const push = useNav((s) => s.push);
  const [kind, setKind] = useState<ChallengeKind>('xp');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const c = await start(kind, days);
      haptic('success');
      onClose();
      push({ name: 'challenge', id: c.id });
      inviteFriends(c, bot);
    } catch (e) {
      setError(challengeError(e));
      haptic('error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('ch.new')}
      onClose={onClose}
      foot={<Tap className="btn primary" onTap={go} disabled={busy} hap={false}>{t('ch.new.cta')}</Tap>}
    >
      <Field label={t('ch.new.kind')}>
        <div className="ch-kinds">
          {CHALLENGE_KINDS.map((k) => (
            <Tap key={k} className={cx('ch-kind', k === kind && 'on')} onTap={() => setKind(k)} hap="select" scale={0.97}>
              <span className="ch-kind-ic"><Emoji e={KIND_EMOJI[k]} /></span>
              <span className="t-body">{kindName(k)}</span>
              <span className="t-tiny muted">{t(`ch.how.${k}` as Key)}</span>
            </Tap>
          ))}
        </div>
      </Field>
      <Field label={t('ch.new.days')}>
        <Chips<string>
          options={CHALLENGE_DAYS.map((d) => ({ id: String(d), label: tn('ch.days', d) }))}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />
      </Field>
      <div className="t-tiny muted">{t('ch.privacy')}</div>
      {error ? <div className="t-small" style={{ color: 'var(--red)' }}>{error}</div> : null}
    </Sheet>
  );
}
