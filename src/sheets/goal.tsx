// Sheets for a goal, an area, a goal's reminder and the smart planner.
import { useMemo, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { Sheet as SheetState, useNav } from '../store/nav';
import { ICONS, PALETTE, TEMPLATES, templateById } from '../lib/templates';
import { ProgressType, Task } from '../lib/types';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { suggestPlan } from '../lib/planner';
import { haptic } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { dayLabel, fmtAmount, fmtTimeStr } from '../i18n/format';
import { Card, EmojiPick, Field, Segmented, Swatches, Tap, Toggle, cx } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { confirmSheet } from './confirm';
import { TimeField, Weekdays } from './create';
import { Emoji } from '../ui/Emoji';

// ---------- area ----------

export function AreaSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'area' }>; onClose: () => void }) {
  const existing = useStore((s) => s.folders.find((f) => f.id === sheet.id));
  const createFolder = useStore((s) => s.createFolder);
  const updateFolder = useStore((s) => s.updateFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const push = useNav((s) => s.push);
  const pop = useNav((s) => s.pop);

  const [templateId, setTemplateId] = useState(existing?.templateId ?? TEMPLATES[0].id);
  const tpl = templateById(templateId);
  const [name, setName] = useState(existing?.name ?? t(`tpl.${templateId}.name` as Key));
  const [icon, setIcon] = useState(existing?.icon ?? tpl.icon);
  const [color, setColor] = useState(existing?.color ?? tpl.color);
  const valid = name.trim().length > 0;

  const pick = (id: string) => {
    const next = templateById(id);
    haptic('select');
    setTemplateId(id);
    setName(t(`tpl.${id}.name` as Key));
    setIcon(next.icon);
    setColor(next.color);
  };

  const save = () => {
    if (!valid) return;
    if (existing) {
      updateFolder(existing.id, { name: name.trim(), icon, color });
      onClose();
    } else {
      const id = createFolder({ name, icon, color, templateId, progressType: tpl.progressType, unit: t(`tpl.${templateId}.unit` as Key) });
      onClose();
      push({ name: 'area', id });
    }
    haptic('success');
  };

  return (
    <Sheet
      title={existing ? t('area.edit') : t('area.new')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} disabled={!valid} hap={false}>
          {existing ? t('common.save') : t('area.save')}
        </Tap>
      }
    >
      {!existing ? (
        <Field label={t('area.template')}>
          <div className="tpl-grid">
            {TEMPLATES.map((x) => (
              <button key={x.id} type="button" className={cx('tpl', templateId === x.id && 'on')} onClick={() => pick(x.id)}>
                <span style={{ fontSize: 24 }}><Emoji e={x.icon} /></span>
                <span className="t-tiny clip" style={{ maxWidth: '100%' }}>{t(`tpl.${x.id}.name` as Key)}</span>
              </button>
            ))}
          </div>
          <span className="hint">{t(`tpl.${templateId}.tagline` as Key)}</span>
        </Field>
      ) : null}

      <Field label={t('area.name')}>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} enterKeyHint="done" />
      </Field>
      <Field label={t('area.icon')}>
        <EmojiPick emojis={ICONS.includes(icon) ? ICONS : [icon, ...ICONS.slice(0, 23)]} value={icon} onChange={setIcon} />
      </Field>
      <Field label={t('area.color')}>
        <Swatches colors={PALETTE.includes(color) ? PALETTE : [color, ...PALETTE.slice(0, 11)]} value={color} onChange={setColor} />
      </Field>

      {existing ? (
        <Tap
          className="btn danger"
          onTap={() =>
            confirmSheet({ title: t('confirm.area.title'), body: t('confirm.area.body'), confirm: t('area.delete') }, () => {
              onClose();
              pop();
              deleteFolder(existing.id);
            })
          }
        >
          <Trash size={18} />
          {t('area.delete')}
        </Tap>
      ) : null}
    </Sheet>
  );
}

// ---------- goal ----------

const TYPES: ProgressType[] = ['units', 'time', 'sessions', 'milestones'];

