// Goals: the areas of your life as cards, and every goal with its progress bar.
import { useMemo } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useData, useStore } from '../store/store';
import { Route, useNav } from '../store/nav';
import { usePlus } from '../store/server';
import { folderProgress } from '../lib/progress';
import { goalsRatio, openGoals } from '../lib/stats';
import { canCreateFolder } from '../lib/plus';
import { Folder } from '../lib/types';
import { t, tn } from '../i18n';
import { pct } from '../i18n/format';
import { Bar, Bubble, Card, Empty, Header, IconBtn, Num, Ring, Screen, Section, Stagger, Tap } from '../ui/kit';
import { GoalCard } from '../ui/parts';

/** Opens the "new area" sheet, or the Plus screen when the free plan is full. */
export function useNewArea(): () => void {
  const count = useStore((s) => s.folders.length);
  const plus = usePlus();
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  return () => (canCreateFolder(count, plus) ? open({ name: 'area' }) : push({ name: 'plus' }));
}

function AreaCard({ folder }: { folder: Folder }) {
  const tasks = useStore((s) => s.tasks);
  const entries = useStore((s) => s.entries);
  const push = useNav((s) => s.push);
  const mine = useMemo(() => tasks.filter((x) => x.folderId === folder.id), [tasks, folder.id]);
  const ratio = useMemo(() => folderProgress(mine, entries), [mine, entries]);
  return (
    <Tap className="area-card" onTap={() => push({ name: 'area', id: folder.id })} scale={0.96}>
      <Card pad={false} className="area-card-in">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <i className="area-bar" style={{ background: folder.color, boxShadow: `0 0 10px ${folder.color}` }} />
          <div className="grow">
            <div className="t-body clip-2" style={{ minHeight: 40 }}>{folder.name}</div>
          </div>
          <span style={{ fontSize: 20 }}>{folder.icon}</span>
        </div>
        <div className="t-tiny muted" style={{ margin: '10px 0 8px' }}>{tn('goals.count', mine.length)}</div>
        <div className="row" style={{ gap: 8 }}>
          <div className="grow"><Bar value={ratio} color={folder.color} height={6} /></div>
          <span className="t-tiny num">{pct(ratio)}</span>
        </div>
      </Card>
    </Tap>
  );
}

export function Goals() {
  const d = useData();
  const open = useNav((s) => s.open);
  const newArea = useNewArea();
  const active = useMemo(() => openGoals(d), [d]);
  const finished = useMemo(() => d.tasks.filter((x) => x.completedAt).sort((a, b) => b.completedAt! - a.completedAt!), [d.tasks]);
  const avg = useMemo(() => goalsRatio(d), [d]);
  const folderOf = (id: string) => d.folders.find((f) => f.id === id);
  const createGoal = () => (d.folders.length ? open({ name: 'goal' }) : newArea());

  return (
    <Screen>
      <Header title={t('goals.title')} />

      <Card className="row" style={{ gap: 16 }}>
        <span className="target-ic">🎯</span>
        <div className="grow">
          <div className="t-display num" style={{ fontSize: 28 }}><Num value={active.length} /></div>
          <div className="t-small muted">{tn('goals.active', active.length)}</div>
        </div>
        {active.length ? (
          <Ring value={avg} size={58} stroke={7}>
            <span className="t-tiny num" style={{ fontWeight: 800 }}>{pct(avg)}</span>
          </Ring>
        ) : null}
      </Card>

      <Section title={t('goals.areas')} action={t('goals.newArea')} onAction={newArea}>
        {d.folders.length ? (
          <div className="areas">
            {d.folders.map((f) => (
              <AreaCard key={f.id} folder={f} />
            ))}
            <Tap className="area-card" onTap={newArea} scale={0.96}>
              <Card pad={false} className="area-card-in area-new">
                <Plus size={22} />
                <span className="t-small">{t('goals.newArea')}</span>
              </Card>
            </Tap>
          </div>
        ) : (
          <Empty icon="🧭" title={t('goals.empty.title')} body={t('goals.needArea')}>
            <Tap className="btn primary sm pill" onTap={newArea}>
              <Plus size={17} strokeWidth={2.8} />
              {t('goals.newArea')}
            </Tap>
          </Empty>
        )}
      </Section>

      {active.length ? (
        <Stagger className="col tight">
          {active.map((g) => (
            <GoalCard key={g.id} task={g} folder={folderOf(g.folderId)} />
          ))}
        </Stagger>
      ) : d.folders.length ? (
        <Empty icon="🎯" title={t('goals.empty.title')} body={t('goals.empty.body')} />
      ) : null}

      {d.folders.length ? (
        <Tap className="btn primary" onTap={createGoal}>
          <Plus size={19} strokeWidth={2.8} />
          {t('goals.create')}
        </Tap>
      ) : null}

      {finished.length ? (
        <Section title={t('goals.finished')}>
          <div className="col tight" style={{ opacity: 0.8 }}>
            {finished.map((g) => (
              <GoalCard key={g.id} task={g} folder={folderOf(g.folderId)} />
            ))}
          </div>
        </Section>
      ) : null}
    </Screen>
  );
}

export function Area({ route }: { route: Extract<Route, { name: 'area' }> }) {
  const folder = useStore((s) => s.folders.find((f) => f.id === route.id));
  const tasks = useStore((s) => s.tasks);
  const entries = useStore((s) => s.entries);
  const open = useNav((s) => s.open);
  const mine = useMemo(() => tasks.filter((x) => x.folderId === route.id), [tasks, route.id]);
  const ratio = useMemo(() => folderProgress(mine, entries), [mine, entries]);
  if (!folder) return <Screen><Header title="" /></Screen>;
  const activeGoals = mine.filter((x) => !x.completedAt);
  const done = mine.filter((x) => x.completedAt);

  return (
    <Screen>
      <Header
        title={folder.name}
        right={
          <IconBtn onTap={() => open({ name: 'area', id: folder.id })} label={t('area.edit')}>
            <Pencil size={18} />
          </IconBtn>
        }
      />
      <Card className="row" style={{ gap: 18 }}>
        <Ring value={ratio} size={96} stroke={10} color={folder.color}>
          <div className="t-title num">{pct(ratio)}</div>
        </Ring>
        <div className="grow">
          <Bubble icon={folder.icon} color={folder.color} />
          <div className="t-small muted" style={{ marginTop: 10 }}>{tn('goals.count', mine.length)}</div>
        </div>
      </Card>

      {mine.length === 0 ? <Empty icon={folder.icon} title={t('area.empty')} body={t('goals.empty.body')} /> : null}
      <Stagger className="col tight">
        {activeGoals.map((g) => (
          <GoalCard key={g.id} task={g} folder={folder} />
        ))}
      </Stagger>
      <Tap className="btn primary" onTap={() => open({ name: 'goal', folderId: folder.id })}>
        <Plus size={19} strokeWidth={2.8} />
        {t('goals.create')}
      </Tap>
      {done.length ? (
        <Section title={t('goals.finished')}>
          <div className="col tight" style={{ opacity: 0.8 }}>
            {done.map((g) => (
              <GoalCard key={g.id} task={g} folder={folder} />
            ))}
          </div>
        </Section>
      ) : null}
    </Screen>
  );
}
