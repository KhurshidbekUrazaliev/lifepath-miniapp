// Logging progress, adding proof to a log, and a log's details.
import { useMemo, useState } from 'react';
import { ArrowSquareOut, Check as CheckIcon, Minus, Plus, Sparkle, Trash } from '@phosphor-icons/react';
import { useStore, useVisibleStreak } from '../store/store';
import { Sheet as SheetState, useNav } from '../store/nav';
import { computeProgress } from '../lib/progress';
import { quickAmounts } from '../lib/templates';
import { XP, sparksFor, xpForLog } from '../lib/gamify';
import { EVIDENCE_WINDOW_DAYS, MIN_SUMMARY_CHARS, cleanEvidence, evidenceBonus, evidenceState } from '../lib/evidence';
import { haptic, openLink } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtAmount, fmtNumber, fmtRelative } from '../i18n/format';
import { Bar, Card, CheckTap, Field, Tap, Toggle, cx } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { confirmSheet } from './confirm';
import { Emoji } from '../ui/Emoji';

/** Summary and link fields, with a live "counts as proof" hint. */
function ProofFields({ summary, url, onSummary, onUrl }: { summary: string; url: string; onSummary: (v: string) => void; onUrl: (v: string) => void }) {
  const missing = MIN_SUMMARY_CHARS - summary.trim().length;
  const ok = !!cleanEvidence({ summary, url });
  return (
    <>
      <Field
        label={t('log.proof.summary')}
        hint={ok ? <span style={{ color: 'var(--green)' }}>✓ {t('log.proof.ok')}</span> : missing > 0 && summary ? tn('log.proof.more', missing) : undefined}
      >
        <textarea className="input" rows={3} maxLength={400} value={summary} onChange={(e) => onSummary(e.target.value)} />
      </Field>
      <Field label={t('log.proof.link')}>
        <input className="input" value={url} maxLength={300} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder={t('log.proof.link.ph')} onChange={(e) => onUrl(e.target.value)} />
      </Field>
    </>
  );
}

export function LogSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'log' }>; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === sheet.taskId));
  const folder = useStore((s) => s.folders.find((f) => f.id === task?.folderId));
  const entries = useStore((s) => s.entries);
  const logProgress = useStore((s) => s.logProgress);
  const toggleMilestone = useStore((s) => s.toggleMilestone);
  const togglePlanDone = useStore((s) => s.togglePlanDone);
  const streak = useVisibleStreak();

  const quick = useMemo(() => (task ? quickAmounts(task.progressType, task.target) : []), [task]);
  const [amount, setAmount] = useState(() => String(task?.progressType === 'sessions' ? 1 : quick[Math.min(1, quick.length - 1)] ?? 1));
  const [note, setNote] = useState('');
  const [proof, setProof] = useState(false);
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');

  const p = useMemo(() => (task ? computeProgress(task, entries) : null), [task, entries]);
  if (!task || !p) return null;

  const value = Math.max(0, Number(amount.replace(',', '.')) || 0);
  const evidence = proof ? { summary, url } : undefined;
  const proven = !!cleanEvidence(evidence);
  const base = xpForLog(task, value || 1, Math.max(1, streak));
  const estimate = base + (proven ? evidenceBonus(base) : 0);
  const step = task.progressType === 'time' ? 5 : task.target >= 100000 ? 10000 : 1;

  // A goal made of steps is logged by ticking a step.
  if (task.progressType === 'milestones') {
    return (
      <Sheet title={task.title} onClose={onClose}>
        <Bar value={p.ratio} color={folder?.color} />
        <Card pad={false} className="list">
          {task.milestones.map((m) => (
            <div className="lrow" key={m.id}>
              <CheckTap
                on={m.done}
                label={m.title}
                onTap={() => {
                  toggleMilestone(task.id, m.id);
                  if (!m.done && sheet.planId) {
                    const plan = useStore.getState().plans.find((x) => x.id === sheet.planId);
                    if (plan && !plan.doneAt) togglePlanDone(plan.id);
                    onClose();
                  }
                }}
              />
              <span className={cx('grow t-body', m.done && 'strike')}>{m.title}</span>
            </div>
          ))}
        </Card>
      </Sheet>
    );
  }

  const save = () => {
    if (value <= 0) return;
    logProgress(task.id, value, note, evidence, sheet.planId);
    haptic('success');
    onClose();
  };

  return (
    <Sheet
      title={t('log.title')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} disabled={value <= 0} hap={false}>
          {t('log.save')} · {t('cel.xp', { n: estimate })}
        </Tap>
      }
    >
      <div className="row" style={{ gap: 12 }}>
        <span className="bubble" style={folder ? { background: `${folder.color}26`, borderColor: `${folder.color}40` } : undefined}><Emoji e={folder?.icon ?? '🎯'} /></span>
        <div className="grow">
          <div className="t-body clip">{task.title}</div>
          <div className="t-small muted">{t('goal.left', { amount: fmtAmount(p.remaining, task.unit, task.progressType) })}</div>
        </div>
      </div>
      <Bar value={p.ratio} color={folder?.color} />

      {task.progressType === 'sessions' ? (
        <Card className="row" style={{ gap: 12 }}>
          <span className="check on green" style={{ width: 30, height: 30 }}><CheckIcon size={17} weight="bold" /></span>
          <span className="t-body">{t('log.session')}</span>
        </Card>
      ) : (
        <Field label={t('log.amount')}>
          <div className="stepper">
            <Tap onTap={() => setAmount(String(Math.max(0, value - step)))} label="−" scale={0.9}><Minus size={22} /></Tap>
            <div style={{ textAlign: 'center' }}>
              <input className="num" inputMode="decimal" value={amount} maxLength={8} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} onFocus={(e) => e.target.select()} />
              <div className="t-tiny muted">{task.progressType === 'time' ? t('unit.min', { n: '' }).trim() : task.unit}</div>
            </div>
            <Tap onTap={() => setAmount(String(value + step))} label="+" scale={0.9}><Plus size={22} /></Tap>
          </div>
          <div className="chips" style={{ paddingBottom: 0, justifyContent: 'center' }}>
            {quick.map((q) => (
              <button key={q} type="button" className={cx('chip', value === q && 'on solid')} onClick={() => { haptic('select'); setAmount(String(q)); }}>
                <span>{task.progressType === 'time' ? fmtAmount(q, task.unit, 'time') : `+${fmtNumber(q)}`}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={t('log.note')}>
        <input className="input" value={note} maxLength={160} placeholder={t('log.note.ph')} onChange={(e) => setNote(e.target.value)} enterKeyHint="done" />
      </Field>

      <Card className="col tight" style={{ padding: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <Sparkle size={20} style={{ color: 'var(--gold)' }} />
          <div className="grow">
            <div className="t-body">{t('log.proof')}</div>
            <div className="t-small muted">{t('log.proof.hint')}</div>
          </div>
          <Toggle on={proof} onChange={setProof} label={t('log.proof')} />
        </div>
        {proof ? <ProofFields summary={summary} url={url} onSummary={setSummary} onUrl={setUrl} /> : <div className="t-tiny faint">{t('log.quick', { n: EVIDENCE_WINDOW_DAYS })}</div>}
      </Card>
      <div className="t-tiny faint center">{t('home.quest')}: +{XP.dailyQuest} XP</div>
    </Sheet>
  );
}

export function ProofSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'proof' }>; onClose: () => void }) {
  const entry = useStore((s) => s.entries.find((e) => e.id === sheet.entryId));
  const attach = useStore((s) => s.attachEvidence);
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  if (!entry) return null;
  const sparks = sparksFor(entry.xp + evidenceBonus(entry.xp));

  const save = () => {
    const result = attach(entry.id, { summary, url });
    if (result.ok) {
      haptic('success');
      onClose();
    } else {
      haptic('error');
      setError(true);
    }
  };

  return (
    <Sheet
      title={t('proof.title')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} hap={false}>
          <Sparkle size={18} />
          {t('proof.save', { n: sparks })}
        </Tap>
      }
    >
      <div className="t-small muted" style={{ lineHeight: 1.5 }}>{t('proof.body')}</div>
      <ProofFields summary={summary} url={url} onSummary={(v) => { setSummary(v); setError(false); }} onUrl={(v) => { setUrl(v); setError(false); }} />
      {error ? <div className="t-small" style={{ color: 'var(--red)' }}>{t('proof.invalid')}</div> : null}
    </Sheet>
  );
}

