// Home: greeting, the companion as the hero (with the hadith of the day) under a sky that follows the
// day, and under it the cards in the person's own order: the next prayer, the journal's question, the
// ayah of the day, the adhkar, today's ring, shortcuts, quick habit ticks, today's focus and the goals.
// The time of day lifts one card to the top (lib/home.ts) unless that is switched off.
import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { CalendarDots, Fire, GearSix as Gear, Lightning, ListChecks, Repeat, SlidersHorizontal, Target } from '@phosphor-icons/react';
import { useData, useStore, useVisibleStreak } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { dayStats, openGoals, overallSeries } from '../lib/stats';
import { weekDays } from '../lib/week';
import { activeHabits, dueHabits, isChecked } from '../lib/habits';
import { lastActivity, loggedToday } from '../lib/progress';
import { XP, levelInfo } from '../lib/gamify';
import { PRAYERS, PrayerKey } from '../lib/prayer';
import { wroteOn } from '../lib/journal';
import { HOME_READY, HomeBlock, cardForNow, gestureFor, homeHidden, homeNow, prayerIsNear, skyPhase } from '../lib/home';
import { haptic, lowPerf, tgUser } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtShortDate, greetingKey, pct, weekdayMini } from '../i18n/format';
import { Avatar, Bubble, Card, Empty, Glyph, IconBtn, Ring, Screen, Section, Tap, cx } from '../ui/kit';
import { GoalCard, HabitDot, PlanItem } from '../ui/parts';
import { useEcho } from '../store/echo';
import { useAdvisor } from '../store/advisor';
import { CompanionThumb } from '../companion/CompanionThumb';
import { CompanionHandle, CompanionStage, StageState } from '../companion/CompanionStage';
import type { Clip, TapPart } from '../companion/types';
import { Emoji } from '../ui/Emoji';
import { AyahCard } from '../ui/Ayah';
import { QuoteStoryButton } from '../ui/QuoteStory';
import { offerHeroShot } from '../companion/heroShot';
import { AdhkarCard, PrayerCard, useAdhkarDue, usePrayerNow } from './Prayer';
import { FocusCard } from '../ui/FocusCard';
import { JournalCard } from '../journal/Journal';
import { Special } from '../ui/Special';
import { BuddyCard, GroupKhatmCard } from '../ui/TogetherCards';


