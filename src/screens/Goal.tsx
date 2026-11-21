// One goal: progress, pace forecast, steps, planned sessions, reminder, resources and its history.
import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwise, ArrowSquareOut, Bell, CalendarPlus, Check as CheckIcon, MagicWand, PencilSimple, Plus, Sparkle, Timer, Trash, X } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { Route, useNav } from '../store/nav';
import { usePlus } from '../store/server';
import { computeProgress, forecast } from '../lib/progress';
import { daysLeftForProof, evidenceState } from '../lib/evidence';
import { sparksFor } from '../lib/gamify';
import { dayKey } from '../lib/dates';
import { Entry, Task } from '../lib/types';
import { openLink } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtAmount, fmtProgress, fmtRelative, fmtShortDate, fmtTime, pct, weekdayMini } from '../i18n/format';
import { Bubble, Card, CheckTap, Header, IconBtn, Ring, Row, Screen, Section, Tap, cx, Glyph } from '../ui/kit';
import { PlanItem } from '../ui/parts';
import { confirmSheet } from '../sheets/confirm';

/** The two planning buttons size to their labels and grow to fill the row. */
const PLAN_BUTTON = { flex: '1 1 auto', width: 'auto', padding: '0 16px', whiteSpace: 'nowrap' } as const;

export function reminderLabel(task: Task): string {
  const r = task.reminder;
  if (!r) return t('goal.reminder.none');
  const days = [...r.days].sort();
  const when =
    days.length === 7 ? t('habit.everyDay')
      : days.join() === '2,3,4,5,6' ? t('habit.weekdays')
        : days.join() === '1,7' ? t('habit.weekends')
          : days.map((x) => weekdayMini(x - 1)).join(' ');
  return `${when} · ${fmtTime(r.hour, r.minute)}`;
}

function EntryRow({ entry, task }: { entry: Entry; task: Task }) {
  const open = useNav((s) => s.open);
  const state = evidenceState(entry);
  const left = daysLeftForProof(entry);
  return (
    <Tap className="lrow" onTap={() => open({ name: 'entry', entryId: entry.id })} scale={0.985} hap={false}>
      <span className="grow">
        <span className="t-body clip" style={{ display: 'block' }}>
          {entry.amount > 0 ? fmtAmount(entry.amount, task.unit, task.progressType) : entry.note}
        </span>
        <span className="t-small muted clip" style={{ display: 'block', marginTop: 2 }}>
          {fmtRelative(entry.at)}
          {entry.amount > 0 && entry.note ? ` · ${entry.note}` : ''}
        </span>
      </span>
      {state === 'pending' ? (
        <span className="pillnote orange">
          <Sparkle size={12} />
          {left === 0 ? t('goal.proof.lastDay') : tn('goal.proof.left', left)}
        </span>
      ) : state === 'verified' ? (
        <span className="pillnote green">
          <CheckIcon size={12} weight="bold" />
          {t('goal.proof.added')}
        </span>
      ) : state === 'expired' ? (
        <span className="pillnote grey">{t('goal.proof.expired')}</span>
      ) : null}
      <span className="t-small num" style={{ fontWeight: 700, minWidth: 48, textAlign: 'right' }}>+{entry.xp} XP</span>
    </Tap>
  );
}