export function EntrySheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'entry' }>; onClose: () => void }) {
  const entry = useStore((s) => s.entries.find((e) => e.id === sheet.entryId));
  const task = useStore((s) => s.tasks.find((x) => x.id === entry?.taskId));
  const deleteEntry = useStore((s) => s.deleteEntry);
  const open = useNav((s) => s.open);
  if (!entry || !task) return null;
  const state = evidenceState(entry);

  return (
    <Sheet title={task.title} onClose={onClose}>
      <Card>
        <div className="row between">
          <span className="t-title num">{entry.amount > 0 ? fmtAmount(entry.amount, task.unit, task.progressType) : entry.note}</span>
          <span className="pillnote">+{entry.xp} XP</span>
        </div>
        <div className="t-small muted" style={{ marginTop: 6 }}>
          {fmtRelative(entry.at)}
          {entry.amount > 0 && entry.note ? ` · ${entry.note}` : ''}
        </div>
      </Card>

      {entry.evidence ? (
        <Card>
          <div className="t-tiny" style={{ color: 'var(--green)', marginBottom: 6 }}>✓ {t('entry.proof')}</div>
          {entry.evidence.summary ? <div className="t-small" style={{ lineHeight: 1.5, userSelect: 'text' }}>{entry.evidence.summary}</div> : null}
          {entry.evidence.url ? (
            <Tap className="row accent" style={{ gap: 8, marginTop: 8 }} onTap={() => openLink(entry.evidence!.url!)}>
              <ArrowSquareOut size={15} />
              <span className="t-small clip">{entry.evidence.url}</span>
            </Tap>
          ) : null}
        </Card>
      ) : null}

      {state === 'pending' ? (
        <Tap className="btn primary" onTap={() => open({ name: 'proof', entryId: entry.id })}>
          <Sparkle size={18} />
          {t('goal.proof.add')}
        </Tap>
      ) : null}
      <Tap
        className="btn danger"
        onTap={() =>
          confirmSheet({ title: t('confirm.entry.title'), body: t('confirm.entry.body'), confirm: t('entry.delete') }, () => {
            onClose();
            deleteEntry(entry.id);
          })
        }
      >
        <Trash size={18} />
        {t('entry.delete')}
      </Tap>
    </Sheet>
  );
}
