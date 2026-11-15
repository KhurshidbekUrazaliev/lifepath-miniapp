// Morning and evening adhkar (Hisn al-Muslim): read each one and tap to count. When the last one of a
// session is done, the session is ticked in the prayer tracker (+XP). Counts are kept for today.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, Check as CheckIcon, Sparkle, TextAa } from '@phosphor-icons/react';
import { ADHKAR } from '../content/adhkar';
import { Dhikr, Session, finished, inSession, saveCounts, savedCounts, sessionAt, sourceLabel, textOf } from '../lib/adhkar';
import { isChecked } from '../lib/habits';
import { dayKey } from '../lib/dates';
import { useStore } from '../store/store';
import type { Route } from '../store/nav';
import { getLang, t } from '../i18n';
import { haptic } from '../tg/telegram';
import { Bar, Card, Header, IconBtn, Ring, Screen, Segmented, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { usePrayerNow } from './Prayer';

const GOLD = '#f0b43c';

/** Arabic over several lines, with the verse-end marks of the Qurʼan in gold. */
function Arabic({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cx('dhikr-ar', className)} dir="rtl" lang="ar">
      {text.split('\n').map((line, i) => (
        <span key={i} className="dhikr-line">
          {line.split(/(۝[٠-٩]+)/).map((part, j) => (j % 2 ? <span key={j} className="ayah-end">{part}</span> : part))}
        </span>
      ))}
    </span>
  );
}

/** A translation, one block per part, with [explanatory notes] dimmed. */
function Meaning({ text }: { text: string }) {
  return (
    <span className="dhikr-mean">
      {text.split('\n').map((line, i) => (
        <span key={i} className="dhikr-line">
          {line.split(/(\[[^\]]*\])/).map((part, j) => (j % 2 ? <span key={j} className="ayah-note">{part}</span> : part))}
        </span>
      ))}
    </span>
  );
}

function Counter({ n, of, onTap }: { n: number; of: number; onTap: () => void }) {
  const done = n >= of;
  return (
    <Tap className={cx('dhikr-count', done && 'on')} onTap={onTap} label={`${n} / ${of}`} scale={0.86} hap={done ? false : 'light'}>
      <Ring value={n / of} size={54} stroke={4} color={GOLD} glow={false}>
        {done ? <CheckIcon size={22} weight="bold" /> : of > 1 ? <span className="num">{n}<i>/{of}</i></span> : null}
      </Ring>
    </Tap>
  );
}