export function Goal({ route }: { route: Extract<Route, { name: 'goal' }> }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === route.id));
  const folder = useStore((s) => s.folders.find((f) => f.id === task?.folderId));
  const entries = useStore((s) => s.entries);
  const plans = useStore((s) => s.plans);
  const toggleMilestone = useStore((s) => s.toggleMilestone);
  const addMilestone = useStore((s) => s.addMilestone);
  const removeMilestone = useStore((s) => s.removeMilestone);
  const addResource = useStore((s) => s.addResource);
  const removeResource = useStore((s) => s.removeResource);
  const completeTask = useStore((s) => s.completeTask);
  const reopenTask = useStore((s) => s.reopenTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const pop = useNav((s) => s.pop);
  const plus = usePlus();
  const [step, setStep] = useState('');
  const [res, setRes] = useState({ title: '', url: '' });
  const [showAll, setShowAll] = useState(false);

  // The goal can disappear under this screen (deleted here or on another device).
  useEffect(() => {
    if (!task) pop();
  }, [task, pop]);

  const mine = useMemo(() => (task ? entries.filter((e) => e.taskId === task.id).sort((a, b) => b.at - a.at) : []), [entries, task]);
  const p = useMemo(() => (task ? computeProgress(task, entries) : null), [task, entries]);
  const f = useMemo(() => (task ? forecast(task, entries) : null), [task, entries]);
  if (!task || !p) return <Screen><Header title="" /></Screen>;

  const today = dayKey();
  const upcoming = plans.filter((x) => x.taskId === task.id && !x.doneAt).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 4);
  const isSteps = task.progressType === 'milestones';
  const color = folder?.color;
  const pending = mine.filter((e) => evidenceState(e) === 'pending').reduce((s, e) => s + sparksFor(e.xp), 0);

  const remove = () =>
    confirmSheet({ title: t('confirm.goal.title'), body: t('confirm.goal.body'), confirm: t('goal.delete') }, () => {
      pop();
      deleteTask(task.id);
    });

  return (
    <Screen>
      <Header
        title={folder?.name ?? t('goals.title')}
        right={
          <IconBtn onTap={() => open({ name: 'goal', id: task.id })} label={t('goal.edit')}>
            <PencilSimple size={18} />
          </IconBtn>
        }
      />

      <Card>
        <div className="row" style={{ gap: 18 }}>
          <Ring value={p.ratio} size={112} stroke={11} color={task.completedAt ? '#34d399' : color}>
            <div className="t-display num" style={{ fontSize: 26 }}>{pct(p.ratio)}</div>
          </Ring>
          <div className="grow">
            <div className="t-title clip-2">{task.title}</div>
            <div className="t-small muted" style={{ marginTop: 6 }}>{fmtProgress(p.done, p.total, task.unit, task.progressType)}</div>
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {task.completedAt ? (
                <span className="pillnote green">{t('goal.finishedOn', { date: fmtShortDate(task.completedAt) })}</span>
              ) : task.deadline ? (
                <span className={cx('pillnote', dayKey(task.deadline) < today ? 'red' : 'grey')}>
                  {dayKey(task.deadline) < today ? t('goals.overdue') : t('goals.due', { date: fmtShortDate(task.deadline) })}
                </span>
              ) : null}
              {!task.completedAt && f?.onTrack !== undefined ? (
                <span className={cx('pillnote', f.onTrack ? 'green' : 'orange')}>{f.onTrack ? t('goals.onTrack') : t('goals.behind')}</span>
              ) : null}
            </div>
          </div>
        </div>
        {!task.completedAt && !isSteps ? (
          <Tap className="btn primary" style={{ marginTop: 16 }} onTap={() => open({ name: 'log', taskId: task.id })}>
            <Plus size={19} weight="bold" />
            {t('goal.log')}
          </Tap>
        ) : null}
        {!task.completedAt && task.progressType === 'time' ? (
          <Tap className="btn soft" style={{ marginTop: 10 }} onTap={() => push({ name: 'focus', taskId: task.id })}>
            <Timer size={19} weight="duotone" />
            {t('focus.forGoal')}
          </Tap>
        ) : null}
      </Card>

      {!task.completedAt && !isSteps ? (
        <Card className="row" style={{ gap: 12 }}>
          <Bubble icon="📈" size="sm" />
          <div className="grow t-small" style={{ lineHeight: 1.45 }}>
            {f?.finishAt ? <div>{t('goal.pace.finish', { date: fmtShortDate(f.finishAt) })}</div> : null}
            {f?.neededPerDay !== undefined && task.deadline ? (
              <div className="muted">
                {t('goal.pace.need', {
                  amount: t('unit.perDay', { amount: fmtAmount(Math.ceil(f.neededPerDay * 10) / 10, task.unit, task.progressType) }),
                  date: fmtShortDate(task.deadline),
                })}
              </div>
            ) : null}
            {!f ? <div className="muted">{t('goal.pace.none')}</div> : null}
          </div>
        </Card>
      ) : null}

      {isSteps || task.milestones.length ? (
        <Section title={t('goal.steps')}>
          <Card pad={false} className="list">
            {task.milestones.map((m) => (
              <div className="lrow" key={m.id}>
                <CheckTap on={m.done} onTap={() => toggleMilestone(task.id, m.id)} label={m.title} />
                <span className={cx('grow t-body', m.done && 'strike')}>{m.title}</span>
                <Tap className="chev" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }} onTap={() => removeMilestone(task.id, m.id)} label={t('common.delete')} scale={0.85}>
                  <X size={16} weight="bold" />
                </Tap>
              </div>
            ))}
            <form
              className="lrow"
              onSubmit={(e) => {
                e.preventDefault();
                if (!step.trim()) return;
                addMilestone(task.id, step.slice(0, 80));
                setStep('');
              }}
            >
              <span className="lrow-ic faint"><Plus size={20} /></span>
              <input className="grow t-body bare" value={step} maxLength={80} placeholder={t('goal.steps.add')} onChange={(e) => setStep(e.target.value)} enterKeyHint="done" />
            </form>
          </Card>
        </Section>
      ) : null}

      {!task.completedAt ? (
        <Section title={t('goal.planned')}>
          {upcoming.map((pl) => (
            <PlanItem key={pl.id} plan={pl} />
          ))}
          {/* Side by side when both labels fit on one line, otherwise stacked full width; never wrapped mid-label. */}
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Tap className="btn soft" style={PLAN_BUTTON} onTap={() => open({ name: 'task', taskId: task.id, day: today })}>
              <CalendarPlus size={18} />
              {t('goal.plan')}
            </Tap>
            <Tap className="btn soft" style={PLAN_BUTTON} onTap={() => (plus ? open({ name: 'planner', taskId: task.id }) : push({ name: 'plus' }))}>
              <MagicWand size={18} style={{ color: 'var(--violet)' }} />
              {t('goal.planSmart')}
            </Tap>
          </div>
        </Section>
      ) : null}

      <Card pad={false} className="list">
        <Row icon={<Bell size={20} />} title={t('goal.reminder')} value={reminderLabel(task)} onTap={() => open({ name: 'reminder', taskId: task.id })} />
      </Card>

      <Section title={t('goal.resources')}>
        <Card pad={false} className="list">
          {task.resources.map((r) => (
            <div className="lrow" key={r.id}>
              <Tap className="grow row" style={{ gap: 12 }} onTap={() => r.url && openLink(r.url)} scale={0.99} hap={r.url ? 'light' : false}>
                <Glyph className="lrow-ic" color={r.url ? 'var(--blue-hi)' : 'var(--glyph-plain)'} icon={<ArrowSquareOut size={18} />} />
                <span className="grow t-body clip">{r.title}</span>
              </Tap>
              <Tap className="chev" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }} onTap={() => removeResource(task.id, r.id)} label={t('common.delete')} scale={0.85}>
                <X size={16} weight="bold" />
              </Tap>
            </div>
          ))}
          <form
            className="lrow"
            style={{ flexWrap: 'wrap' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!res.title.trim()) return;
              addResource(task.id, res.title.slice(0, 80), res.url.slice(0, 300));
              setRes({ title: '', url: '' });
            }}
          >
            <span className="lrow-ic faint"><Plus size={20} /></span>
            <input className="grow t-body bare" value={res.title} maxLength={80} placeholder={t('goal.resources.add')} onChange={(e) => setRes({ ...res, title: e.target.value })} enterKeyHint="next" />
            {res.title ? (
              <input className="t-small bare" style={{ flexBasis: '100%', paddingLeft: 40, paddingTop: 6 }} value={res.url} maxLength={300} inputMode="url" autoCapitalize="none" placeholder={t('goal.resources.link')} onChange={(e) => setRes({ ...res, url: e.target.value })} enterKeyHint="done" />
            ) : null}
            <button type="submit" hidden />
          </form>
        </Card>
      </Section>

      <Section title={t('goal.history')} action={mine.length > 6 && !showAll ? t('common.seeAll') : undefined} onAction={() => setShowAll(true)}>
        {pending ? <div className="t-small" style={{ color: 'var(--orange)', padding: '0 2px' }}>{tn('you.pending', pending)}</div> : null}
        {mine.length ? (
          <Card pad={false} className="list">
            {(showAll ? mine : mine.slice(0, 6)).map((e) => (
              <EntryRow key={e.id} entry={e} task={task} />
            ))}
          </Card>
        ) : (
          <Card className="t-small muted center">{t('goal.history.empty')}</Card>
        )}
      </Section>

      <div className="col tight" style={{ marginTop: 6 }}>
        {task.completedAt ? (
          <Tap className="btn soft" onTap={() => reopenTask(task.id)}>
            <ArrowCounterClockwise size={18} />
            {t('goal.reopen')}
          </Tap>
        ) : (
          <Tap className="btn soft" onTap={() => completeTask(task.id)} hap="medium">
            <CheckIcon size={18} weight="bold" style={{ color: 'var(--green)' }} />
            {t('goal.finish')}
          </Tap>
        )}
        <Tap className="btn danger" onTap={remove}>
          <Trash size={18} />
          {t('goal.delete')}
        </Tap>
      </div>
    </Screen>
  );
}
