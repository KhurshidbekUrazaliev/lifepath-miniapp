// The focus timer: pick a length (and, if you like, the timed goal it counts toward), then study while
// the companion reads along. A finished session logs its minutes or earns focus XP; ending early earns
// nothing. The timer keeps going with the app closed, and the bot can say when it is over.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Pause, Play, Stop } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { useEcho } from '../store/echo';
import { useFocus, useNowWhile } from '../store/focus';
import { useServer } from '../store/server';
import type { Route } from '../store/nav';
import { BREAK_MINUTES, FOCUS_MINUTES, clock, focusToday, remaining } from '../lib/focus';
import { dayKey } from '../lib/dates';
import { Key, t, tn } from '../i18n';
import { fmtHours } from '../i18n/format';
import { haptic } from '../tg/telegram';
import { Card, Chips, Header, Ring, Screen, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { CompanionHandle, CompanionStage } from '../companion/CompanionStage';
import { Speech, SpeechCard } from '../companion/Speech';
import type { TapPart } from '../companion/types';
import { confirmSheet } from '../sheets/confirm';

const BREAK_COLOR = '#22C55E';
const pick = (base: string, n: number): string => t(`${base}.${Math.floor(Math.random() * n)}` as Key);
const say = (text: string): Speech => ({ kind: 'say', key: `${Date.now()}-${Math.random()}`, text });

export function Focus({ route }: { route: Extract<Route, { name: 'focus' }> }) {
  const e = useEcho();
  const run = useFocus((s) => s.run);
  const done = useFocus((s) => s.done);
  const focus = useFocus();
  const stats = useStore((s) => s.profile.focus);
  const tasks = useStore((s) => s.tasks);
  const reminders = useStore((s) => s.settings.reminders);
  const canMessage = useServer((s) => s.canMessage);
  const goals = useMemo(() => tasks.filter((x) => x.progressType === 'time' && !x.completedAt), [tasks]);
  const [minutes, setMinutes] = useState<number>(25);
  const [goal, setGoal] = useState<string>(() => (route.taskId && goals.some((g) => g.id === route.taskId) ? route.taskId : 'none'));
  const stage = useRef<CompanionHandle>(null);
  const [speech, setSpeech] = useState<Speech>(() => say(run ? t('focus.say.back') : t('focus.say.idle')));
  const recent = !!done && Date.now() - done.at < 30 * 60_000;
  const now = useNowWhile(!!run?.endsAt);

  const running = !!run?.endsAt;
  const paused = !!run && !running;
  const studying = run?.mode === 'focus' && running;

  // The companion reads while the session runs (or thinks, when its model has no reading motion).
  const study = useCallback(() => {
    if (!(stage.current?.play('read') ?? false)) stage.current?.play('think');
  }, []);
  const onState = useCallback(
    (s: string) => {
      if (s !== 'ready') return;
      const { run: r, done: d } = useFocus.getState();
      const cheer = !r && d?.mode === 'focus' && Date.now() - d.at < 60_000;
      setTimeout(() => (r?.mode === 'focus' && r.endsAt ? study() : stage.current?.play(cheer ? 'cheer' : 'wave')), 350);
    },
    [study],
  );

  // A session that has just ended (on this screen, or just before it opened): cheer, and say so.
  const seen = useRef(0);
  useEffect(() => {
    if (!done || done.at === seen.current || Date.now() - done.at > 30 * 60_000) return;
    seen.current = done.at;
    if (done.mode === 'focus') {
      stage.current?.play('cheer');
      setSpeech(say(pick('focus.say.done', 3)));
    } else {
      stage.current?.play('wave');
      setSpeech(say(t('focus.say.breakDone')));
    }
  }, [done]);

  const start = () => {
    focus.start(minutes, goal === 'none' ? undefined : goal);
    haptic('medium');
    study();
    setSpeech(say(pick('focus.say.start', 4)));
  };
  const startBreak = () => {
    focus.startBreak();
    haptic('light');
    stage.current?.play('nod');
    setSpeech(say(t('focus.say.break')));
  };
  const pause = () => {
    focus.pause();
    stage.current?.play('idle');
    setSpeech(say(t('focus.say.pause')));
  };
  const resume = () => {
    focus.resume();
    if (run?.mode === 'focus') study();
    setSpeech(say(pick('focus.say.start', 4)));
  };
  const end = () =>
    confirmSheet({ title: t('focus.end.title'), body: t('focus.end.body'), confirm: t('focus.end') }, () => {
      focus.stop();
      stage.current?.play('idle');
      setSpeech(say(t('focus.say.idle')));
    });
  const onTap = (part: TapPart) => {
    haptic('light');
    if (!studying) {
      stage.current?.play(part === 'head' ? 'nod' : 'wave');
      return;
    }
    // Interrupted: a nod, a word, then back to the book.
    stage.current?.play('nod');
    setSpeech(say(pick('focus.say.tap', 3)));
    setTimeout(() => useFocus.getState().run?.endsAt && study(), 1600);
  };

  const finished = !run && recent && done?.mode === 'focus';
  const length = run ? run.minutes : minutes;
  const left = run ? remaining(run, now) : finished ? done.minutes * 60_000 : minutes * 60_000;
  const progress = run ? 1 - left / (run.minutes * 60_000) : finished ? 1 : 0;
  const today = focusToday(stats, dayKey());
  const goalTitle = (id?: string) => tasks.find((x) => x.id === id)?.title;
  const label = finished ? t('focus.label.done') : !run ? t('focus.label.focus') : paused ? t('focus.paused') : t(run.mode === 'break' ? 'focus.label.break' : 'focus.label.focus');

  return (
    <Screen>
      <Header title={t('focus.title')} noGear />

      <div className="companion">
        <CompanionStage
          ref={stage}
          gender={e.gender}
          stage={e.growth.index}
          accent={e.accent}
          outfit={e.outfit}
          mood={e.mood}
          skin={e.echo?.skin}
          hair={e.echo?.hair}
          height={236}
          onTap={onTap}
          onState={onState}
        >
          {studying ? (
            <div className="cstage-badge focus-badge">
              <Emoji e="📖" /> {t('focus.studying')}
            </div>
          ) : null}
        </CompanionStage>
        <SpeechCard speech={speech} />
      </div>

      <Card className="focus-clock">
        <Ring value={progress} size={188} stroke={10} color={run?.mode === 'break' ? BREAK_COLOR : e.accent}>
          <div className={cx('focus-time num', paused && 'paused')}>{clock(left)}</div>
          <div className="t-tiny muted">{label}</div>
        </Ring>

        {run ? (
          <>
            {run.taskId && goalTitle(run.taskId) ? <div className="t-small muted clip focus-for">{t('focus.for', { goal: goalTitle(run.taskId)! })}</div> : null}
            <div className="focus-controls">
              <Tap className="btn soft" onTap={paused ? resume : pause} hap="select">
                {paused ? <Play size={18} weight="fill" /> : <Pause size={18} weight="fill" />}
                {t(paused ? 'focus.resume' : 'focus.pause')}
              </Tap>
              <Tap className="btn ghost" onTap={end} hap={false}>
                <Stop size={18} weight="fill" />
                {t('focus.end')}
              </Tap>
            </div>
          </>
        ) : finished ? (
          <div className="focus-done">
            <div className="t-title">
              <Emoji e="✅" /> {t('focus.done.title')}
            </div>
            <div className="t-small muted">
              {done.taskId && goalTitle(done.taskId)
                ? t('focus.done.logged', { n: done.xp, min: done.minutes, goal: goalTitle(done.taskId)! })
                : done.xp > 0
                  ? t('focus.done.xp', { n: done.xp, min: done.minutes })
                  : t('focus.done.cap', { min: done.minutes })}
            </div>
            <div className="focus-controls stack">
              <Tap className="btn primary" onTap={() => focus.clearDone()}>
                {t('focus.again')}
              </Tap>
              <Tap className="btn soft" onTap={startBreak}>
                <Coffee size={18} weight="duotone" />
                {t('focus.break', { n: BREAK_MINUTES })}
              </Tap>
            </div>
          </div>
        ) : (
          <>
            <div className="focus-pick">
              <div className="t-tiny muted focus-pick-title">{t('focus.length')}</div>
              <Chips<string>
                value={String(minutes)}
                onChange={(v) => setMinutes(Number(v))}
                options={FOCUS_MINUTES.map((n) => ({ id: String(n), label: t('focus.min', { n }) }))}
              />
            </div>
            {goals.length ? (
              <div className="focus-pick">
                <div className="t-tiny muted focus-pick-title">{t('focus.goal')}</div>
                <Chips<string>
                  value={goal}
                  onChange={setGoal}
                  options={[{ id: 'none', label: t('focus.goal.none') }, ...goals.map((g) => ({ id: g.id, label: g.title }))]}
                />
              </div>
            ) : null}
            <Tap className="btn primary" onTap={start} hap={false}>
              <Play size={18} weight="fill" />
              {t('focus.start', { n: length })}
            </Tap>
          </>
        )}
      </Card>

      <div className="t-small muted center">
        {today.n > 0 ? t('focus.today', { sessions: tn('focus.sessions', today.n), time: fmtHours(today.min) }) : t('focus.today.none')}
        {stats?.total ? ` · ${t('focus.total', { time: fmtHours(stats.total) })}` : ''}
      </div>
      <div className="t-tiny faint center focus-away">{t(reminders && canMessage ? 'focus.away.bot' : 'focus.away')}</div>

      <Card className="focus-quote">
        <span className="t-small">{t('focus.hadith')}</span>
        <span className="t-tiny muted">{t('focus.hadith.src')}</span>
      </Card>
    </Screen>
  );
}
