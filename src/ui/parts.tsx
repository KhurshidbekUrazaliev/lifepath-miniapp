// Cards that several screens share: a to-do, a goal, a habit row.
import { ReactNode, useMemo } from 'react';
import { motion } from 'motion/react';
import { Fire } from '@phosphor-icons/react';
import { Folder, Habit, Plan, Task } from '../lib/types';
import { computeProgress } from '../lib/progress';
import { habitStreak, isChecked } from '../lib/habits';
import { dayKey } from '../lib/dates';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { t, tn } from '../i18n';
import { dayTimeLabel, fmtClock, fmtProgress, fmtShortDate, pct } from '../i18n/format';
import { Bar, Bubble, Card, CheckTap, Tap, cx } from './kit';
import { Emoji } from './Emoji';

export function useFolderOf(): (taskId?: string) => { task?: Task; folder?: Folder } {
  const tasks = useStore((s) => s.tasks);
  const folders = useStore((s) => s.folders);
  return useMemo(() => {
    const byTask = new Map(tasks.map((x) => [x.id, x]));
    const byFolder = new Map(folders.map((f) => [f.id, f]));
    return (taskId?: string) => {
      const task = taskId ? byTask.get(taskId) : undefined;
      return { task, folder: task ? byFolder.get(task.folderId) : undefined };
    };
  }, [tasks, folders]);
}

export const planTitle = (plan: Plan, task?: Task): string => plan.title || task?.title || '';

/** A to-do card: round check, title, "Today • 8:00 PM", icon. */
export function PlanItem({ plan, showDay = true }: { plan: Plan; showDay?: boolean }) {
  const lookup = useFolderOf();
  const { task, folder } = lookup(plan.taskId);
  const toggle = useStore((s) => s.togglePlanDone);
  const open = useNav((s) => s.open);
  const done = !!plan.doneAt;
  const overdue = !done && plan.day < dayKey();

  const onCheck = () => {
    // Finishing a to-do that belongs to an open goal means logging that progress.
    if (!done && task && !task.completedAt) open({ name: 'log', taskId: task.id, planId: plan.id });
    else toggle(plan.id);
  };

  const sub = done
    ? `${t('home.completed')} • ${fmtClock(plan.doneAt!)}`
    : showDay
      ? dayTimeLabel(plan.day, plan.time)
      : plan.time
        ? dayTimeLabel(plan.day, plan.time).split(' • ')[1]
        : (task?.title ?? '');

  return (
    <Card pad={false} className={cx('item', done && 'done')}>
      {folder ? <i className="item-bar" style={{ background: folder.color }} /> : null}
      <CheckTap on={done} green={done} onTap={onCheck} label={planTitle(plan, task)} />
      <Tap className="grow" onTap={() => open({ name: 'task', id: plan.id })} scale={0.99} hap={false}>
        <div className="t-body item-title clip">{planTitle(plan, task)}</div>
        <div className={cx('t-small clip', done ? 'faint' : overdue ? '' : 'muted')} style={overdue ? { color: 'var(--orange)' } : done ? { color: 'var(--green)' } : undefined}>
          {sub}
        </div>
      </Tap>
      <Bubble icon={plan.icon ?? folder?.icon ?? '✅'} color={folder?.color} />
    </Card>
  );
}

/** A goal card: icon, title, target line, progress bar and percent. */
export function GoalCard({ task, folder }: { task: Task; folder?: Folder }) {
  const entries = useStore((s) => s.entries);
  const push = useNav((s) => s.push);
  const p = useMemo(() => computeProgress(task, entries), [task, entries]);
  const sub = task.completedAt
    ? t('goal.finishedOn', { date: fmtShortDate(task.completedAt) })
    : fmtProgress(p.done, p.total, task.unit, task.progressType);
  return (
    <Tap onTap={() => push({ name: 'goal', id: task.id })} scale={0.98}>
      <Card className="row" style={{ gap: 14 }}>
        <Bubble icon={folder?.icon ?? '🎯'} color={folder?.color} size="lg" />
        <div className="grow">
          <div className="t-body clip">{task.title}</div>
          <div className="t-small muted clip" style={{ marginTop: 2 }}>{sub}</div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <div className="grow">
              <Bar value={p.ratio} color={task.completedAt ? 'var(--green)' : undefined} />
            </div>
            <span className="t-small num" style={{ fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{pct(p.ratio)}</span>
          </div>
        </div>
      </Card>
    </Tap>
  );
}

/** A habit line with its check and streak. */
export function HabitRow({ habit, day, disabled }: { habit: Habit; day: string; disabled?: boolean }) {
  const checks = useStore((s) => s.checks);
  const toggle = useStore((s) => s.toggleHabit);
  const open = useNav((s) => s.open);
  const on = isChecked(checks, habit.id, day);
  const streak = useMemo(() => habitStreak(habit, checks), [habit, checks]);
  return (
    <Card pad={false} className="item" style={{ paddingTop: 11, paddingBottom: 11, opacity: disabled ? 0.5 : 1 }}>
      <CheckTap on={on} onTap={() => !disabled && toggle(habit.id, day)} label={habit.title} />
      <Tap className="grow" onTap={() => open({ name: 'habit', id: habit.id })} scale={0.99} hap={false}>
        <div className={cx('t-body clip', on && 'muted')}>{habit.title}</div>
      </Tap>
      {streak > 1 ? (
        <span className="pillnote orange">
          <Fire size={12} weight="bold" />
          {streak}
        </span>
      ) : null}
      <span style={{ fontSize: 20 }}><Emoji e={habit.icon} /></span>
    </Card>
  );
}

/** A round habit button for quick ticking on Home. */
export function HabitDot({ habit, day }: { habit: Habit; day: string }) {
  const on = useStore((s) => isChecked(s.checks, habit.id, day));
  const toggle = useStore((s) => s.toggleHabit);
  return (
    <Tap className="hdot" onTap={() => toggle(habit.id, day)} hap={on ? 'light' : 'medium'} scale={0.88} label={habit.title}>
      <motion.span
        className={cx('hdot-ring', on && 'on')}
        animate={on ? { scale: [1, 1.14, 1] } : { scale: 1 }}
        transition={{ duration: 0.36 }}
        style={on ? { borderColor: habit.color, background: `${habit.color}2e`, boxShadow: `0 6px 18px ${habit.color}55` } : undefined}
      >
        <Emoji e={habit.icon} />
        {on ? <i className="hdot-tick" style={{ background: habit.color }}>✓</i> : null}
      </motion.span>
      <span className="t-tiny clip muted" style={{ maxWidth: 64 }}>{habit.title}</span>
    </Tap>
  );
}

export function StatTile({ icon, value, label, onTap }: { icon: ReactNode; value: ReactNode; label: string; onTap?: () => void }) {
  const body = (
    <Card pad={false} className="tile">
      <span className="tile-ic">{icon}</span>
      <span className="tile-val num">{value}</span>
      <span className="t-tiny muted">{label}</span>
    </Card>
  );
  return onTap ? <Tap onTap={onTap}>{body}</Tap> : body;
}

export const streakText = (n: number): string => (n > 0 ? tn('home.streak', n) : t('home.streak.none'));