export function Home() {
  const d = useData();
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const goTab = useNav((s) => s.go);
  const streak = useVisibleStreak();
  const today = dayKey();

  const stats = useMemo(() => dayStats(d, today), [d, today]);
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

  // This week, Monday first: how full each day was, for the bars beside the ring.
  const week = useMemo(() => {
    const days = weekDays(today);
    return days.map((day, i) => ({ day, value: day > today ? null : overallSeries(d, [day])[0], dow: (i + 1) % 7 }));
  }, [d, today]);

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

  // ---------- the cards, each by its name ----------

  const blocks: Partial<Record<HomeBlock, ReactNode>> = {
    special: <Special />,
    buddy: <BuddyCard />,
    gkhatm: <GroupKhatmCard />,
    prayer: <PrayerCard />,
    journal: <JournalCard />,
    ayah: <AyahCard />,
    adhkar: <AdhkarCard />,

    ring: (
      <Card className="row" style={{ gap: 18 }}>
        <Ring value={stats.overall} size={128} stroke={13}>
          <div className="t-display num" style={{ fontSize: 30 }}>{pct(stats.overall)}</div>
          <div className="t-tiny muted" style={{ maxWidth: 80, margin: '2px auto 0' }}>{t('home.ring')}</div>
        </Ring>
        <div className="grow ring-week">
          <Tap className="ring-week-head" onTap={() => goTab('stats')} scale={0.97}>
            <span className="t-tiny muted">{t('home.week')}</span>
          </Tap>
          <div className="ring-bars">
            {week.map((w) => (
              <div key={w.day} className={cx('ring-bar', w.day === today && 'today', w.value === null && 'ahead')}>
                <span><i style={{ height: `${Math.max(w.value ? 10 : 0, Math.round((w.value ?? 0) * 100))}%` }} /></span>
                <b>{weekdayMini(w.dow)}</b>
              </div>
            ))}
          </div>
          <div className="ring-chips">
            <Tap className="ring-chip" onTap={() => push({ name: 'progress' })} scale={0.95}>
              <Fire size={15} weight="fill" style={{ color: streak > 0 ? 'var(--orange)' : 'var(--text-3)' }} />
              <span className="num">{streak > 0 ? tn('home.streak', streak) : t('home.streak.none')}</span>
            </Tap>
            <Tap className="ring-chip" onTap={() => push({ name: 'progress' })} scale={0.95}>
              <Lightning size={15} weight="fill" style={{ color: 'var(--violet)' }} />
              <span className="num">{t('home.todayXp', { n: Math.min(stats.xp.value, 999), goal: stats.xp.goal })}</span>
            </Tap>
          </div>
        </div>
      </Card>
    ),

    quick: (
      <div className="quick">
        {tiles.map((tile) => (
          <Tap key={tile.label} onTap={tile.go} scale={0.95}>
            <Card pad={false} className="quick-tile">
              <Glyph icon={tile.icon} color={tile.color} className="quick-ic" />
              <span className="t-small" style={{ fontWeight: 700 }}>{tile.label}</span>
              <span className="t-tiny muted clip" style={{ maxWidth: '100%' }}>{tile.sub}</span>
            </Card>
          </Tap>
        ))}
      </div>
    ),

    habits: habits.length ? (
      <Section title={t('habits.today')} action={`${stats.habits.done} / ${stats.habits.total}`} onAction={() => push({ name: 'habits' })}>
        <div className="hdots">
          {habits.map((h) => (
            <HabitDot key={h.id} habit={h} day={today} />
          ))}
        </div>
      </Section>
    ) : null,

    plan: (
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
    ),

    goals: goals.length ? (
      <Section title={t('home.goals')} action={t('common.seeAll')} onAction={() => push({ name: 'goals' })}>
        {goals.slice(0, 3).map((g) => (
          <GoalCard key={g.id} task={g} folder={folderOf(g.folderId)} />
        ))}
      </Section>
    ) : null,
  };

  // ---------- their order, and the one this moment asks for ----------

  const { info, now } = usePrayerNow();
  const adhkarDue = useAdhkarDue();
  const settings = d.settings;
  const shown = (id: HomeBlock) => HOME_READY.includes(id) && !homeHidden(settings, id);
  const isPrayer = (key: string | null): key is PrayerKey => !!key && (PRAYERS as readonly string[]).includes(key);
  const lift = cardForNow(
    {
      hour: new Date(now).getHours(),
      prayerNear:
        !!info &&
        prayerIsNear({
          toNext: info.next.at.getTime() - now,
          nextIsPrayer: isPrayer(info.next.key),
          sinceCurrent: now - info.since.getTime(),
          currentOpen: isPrayer(info.current) && !isChecked(d.worship, info.current, info.day),
        }),
      adhkarDue,
      written: wroteOn(d.pages, today),
    },
    shown,
  );
  const order = homeNow(settings, lift).filter(shown);

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

      <Hero streak={streak} level={lvl.level} />

      <FocusCard />
      {order.map((id) => (
        <Fragment key={id}>{blocks[id]}</Fragment>
      ))}

      <Tap className="home-arrange" onTap={() => push({ name: 'homecards' })} scale={0.96}>
        <SlidersHorizontal size={16} weight="bold" />
        {t('home.arrange')}
      </Tap>
    </Screen>
  );
}

// ---------- the companion ----------

// The companion waves once per visit to the app, not at every return to Home.
let greeted = false;
const TAP_MOVES = ['wave', 'cheer', 'nod'] as const;

// What was just done, wherever in the app it was done, for the companion to answer when Home is next in
// sight: a cheer for a habit, hands raised after a prayer, a book after pages of the Qurʼan.
let deed: { clip: Clip; at: number } | null = null;
let noticed = new Set<string>();
useStore.subscribe((s) => {
  for (const c of s.celebrations) {
    if (noticed.has(c.id)) continue;
    noticed.add(c.id);
    const clip = gestureFor(c);
    if (clip) deed = { clip, at: Date.now() };
  }
  if (noticed.size > 300) noticed = new Set(s.celebrations.map((c) => c.id));
});
/** How long after a deed the companion still answers it. */
const DEED_FRESH_MS = 120_000;

/**
 * The top of Home: the companion, alive, with the hadith of the day beside it, under the app's title and
 * the streak. Touching the companion makes it answer; the words open its own screen.
 */
