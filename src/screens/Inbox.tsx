// Inbox: what needs you now. Proof to add, tasks that slipped, what is coming up, and recent wins.
import { useMemo, useState } from 'react';
import { BellRinging, Sparkle } from '@phosphor-icons/react';
import { useData, useStore } from '../store/store';
import { useNav } from '../store/nav';
import { useServer } from '../store/server';
import { isNative } from '../tg/telegram';
import { disableReminders, enableReminders } from '../store/serverSync';
import { dayKey } from '../lib/dates';
import { daysLeftForProof, evidenceState, pendingSparks } from '../lib/evidence';
import { sparksFor } from '../lib/gamify';
import { activeHabits, dayTally } from '../lib/habits';
import { badgeById } from '../lib/achievements';
import { Key, t, tn } from '../i18n';
import { fmtAmount, fmtRelative } from '../i18n/format';
import { Card, Empty, Header, Screen, Section, Tap, Toggle, Glyph } from '../ui/kit';
import { Hex } from '../ui/charts';
import { PlanItem } from '../ui/parts';
import { Emoji } from '../ui/Emoji';

const DAY = 86400_000;

/** The orange dot on the bell: proof is waiting or a task slipped. */
export function useInboxDot(): boolean {
  const entries = useStore((s) => s.entries);
  const plans = useStore((s) => s.plans);
  return useMemo(() => {
    const today = dayKey();
    return entries.some((e) => evidenceState(e) === 'pending') || plans.some((p) => !p.doneAt && p.day < today);
  }, [entries, plans]);
}

/** The reminders switch, shared with Settings. Shows why it could not be turned on. */
export function RemindersSwitch({ onProblem }: { onProblem: (message: string) => void }) {
  // In the phone app the switch is on only when the phone may also show them: off, a tap asks again.
  const wanted = useStore((s) => s.settings.reminders);
  const shown = useServer((s) => !isNative || s.canMessage);
  const on = wanted && shown;
  const [busy, setBusy] = useState(false);
  return (
    <Toggle
      on={on}
      label={t(isNative ? 'app.notif.bot' : 'notif.bot')}
      onChange={async (next) => {
        if (busy) return;
        if (!next) return disableReminders();
        setBusy(true);
        const result = await enableReminders();
        setBusy(false);
        onProblem(result === 'denied' ? t(isNative ? 'app.notif.denied' : 'notif.denied') : result === 'off' ? t('notif.off') : '');
      }}
    />
  );
}