export function Adhkar({ route }: { route: Extract<Route, { name: 'adhkar' }> }) {
  const { info } = usePrayerNow();
  const [session, setSession] = useState<Session>(() => route.session ?? sessionAt(info?.times ?? null, Date.now()));
  const showTr = useStore((s) => s.settings.adhkarTr !== false);
  const setSettings = useStore((s) => s.setSettings);
  const ticked = useStore((s) => isChecked(s.worship, session, dayKey()));
  const toggleWorship = useStore((s) => s.toggleWorship);
  const lang = getLang();
  const list = useMemo(() => ADHKAR.filter((d) => inSession(d, session)), [session]);
  const [counts, setCounts] = useState(() => savedCounts(session));
  const [reopened, setReopened] = useState<number | null>(null);
  const slots = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    setCounts(savedCounts(session));
    setReopened(null);
  }, [session]);

  const done = finished(list, counts);
  const all = done === list.length;

  const count = (d: Dhikr, to?: number) => {
    const was = counts[d.id] ?? 0;
    const n = Math.min(d.count, to ?? was + 1);
    if (n === was) return;
    const next = { ...counts, [d.id]: n };
    setCounts(next);
    saveCounts(session, next, finished(list, next));
    if (n < d.count) return;
    haptic('success');
    const ahead = list.find((x) => (next[x.id] ?? 0) < x.count);
    if (ahead) setTimeout(() => slots.current.get(ahead.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
    const today = dayKey();
    if (!ahead && !isChecked(useStore.getState().worship, session, today)) toggleWorship(session, today);
  };

  const readAgain = () => {
    setCounts({});
    saveCounts(session, {}, 0);
    slots.current.get(list[0].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Screen>
      <Header
        title={t('adhkar.title')}
        right={
          <IconBtn onTap={() => setSettings({ adhkarTr: !showTr })} label={t('adhkar.translit')}>
            <TextAa size={21} weight={showTr ? 'fill' : 'regular'} />
          </IconBtn>
        }
      />
      <Segmented<Session>
        value={session}
        onChange={setSession}
        options={[
          { id: 'am', label: t('adhkar.am') },
          { id: 'pm', label: t('adhkar.pm') },
        ]}
      />

      <Card className="adhkar-top">
        <Emoji e={session === 'am' ? '🌅' : '🌙'} size={40} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="adhkar-top-line">
            <span className="t-body" style={{ fontWeight: 700 }}>{t(session === 'am' ? 'adhkar.amTitle' : 'adhkar.pmTitle')}</span>
            <span className="t-small muted num">{t('adhkar.progress', { done, total: list.length })}</span>
          </div>
          <Bar value={done / list.length} color={GOLD} height={6} />
          <div className={cx('t-tiny', ticked ? 'adhkar-ticked' : 'muted')} style={{ marginTop: 7 }}>
            {ticked ? (
              <>
                <CheckIcon size={13} weight="bold" /> {t('adhkar.doneToday')}
              </>
            ) : (
              t('adhkar.tap')
            )}
          </div>
        </div>
      </Card>

      {list.map((d, i) => {
        const n = counts[d.id] ?? 0;
        const complete = n >= d.count;
        const text = textOf(d, session);
        const folded = complete && reopened !== d.id;
        return (
          <div
            key={`${session}-${d.id}`}
            className="dhikr-slot"
            ref={(el) => {
              if (el) slots.current.set(d.id, el);
              else slots.current.delete(d.id);
            }}
          >
            <Card pad={false} className={cx('dhikr', complete && 'done')}>
              {folded ? (
                <Tap className="dhikr-folded" onTap={() => setReopened(d.id)} scale={0.99} hap={false}>
                  <span className="dhikr-tick"><CheckIcon size={13} weight="bold" /></span>
                  <span className="dhikr-folded-ar clip" dir="rtl" lang="ar">{text.ar.split('\n')[0]}</span>
                  {d.count > 1 ? <span className="t-tiny muted num">×{d.count}</span> : null}
                </Tap>
              ) : (
                <>
                  <Tap className="dhikr-body" onTap={() => (complete ? setReopened(null) : count(d))} scale={0.99} hap={complete ? false : 'light'}>
                    <span className="dhikr-head">
                      <span className="dhikr-n num">{i + 1}</span>
                      {d.count > 1 ? <span className="dhikr-times num">×{d.count}</span> : null}
                    </span>
                    <Arabic text={text.ar} className={text.ar.length > 420 ? 'long' : undefined} />
                    {showTr ? <span className="dhikr-tr">{lang === 'uz' ? text.trUz : text.tr}</span> : null}
                    <Meaning text={text[lang]} />
                  </Tap>
                  {d.virtue ? (
                    <div className="dhikr-virtue">
                      <Sparkle size={14} weight="fill" />
                      <span>{d.virtue[lang]}</span>
                    </div>
                  ) : null}
                  <div className="dhikr-foot">
                    <span className="t-tiny muted grow">{d.quran ? t('adhkar.quran', { ref: d.quran }) : d.src ? sourceLabel(d.src, lang) : ''}</span>
                    {d.count >= 10 && !complete ? (
                      <Tap className="link-btn t-small" onTap={() => count(d, d.count)} hap={false}>
                        {t('adhkar.finish')}
                      </Tap>
                    ) : null}
                    <Counter n={n} of={d.count} onTap={() => (complete ? setReopened(null) : count(d))} />
                  </div>
                </>
              )}
            </Card>
          </div>
        );
      })}

      {all ? (
        <Card className="center adhkar-done">
          <Emoji e="📿" size={52} />
          <div className="t-title" style={{ marginTop: 8 }}>{t('adhkar.complete')}</div>
          <Tap className="btn soft" style={{ marginTop: 14 }} onTap={readAgain}>
            <ArrowCounterClockwise size={18} />
            {t('adhkar.again')}
          </Tap>
        </Card>
      ) : null}
      <p className="t-tiny muted adhkar-credit">{t('adhkar.credit')}</p>
    </Screen>
  );
}
