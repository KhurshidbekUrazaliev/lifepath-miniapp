// Restoring from a backup: paste it, see what is in it, and only then let it take the place of what is
// here. The checking is in lib/backup.ts: nothing reaches the store until the paste has passed it and
// the person has said yes to what they were shown.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardText, WarningCircle } from '@phosphor-icons/react';
import { emptyData, snapshot, useStore } from '../store/store';
import { useNav } from '../store/nav';
import { restartWeek } from '../store/week';
import { BackupSummary, readBackup, restored } from '../lib/backup';
import { Key, t } from '../i18n';
import { fmtClock, fmtLongDate } from '../i18n/format';
import { Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { haptic, hideKeyboard } from '../tg/telegram';
import { copyBackup } from '../journal/out';

type Note = { text: string; ok: boolean } | null;

const goHome = () => useNav.setState({ stack: [], tab: 'home', sheet: null });

function NoteLine({ note }: { note: Note }) {
  return note ? <div className="t-small center" style={{ color: note.ok ? 'var(--green)' : 'var(--orange)' }}>{note.text}</div> : null;
}

/** When the backup was made and what it holds. */
function Summary({ s }: { s: BackupSummary }) {
  const numbers: [number, string][] = [
    [s.goals, t('goals.title')],
    [s.habits, t('habits.title')],
    [s.logs, t('stats.logs')],
    [s.pages, t('restore.pages')],
    [s.notes, t('j.tab.notes')],
    [s.level, t('restore.level')],
  ];
  return (
    <div className="card restore-sum">
      <div className="restore-sum-head">
        <b>{t('restore.found')}</b>
        <span>{s.madeAt ? t('restore.made', { date: `${fmtLongDate(s.madeAt)}, ${fmtClock(s.madeAt)}` }) : t('restore.made.unknown')}</span>
      </div>
      <div className="restore-sum-grid">
        {numbers.map(([value, label]) => (
          <div key={label}>
            <b className="num">{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RestoreSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [step, setStep] = useState<'paste' | 'confirm' | 'done'>('paste');
  // The Paste button brought something, or nothing: from then on an empty box is said to be empty.
  const [asked, setAsked] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const read = useMemo(() => readBackup(text, emptyData()), [text]);
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  // Restored: a moment for the line to be read, then back to Home.
  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(goHome, 1800);
    return () => clearTimeout(timer);
  }, [step]);

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setAsked(true);
      setNote(null);
    } catch {
      setNote({ text: t('restore.paste.failed'), ok: false });
    }
  };

  const restore = () => {
    if (!read.ok) return;
    useStore.getState().replaceData(restored(read.data, snapshot()));
    restartWeek();
    haptic('success');
    setNote(null);
    setStep('done');
  };

  if (step === 'done') {
    return (
      <Sheet title={t('data.restore')} onClose={goHome} foot={<Tap className="btn primary" onTap={goHome}>{t('common.done')}</Tap>}>
        <div className="restore-mark" style={{ color: 'var(--green)' }}>
          <CheckCircle size={46} weight="fill" />
        </div>
        <div className="t-h center">{t('restore.done')}</div>
      </Sheet>
    );
  }

  if (step === 'confirm' && read.ok) {
    return (
      <Sheet
        title={t('data.restore')}
        onClose={onClose}
        foot={
          <div className="col tight">
            <Tap className="btn danger" onTap={restore} hap="medium">
              {t('restore.confirm.yes')}
            </Tap>
            <Tap
              className="btn soft"
              onTap={() => {
                setNote(null);
                setStep('paste');
              }}
            >
              {t('common.back')}
            </Tap>
          </div>
        }
      >
        <div className="restore-mark" style={{ color: 'var(--orange)' }}>
          <WarningCircle size={46} weight="fill" />
        </div>
        <div className="t-title center">{t('restore.confirm.title')}</div>
        <div className="t-small muted center" style={{ lineHeight: 1.5 }}>{t('restore.confirm.body')}</div>
        <Summary s={read.summary} />
        <Tap className="btn soft" onTap={() => void copyBackup().then(setNote)}>
          {t('restore.keep')}
        </Tap>
        <NoteLine note={note} />
      </Sheet>
    );
  }

  const problem = !read.ok && (text.trim() || asked) ? t(`restore.err.${read.problem}` as Key) : '';
  return (
    <Sheet
      title={t('data.restore')}
      onClose={onClose}
      foot={
        <Tap
          className="btn primary"
          disabled={!read.ok}
          hap={false}
          onTap={() => {
            hideKeyboard();
            setNote(null);
            setStep('confirm');
          }}
        >
          {t('common.continue')}
        </Tap>
      }
    >
      <div className="t-small muted" style={{ lineHeight: 1.5 }}>{t('restore.body')}</div>
      <textarea
        className="input restore-box"
        value={text}
        rows={4}
        placeholder={t('restore.ph')}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
      />
      {canPaste ? (
        <Tap className="btn soft sm pill restore-paste" onTap={() => void paste()}>
          <ClipboardText size={16} weight="bold" />
          {t('restore.paste')}
        </Tap>
      ) : null}
      {problem ? <div className="t-small" style={{ color: 'var(--orange)' }}>{problem}</div> : <NoteLine note={note} />}
      {read.ok ? <Summary s={read.summary} /> : null}
    </Sheet>
  );
}
