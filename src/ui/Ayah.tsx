// The ayah of the day: the card on Home, and the pieces it shares with the full sheet
// (the Arabic with end-of-ayah signs, the translation, the listen button).
import { Pause, Play, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Passage, ayahEnd, passageOfDay, passageRef, translationParts } from '../lib/ayah';
import { dayKey } from '../lib/dates';
import { Lang, getLang, t } from '../i18n';
import { toggleRecitation, useRecitation } from '../store/recitation';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { useDailyPassage } from '../store/daily';
import { Card, Tap, cx } from './kit';
import { Emoji } from './Emoji';
import { Quote, QuoteStoryButton } from './QuoteStory';

/** The ayah of the day as a story: the Arabic with its ayah marks, the translation, where it is from. */
function ayahQuote(p: Passage): Quote {
  return {
    label: t('verse.title'),
    arabic: p.ayat.map((a) => `${a.ar} ${ayahEnd(Number(a.k.split(':')[1]))}`).join(' '),
    text: translationParts(p, getLang(), true).map((x) => x.text).join(' ').replace(/[[\]]/g, ''),
    source: passageRef(p),
  };
}

/** The Arabic of a passage; the ayah being recited is highlighted. */
export function AyahArabic({ p, active = -1 }: { p: Passage; active?: number }) {
  return (
    <>
      {p.ayat.map((a, i) => (
        <span key={a.k} className={cx('ayah-part', i === active && 'on')}>
          {a.ar}
          {' '}
          <span className="ayah-end">{ayahEnd(Number(a.k.split(':')[1]))}</span>{' '}
        </span>
      ))}
    </>
  );
}

/** Square-bracketed words in a lighter colour: translators add them to make the meaning clear. */
function withNotes(text: string) {
  return text.split(/(\[[^\]]*\])/).map((part, i) => (i % 2 ? <span key={i} className="ayah-note">{part}</span> : part));
}

/** The translation; a passage of several ayat shows each one's number. */
export function AyahTranslation({ p, lang, brief, active = -1 }: { p: Passage; lang: Lang; brief?: boolean; active?: number }) {
  const parts = translationParts(p, lang, brief);
  return (
    <>
      {parts.map((part, i) => (
        <span key={part.n} className={cx('ayah-part', i === active && 'on')}>
          {parts.length > 1 ? <sup className="ayah-num">{part.n}</sup> : null}
          {withNotes(part.text)}
          {i < parts.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  );
}

/** Play, pause and resume a passage with the chosen reciter. */
export function ListenButton({ p, large }: { p: Passage; large?: boolean }) {
  const status = useRecitation((s) => (s.id === p.key ? s.status : null));
  const reciter = useStore((s) => s.settings.reciter);
  const busy = status === 'playing' || status === 'loading';
  const size = large ? 24 : 19;
  return (
    <Tap
      className={cx('listen', large && 'lg', status === 'error' && 'bad')}
      onTap={() => toggleRecitation(p.key, p.ayat.map((a) => a.k), reciter)}
      label={busy ? t('verse.pause') : t('verse.listen')}
      scale={0.9}
    >
      {status === 'loading' ? (
        <SpinnerGap size={size} weight="bold" className="spin" />
      ) : status === 'playing' ? (
        <Pause size={size} weight="fill" />
      ) : status === 'error' ? (
        <WarningCircle size={size + 1} weight="bold" />
      ) : (
        <Play size={size} weight="fill" style={{ marginLeft: 2 }} />
      )}
    </Tap>
  );
}

/** A night sky with a mosque silhouette, drawn in SVG so it follows the theme and stays sharp. */
function MosqueArt() {
  return (
    <svg className="ayah-art" viewBox="0 0 170 120" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
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

/** Home's card: today's passage in Arabic with a short translation; a tap opens all of it. */
export function AyahCard() {
  const open = useNav((s) => s.open);
  const p = useDailyPassage() ?? passageOfDay(dayKey());
  const failed = useRecitation((s) => s.id === p.key && s.status === 'error');
  const long = p.ayat.reduce((n, a) => n + a.ar.length, 0) > 190;
  return (
    <Card pad={false} className="ayah">
      <MosqueArt />
      <Tap className="ayah-main" onTap={() => open({ name: 'ayah', id: p.key })} scale={0.985}>
        <span className="ayah-kind">
          <Emoji e="📖" /> {t('verse.title')}
        </span>
        <span className={cx('ayah-ar', long && 'long')} dir="rtl" lang="ar">
          <AyahArabic p={p} />
        </span>
        <span className="ayah-tr">
          <AyahTranslation p={p} lang={getLang()} brief />
        </span>
      </Tap>
      <div className="ayah-foot">
        <span className={cx('t-tiny clip', failed ? 'ayah-error' : 'muted')}>{failed ? t('verse.audioError') : passageRef(p)}</span>
        <span className="row" style={{ gap: 8 }}>
          <QuoteStoryButton make={() => ayahQuote(p)} />
          <ListenButton p={p} />
        </span>
      </div>
    </Card>
  );
}
