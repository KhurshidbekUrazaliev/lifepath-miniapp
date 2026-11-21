// The create menu and the sheets for a task and a habit.
import { useMemo, useState } from 'react';
import { CalendarCheck, FolderPlus, Note, Notebook, PencilSimpleLine, Repeat, Target, Trash } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { Sheet as SheetState, useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { EVERY_DAY, shiftDay } from '../lib/habits';
import { PALETTE } from '../lib/templates';
import { openGoals } from '../lib/stats';
import { haptic } from '../tg/telegram';
import { Key, t } from '../i18n';
import { weekdayMini } from '../i18n/format';
import { Bubble, DayStrip, EmojiPick, Field, Segmented, Swatches, Tap, cx, Glyph } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { confirmSheet } from './confirm';
import { useNewArea } from '../screens/Goals';
import { Emoji } from '../ui/Emoji';

// ---------- shared bits ----------

/** Seven round weekday toggles, Monday first. Values use 1 = Sunday ... 7 = Saturday. */
export function Weekdays({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="wdays">
      {[2, 3, 4, 5, 6, 7, 1].map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            className={cx('wday', on && 'on')}
            onClick={() => {
              haptic('select');
              onChange(on ? value.filter((x) => x !== d) : [...value, d].sort());
            }}
          >
            {weekdayMini(d - 1)}
          </button>
        );
      })}
    </div>
  );
}

export function TimeField({ value, onChange, emptyLabel }: { value: string; onChange: (v: string) => void; emptyLabel: string }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <input className="input time grow" type="time" value={value} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <Tap className="btn soft sm" onTap={() => onChange('')}>
          {emptyLabel}
        </Tap>
      ) : null}
    </div>
  );
}

// ---------- create menu ----------

