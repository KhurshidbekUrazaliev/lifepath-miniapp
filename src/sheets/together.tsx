// Sheets for group khatms: starting one (a name and, if the group likes, a day to finish by), and one
// juz of the board (where to read it, and what its reader can do with it).
import { useState } from 'react';
import { ArrowSquareOut, Check as CheckIcon } from '@phosphor-icons/react';
import { useNav } from '../store/nav';
import { useServer } from '../store/server';
import { useKhatms } from '../store/together';
import { JUZ_XP, JUZ_XP_DAY, JuzAction, board, juzPages, juzUrl } from '../lib/together';
import { surahOf } from '../lib/khatm';
import { dayKey } from '../lib/dates';
import { shiftDay } from '../lib/habits';
import { haptic, openLink } from '../tg/telegram';
import { t } from '../i18n';
import { Card, Field, Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { inviteToKhatm, khatmError, nameOf } from '../ui/togetherText';

/** The server takes a finish date up to two years ahead. */
const MAX_DUE_DAYS = 730;

export function KhatmNewSheet({ onClose }: { onClose: () => void }) {
  const start = useKhatms((s) => s.start);
  const bot = useServer((s) => s.botUsername);
  const push = useNav((s) => s.push);
  const [title, setTitle] = useState(t('gk.new.default'));
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = title.replace(/\s+/g, ' ').trim();
  const today = dayKey();

  const go = async () => {
    if (busy || !name) return;
    setBusy(true);
    setError('');
    try {
      const k = await start(name, due || null);
      haptic('success');
      onClose();
      push({ name: 'gkhatm', id: k.id });
      inviteToKhatm(k, bot);
    } catch (e) {
      setError(khatmError(e));
      haptic('error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('gk.new')}
      onClose={onClose}
      foot={<Tap className="btn primary" onTap={go} disabled={busy || !name} hap={false}>{t('gk.new.cta')}</Tap>}
    >
      <Field label={t('gk.new.name')}>
        <input className="input" value={title} maxLength={40} placeholder={t('gk.new.default')} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
      </Field>
      <Field label={t('gk.new.due')}>
        <div className="row" style={{ gap: 10 }}>
          <input className="input grow" type="date" value={due} min={today} max={shiftDay(today, MAX_DUE_DAYS)} onChange={(e) => setDue(e.target.value)} />
          {due ? <Tap className="btn soft sm" onTap={() => setDue('')}>{t('goal.deadline.none')}</Tap> : null}
        </div>
      </Field>
      <div className="t-tiny muted">{t('gk.xpNote', { n: JUZ_XP, max: JUZ_XP_DAY })} {t('gk.privacy')}</div>
      {error ? <div className="t-small" style={{ color: 'var(--red)' }}>{error}</div> : null}
    </Sheet>
  );
}

export function JuzSheet({ sheet, onClose }: { sheet: { id: string; juz: number }; onClose: () => void }) {
  const khatm = useKhatms((s) => s.list?.find((k) => k.id === sheet.id));
  const act = useKhatms((s) => s.juz);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cell = khatm ? board(khatm)[sheet.juz - 1] : undefined;
  const state = cell?.state ?? 'free';
  const pages = juzPages(sheet.juz);
  // A complete khatm stays as it is; so does a juz that is somebody else's.
  const open = !!khatm && khatm.joined && !khatm.done;

  const run = async (action: JuzAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await act(sheet.id, sheet.juz, action);
      haptic(action === 'read' ? 'success' : 'light');
      onClose();
    } catch (e) {
      setError(khatmError(e));
      haptic('error');
      setBusy(false);
    }
  };

  const says =
    state === 'mine' ? t('gk.s.mine')
    : state === 'mineRead' ? t('gk.s.mineRead')
    : state === 'taken' ? t('gk.s.taken', { name: nameOf(cell?.name ?? '') })
    : state === 'read' ? t('gk.s.read', { name: nameOf(cell?.name ?? '') })
    : '';

  return (
    <Sheet
      title={t('gk.juz', { n: sheet.juz })}
      onClose={onClose}
      foot={
        open && state === 'mine' ? (
          <Tap className="btn primary" onTap={() => run('read')} disabled={busy} hap={false}>
            <CheckIcon size={18} weight="bold" />
            {t('gk.markRead')}
          </Tap>
        ) : undefined
      }
    >
      <Card className="row gk-where">
        <span className="gk-num lg num">{sheet.juz}</span>
        <div className="grow">
          <div className="t-body">{t('khatm.pages', pages)}</div>
          <div className="t-small muted clip">{surahOf(pages.from).name}</div>
        </div>
      </Card>
      {says ? <div className="t-small muted center">{says}</div> : null}
      <Tap className="btn soft" onTap={() => openLink(juzUrl(sheet.juz))}>
        <ArrowSquareOut size={18} />
        {t('khatm.read')}
      </Tap>
      {open && state === 'mine' ? (
        <>
          <Tap className="btn ghost" onTap={() => run('release')} disabled={busy} hap={false}>{t('gk.giveBack')}</Tap>
          <div className="t-tiny muted center">{t('gk.xpNote', { n: JUZ_XP, max: JUZ_XP_DAY })}</div>
        </>
      ) : null}
      {open && state === 'mineRead' ? (
        <>
          <Tap className="btn ghost" onTap={() => run('unread')} disabled={busy} hap={false}>{t('gk.unmark')}</Tap>
          <div className="t-tiny muted center">{t('gk.unmark.hint')}</div>
        </>
      ) : null}
      {error ? <div className="t-small center" style={{ color: 'var(--red)' }}>{error}</div> : null}
    </Sheet>
  );
}
