// Home: greeting, the daily verse, today's ring, shortcuts, today's focus and quick habit ticks.
import { useMemo } from 'react';
import { CalendarDays, Flame, ListChecks, Repeat, Settings as Gear, Target } from 'lucide-react';
import { useData, useVisibleStreak } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { dayStats, goalsRatio, openGoals } from '../lib/stats';
import { activeHabits, dueHabits } from '../lib/habits';
import { lastActivity, loggedToday } from '../lib/progress';
import { XP, levelInfo } from '../lib/gamify';
import { tgUser } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { fmtShortDate, greetingKey, pct } from '../i18n/format';
import { Avatar, Bubble, Card, Empty, IconBtn, Ring, Screen, Section, Tap } from '../ui/kit';
import { GoalCard, HabitDot, PlanItem } from '../ui/parts';

/** A night sky with a mosque silhouette, drawn in SVG so it follows the theme and stays sharp. */
function MosqueArt() {
  return (
    <svg className="verse-art" viewBox="0 0 170 120" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="va-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a66" stopOpacity="0" />
          <stop offset="1" stopColor="#4c6fff" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="va-glow" cx="0.6" cy="0.72" r="0.55">
          <stop offset="0" stopColor="#8fb0ff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#8fb0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="va-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22336f" />
          <stop offset="1" stopColor="#0b1230" />
        </linearGradient>
      </defs>
      <rect width="170" height="120" fill="url(#va-sky)" />
      <rect width="170" height="120" fill="url(#va-glow)" />
      {[[22, 18, 1], [48, 34, 0.7], [70, 12, 1.1], [96, 26, 0.7], [128, 10, 0.9], [150, 30, 0.8], [112, 44, 0.6], [36, 52, 0.6]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#dfe8ff" opacity={0.85} />
      ))}
      <path d="M139 14a9 9 0 1 0 9 12 7.4 7.4 0 0 1-9-12Z" fill="#e9efff" opacity="0.92" />
      <g fill="url(#va-fill)">
        {/* minarets */}
        <path d="M30 120V58l3-9 3 9v62Z" />
        <path d="M27 62h12v4H27zM28 80h10v3H28z" />
        <path d="M146 120V50l3.5-11 3.5 11v70Z" />
        <path d="M143 55h13v4h-13zM144 76h11v3h-11z" />
        {/* side domes */}
        <path d="M48 120V94c0-9 7-14 12-18 5 4 12 9 12 18v26Z" />
        <path d="M112 120V92c0-9 7-15 12-19 5 4 12 10 12 19v28Z" />
        {/* main dome */}
        <path d="M62 120V88c0-18 16-26 28-38 12 12 28 20 28 38v32Z" />
        <path d="M89 50V38h2v12Z" />
        <circle cx="90" cy="36" r="2.4" />
        <path d="M20 112h140v8H20z" />
      </g>
      <g fill="#ffd98a" opacity="0.9">
        <path d="M86 120v-14a4 4 0 0 1 8 0v14Z" />
        <rect x="58" y="104" width="3.4" height="8" rx="1.7" />
        <rect x="122" y="103" width="3.4" height="8" rx="1.7" />
        <rect x="74" y="98" width="3" height="7" rx="1.5" />
        <rect x="103" y="98" width="3" height="7" rx="1.5" />
      </g>
    </svg>
  );
}

function verseOfDay(day: string): number {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 12) + 1;
}

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
  const verse = verseOfDay(today);
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
    { icon: <CalendarDays size={21} />, color: '#9b8cff', label: t('home.tile.calendar'), go: () => push({ name: 'calendar' }), sub: fmtShortDate(Date.now()) },
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
          <div className="t-small muted">{t(greetingKey())} 👋</div>
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
          <Flame size={16} strokeWidth={2.6} style={{ color: streak > 0 ? 'var(--orange)' : 'var(--text-3)' }} />
          <span className="num">{streak}</span>
          <i />
          <span className="num">{t('common.lv', { n: lvl.level })}</span>
        </Tap>
      </div>

      {d.settings.verse ? (
        <Card pad={false} className="verse">
          <MosqueArt />
          <div className="verse-text">
            <p className="t-body" style={{ fontWeight: 600, lineHeight: 1.45 }}>“{t(`verse.${verse}` as Key)}”</p>
            <p className="t-small muted" style={{ marginTop: 8 }}>— {t('verse.source', { ref: t(`verse.${verse}.ref` as Key) })}</p>
          </div>
        </Card>
      ) : null}

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
