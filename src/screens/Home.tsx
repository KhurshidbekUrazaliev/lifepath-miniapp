// Home: greeting, the next prayer, the ayah of the day, today's ring, shortcuts, today's focus and quick habit ticks.
import { useMemo } from 'react';
import { CalendarDots, Fire, GearSix as Gear, ListChecks, Repeat, Target } from '@phosphor-icons/react';
import { useData, useVisibleStreak } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { dayStats, goalsRatio, openGoals } from '../lib/stats';
import { activeHabits, dueHabits } from '../lib/habits';
import { lastActivity, loggedToday } from '../lib/progress';
import { XP, levelInfo } from '../lib/gamify';
import { tgUser } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtShortDate, greetingKey, pct } from '../i18n/format';
import { Avatar, Bubble, Card, Empty, IconBtn, Ring, Screen, Section, Tap } from '../ui/kit';
import { GoalCard, HabitDot, PlanItem } from '../ui/parts';
import { useEcho } from '../store/echo';
import { useAdvisor } from '../store/advisor';
import { CompanionThumb } from '../companion/CompanionThumb';
import { Emoji } from '../ui/Emoji';
import { AyahCard } from '../ui/Ayah';
import { AdhkarCard, PrayerCard } from './Prayer';
import { FocusCard } from '../ui/FocusCard';