export function AddSheet({ onClose }: { onClose: () => void }) {
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const tasks = useStore((s) => s.tasks);
  const folders = useStore((s) => s.folders);
  const entries = useStore((s) => s.entries);
  const newArea = useNewArea();
  const [picking, setPicking] = useState(false);
  const goals = useMemo(() => openGoals({ tasks, folders }).filter((g) => g.progressType !== 'milestones'), [tasks, folders]);
  void entries;

  const options = [
    { icon: <CalendarCheck size={22} />, color: '#3d7bff', title: t('add.task'), hint: t('add.task.hint'), go: () => open({ name: 'task', day: dayKey() }) },
    // Pushing a screen closes the menu.
    { icon: <Notebook size={22} />, color: '#a596ff', title: t('add.entry'), hint: t('add.entry.hint'), go: () => push({ name: 'page' }) },
    { icon: <Note size={22} />, color: '#ffcf5c', title: t('add.note'), hint: t('add.note.hint'), go: () => push({ name: 'page', kind: 'note' }) },
    { icon: <Repeat size={22} />, color: '#34d399', title: t('add.habit'), hint: t('add.habit.hint'), go: () => open({ name: 'habit' }) },
    { icon: <Target size={22} />, color: '#ff9f43', title: t('add.goal'), hint: t('add.goal.hint'), go: () => (folders.length ? open({ name: 'goal' }) : newArea()) },
    { icon: <PencilSimpleLine size={22} />, color: '#9b8cff', title: t('add.log'), hint: t('add.log.hint'), go: () => setPicking(true) },
    { icon: <FolderPlus size={22} />, color: '#3dd6f5', title: t('add.area'), hint: t('add.area.hint'), go: newArea },
  ];

  if (picking) {
    return (
      <Sheet title={t('log.pick')} onClose={onClose}>
        {goals.length === 0 ? <div className="t-small muted center" style={{ padding: 20 }}>{t('log.pick.empty')}</div> : null}
        {goals.map((g) => {
          const folder = folders.find((f) => f.id === g.folderId);
          return (
            <Tap key={g.id} className="card item" onTap={() => open({ name: 'log', taskId: g.id })} scale={0.98}>
              <Bubble icon={folder?.icon ?? '🎯'} color={folder?.color} />
              <span className="grow">
                <span className="t-body clip" style={{ display: 'block' }}>{g.title}</span>
                <span className="t-small muted clip" style={{ display: 'block' }}>{folder?.name}</span>
              </span>
            </Tap>
          );
        })}
      </Sheet>
    );
  }

  return (
    <Sheet title={t('add.title')} onClose={onClose}>
      <div className="col tight">
        {options.map((o) => (
          <Tap key={o.title} className="card item" onTap={o.go} scale={0.98}>
            <Glyph className="bubble" color={o.color} icon={o.icon} />
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{o.title}</span>
              <span className="t-small muted" style={{ display: 'block' }}>{o.hint}</span>
            </span>
          </Tap>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- task ----------

const TASK_ICONS = ['✅', '📖', '💻', '🏋️', '🏃', '📚', '🛒', '📞', '✍️', '🧹', '💼', '🎓', '🕌', '💧', '🍳', '🎯'];

export function TaskSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'task' }>; onClose: () => void }) {
  const existing = useStore((s) => s.plans.find((p) => p.id === sheet.id));
  const tasks = useStore((s) => s.tasks);
  const folders = useStore((s) => s.folders);
  const addPlan = useStore((s) => s.addPlan);
  const updatePlan = useStore((s) => s.updatePlan);
  const deletePlan = useStore((s) => s.deletePlan);
  const today = dayKey();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [goalId, setGoalId] = useState<string | undefined>(existing ? existing.taskId : sheet.taskId);
  const [day, setDay] = useState(existing?.day ?? sheet.day ?? today);
  const [time, setTime] = useState(existing?.time ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '✅');

  const goals = useMemo(() => openGoals({ tasks, folders }), [tasks, folders]);
  const goal = goals.find((g) => g.id === goalId) ?? tasks.find((g) => g.id === goalId);
  const days = useMemo(() => {
    const base = Array.from({ length: 7 }, (_, i) => shiftDay(today, i));
    return base.includes(day) ? base : [day, ...base.slice(0, 6)].sort();
  }, [today, day]);
  const valid = title.trim().length > 0 || !!goal;

  const save = () => {
    if (!valid) return;
    const data = {
      taskId: goal?.id,
      title: title.trim() || undefined,
      icon: goal ? undefined : icon,
      day,
      time: time || undefined,
      note: note.trim() || undefined,
    };
    if (existing) updatePlan(existing.id, data);
    else addPlan(data);
    haptic('success');
    onClose();
  };

  return (
    <Sheet
      title={existing ? t('task.edit') : t('task.new')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} disabled={!valid} hap={false}>
          {existing ? t('common.save') : t('task.save')}
        </Tap>
      }
    >
      <Field label={t('task.title')}>
        <input className="input" value={title} maxLength={80} placeholder={goal?.title ?? t('task.title.ph')} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
      </Field>

      {goals.length ? (
        <Field label={t('task.goal')} hint={goal ? t('task.goal.hint') : undefined}>
          <div className="chips" style={{ paddingTop: 0, paddingBottom: 2 }}>
            <button type="button" className={cx('chip', !goal && 'on solid')} onClick={() => setGoalId(undefined)}>
              <span>{t('task.goal.none')}</span>
            </button>
            {goals.map((g) => (
              <button key={g.id} type="button" className={cx('chip', goal?.id === g.id && 'on solid')} onClick={() => { haptic('select'); setGoalId(g.id); }}>
                <span><Emoji e={folders.find((f) => f.id === g.folderId)?.icon ?? '🎯'} /> {g.title}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label={t('task.day')}>
        <DayStrip days={days} value={day} onChange={setDay} />
        <input className="input" type="date" value={day} min="2020-01-01" onChange={(e) => e.target.value && setDay(e.target.value)} style={{ marginTop: 8 }} />
      </Field>

      <Field label={t('task.time')}>
        <TimeField value={time} onChange={setTime} emptyLabel={t('task.time.none')} />
      </Field>

      {!goal ? (
        <Field label={t('task.icon')}>
          <EmojiPick emojis={TASK_ICONS} value={icon} onChange={setIcon} />
        </Field>
      ) : null}

      <Field label={t('task.note')}>
        <input className="input" value={note} maxLength={160} placeholder={t('task.note.ph')} onChange={(e) => setNote(e.target.value)} enterKeyHint="done" />
      </Field>

      {existing ? (
        <Tap
          className="btn danger"
          onTap={() => {
            deletePlan(existing.id);
            onClose();
          }}
        >
          <Trash size={18} />
          {t('task.delete')}
        </Tap>
      ) : null}
    </Sheet>
  );
}

// ---------- habit ----------

const HABIT_ICONS = ['📖', '💪', '💧', '📿', '🗣️', '💻', '🌙', '🏃', '🧘', '✍️', '🥗', '🚶', '🛏️', '🧠', '🎧', '🌱'];
export type IdeaGroup = 'faith' | 'health' | 'mind' | 'life';
/** Habit ideas for anyone, grouped for the first-run picker (habit.s.<key>, habit.g.<group>). */
const IDEAS: { key: string; icon: string; color: string; group: IdeaGroup }[] = [
  { key: 'quran', icon: '📖', color: '#10B981', group: 'faith' },
  { key: 'dhikr', icon: '📿', color: '#A855F7', group: 'faith' },
  { key: 'hadith', icon: '📗', color: '#14B8A6', group: 'faith' },
  { key: 'workout', icon: '💪', color: '#FF6B5B', group: 'health' },
  { key: 'walk', icon: '🚶', color: '#22C55E', group: 'health' },
  { key: 'water', icon: '💧', color: '#0EA5E9', group: 'health' },
  { key: 'stretch', icon: '🧘', color: '#A855F7', group: 'health' },
  { key: 'veggies', icon: '🥗', color: '#22C55E', group: 'health' },
  { key: 'sleep', icon: '🌙', color: '#6C63FF', group: 'health' },
  { key: 'read', icon: '📚', color: '#F59E0B', group: 'mind' },
  { key: 'study', icon: '🎓', color: '#3B82F6', group: 'mind' },
  { key: 'language', icon: '🗣️', color: '#14B8A6', group: 'mind' },
  { key: 'skill', icon: '🎯', color: '#F97316', group: 'mind' },
  { key: 'journal', icon: '✍️', color: '#EC4899', group: 'mind' },
  { key: 'screens', icon: '⏳', color: '#64748B', group: 'mind' },
  { key: 'family', icon: '📞', color: '#E11D48', group: 'life' },
  { key: 'kind', icon: '🕊️', color: '#F97316', group: 'life' },
  { key: 'tidy', icon: '🧹', color: '#0EA5E9', group: 'life' },
  { key: 'plan', icon: '🗓️', color: '#6C63FF', group: 'life' },
];
export const HABIT_IDEAS = IDEAS;
export const IDEA_GROUPS: IdeaGroup[] = ['faith', 'health', 'mind', 'life'];

export function HabitSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'habit' }>; onClose: () => void }) {
  const existing = useStore((s) => s.habits.find((h) => h.id === sheet.id));
  const createHabit = useStore((s) => s.createHabit);
  const updateHabit = useStore((s) => s.updateHabit);
  const deleteHabit = useStore((s) => s.deleteHabit);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '🌱');
  const [color, setColor] = useState(existing?.color ?? PALETTE[4]);
  const [days, setDays] = useState<number[]>(existing?.days ?? EVERY_DAY);
  const [time, setTime] = useState(existing?.time ?? '');
  const valid = title.trim().length > 0 && days.length > 0;

  const preset = days.length === 7 ? 'all' : days.join() === '2,3,4,5,6' ? 'week' : days.join() === '1,7' ? 'end' : 'custom';

  const save = () => {
    if (!valid) return;
    const data = { title: title.trim(), icon, color, days, time: time || undefined };
    if (existing) updateHabit(existing.id, data);
    else createHabit(data);
    haptic('success');
    onClose();
  };

  return (
    <Sheet
      title={existing ? t('habit.edit') : t('habit.new')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} disabled={!valid} hap={false}>
          {existing ? t('common.save') : t('habit.save')}
        </Tap>
      }
    >
      <Field label={t('habit.title')}>
        <input className="input" value={title} maxLength={60} placeholder={t('habit.title.ph')} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
      </Field>

      {!existing ? (
        <Field label={t('habit.ideas')}>
          <div className="chips" style={{ paddingTop: 0, paddingBottom: 2 }}>
            {IDEAS.map((idea) => (
              <button
                key={idea.key}
                type="button"
                className="chip"
                onClick={() => {
                  haptic('select');
                  setTitle(t(`habit.s.${idea.key}` as Key));
                  setIcon(idea.icon);
                  setColor(idea.color);
                }}
              >
                <span><Emoji e={idea.icon} /> {t(`habit.s.${idea.key}` as Key)}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label={t('habit.days')}>
        <Segmented
          value={preset === 'custom' ? 'all' : preset}
          onChange={(p) => setDays(p === 'all' ? EVERY_DAY : p === 'week' ? [2, 3, 4, 5, 6] : [1, 7])}
          options={[
            { id: 'all', label: t('habit.everyDay') },
            { id: 'week', label: t('habit.weekdays') },
            { id: 'end', label: t('habit.weekends') },
          ]}
        />
        <Weekdays value={days} onChange={setDays} />
      </Field>

      <Field label={t('habit.reminder')}>
        <TimeField value={time} onChange={setTime} emptyLabel={t('habit.reminder.none')} />
      </Field>

      <Field label={t('habit.icon')}>
        <EmojiPick emojis={HABIT_ICONS.includes(icon) ? HABIT_ICONS : [icon, ...HABIT_ICONS.slice(0, 15)]} value={icon} onChange={setIcon} />
      </Field>

      <Field label={t('habit.color')}>
        <Swatches colors={PALETTE.includes(color) ? PALETTE : [color, ...PALETTE.slice(0, 11)]} value={color} onChange={setColor} />
      </Field>

      {existing ? (
        <Tap
          className="btn danger"
          onTap={() =>
            confirmSheet({ title: t('confirm.habit.title'), body: t('confirm.habit.body'), confirm: t('habit.delete') }, () => {
              deleteHabit(existing.id);
              onClose();
            })
          }
        >
          <Trash size={18} />
          {t('habit.delete')}
        </Tap>
      ) : null}
    </Sheet>
  );
}