export function GoalSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'goal' }>; onClose: () => void }) {
  const existing = useStore((s) => s.tasks.find((x) => x.id === sheet.id));
  const folders = useStore((s) => s.folders);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const push = useNav((s) => s.push);

  const [folderId, setFolderId] = useState(existing?.folderId ?? sheet.folderId ?? folders[0]?.id ?? '');
  const folder = folders.find((f) => f.id === folderId);
  const tpl = templateById(folder?.templateId ?? 'custom');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [type, setType] = useState<ProgressType>(existing?.progressType ?? folder?.progressType ?? 'units');
  const [target, setTarget] = useState(String(existing?.target ?? tpl.defaultTarget ?? 10));
  const [unit, setUnit] = useState(existing?.unit ?? folder?.unit ?? '');
  const [steps, setSteps] = useState('');
  const [deadline, setDeadline] = useState(existing?.deadline ? dayKey(existing.deadline) : '');

  const pickFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    haptic('select');
    setFolderId(id);
    if (!existing && f) {
      setType(f.progressType);
      setUnit(f.unit);
      setTarget(String(templateById(f.templateId).defaultTarget || 10));
    }
  };

  const targetNumber = Math.max(0, Number(target.replace(',', '.')) || 0);
  const stepList = steps.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const valid = title.trim().length > 0 && !!folder && (existing ? true : type === 'milestones' ? stepList.length > 0 : targetNumber > 0);

  const save = () => {
    if (!valid || !folder) return;
    const due = deadline ? dayKeyToMs(deadline, 23, 59) : undefined;
    if (existing) {
      updateTask(existing.id, {
        title: title.trim(), folderId,
        target: existing.progressType === 'milestones' ? existing.target : targetNumber || existing.target,
        unit: unit.trim() || existing.unit, deadline: due,
      });
      onClose();
    } else {
      const id = createTask({
        folderId, title, progressType: type,
        target: type === 'milestones' ? 0 : targetNumber,
        unit: type === 'time' ? 'min' : type === 'sessions' ? 'sessions' : type === 'milestones' ? 'steps' : unit.trim() || folder.unit,
        deadline: due, milestones: type === 'milestones' ? stepList : [], resources: [],
      });
      onClose();
      push({ name: 'goal', id });
    }
    haptic('success');
  };

  const shownType = existing?.progressType ?? type;

  return (
    <Sheet
      title={existing ? t('goal.edit') : t('goal.new')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={save} disabled={!valid} hap={false}>
          {existing ? t('common.save') : t('goal.save')}
        </Tap>
      }
    >
      <Field label={t('goal.area')}>
        <div className="chips" style={{ paddingTop: 0, paddingBottom: 2 }}>
          {folders.map((f) => (
            <button key={f.id} type="button" className={cx('chip', f.id === folderId && 'on solid')} onClick={() => pickFolder(f.id)}>
              <span><Emoji e={f.icon} /> {f.name}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('goal.title')}>
        <input className="input" value={title} maxLength={80} placeholder={t(`tpl.${tpl.id}.ph` as Key)} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
      </Field>

      {!existing ? (
        <Field label={t('goal.measure')} hint={t(`type.${type}.hint` as Key)}>
          <Segmented<ProgressType> value={type} onChange={setType} options={TYPES.map((id) => ({ id, label: t(`type.${id}` as Key) }))} />
        </Field>
      ) : null}

      {shownType === 'milestones' ? (
        existing ? null : (
          <Field label={t('goal.stepsField')}>
            <textarea className="input" rows={4} value={steps} placeholder={t('goal.stepsField.ph')} onChange={(e) => setSteps(e.target.value)} />
          </Field>
        )
      ) : (
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div className="grow">
            <Field label={shownType === 'time' ? `${t('goal.target')} (${t('unit.min', { n: '' }).trim()})` : t('goal.target')}>
              <input className="input num" inputMode="decimal" value={target} maxLength={9} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} />
            </Field>
          </div>
          {shownType === 'units' ? (
            <div className="grow">
              <Field label={t('goal.unit')}>
                <input className="input" value={unit} maxLength={12} autoCapitalize="none" onChange={(e) => setUnit(e.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
      )}

      <Field label={t('goal.deadline')}>
        <div className="row" style={{ gap: 10 }}>
          <input className="input grow" type="date" value={deadline} min={dayKey()} onChange={(e) => setDeadline(e.target.value)} />
          {deadline ? (
            <Tap className="btn soft sm" onTap={() => setDeadline('')}>
              {t('goal.deadline.none')}
            </Tap>
          ) : null}
        </div>
      </Field>
    </Sheet>
  );
}

// ---------- reminder ----------

export function ReminderSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'reminder' }>; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === sheet.taskId));
  const setReminder = useStore((s) => s.setReminder);
  const botOn = useStore((s) => s.settings.reminders);
  const push = useNav((s) => s.push);
  const r = task?.reminder;
  const [on, setOn] = useState(!!r);
  const [time, setTime] = useState(r ? `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}` : '21:00');
  const [days, setDays] = useState<number[]>(r?.days ?? [1, 2, 3, 4, 5, 6, 7]);
  if (!task) return null;

  const save = () => {
    const [h, m] = time.split(':').map(Number);
    setReminder(task.id, on && days.length && Number.isFinite(h) ? { hour: h, minute: m || 0, days } : undefined);
    haptic('success');
    onClose();
  };

  return (
    <Sheet
      title={t('goal.reminder')}
      onClose={onClose}
      foot={<Tap className="btn primary" onTap={save} hap={false}>{t('common.save')}</Tap>}
    >
      <Card className="row" style={{ gap: 12 }}>
        <div className="grow">
          <div className="t-body clip">{task.title}</div>
          <div className="t-small muted">{t('goal.reminder.hint')}</div>
        </div>
        <Toggle on={on} onChange={setOn} label={t('goal.reminder')} />
      </Card>
      {on ? (
        <>
          <Field label={t('task.time')}>
            <input className="input time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label={t('habit.days')}>
            <Weekdays value={days} onChange={setDays} />
          </Field>
          {!botOn ? (
            <Tap className="btn soft" onTap={() => { save(); push({ name: 'notifications' }); }}>
              {t('inbox.reminders.off')}
            </Tap>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ---------- smart planner (Plus) ----------

/** The planner writes its notes in English; this rebuilds them in the app's language. */
function localNote(note: string, task: Task): string {
  let m = /^Session (\d+) of (\d+)$/.exec(note);
  if (m) return t('planner.session', { n: m[1], total: m[2] });
  m = /^Milestone: (.*)$/.exec(note);
  if (m) return t('planner.step', { title: m[1] });
  m = /^Aim for (.*)$/.exec(note);
  if (m) {
    const hm = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(m[1]);
    const amount = task.progressType === 'time' && hm && (hm[1] || hm[2]) ? Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0) : parseFloat(m[1]);
    if (Number.isFinite(amount)) return t('planner.aim', { amount: fmtAmount(amount, task.unit, task.progressType) });
  }
  return note;
}

export function PlannerSheet({ sheet, onClose }: { sheet: Extract<SheetState, { name: 'planner' }>; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === sheet.taskId));
  const entries = useStore((s) => s.entries);
  const addPlan = useStore((s) => s.addPlan);
  const [perWeek, setPerWeek] = useState('3');
  const [weeks, setWeeks] = useState('2');
  const [time, setTime] = useState('');

  const plan = useMemo(
    () => (task ? suggestPlan(task, entries, { daysPerWeek: Number(perWeek), time: time || undefined, horizonDays: Number(weeks) * 7 }) : []),
    [task, entries, perWeek, weeks, time],
  );
  if (!task) return null;

  const add = () => {
    for (const s of plan) addPlan({ taskId: task.id, day: s.day, time: s.time, note: localNote(s.note, task) });
    haptic('success');
    onClose();
  };

  return (
    <Sheet
      title={t('planner.title')}
      onClose={onClose}
      foot={
        <Tap className="btn primary" onTap={add} disabled={plan.length === 0} hap={false}>
          {t('planner.add')} · {tn('planner.preview', plan.length)}
        </Tap>
      }
    >
      <div className="t-small muted">{t('planner.body')}</div>
      <Field label={t('planner.perWeek')}>
        <Segmented value={perWeek} onChange={setPerWeek} options={['1', '2', '3', '4', '5', '7'].map((id) => ({ id, label: id }))} />
      </Field>
      <Field label={t('planner.horizon')}>
        <Segmented value={weeks} onChange={setWeeks} options={['1', '2', '4', '8'].map((id) => ({ id, label: tn('planner.weeks', Number(id)) }))} />
      </Field>
      <Field label={t('planner.time')}>
        <TimeField value={time} onChange={setTime} emptyLabel={t('task.time.none')} />
      </Field>
      {plan.length === 0 ? (
        <Card className="t-small muted center">{t('planner.none')}</Card>
      ) : (
        <Card pad={false} className="list">
          {plan.slice(0, 6).map((s) => (
            <div className="lrow" key={s.day}>
              <span className="grow">
                <span className="t-body" style={{ display: 'block' }}>{dayLabel(s.day)}{s.time ? ` • ${fmtTimeStr(s.time)}` : ''}</span>
                <span className="t-small muted clip" style={{ display: 'block' }}>{localNote(s.note, task)}</span>
              </span>
            </div>
          ))}
          {plan.length > 6 ? <div className="lrow t-small muted">+{plan.length - 6}</div> : null}
        </Card>
      )}
    </Sheet>
  );
}