export function Inbox() {
  const d = useData();
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const server = useServer((s) => s.status);
  const [problem, setProblem] = useState('');
  const today = dayKey();

  const m = useMemo(() => {
    const taskOf = (id: string) => d.tasks.find((x) => x.id === id);
    const pending = d.entries
      .filter((e) => evidenceState(e) === 'pending' && taskOf(e.taskId))
      .sort((a, b) => a.at - b.at)
      .map((e) => ({ e, task: taskOf(e.taskId)! }));
    const overdue = d.plans.filter((p) => !p.doneAt && p.day < today).sort((a, b) => a.day.localeCompare(b.day));
    const upcoming = d.plans
      .filter((p) => !p.doneAt && p.day >= today)
      .sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99'))
      .slice(0, 5);
    const tally = dayTally(activeHabits(d.habits), d.checks, today);
    const since = Date.now() - 30 * DAY;
    const feed = [
      ...Object.entries(d.profile.achievements)
        .filter(([, at]) => at >= since)
        .map(([id, at]) => ({ key: `a${id}`, at, badge: badgeById(id), text: t('inbox.feed.badge', { title: t(`ach.${id}.title` as Key) }) })),
      ...d.tasks
        .filter((x) => x.completedAt && x.completedAt >= since)
        .map((x) => ({ key: `g${x.id}`, at: x.completedAt!, badge: undefined, text: t('inbox.feed.goal', { title: x.title }) })),
    ].sort((a, b) => b.at - a.at).slice(0, 8);
    return { pending, overdue, upcoming, habitsLeft: tally.due - tally.done, feed, held: pendingSparks(d.entries) };
  }, [d, today]);

  const quiet = !m.pending.length && !m.overdue.length && !m.upcoming.length && !m.feed.length && m.habitsLeft === 0;

  return (
    <Screen>
      <Header title={t('inbox.title')} />

      <Card>
        <div className="row" style={{ gap: 14 }}>
          <Glyph className="bubble" color="var(--blue-hi)" icon={<BellRinging size={21} />} />
          <div className="grow">
            <div className="t-body">{t(isNative ? 'app.inbox.reminders' : 'inbox.reminders')}</div>
            <div className="t-small muted">{d.settings.reminders ? t('inbox.reminders.on') : t(isNative ? 'app.inbox.reminders.off' : 'inbox.reminders.off')}</div>
          </div>
          <RemindersSwitch onProblem={setProblem} />
        </div>
        {problem || (server === 'off' && !isNative && !d.settings.reminders) ? (
          <div className="t-small" style={{ marginTop: 12, color: problem ? 'var(--orange)' : 'var(--text-3)' }}>{problem || t('notif.off')}</div>
        ) : null}
      </Card>

      {m.habitsLeft > 0 ? (
        <Tap onTap={() => push({ name: 'habits' })} scale={0.98}>
          <Card className="row" style={{ gap: 12, padding: '12px 16px' }}>
            <span style={{ fontSize: 20 }}>🌱</span>
            <span className="t-body grow">{tn('inbox.habitsLeft', m.habitsLeft)}</span>
          </Card>
        </Tap>
      ) : null}

      {m.pending.length ? (
        <Section title={t('inbox.proofs')}>
          <div className="t-small muted" style={{ padding: '0 2px' }}>{tn('inbox.proofs.body', m.held)}</div>
          {m.pending.slice(0, 6).map(({ e, task }) => {
            const left = daysLeftForProof(e);
            return (
              <Card key={e.id} pad={false} className="item">
                <div className="grow">
                  <div className="t-body clip">{task.title}</div>
                  <div className="t-small muted clip">
                    {e.amount > 0 ? fmtAmount(e.amount, task.unit, task.progressType) : e.note} · {fmtRelative(e.at)} ·{' '}
                    <span style={{ color: 'var(--orange)' }}>{left === 0 ? t('goal.proof.lastDay') : tn('goal.proof.left', left)}</span>
                  </div>
                </div>
                <Tap className="btn primary sm pill" onTap={() => open({ name: 'proof', entryId: e.id })}>
                  <Sparkle size={15} />
                  {sparksFor(e.xp)}
                </Tap>
              </Card>
            );
          })}
        </Section>
      ) : null}

      {m.overdue.length ? (
        <Section title={t('inbox.overdue')}>
          {m.overdue.slice(0, 6).map((p) => (
            <PlanItem key={p.id} plan={p} />
          ))}
        </Section>
      ) : null}

      {m.upcoming.length ? (
        <Section title={t('inbox.upcoming')} action={t('common.seeAll')} onAction={() => push({ name: 'tasks' })}>
          {m.upcoming.map((p) => (
            <PlanItem key={p.id} plan={p} />
          ))}
        </Section>
      ) : null}

      {m.feed.length ? (
        <Section title={t('inbox.recent')}>
          <Card pad={false} className="list">
            {m.feed.map((f) => (
              <div className="lrow" key={f.key}>
                {f.badge ? <Hex tone={f.badge.tone} icon={f.badge.icon} size={34} /> : <span className="lrow-ic" style={{ fontSize: 22, width: 34 }}><Emoji e="🏁" /></span>}
                <span className="grow t-small" style={{ fontWeight: 600 }}>{f.text}</span>
                <span className="t-tiny faint">{fmtRelative(f.at)}</span>
              </div>
            ))}
          </Card>
        </Section>
      ) : null}

      {quiet ? <Empty icon="📭" title={t('inbox.empty.title')} body={t('inbox.empty.body')} /> : null}
    </Screen>
  );
}
