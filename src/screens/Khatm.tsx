// The Qurʼan khatm planner: choose how many days, then each day shows the portion that keeps the plan
// on time. Moving the bookmark forward earns XP per page; the last page finishes the khatm.
import { useState } from 'react';
import { ArrowSquareOut, Check as CheckIcon, Minus, Plus } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { PAGES, PAGE_XP_CAP, PLAN_DAYS, finishDay, isDone, juzOf, pace, portion, surahOf } from '../lib/khatm';
import type { Khatm as KhatmPlan } from '../lib/types';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { t, tn } from '../i18n';
import { fmtShortDate, pct } from '../i18n/format';
import { openLink } from '../tg/telegram';
import { Card, Header, IconBtn, Ring, Row, Screen, Section, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { StoryButton, storyCards } from '../ui/StoryButton';
import { IlmulHaqCard } from '../ui/IlmulHaq';
import { confirmSheet } from '../sheets/confirm';

const GOLD = '#f0b43c';
const dateOf = (day: string) => fmtShortDate(dayKeyToMs(day, 12));

/** "Juz 8 · Al-An'am" for a page. */
export function pageWhere(page: number): string {
  const p = Math.max(1, Math.min(PAGES, page));
  return t('khatm.where', { juz: juzOf(p), surah: surahOf(p).name });
}

export const quranPageUrl = (page: number): string => `https://quran.com/page/${Math.max(1, Math.min(PAGES, page))}`;

/** Choosing the number of days: for a new khatm, or to change the plan of the one under way. */
function PlanPicker({ current, onDone }: { current?: KhatmPlan; onDone: () => void }) {
  const startKhatm = useStore((s) => s.startKhatm);
  const setKhatmDays = useStore((s) => s.setKhatmDays);
  const [days, setDays] = useState<number>(current?.days ?? 30);
  const keep = !!current && !isDone(current);
  return (
    <Screen>
      <Header title={t('khatm.title')} noGear />
      <Card className="center khatm-intro">
        <Emoji e="📖" size={56} />
        <div className="t-title" style={{ marginTop: 8 }}>{t(keep ? 'khatm.change' : 'khatm.title')}</div>
        <p className="t-small muted" style={{ margin: '6px 0 0' }}>{t('khatm.intro')}</p>
      </Card>
      <Section title={t('khatm.days')}>
        <div className="khatm-days">
          {PLAN_DAYS.map((n) => (
            <Tap key={n} className={cx('khatm-day', n === days && 'on')} onTap={() => setDays(n)} hap="select" scale={0.95}>
              <b>{tn('khatm.daysN', n)}</b>
              <span className="t-tiny">{t('khatm.perDay', { n: Math.ceil(PAGES / n) })}</span>
            </Tap>
          ))}
        </div>
      </Section>
      <Tap
        className="btn primary"
        onTap={() => {
          if (keep) setKhatmDays(days);
          else startKhatm(days);
          onDone();
        }}
      >
        {t(keep ? 'common.save' : 'khatm.start')}
      </Tap>
      {current ? (
        <Tap className="btn ghost" style={{ marginTop: 8 }} onTap={onDone}>
          {t('common.cancel')}
        </Tap>
      ) : null}
    </Screen>
  );
}

export function Khatm() {
  const khatm = useStore((s) => s.profile.khatm);
  const khatms = useStore((s) => s.profile.khatms ?? 0);
  const readQuran = useStore((s) => s.readQuran);
  const startKhatm = useStore((s) => s.startKhatm);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);

  if (!khatm || picking) return <PlanPicker current={khatm} onDone={() => setPicking(false)} />;

  const today = dayKey();
  const todays = portion(khatm, today);
  const ahead = pace(khatm, today);
  const done = isDone(khatm);
  const shown = draft ?? khatm.page;
  const commit = () => {
    if (draft === null) return;
    readQuran(draft);
    setDraft(null);
  };
  const status = done
    ? t('khatm.done.title')
    : ahead > 0
      ? tn('khatm.ahead', ahead)
      : ahead < 0
        ? tn('khatm.behind', -ahead)
        : t('khatm.onTrack');

  return (
    <Screen>
      <Header title={t('khatm.title')} noGear />

      <Card className="khatm-hero">
        <Ring value={khatm.page / PAGES} size={118} stroke={10} color={GOLD}>
          <div className="khatm-pct num">{pct(khatm.page / PAGES)}</div>
          <div className="t-tiny muted">{t('khatm.pageOf', { n: khatm.page, total: PAGES })}</div>
        </Ring>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className={cx('khatm-status', ahead < 0 && !done && 'behind', done && 'done')}>{status}</div>
          {done ? (
            <div className="t-small muted">{t('khatm.done.body')}</div>
          ) : (
            <div className="t-small muted">{t('khatm.finishBy', { date: dateOf(finishDay(khatm)) })}</div>
          )}
          {khatms > 0 ? <div className="t-tiny muted" style={{ marginTop: 6 }}>{tn('khatm.count', khatms)}</div> : null}
        </div>
      </Card>

      {done ? (
        <>
          <Tap className="btn primary" onTap={() => setPicking(true)}>
            {t('khatm.new')}
          </Tap>
          <StoryButton make={storyCards.khatm} />
        </>
      ) : (
        <Section title={t('khatm.today')}>
          <Card className="khatm-today">
            {todays.pages > 0 ? (
              <>
                <div className="khatm-portion">
                  <span className="t-body" style={{ fontWeight: 700 }}>{t('khatm.pages', { from: todays.from, to: todays.to })}</span>
                  <span className="t-small muted">{tn('khatm.pagesN', todays.pages)}</span>
                </div>
                <div className="t-small muted">{pageWhere(todays.from)}</div>
                <Tap className="btn primary" style={{ marginTop: 14 }} onTap={() => readQuran(todays.to)} hap="medium">
                  <CheckIcon size={18} weight="bold" />
                  {t('khatm.mark')}
                </Tap>
              </>
            ) : (
              <div className="khatm-portion">
                <span className="t-body adhkar-ticked" style={{ fontWeight: 700 }}>
                  <CheckIcon size={16} weight="bold" /> {t('khatm.doneToday')}
                </span>
              </div>
            )}
            <Tap className="btn soft" style={{ marginTop: 10 }} onTap={() => openLink(quranPageUrl(todays.pages > 0 ? todays.from : khatm.page + 1))}>
              <ArrowSquareOut size={18} />
              {t('khatm.read')}
            </Tap>
          </Card>
        </Section>
      )}

      <Section title={t('khatm.adjust')}>
        <Card>
          <div className="khatm-step">
            <IconBtn small onTap={() => readQuran(khatm.page - 1)} label={t('khatm.back')}>
              <Minus size={18} weight="bold" />
            </IconBtn>
            <div className="khatm-page">
              <b className="num">{t('khatm.page', { n: shown })}</b>
              <span className="t-tiny muted">{shown > 0 ? pageWhere(shown) : t('khatm.notStarted')}</span>
            </div>
            <IconBtn small onTap={() => readQuran(khatm.page + 1)} label={t('khatm.forward')}>
              <Plus size={18} weight="bold" />
            </IconBtn>
          </div>
          <input
            className="khatm-range"
            type="range"
            min={0}
            max={PAGES}
            value={shown}
            aria-label={t('khatm.adjust')}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <div className="t-tiny muted">{t('khatm.xpNote', { n: PAGE_XP_CAP })}</div>
        </Card>
      </Section>

      <Card pad={false} className="list">
        <Row
          title={t('khatm.planInfo', { days: tn('khatm.daysN', khatm.days), date: dateOf(khatm.start) })}
          value={done ? undefined : t('khatm.change')}
          onTap={done ? undefined : () => setPicking(true)}
        />
        <Row
          title={t('khatm.restart')}
          danger
          onTap={() =>
            confirmSheet({ title: t('khatm.restart.title'), body: t('khatm.restart.body'), confirm: t('khatm.restart') }, () => startKhatm(khatm.days))
          }
        />
      </Card>
      <IlmulHaqCard />
    </Screen>
  );
}
