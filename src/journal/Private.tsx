// What stands in front of the journal while it is locked. Nothing of the journal is drawn behind it.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { LockSimple } from '@phosphor-icons/react';
import { t } from '../i18n';
import { Header, Screen, Tap } from '../ui/kit';
import { useLock, useLocked } from './lock';

/** Shows its children only while the journal is open; the lock's own screen otherwise. */
export function Private({ title, children }: { title: string; children: ReactNode }) {
  const locked = useLocked();
  return locked ? <LockScreen title={title} /> : <>{children}</>;
}

function LockScreen({ title }: { title: string }) {
  const unlock = useLock((s) => s.unlock);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await unlock(t('lock.reason'));
    setBusy(false);
    setFailed(!ok);
  };

  // The check starts by itself the first time; after a "no" it waits for the button.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <Header title={title} noGear />
      <div className="j-lock">
        <span className="j-lock-ic">
          <LockSimple size={40} weight="fill" />
        </span>
        <div className="t-title">{t('lock.title')}</div>
        <div className="t-small muted">{t(failed ? 'lock.failed' : 'lock.body')}</div>
        <Tap className="btn primary" onTap={() => void run()} disabled={busy}>
          {t('lock.open')}
        </Tap>
      </div>
    </Screen>
  );
}
