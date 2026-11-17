// Prayer times: the cards on Home, the prayer screen (today's times, the tracker, Ramadan, the way to the
// adhkar and the khatm) and the Qibla.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretRight, Check, Compass, GearSix as Gear, MapPin, NavigationArrow, SpinnerGap } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import {
  PRAYERS, PrayerNow, TIMES, TIME_EMOJI, WorshipKey, canTick, daysToRamadan, hijriOf, kmToKaaba, prayedOn, prayerNow,
  prayerStreak, qiblaBearing, ramadanDays, turn,
} from '../lib/prayer';
import { isChecked, shiftDay, weekdayOf } from '../lib/habits';
import { HIJRI_MONTHS } from '../lib/hijri';
import { cityById, nearestCity } from '../content/cities';
import { Place } from '../lib/types';
import { getLang, t, tn } from '../i18n';
import { fmtClockIn, fmtLeft, fmtNumber, fmtWeekdayDate, pct, weekdayMini } from '../i18n/format';
import { dayKeyToMs } from '../lib/calendar';
import { askCompassPermission, compassNeedsPermission, getLocation, haptic, openLocationSettings, watchHeading } from '../tg/telegram';
import { Bar, Card, Header, IconBtn, Screen, Section, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { IlmulHaqCard } from '../ui/IlmulHaq';
import { SESSION_SIZE, Session, savedDone, sessionAt } from '../lib/adhkar';
import { PAGES, isDone, portion } from '../lib/khatm';
import { dayKey } from '../lib/dates';

/** The current time, refreshed every `ms`. */
function useClock(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Today's prayer times where the user is (null until a place is set). */
export function usePrayerNow(): { place?: Place; info: PrayerNow | null; now: number } {
  const place = useStore((s) => s.settings.place);
  const prayerMethod = useStore((s) => s.settings.prayerMethod);
  const asr = useStore((s) => s.settings.asr);
  const now = useClock(15_000);
  const info = useMemo(() => (place ? prayerNow(place, { prayerMethod, asr }, now) : null), [place, prayerMethod, asr, now]);
  return { place, info, now };
}

export function placeName(place: Place): string {
  const lang = getLang();
  const city = cityById(place.city) ?? nearestCity(place.lat, place.lon);
  return city ? city.name[lang] : t('place.mine');
}

const deviceTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Asks the phone where it is and saves the place (rounded to about a kilometre). */
export function useLocate(onDone?: () => void) {
  const setSettings = useStore((s) => s.setSettings);
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'unavailable'>('idle');
  const locate = async () => {
    setState('locating');
    const r = await getLocation();
    if (typeof r === 'object') {
      setSettings({ place: { lat: round2(r.lat), lon: round2(r.lon), tz: deviceTz() } });
      haptic('success');
      setState('idle');
      onDone?.();
    } else setState(r);
  };
  return { state, locate };
}

/** Shown wherever prayer times need a place first. */
export function PlaceSetup() {
  const open = useNav((s) => s.open);
  const { state, locate } = useLocate();
  return (
    <Card className="center place-setup">
      <Emoji e="🕌" size={56} />
      <div className="t-title" style={{ marginTop: 10 }}>{t('place.setup.title')}</div>
      <p className="t-small muted" style={{ margin: '6px 0 16px' }}>{t('place.setup.body')}</p>
      <Tap className="btn primary" onTap={locate} disabled={state === 'locating'}>
        {state === 'locating' ? <SpinnerGap size={18} weight="bold" className="spin" /> : <NavigationArrow size={18} weight="fill" />}
        {t('place.useMine')}
      </Tap>
      <Tap className="btn soft" style={{ marginTop: 10 }} onTap={() => open({ name: 'place' })}>
        <MapPin size={18} />
        {t('place.pick')}
      </Tap>
      <LocateProblem state={state} />
    </Card>
  );
}

export function LocateProblem({ state }: { state: string }) {
  if (state !== 'denied' && state !== 'unavailable') return null;
  return (
    <div className="t-small" style={{ color: 'var(--orange)', marginTop: 12 }}>
      {state === 'denied' ? t('place.denied') : t('place.unavailable')}{' '}
      {state === 'denied' ? (
        <Tap className="link-btn" onTap={() => openLocationSettings()}>
          {t('place.openSettings')}
        </Tap>
      ) : null}
    </div>
  );
}

const hijriLabel = (day: string, offset: number): string => {
  const h = hijriOf(day, offset);
  return h ? `${h.day} ${HIJRI_MONTHS[getLang()][h.month - 1]} ${h.year}` : '';
};

/** Five dots: the prayers ticked on a day. */
function PrayerDots({ day }: { day: string }) {
  const worship = useStore((s) => s.worship);
  return (
    <span className="pdots" aria-label={t('prayer.prayedOf', { n: prayedOn(worship, day) })}>
      {PRAYERS.map((p) => (
        <i key={p} className={isChecked(worship, p, day) ? 'on' : undefined} />
      ))}
    </span>
  );
}

// ---------- Home ----------

/** Home: the next prayer and how long until it; in Ramadan, iftar or suhoor. */
export function PrayerCard() {
  const show = useStore((s) => s.settings.prayerCard !== false);
  const offset = useStore((s) => s.settings.hijriOffset ?? 0);
  const push = useNav((s) => s.push);
  const { place, info, now } = usePrayerNow();
  if (!show) return null;
  if (!place || !info) {
    return (
      <Tap onTap={() => push({ name: 'prayer' })} scale={0.98}>
        <Card pad={false} className="prayer-card">
          <span className="prayer-ic"><Emoji e="🕌" /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{t('prayer.title')}</span>
            <span className="t-small muted">{t('place.setup.short')}</span>
          </span>
          <CaretRight size={18} weight="bold" className="chev" />
        </Card>
      </Tap>
    );
  }
  const ramadan = ramadanDays(info.day, offset).length > 0;
  // In Ramadan the fast frames the day: suhoor ends at Fajr, iftar is at Maghrib.
  const fastNote = ramadan
    ? info.next.key === 'maghrib'
      ? `${t('ramadan.iftar')} ${fmtClockIn(info.times.maghrib, place.tz)}`
      : info.next.key === 'fajr'
        ? `${t('ramadan.suhoor')} ${fmtClockIn(info.next.at, place.tz)}`
        : null
    : null;
  return (
    <Tap onTap={() => push({ name: 'prayer' })} scale={0.98}>
      <Card pad={false} className="prayer-card">
        <span className="prayer-ic"><Emoji e={TIME_EMOJI[info.next.key]} /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-tiny prayer-kind">{t('prayer.next')}{fastNote ? ` · ${fastNote}` : ''}</span>
          <span className="prayer-line">
            {t(`prayer.${info.next.key}`)} <b className="num">{fmtClockIn(info.next.at, place.tz)}</b>
          </span>
          <span className="t-tiny muted clip" style={{ display: 'block' }}>{fmtLeft(info.next.at.getTime() - now)} · {placeName(place)}</span>
        </span>
        <PrayerDots day={info.day} />
      </Card>
    </Tap>
  );
}

// ---------- the prayer screen ----------

export function Prayer() {
  const { place, info, now } = usePrayerNow();
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const offset = useStore((s) => s.settings.hijriOffset ?? 0);
  const gear = (
    <IconBtn onTap={() => push({ name: 'faith' })} label={t('common.settings')}>
      <Gear size={20} />
    </IconBtn>
  );
  if (!place || !info) {
    return (
      <Screen>
        <Header title={t('prayer.title')} right={gear} />
        <PlaceSetup />
        <AdhkarRow info={null} now={now} />
        <KhatmRow />
      </Screen>
    );
  }
  const span = info.next.at.getTime() - info.since.getTime();
  return (
    <Screen>
      <Header title={t('prayer.title')} right={gear} />

      <Card className="prayer-hero">
        <Tap className="prayer-place" onTap={() => open({ name: 'place' })} scale={0.96}>
          <MapPin size={15} weight="fill" />
          <span className="clip">{placeName(place)}</span>
        </Tap>
        <div className="t-tiny muted" style={{ marginTop: 6 }}>
          {fmtWeekdayDate(dayKeyToMs(info.day, 12))} · {hijriLabel(info.day, offset)}
        </div>
        <div className="prayer-hero-main">
          <Emoji e={TIME_EMOJI[info.next.key]} size={44} />
          <div>
            <div className="t-small muted">{t('prayer.next')}</div>
            <div className="prayer-hero-name">
              {t(`prayer.${info.next.key}`)} <span className="num">{fmtClockIn(info.next.at, place.tz)}</span>
            </div>
          </div>
        </div>
        <Bar value={span > 0 ? (now - info.since.getTime()) / span : 0} height={6} color="var(--gold)" />
        <div className="t-small" style={{ marginTop: 8, fontWeight: 600 }}>{fmtLeft(info.next.at.getTime() - now)}</div>
      </Card>

      <PrayerList info={info} place={place} now={now} />
      <RamadanCard info={info} place={place} now={now} />
      <PrayerWeek info={info} now={now} />

      <Tap onTap={() => push({ name: 'qibla' })} scale={0.98}>
        <Card pad={false} className="prayer-card">
          <span className="prayer-ic"><Emoji e="🕋" /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{t('qibla.title')}</span>
            <span className="t-small muted">{t('qibla.card', { deg: Math.round(qiblaBearing(place.lat, place.lon)), km: fmtNumber(Math.round(kmToKaaba(place.lat, place.lon))) })}</span>
          </span>
          <CaretRight size={18} weight="bold" className="chev" />
        </Card>
      </Tap>
      <AdhkarRow info={info} now={now} />
      <KhatmRow />
      <IlmulHaqCard />
    </Screen>
  );
}

// ---------- adhkar and khatm ----------

/** While the morning adhkar (Fajr to Dhuhr) or the evening ones (Asr to Isha) are due. */
function adhkarDue(info: PrayerNow | null, now: number, session: Session): boolean {
  if (info) {
    const { fajr, dhuhr, asr, isha } = info.times;
    return session === 'am' ? now >= fajr.getTime() && now < dhuhr.getTime() : now >= asr.getTime() && now < isha.getTime();
  }
  const hour = new Date(now).getHours();
  return session === 'am' ? hour >= 5 && hour < 12 : hour >= 15 && hour < 21;
}

/** The adhkar of this part of the day, and how far today's have got. */
function AdhkarRow({ info, now }: { info: PrayerNow | null; now: number }) {
  const push = useNav((s) => s.push);
  const session = sessionAt(info?.times ?? null, now);
  const ticked = useStore((s) => isChecked(s.worship, session, dayKey()));
  const done = savedDone(session);
  return (
    <Tap onTap={() => push({ name: 'adhkar', session })} scale={0.98}>
      <Card pad={false} className="prayer-card">
        <span className="prayer-ic"><Emoji e={session === 'am' ? '🌅' : '🌙'} /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{t(session === 'am' ? 'adhkar.amTitle' : 'adhkar.pmTitle')}</span>
          {ticked ? (
            <span className="t-small adhkar-ticked"><Check size={13} weight="bold" /> {t('adhkar.doneToday')}</span>
          ) : (
            <span className="t-small muted">{done > 0 ? t('adhkar.progress', { done, total: SESSION_SIZE[session] }) : t('adhkar.card')}</span>
          )}
        </span>
        <CaretRight size={18} weight="bold" className="chev" />
      </Card>
    </Tap>
  );
}

/** Home: the adhkar while they are due and not yet said today. */
/** True while the adhkar of this part of the day are due and not yet read: when their card shows on Home. */
export function useAdhkarDue(): boolean {
  const { info, now } = usePrayerNow();
  const session = sessionAt(info?.times ?? null, now);
  const ticked = useStore((s) => isChecked(s.worship, session, dayKey()));
  return !ticked && adhkarDue(info, now, session);
}

/** Home: the adhkar of this part of the day, until they are read. Whether Home shows the card at all is Home's to say. */
export function AdhkarCard() {
  const { info, now } = usePrayerNow();
  const due = useAdhkarDue();
  if (!due) return null;
  return <AdhkarRow info={info} now={now} />;
}

/** The khatm under way: today's pages, or a way to plan one. */
function KhatmRow() {
  const push = useNav((s) => s.push);
  const khatm = useStore((s) => s.profile.khatm);
  const today = portion(khatm ?? { start: dayKey(), days: 30, page: 0, best: 0 }, dayKey());
  const sub = !khatm
    ? t('khatm.card')
    : isDone(khatm)
      ? t('khatm.done.title')
      : today.pages > 0
        ? t('khatm.card.today', { from: today.from, to: today.to })
        : t('khatm.doneToday');
  return (
    <Tap onTap={() => push({ name: 'khatm' })} scale={0.98}>
      <Card pad={false} className="prayer-card">
        <span className="prayer-ic"><Emoji e="📖" /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{t('khatm.title')}</span>
          <span className="t-small muted">{sub}</span>
        </span>
        {khatm && !isDone(khatm) ? <span className="khatm-mini num">{pct(khatm.page / PAGES)}</span> : <CaretRight size={18} weight="bold" className="chev" />}
      </Card>
    </Tap>
  );
}

/** Today's six times; the five prayers can be ticked once their time has come. */
function PrayerList({ info, place, now }: { info: PrayerNow; place: Place; now: number }) {
  const worship = useStore((s) => s.worship);
  const toggle = useStore((s) => s.toggleWorship);
  return (
    <Card pad={false} className="list">
      {TIMES.map((key) => {
        const prayer = key !== 'sunrise';
        const done = prayer && isChecked(worship, key, info.day);
        const open = prayer && canTick(key as WorshipKey, info.day, info, now);
        return (
          <div key={key} className={cx('lrow prayer-row', info.current === key && 'now', !prayer && 'quiet')}>
            <span className="lrow-ic"><Emoji e={TIME_EMOJI[key]} /></span>
            <span className="grow t-body">{t(`prayer.${key}`)}</span>
            <span className="num prayer-time">{fmtClockIn(info.times[key], place.tz)}</span>
            {prayer ? (
              <Tap
                className={cx('pcheck', done && 'on')}
                onTap={() => toggle(key as WorshipKey, info.day)}
                disabled={!open && !done}
                label={t('prayer.tick', { name: t(`prayer.${key}`) })}
                hap={done ? 'light' : 'success'}
                scale={0.85}
              >
                <Check size={16} weight="bold" />
              </Tap>
            ) : (
              <span className="pcheck-gap" />
            )}
          </div>
        );
      })}
    </Card>
  );
}

/** The last seven days of prayers; earlier days can be filled in. */
function PrayerWeek({ info, now }: { info: PrayerNow; now: number }) {
  const worship = useStore((s) => s.worship);
  const toggle = useStore((s) => s.toggleWorship);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(info.day, i - 6));
  const streak = prayerStreak(worship, info.day);
  return (
    <Section title={t('prayer.week')}>
      <Card>
        <div className="pweek">
          <span />
          {days.map((d) => (
            <span key={d} className={cx('t-tiny pweek-day', d === info.day && 'today')}>{weekdayMini(weekdayOf(d) - 1)}</span>
          ))}
          {PRAYERS.map((p) => (
            <PrayerWeekRow key={p} p={p} days={days} info={info} now={now} worship={worship} toggle={toggle} />
          ))}
        </div>
        <div className="t-small muted" style={{ marginTop: 12 }}>
          {streak > 0 ? <><Emoji e="🔥" /> {tn('prayer.streak', streak)}</> : t('prayer.streak.none')}
        </div>
      </Card>
    </Section>
  );
}

function PrayerWeekRow({ p, days, info, now, worship, toggle }: { p: (typeof PRAYERS)[number]; days: string[]; info: PrayerNow; now: number; worship: ReturnType<typeof useStore.getState>['worship']; toggle: (k: WorshipKey, d: string) => void }) {
  return (
    <>
      <span className="t-tiny pweek-name">{t(`prayer.${p}`)}</span>
      {days.map((d) => {
        const on = isChecked(worship, p, d);
        return (
          <Tap
            key={d}
            className={cx('pweek-dot', on && 'on')}
            onTap={() => toggle(p, d)}
            disabled={!on && !canTick(p, d, info, now)}
            label={`${t(`prayer.${p}`)} ${d}`}
            hap="select"
            scale={0.8}
          >
            <i />
          </Tap>
        );
      })}
    </>
  );
}

/** In Ramadan: suhoor and iftar, and the fasts kept so far. Before it: how many days are left. */
function RamadanCard({ info, place, now }: { info: PrayerNow; place: Place; now: number }) {
  const offset = useStore((s) => s.settings.hijriOffset ?? 0);
  const worship = useStore((s) => s.worship);
  const toggle = useStore((s) => s.toggleWorship);
  const days = ramadanDays(info.day, offset);
  if (!days.length) {
    const left = daysToRamadan(info.day, offset);
    if (left == null) return null;
    return (
      <Card className="ramadan soon">
        <Emoji e="🌙" size={30} />
        <span className="t-body" style={{ fontWeight: 700 }}>{tn('ramadan.soon', left)}</span>
      </Card>
    );
  }
  const fasted = days.filter((d) => isChecked(worship, 'fast', d)).length;
  const iftarNext = now < info.times.maghrib.getTime() && now >= info.times.fajr.getTime();
  return (
    <Card className="ramadan">
      <div className="row between">
        <span className="t-body" style={{ fontWeight: 800 }}><Emoji e="🌙" /> {t('ramadan.day', { n: days.length })}</span>
        <span className="t-tiny muted">{t('ramadan.fasted', { n: fasted, total: days.length })}</span>
      </div>
      <div className="ramadan-times">
        <div className={cx('ramadan-time', !iftarNext && 'next')}>
          <span className="t-tiny muted">{t('ramadan.suhoor')}</span>
          <b className="num">{fmtClockIn(info.times.fajr, place.tz)}</b>
        </div>
        <div className={cx('ramadan-time', iftarNext && 'next')}>
          <span className="t-tiny muted">{t('ramadan.iftar')}</span>
          <b className="num">{fmtClockIn(info.times.maghrib, place.tz)}</b>
          {iftarNext ? <span className="t-tiny">{fmtLeft(info.times.maghrib.getTime() - now)}</span> : null}
        </div>
      </div>
      <div className="ramadan-grid">
        {days.map((d, i) => {
          const on = isChecked(worship, 'fast', d);
          return (
            <Tap key={d} className={cx('ramadan-day', on && 'on', d === info.day && 'today')} onTap={() => toggle('fast', d)} hap={on ? 'light' : 'success'} scale={0.85} label={t('ramadan.day', { n: i + 1 })}>
              {i + 1}
            </Tap>
          );
        })}
      </div>
      <div className="t-tiny muted" style={{ marginTop: 8 }}>{t('ramadan.hint')}</div>
    </Card>
  );
}

// ---------- the Qibla ----------

export function Qibla() {
  const place = useStore((s) => s.settings.place);
  const [heading, setHeading] = useState<number | null>(null);
  const [needsTap, setNeedsTap] = useState(compassNeedsPermission);
  const [silent, setSilent] = useState(false); // no compass readings arrived
  const smooth = useRef<number | null>(null);
  const facing = useRef(false);

  useEffect(() => {
    if (needsTap) return;
    let frame = 0;
    const stop = watchHeading((deg) => {
      // Ease towards the new reading the short way round, so the dial does not spin past north.
      smooth.current = smooth.current == null ? deg : (smooth.current + turn(smooth.current, deg) * 0.25 + 360) % 360;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHeading(smooth.current));
    });
    const quiet = setTimeout(() => setSilent(smooth.current == null), 2500);
    return () => {
      stop();
      cancelAnimationFrame(frame);
      clearTimeout(quiet);
    };
  }, [needsTap]);

  const bearing = place ? qiblaBearing(place.lat, place.lon) : 0;
  const off = heading == null ? null : turn(heading, bearing);
  const aligned = off != null && Math.abs(off) <= 4;
  useEffect(() => {
    if (aligned && !facing.current) haptic('success');
    if (off != null) facing.current = aligned || (facing.current && Math.abs(off) < 8);
  }, [aligned, off]);

  if (!place) {
    return (
      <Screen>
        <Header title={t('qibla.title')} noGear />
        <PlaceSetup />
      </Screen>
    );
  }
  const rot = heading ?? 0;
  return (
    <Screen>
      <Header title={t('qibla.title')} noGear />
      <Card className="qibla">
        <div className={cx('qibla-stage', aligned && 'aligned')}>
          <span className="qibla-pointer" />
          <div className="qibla-dial" style={{ transform: `rotate(${-rot}deg)` }}>
            <svg viewBox="0 0 260 260" aria-hidden="true">
              <circle cx="130" cy="130" r="124" className="qibla-ring" />
              {Array.from({ length: 72 }, (_, i) => (
                <line key={i} x1="130" y1={i % 18 === 0 ? 14 : i % 2 === 0 ? 16 : 18} x2="130" y2={i % 2 === 0 ? 26 : 22} transform={`rotate(${i * 5} 130 130)`} className={i % 18 === 0 ? 'major' : undefined} />
              ))}
              {['N', 'E', 'S', 'W'].map((l, i) => (
                <text key={l} x="130" y="46" transform={`rotate(${i * 90} 130 130)`} className={l === 'N' ? 'north' : undefined}>{l}</text>
              ))}
              <line x1="130" y1="130" x2="130" y2="58" transform={`rotate(${bearing} 130 130)`} className="qibla-needle" />
              <circle cx="130" cy="130" r="6" className="qibla-hub" />
            </svg>
            <span className="qibla-kaaba" style={{ transform: `rotate(${bearing}deg) translateY(calc(var(--qs) * -0.42)) rotate(${-bearing + rot}deg)` }}>
              <Emoji e="🕋" size={28} />
            </span>
          </div>
        </div>
        <div className="qibla-text">
          {off == null ? (
            <b>{t('qibla.bearing', { deg: Math.round(bearing) })}</b>
          ) : aligned ? (
            <b style={{ color: 'var(--green)' }}>{t('qibla.facing')}</b>
          ) : (
            <b>{off > 0 ? t('qibla.right', { deg: Math.round(off) }) : t('qibla.left', { deg: Math.round(-off) })}</b>
          )}
          <div className="t-small muted" style={{ marginTop: 4 }}>
            {placeName(place)} · {t('qibla.km', { km: fmtNumber(Math.round(kmToKaaba(place.lat, place.lon))) })}
          </div>
        </div>
        {needsTap ? (
          <Tap
            className="btn primary"
            style={{ marginTop: 14 }}
            onTap={async () => {
              const ok = await askCompassPermission();
              setNeedsTap(!ok);
              if (!ok) setSilent(true); // refused: show how to find it without the compass
            }}
          >
            <Compass size={18} />
            {t('qibla.start')}
          </Tap>
        ) : null}
      </Card>
      <div className="t-small muted" style={{ padding: '0 4px' }}>
        {silent ? t('qibla.noCompass', { deg: Math.round(bearing) }) : t('qibla.hint')}
      </div>
    </Screen>
  );
}
