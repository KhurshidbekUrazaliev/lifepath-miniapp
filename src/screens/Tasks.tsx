// Tasks: dated to-dos with filter chips, as on the design's second screen.
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { shiftDay } from '../lib/habits';
import { dayKeyToMs } from '../lib/calendar';
import { Plan } from '../lib/types';
import { t } from '../i18n';
import { Chips, Empty, Header, Screen, Stagger, Tap } from '../ui/kit';
import { PlanItem } from '../ui/parts';

type Filter = 'all' | 'today' | 'week' | 'done';

const byWhen = (a: Plan, b: Plan) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99');

export function Tasks() {
  const plans = useStore((s) => s.plans);
  const open = useNav((s) => s.open);
  const [filter, setFilter] = useState<Filter>('all');
  const today = dayKey();

  const groups = useMemo(() => {
    // The week runs Monday to Sunday.
    const dow = (new Date(dayKeyToMs(today, 12)).getDay() + 6) % 7;
    const weekEnd = shiftDay(today, 6 - dow);
    const open_ = plans.filter((p) => !p.doneAt).sort(byWhen);
    if (filter === 'done') {
      return [{ title: '', items: plans.filter((p) => p.doneAt).sort((a, b) => b.doneAt! - a.doneAt!).slice(0, 60) }];
    }
    if (filter === 'today') {
      const items = plans.filter((p) => p.day === today).sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || byWhen(a, b));
      return [{ title: '', items }];
    }
    if (filter === 'week') {
      return [{ title: '', items: open_.filter((p) => p.day >= today && p.day <= weekEnd) }];
    }
    const overdue = open_.filter((p) => p.day < today);
    const rest = open_.filter((p) => p.day >= today);
    return [
      { title: overdue.length ? t('tasks.overdue') : '', items: overdue },
      { title: '', items: rest },
    ];
  }, [plans, filter, today]);

  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <Screen
      fab={
        <Tap className="btn primary" onTap={() => open({ name: 'task', day: today })}>
          <Plus size={19} strokeWidth={2.8} />
          {t('tasks.add')}
        </Tap>
      }
    >
      <Header title={t('tasks.title')} />
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: t('tasks.filter.all') },
          { id: 'today', label: t('tasks.filter.today') },
          { id: 'week', label: t('tasks.filter.week') },
          { id: 'done', label: t('tasks.filter.done') },
        ]}
      />
      {count === 0 ? (
        <Empty icon={filter === 'done' ? '🏁' : '📝'} title={t('tasks.empty.title')} body={filter === 'done' ? t('tasks.empty.done') : t('tasks.empty.body')} />
      ) : (
        groups.map((g, gi) =>
          g.items.length ? (
            <div key={`${filter}-${gi}`} className="col tight">
              {g.title ? <div className="t-small" style={{ color: 'var(--orange)', fontWeight: 700, padding: '0 2px' }}>{g.title}</div> : null}
              <Stagger className="col tight">
                {g.items.map((p) => (
                  <PlanItem key={p.id} plan={p} />
                ))}
              </Stagger>
            </div>
          ) : null,
        )
      )}
    </Screen>
  );
}