export function Home() {
  const d = useData();
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const streak = useVisibleStreak();
  const today = dayKey();

  const stats = useMemo(() => dayStats(d, today), [d, today]);
  const goalsAvg = useMemo(() => goalsRatio(d), [d]);
  const goals = useMemo(() => openGoals(d), [d]);
  const habits = useMemo(() => dueHabits(activeHabits(d.habits), today), [d.habits, today]);
  const lvl = levelInfo(d.profile.xp);

  const todays = useMemo(
    () =>
      d.plans
        .filter((p) => p.day === today)
        .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.time ?? '99').localeCompare(b.time ?? '99')),
    [d.plans, today],
  );

  // Daily quest: the open goal that has waited the longest, if nothing was logged on it today.
  const quest = useMemo(() => {
    if (d.profile.questDay === today) return undefined;
    const waiting = goals.filter((g) => !loggedToday(g.id, d.entries));
    return waiting.sort((a, b) => (lastActivity(a.id, d.entries) ?? 0) - (lastActivity(b.id, d.entries) ?? 0))[0];
  }, [goals, d.entries, d.profile.questDay, today]);

  const name = d.profile.name || tgUser.firstName || t('common.guest');
  const folderOf = (id: string) => d.folders.find((f) => f.id === id);

  const legend: { label: string; value: string; color: string; go: () => void }[] = [
    { label: t('home.legend.tasks'), value: `${stats.tasks.done} / ${stats.tasks.total}`, color: 'var(--blue)', go: () => push({ name: 'tasks' }) },
    { label: t('home.legend.habits'), value: `${stats.habits.done} / ${stats.habits.total}`, color: 'var(--green)', go: () => push({ name: 'habits' }) },
    { label: t('home.legend.xp'), value: `${Math.min(stats.xp.value, 999)} / ${stats.xp.goal}`, color: 'var(--violet)', go: () => push({ name: 'progress' }) },
    { label: t('home.legend.goals'), value: goals.length ? pct(goalsAvg) : '–', color: 'var(--cyan)', go: () => push({ name: 'goals' }) },
  ];

  const left = stats.tasks.total - stats.tasks.done;
  const tiles = [
    {
      icon: <ListChecks size={21} />, color: '#3d7bff', label: t('home.tile.tasks'), go: () => push({ name: 'tasks' }),
      sub: stats.tasks.total === 0 ? t('home.tile.tasks.none') : left === 0 ? t('home.tile.tasks.clear') : tn('home.tile.tasks.left', left),
    },
    {
      icon: <Repeat size={21} />, color: '#34d399', label: t('home.tile.habits'), go: () => push({ name: 'habits' }),
      sub: stats.habits.total ? t('home.tile.habits.of', { done: stats.habits.done, total: stats.habits.total }) : t('home.tile.habits.none'),
    },
    { icon: <CalendarDots size={21} />, color: '#9b8cff', label: t('home.tile.calendar'), go: () => push({ name: 'calendar' }), sub: fmtShortDate(Date.now()) },
    {
      icon: <Target size={21} />, color: '#ff9f43', label: t('home.tile.goals'), go: () => push({ name: 'goals' }),
      sub: goals.length ? tn('home.tile.goals.active', goals.length) : t('home.tile.goals.none'),
    },
  ];

  return (
    <Screen>
      <header className="hdr home">
        <Tap onTap={() => useNav.getState().go('you')} scale={0.92} label={t('nav.you')} style={{ width: 46 }}>
          <Avatar />
        </Tap>
        <div style={{ minWidth: 0 }}>
          <div className="t-small muted">{t(greetingKey())} <Emoji e="👋" /></div>
          <div className="t-title clip">{name}</div>
        </div>
        <IconBtn onTap={() => push({ name: 'settings' })} label={t('common.settings')}>
          <Gear size={20} />
        </IconBtn>
      </header>

      <div className="row between" style={{ alignItems: 'flex-end', marginTop: 4 }}>
        <div>
          <h1 className="t-display">
            {t('home.title.your')} <span className="grad-text">{t('home.title.path')}</span>
          </h1>
          <div className="t-body muted" style={{ marginTop: 4, fontWeight: 500 }}>{t('home.tagline')}</div>
        </div>
        <Tap className="streak-pill" onTap={() => push({ name: 'progress' })} scale={0.94} label={tn('home.streak', streak)}>
          <Fire size={16} weight="bold" style={{ color: streak > 0 ? 'var(--orange)' : 'var(--text-3)' }} />
          <span className="num">{streak}</span>
          <i />
          <span className="num">{t('common.lv', { n: lvl.level })}</span>
        </Tap>
      </div>

      <FocusCard />
      <PrayerCard />
      <AdhkarCard />
      {d.settings.verse ? <AyahCard /> : null}

      <Card className="row" style={{ gap: 18 }}>
        <Ring value={stats.overall} size={128} stroke={13}>
          <div className="t-display num" style={{ fontSize: 30 }}>{pct(stats.overall)}</div>
          <div className="t-tiny muted" style={{ maxWidth: 80, margin: '2px auto 0' }}>{t('home.ring')}</div>
        </Ring>
        <div className="grow legend">
          {legend.map((row) => (
            <Tap key={row.label} className="legend-row" onTap={row.go} scale={0.97}>
              <i style={{ background: row.color, boxShadow: `0 0 8px ${row.color}` }} />
              <span className="t-small grow clip">{row.label}</span>
              <span className="t-small num" style={{ fontWeight: 700 }}>{row.value}</span>
            </Tap>
          ))}
        </div>
      </Card>

      <div className="quick">
        {tiles.map((tile) => (
          <Tap key={tile.label} onTap={tile.go} scale={0.95}>
            <Card pad={false} className="quick-tile">
              <span className="quick-ic" style={{ color: tile.color, background: `${tile.color}24` }}>{tile.icon}</span>
              <span className="t-small" style={{ fontWeight: 700 }}>{tile.label}</span>
              <span className="t-tiny muted clip" style={{ maxWidth: '100%' }}>{tile.sub}</span>
            </Card>
          </Tap>
        ))}
      </div>

      <AdvisorCard />

      {habits.length ? (
        <Section title={t('habits.today')} action={`${stats.habits.done} / ${stats.habits.total}`} onAction={() => push({ name: 'habits' })}>
          <div className="hdots">
            {habits.map((h) => (
              <HabitDot key={h.id} habit={h} day={today} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t('home.focus')} action={t('common.seeAll')} onAction={() => push({ name: 'tasks' })}>
        {quest ? (
          <Tap onTap={() => open({ name: 'log', taskId: quest.id })} scale={0.98}>
            <Card pad={false} className="item quest">
              <Bubble icon="🎯" />
              <div className="grow">
                <div className="t-tiny" style={{ color: 'var(--blue-hi)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  {t('home.quest')} · {t('cel.xp', { n: XP.dailyQuest })}
                </div>
                <div className="t-body clip-2" style={{ marginTop: 2 }}>{t('home.quest.body', { title: quest.title })}</div>
              </div>
            </Card>
          </Tap>
        ) : null}
        {todays.map((p) => (
          <PlanItem key={p.id} plan={p} />
        ))}
        {todays.length === 0 && !quest ? (
          <Empty icon="🗓️" title={t('home.focus.empty.title')} body={t('home.focus.empty.body')}>
            <Tap className="btn primary sm pill" onTap={() => open({ name: 'task', day: today })}>
              {t('home.focus.add')}
            </Tap>
          </Empty>
        ) : null}
      </Section>

      {goals.length ? (
        <Section title={t('home.goals')} action={t('common.seeAll')} onAction={() => push({ name: 'goals' })}>
          {goals.slice(0, 3).map((g) => (
            <GoalCard key={g.id} task={g} folder={folderOf(g.folderId)} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

/** The companion's hadith of the day; a tap opens the companion for more. */
function AdvisorCard() {
  const e = useEcho();
  const push = useNav((s) => s.push);
  const { today } = useAdvisor();
  if (!e.echo) return null;
  return (
    <Tap onTap={() => push({ name: 'echo' })} scale={0.98}>
      <Card pad={false} className="advisor-card">
        <div className="advisor-thumb">
          <CompanionThumb size={64} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t-tiny advisor-kind">{e.echo.name} · {t('home.hadithOfDay')}</div>
          <p className="advisor-text">{today.text}</p>
          <div className="t-tiny faint">
            {today.source}
            {today.ai ? ` · ${t('advice.ai')}` : ''}
          </div>
        </div>
      </Card>
    </Tap>
  );
}