function Hero({ streak, level }: { streak: number; level: number }) {
  const e = useEcho();
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  // Something is over Home: the companion stops drawing until Home shows again.
  const covered = useNav((s) => s.stack.length > 0 || !!s.sheet);
  // Its own screens have a stage of their own; two at once is more than a phone should carry.
  const elsewhere = useNav((s) => s.stack.some((r) => r.name === 'echo' || r.name === 'shop'));
  const { today } = useAdvisor();
  const stage = useRef<CompanionHandle>(null);
  const taps = useRef(0);
  const ready = useRef(false);
  const { info, now } = usePrayerNow();
  const sky = skyPhase(info ? info.current : undefined, new Date(now).getHours());
  const worn = !!e.outfit?.sky && e.outfit.sky !== 'bg-none';

  /** Answers the last deed, once, if Home is in sight and the deed is still fresh. */
  const answer = useCallback(() => {
    if (!deed || !ready.current) return;
    const { clip, at } = deed;
    deed = null;
    if (Date.now() - at <= DEED_FRESH_MS) setTimeout(() => stage.current?.play(clip), 380);
  }, []);
  const deeds = useStore((s) => s.celebrations.length);
  useEffect(() => {
    if (!covered) answer();
  }, [covered, deeds, answer]);

  const onState = useCallback(
    (state: StageState) => {
      ready.current = state === 'ready';
      if (state !== 'ready') return;
      if (greeted) {
        answer();
        return;
      }
      greeted = true;
      deed = null; // the greeting comes first; what was done before the app was opened is not news
      setTimeout(() => stage.current?.play('wave'), 400);
    },
    [answer],
  );
  // While Home's stage is here, a story of the day's words draws the companion from it, fresh and sharp.
  useEffect(() => {
    offerHeroShot((width) => stage.current?.picture(width) ?? null);
    return () => offerHeroShot(null);
  }, []);

  const onTap = (part: TapPart) => {
    haptic('light');
    stage.current?.play(part === 'head' ? 'nod' : TAP_MOVES[taps.current++ % TAP_MOVES.length]);
  };

  return (
    <section className="card hero">
      {/* A sky bought in the shop is drawn by the stage itself; the day's own sky then stays away. */}
      {worn ? null : (
        <div className={cx('hero-sky', `sky-${sky}`)} aria-hidden="true">
          <i className="hero-orb" />
        </div>
      )}
      <div className="hero-stage">
        {!e.echo ? (
          <div className="hero-still">
            <span className="hero-seed"><Emoji e="🌱" /></span>
          </div>
        ) : elsewhere || lowPerf ? (
          <div className="hero-still">
            <CompanionThumb size={150} />
          </div>
        ) : (
          <CompanionStage
            ref={stage}
            own="home"
            resting={covered}
            gender={e.gender}
            stage={e.growth.index}
            accent={e.accent}
            outfit={e.outfit}
            mood={e.mood}
            skin={e.echo.skin}
            hair={e.echo.hair}
            height={240}
            onTap={onTap}
            onState={onState}
          />
        )}
      </div>
      <div className="hero-copy">
        <h1 className="t-display">
          {t('home.title.your')} <span className="grad-text">{t('home.title.path')}</span>
        </h1>
        <div className="t-body muted hero-tag">{t('home.tagline')}</div>
        {e.echo ? (
          <div className="hero-say-wrap">
            <Tap className="hero-say" onTap={() => push({ name: 'echo' })} scale={0.98}>
              <span className="t-tiny advisor-kind">{e.echo.name} · {t('home.hadithOfDay')}</span>
              <span className="advisor-text">{today.text}</span>
              <span className="t-tiny faint">
                {today.source}
                {today.ai ? ` · ${t('advice.ai')}` : ''}
              </span>
            </Tap>
            <QuoteStoryButton
              className="hero-share"
              make={() => ({
                label: `${e.echo!.name} · ${t('home.hadithOfDay')}`,
                text: today.text,
                source: [today.source, today.ai ? t('advice.ai') : ''].filter(Boolean).join(' · '),
              })}
            />
          </div>
        ) : (
          <Tap className="hero-say" onTap={() => open({ name: 'echo' })} scale={0.98}>
            <span className="t-tiny advisor-kind">{t('you.echo.meet')}</span>
            <span className="advisor-text">{t('you.echo.meet.body')}</span>
          </Tap>
        )}
      </div>
      <Tap className="streak-pill hero-streak" onTap={() => push({ name: 'progress' })} scale={0.94} label={tn('home.streak', streak)}>
        <Fire size={16} weight="bold" style={{ color: streak > 0 ? 'var(--orange)' : 'var(--text-3)' }} />
        <span className="num">{streak}</span>
        <i />
        <span className="num">{t('common.lv', { n: level })}</span>
      </Tap>
    </section>
  );
}
