// The owner's panel: who uses LifePath, what level they are, and what is opened for them, and what the
// app has reported about its own errors.
// Only the bot's owner is shown the way here, and the server refuses everyone else whatever the app says.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, BookOpenText, Bug, MagnifyingGlass, Shuffle, SpinnerGap, CalendarCheck, CaretDown, Crown, LockKeyOpen, PaperPlaneTilt, SunHorizon, UserPlus, UsersThree } from '@phosphor-icons/react';
import { api, useServer } from '../store/server';
import { AdminAccess, AdminList, AdminSort, AdminUser, MAX_SPARKS_GIFT, hasPlus, listQuery, profileLink, seenAgo, statsAfter, withAccess } from '../lib/admin';
import type { ErrorList, ErrorRow } from '../lib/errors';
import { haptic, openLink, tgUser } from '../tg/telegram';
import { getLang, t } from '../i18n';
import { BOOK_NAMES } from '../store/hadith';
import { fmtLongDate, fmtNumber, fmtRelative, fmtShortDate } from '../i18n/format';
import { dayKeyToMs } from '../lib/calendar';
import { Card, Chips, Empty, Header, IconBtn, Num, Screen, Tap, Toggle, cx, Glyph } from '../ui/kit';
import { StatTile } from '../ui/parts';

/** "Here now", "12 min ago", "3 h ago", then a day or a date. */
function seenText(seenAt: number, now: number): string {
  const seen = seenAgo(seenAt, now);
  if (seen.unit === 'never') return t('admin.seen.never');
  if (seen.unit === 'now') return t('admin.seen.now');
  if (seen.unit === 'min') return t('admin.seen.min', { n: seen.n });
  if (seen.unit === 'hour') return t('admin.seen.hour', { n: seen.n });
  return fmtRelative(seenAt, now);
}

export function Admin() {
  const server = useServer((s) => s.status);
  const admin = useServer((s) => s.admin);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<AdminSort>('seen');
  const [list, setList] = useState<AdminList | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [round, setRound] = useState(0);
  // Each load has a number, so an answer that arrives after a newer question is dropped.
  const asked = useRef(0);

  // The search waits until typing pauses.
  useEffect(() => {
    const id = setTimeout(() => setQ(typed), 300);
    return () => clearTimeout(id);
  }, [typed]);

  useEffect(() => {
    if (server !== 'ok' || !admin) return;
    const mine = ++asked.current;
    setFailed(false);
    setBusy(true);
    api<AdminList>('GET', listQuery(q, sort, 0))
      .then((next) => mine === asked.current && setList(next))
      .catch(() => mine === asked.current && setFailed(true))
      .finally(() => mine === asked.current && setBusy(false));
  }, [server, admin, q, sort, round]);

  const more = () => {
    if (!list || busy) return;
    const mine = ++asked.current;
    setBusy(true);
    api<AdminList>('GET', listQuery(q, sort, list.users.length))
      .then((next) => {
        if (mine !== asked.current) return;
        // Someone may have joined between the two pages: nobody is listed twice.
        setList((cur) => (cur ? { ...next, users: [...cur.users, ...next.users.filter((u) => !cur.users.some((c) => c.id === u.id))] } : next));
      })
      .catch(() => mine === asked.current && setNote(t('admin.error')))
      .finally(() => mine === asked.current && setBusy(false));
  };

  /** Flips a switch for someone, or gives them Sparks. It shows at once and goes back if the server refuses. */
  const setAccess = (user: AdminUser, patch: Patch) => {
    const wanted: AdminAccess = {
      id: user.id,
      levelsOpen: patch.levels ?? user.levelsOpen,
      plusGift: patch.plus ?? user.plusGift,
      sparksGift: patch.sparks ?? user.sparksGift,
      wardrobeOpen: patch.wardrobe ?? user.wardrobeOpen,
    };
    const put = (access: AdminAccess) =>
      setList((cur) => {
        if (!cur) return cur;
        const before = cur.users.find((u) => u.id === access.id);
        return { ...cur, users: withAccess(cur.users, access), stats: before ? statsAfter(cur.stats, before, access, cur.now) : cur.stats };
      });
    setNote('');
    put(wanted);
    api<AdminAccess>('PUT', '/admin/access', { id: user.id, ...patch })
      .then(put)
      .catch(() => {
        put(user);
        setNote(t('admin.failed'));
        haptic('error');
      });
  };

  if (server !== 'ok' || !admin) {
    return (
      <Screen>
        <Header title={t('admin.title')} noGear />
        <Empty icon="🛡️" title={t('admin.off.title')} body={t('admin.off.body')} />
      </Screen>
    );
  }

  const stats = list?.stats;
  const tile = (icon: ReactNode, value: number | undefined, label: string) => (
    <StatTile icon={icon} value={value === undefined ? '–' : <Num value={value} />} label={label} />
  );

  return (
    <Screen>
      <Header
        title={t('admin.title')}
        noGear
        right={
          <IconBtn onTap={() => setRound((n) => n + 1)} label={t('admin.refresh')}>
            <ArrowsClockwise size={19} className={cx(busy && 'spin')} />
          </IconBtn>
        }
      />

      <div className="admin-stats">
        {tile(<UsersThree size={22} style={{ color: 'var(--blue-hi)' }} />, stats?.users, t('admin.stat.users'))}
        {tile(<SunHorizon size={22} style={{ color: 'var(--gold-ink)' }} />, stats?.today, t('admin.stat.today'))}
        {tile(<CalendarCheck size={22} style={{ color: 'var(--green)' }} />, stats?.week, t('admin.stat.week'))}
        {tile(<UserPlus size={22} style={{ color: 'var(--cyan)' }} />, stats?.fresh, t('admin.stat.fresh'))}
        {tile(<Crown size={22} style={{ color: 'var(--violet)' }} />, stats?.plus, t('admin.stat.plus'))}
        {tile(<LockKeyOpen size={22} style={{ color: 'var(--orange)' }} />, stats?.levelsOpen, t('admin.stat.open'))}
      </div>

      <Errors round={round} />
      <HadithReview round={round} />

      <input
        className="input"
        value={typed}
        maxLength={64}
        placeholder={t('admin.search')}
        onChange={(ev) => setTyped(ev.target.value)}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Chips<AdminSort>
        value={sort}
        onChange={setSort}
        options={[
          { id: 'seen', label: t('admin.sort.seen') },
          { id: 'level', label: t('admin.sort.level') },
          { id: 'new', label: t('admin.sort.new') },
        ]}
      />

      {failed ? (
        <Card className="t-small muted center">{t('admin.error')}</Card>
      ) : !list ? (
        <Card pad={false} className="list">
          {[0, 1, 2, 3].map((i) => (
            <div className="lrow" key={i}><span className="skeleton" style={{ width: `${72 - i * 9}%` }} /></div>
          ))}
        </Card>
      ) : list.users.length === 0 ? (
        <Card className="t-small muted center">{t('admin.none')}</Card>
      ) : (
        <>
          <Card pad={false} className="list">
            {list.users.map((u) => (
              <Person key={u.id} user={u} now={list.now} open={openId === u.id} onOpen={() => setOpenId(openId === u.id ? null : u.id)} onAccess={setAccess} />
            ))}
          </Card>
          <div className="t-tiny faint center">{t('admin.count', { n: list.users.length, total: list.total })}</div>
          {list.more ? (
            <Tap className="btn soft" onTap={more} disabled={busy}>{t('admin.more')}</Tap>
          ) : null}
        </>
      )}
      {note ? <div className="t-small center" style={{ color: 'var(--orange)' }}>{note}</div> : null}
    </Screen>
  );
}

/** What can be changed for one person: the two switches, and how many Sparks they were given in all. */
interface Patch {
  levels?: boolean;
  plus?: boolean;
  sparks?: number;
  wardrobe?: boolean;
}

interface PersonProps {
  user: AdminUser;
  now: number;
  open: boolean;
  onOpen: () => void;
  onAccess: (user: AdminUser, patch: Patch) => void;
}

function Person({ user: u, now, open, onOpen, onAccess }: PersonProps) {
  const name = u.firstName.trim() || (u.username ? `@${u.username}` : String(u.id));
  const link = profileLink(u);
  const lastDid = u.lastActiveDay ? fmtShortDate(dayKeyToMs(u.lastActiveDay)) : '–';
  return (
    <div className="admin-user">
      <Tap className="lrow" onTap={onOpen} scale={0.985} hap="select">
        <span className="admin-face" style={{ background: `hsl(${(u.id * 137) % 360} 52% 46%)` }}>{name.replace(/^@/, '').charAt(0).toUpperCase()}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body clip" style={{ display: 'block' }}>
            {name}
            {u.id === tgUser.id ? <span className="muted"> · {t('board.you')}</span> : null}
          </span>
          <span className="t-tiny muted clip" style={{ display: 'block' }}>
            {u.username ? `@${u.username}` : `ID ${u.id}`} · {seenText(u.seenAt, now)}
          </span>
        </span>
        {u.levelsOpen || hasPlus(u, now) ? (
          <span className="admin-marks">
            {hasPlus(u, now) ? <Crown size={15} weight="fill" style={{ color: 'var(--violet)' }} /> : null}
            {u.levelsOpen ? <LockKeyOpen size={15} weight="fill" style={{ color: 'var(--orange)' }} /> : null}
          </span>
        ) : null}
        <span className="admin-meta">
          <span className="t-small num" style={{ fontWeight: 700 }}>{u.level ? t('common.lv', { n: u.level }) : '–'}</span>
          <span className="t-tiny muted num">{fmtNumber(u.xp)} XP</span>
        </span>
      </Tap>

      {open ? (
        <div className="admin-detail">
          <dl className="admin-facts">
            <dt>ID</dt>
            <dd className="num">{u.id}</dd>
            <dt>{t('admin.joined')}</dt>
            <dd>{fmtLongDate(u.createdAt)}</dd>
            <dt>{t('admin.lastDid')}</dt>
            <dd>{lastDid}</dd>
            <dt>{t('admin.proven')}</dt>
            <dd className="num">{fmtNumber(u.provenXp)}</dd>
            <dt>{t('admin.week')}</dt>
            <dd className="num">{fmtNumber(u.weekXp)}</dd>
            <dt>{t('admin.streak')}</dt>
            <dd className="num">{fmtNumber(u.streak)}</dd>
            <dt>{t('admin.place')}</dt>
            <dd>{u.lang.toUpperCase()} · {u.tz}</dd>
            <dt>{t('admin.reminders')}</dt>
            <dd>{u.reminders ? t('admin.yes') : t('admin.no')}</dd>
            <dt>{t('admin.bot')}</dt>
            <dd>{u.blocked ? t('admin.bot.blocked') : u.canMessage ? t('admin.bot.ok') : t('admin.bot.no')}</dd>
          </dl>

          <div className="admin-switch">
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{t('admin.levels')}</span>
              <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>{t('admin.levels.sub')}</span>
            </span>
            <Toggle on={u.levelsOpen} onChange={(levels) => onAccess(u, { levels })} label={t('admin.levels')} />
          </div>
          <div className="admin-switch">
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{t('admin.plus')}</span>
              <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>
                {u.paidUntil ? t('admin.plus.paid', { date: fmtLongDate(u.paidUntil) }) : t('admin.plus.sub')}
              </span>
            </span>
            <Toggle on={u.plusGift} onChange={(plus) => onAccess(u, { plus })} label={t('admin.plus')} />
          </div>
          <div className="admin-switch">
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{t('admin.wardrobe')}</span>
              <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>{t('admin.wardrobe.sub')}</span>
            </span>
            <Toggle on={u.wardrobeOpen} onChange={(wardrobe) => onAccess(u, { wardrobe })} label={t('admin.wardrobe')} />
          </div>

          <div>
            <span className="t-body" style={{ display: 'block' }}>{t('admin.sparks')}</span>
            <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>{t('admin.sparks.sub', { n: fmtNumber(u.sparksGift) })}</span>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {[100, 500].map((n) => (
                <Tap key={n} className="btn soft sm grow" onTap={() => onAccess(u, { sparks: Math.min(MAX_SPARKS_GIFT, u.sparksGift + n) })} disabled={u.sparksGift >= MAX_SPARKS_GIFT}>
                  +{n}
                </Tap>
              ))}
              <Tap className="btn ghost sm grow" onTap={() => onAccess(u, { sparks: 0 })} disabled={!u.sparksGift}>{t('admin.sparks.clear')}</Tap>
            </div>
          </div>

          {link ? (
            <Tap className="btn soft sm" onTap={() => openLink(link)}>
              <PaperPlaneTilt size={16} /> {t('admin.telegram')}
            </Tap>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Just now", "12 min ago", "3 h ago", then a day or a date. */
function agoText(at: number, now: number): string {
  const ago = seenAgo(at, now);
  if (ago.unit === 'now' || ago.unit === 'never') return t('admin.errors.now');
  if (ago.unit === 'min') return t('admin.seen.min', { n: ago.n });
  if (ago.unit === 'hour') return t('admin.seen.hour', { n: ago.n });
  return fmtRelative(at, now);
}

/**
 * What the app reported about its own errors (store/report.ts): the newest build first, and for each
 * error how often it happened, when last, on which screen and on what. A tap shows where in the code.
 */
function Errors({ round }: { round: number }) {
  const [list, setList] = useState<ErrorList | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api<ErrorList>('GET', '/admin/errors')
      .then((next) => alive && setList(next))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [round]);

  // How many different errors there are; each row says how many times it happened.
  const count = list ? list.builds.reduce((n, b) => n + b.errors.length, 0) : 0;
  const head = (
    <>
      <Glyph className="lrow-ic" icon={<Bug size={21} style={{ color: count ? 'var(--red)' : 'var(--green)' }} />} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="t-body" style={{ display: 'block' }}>{t('admin.errors')}</span>
        <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>
          {failed ? t('admin.error') : list && count === 0 ? t('admin.errors.none') : t('admin.errors.sub')}
        </span>
      </span>
      {list ? <span className={cx('admin-errors-count num', count > 0 && 'some')}>{fmtNumber(count)}</span> : null}
      {count > 0 ? <CaretDown size={18} weight="bold" className={cx('chev admin-errors-caret', open && 'up')} /> : null}
    </>
  );

  return (
    <Card pad={false} className="list">
      {count > 0 ? (
        <Tap className="admin-errors-head" onTap={() => setOpen(!open)} scale={0.985} hap="select">{head}</Tap>
      ) : (
        <div className="admin-errors-head">{head}</div>
      )}
      {open && list
        ? list.builds.map((b) => (
            <div key={b.build}>
              <div className="admin-build">
                <span className="t-small num clip" style={{ fontWeight: 700 }}>{t('about.build', { id: b.build })}</span>
                <span className="t-tiny muted num">×{fmtNumber(b.count)}</span>
              </div>
              {b.errors.map((e) => (
                <Problem key={e.key} error={e} now={list.now} open={shown === e.key} onOpen={() => setShown(shown === e.key ? null : e.key)} />
              ))}
            </div>
          ))
        : null}
    </Card>
  );
}

function Problem({ error: e, now, open, onOpen }: { error: ErrorRow; now: number; open: boolean; onOpen: () => void }) {
  // Where the latest one happened: "render · tasks · ios 8.0 · ru".
  const where = [e.kind, e.screen, [e.platform, e.tg].filter(Boolean).join(' '), e.lang].filter(Boolean).join(' · ');
  return (
    <div className={cx('admin-error', open && 'open')}>
      <Tap className="lrow" onTap={onOpen} scale={0.985} hap="select">
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="admin-error-text">{e.message}</span>
          <span className="admin-error-where t-tiny muted">{agoText(e.lastAt, now)} · {where}</span>
        </span>
        <span className="admin-error-times num">×{fmtNumber(e.count)}</span>
      </Tap>
      {open ? (
        <div className="admin-detail">
          <div className="t-tiny muted">{t('admin.errors.first', { date: fmtLongDate(e.firstAt) })}</div>
          {e.stack ? <pre className="admin-stack">{e.stack}</pre> : <div className="t-small muted">{t('admin.errors.nostack')}</div>}
        </div>
      ) : null}
    </div>
  );
}

// ---------- checking the Uzbek of the Hadis button ----------

interface PendingHadith {
  id: string;
  book: string;
  n: number;
  ref?: [number, number];
  en: string;
  ru: string;
  uz: string;
  ruAi?: boolean;
}

interface HadithQueue {
  list: PendingHadith[];
  waiting: number;
  approved: number;
  kept: number;
  /** The date a choice made now is for (today until 12:00 in Busan, then tomorrow) and its hadith. */
  daily: { day: string; id: string | null };
}

const hadithSource = (h: PendingHadith): string =>
  h.book === 'muslim' && h.ref ? `https://sunnah.com/muslim/${h.ref[0] || 'introduction'}/${h.ref[1]}` : `https://sunnah.com/${h.book}:${h.n}`;

/**
 * The hadith the server found for the Hadis button, with the AI's Uzbek. Uzbek users see one only
 * after it is approved here (corrected if need be); one that should not be shown in Uzbek is set aside.
 */
function HadithReview({ round }: { round: number }) {
  const [queue, setQueue] = useState<HadithQueue | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api<HadithQueue>('GET', '/admin/hadith')
      .then((next) => alive && setQueue(next))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [round, again]);

  const decide = (h: PendingHadith, ok: boolean, uz: string, daily = false) => {
    setBusy(h.id);
    api<{ daily?: { day: string; id: string } }>('PUT', '/admin/hadith', { id: h.id, ok, uz, daily })
      .then((r) => {
        haptic(ok ? 'success' : 'light');
        setQueue(
          (q) =>
            q && {
              ...q,
              list: q.list.filter((x) => x.id !== h.id),
              waiting: q.waiting - 1,
              approved: q.approved + (ok ? 1 : 0),
              daily: r.daily ?? q.daily,
            },
        );
        // The last one on screen: bring the next ones.
        if (queue && queue.list.length <= 1) setAgain((n) => n + 1);
      })
      .catch(() => haptic('error'))
      .finally(() => setBusy(null));
  };

  const waiting = queue?.waiting ?? 0;
  const head = (
    <>
      <Glyph className="lrow-ic" icon={<BookOpenText size={21} style={{ color: waiting ? 'var(--gold-ink)' : 'var(--green)' }} />} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="t-body" style={{ display: 'block' }}>{t('admin.hadith')}</span>
        <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>
          {failed ? t('admin.error') : queue ? t('admin.hadith.sub', { n: queue.waiting, ok: queue.approved }) : t('admin.hadith.hint')}
        </span>
      </span>
      {queue ? <span className={cx('admin-errors-count num', waiting > 0 && 'some')}>{fmtNumber(waiting)}</span> : null}
      <CaretDown size={18} weight="bold" className={cx('chev admin-errors-caret', open && 'up')} />
    </>
  );

  // A chosen one is translated and put first in the list to check.
  const picked = (h: PendingHadith) =>
    setQueue((q) => q && { ...q, list: [h, ...q.list.filter((x) => x.id !== h.id)], waiting: q.waiting + 1 });

  return (
    <Card pad={false} className="list">
      <Tap className="admin-errors-head" onTap={() => setOpen(!open)} scale={0.985} hap="select">{head}</Tap>
      {open && queue ? (
        <div className="admin-detail t-small" style={{ color: queue.daily.id ? 'var(--green)' : 'var(--gold-ink)' }}>
          {queue.daily.id
            ? t('admin.hadith.daily.set', { date: fmtLongDate(dayKeyToMs(queue.daily.day)), id: queue.daily.id })
            : t('admin.hadith.daily.none', { date: fmtLongDate(dayKeyToMs(queue.daily.day)) })}
        </div>
      ) : null}
      {open ? <HadithShuffle onPicked={picked} /> : null}
      {open && queue
        ? queue.list.map((h) => <HadithItem key={h.id} hadith={h} busy={busy === h.id} onDecide={decide} />)
        : null}
    </Card>
  );
}

interface ShuffleCandidate {
  id: string;
  book: string;
  n: number;
  ref?: [number, number];
  en: string;
  ru: string | null;
}

/** Shows random hadith from the six books, one at a time, to choose from; the chosen one is translated. */
function HadithShuffle({ onPicked }: { onPicked: (h: PendingHadith) => void }) {
  const [cand, setCand] = useState<ShuffleCandidate | null>(null);
  const [state, setState] = useState<'idle' | 'shuffling' | 'picking' | 'finding' | 'none' | 'failed'>('idle');
  const [book, setBook] = useState<keyof typeof BOOK_NAMES>('bukhari');
  const [num, setNum] = useState('');
  // A hadith found by number that cannot be chosen: its text, and why not.
  const [found, setFound] = useState<{ id: string; text: string; why: 'sahih' | 'fit' } | null>(null);
  const [missing, setMissing] = useState(false);

  const find = () => {
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1) return;
    setState('finding');
    setFound(null);
    setMissing(false);
    api<{ found: boolean; id?: string; text?: string; sahih?: boolean; candidate?: ShuffleCandidate }>('POST', '/admin/hadith/find', { book, n })
      .then((r) => {
        setState('idle');
        if (!r.found) return setMissing(true);
        if (r.candidate) return setCand(r.candidate);
        setCand(null);
        setFound({ id: r.id!, text: r.text!, why: r.sahih ? 'fit' : 'sahih' });
      })
      .catch(() => setState('failed'));
  };

  const shuffle = () => {
    setState('shuffling');
    api<{ candidate: ShuffleCandidate | null }>('POST', '/admin/hadith/shuffle', {})
      .then((r) => {
        setCand(r.candidate);
        setFound(null);
        setMissing(false);
        setState(r.candidate ? 'idle' : 'none');
        haptic('select');
      })
      .catch(() => setState('failed'));
  };

  const pick = () => {
    if (!cand) return;
    setState('picking');
    api<{ hadith: PendingHadith | null }>('POST', '/admin/hadith/pick', { id: cand.id })
      .then((r) => {
        if (!r.hadith) return setState('failed');
        haptic('success');
        onPicked(r.hadith);
        setCand(null);
        setState('idle');
      })
      .catch(() => setState('failed'));
  };

  const busy = state === 'shuffling' || state === 'picking' || state === 'finding';
  const lang = getLang();
  return (
    <div className="admin-detail" style={{ display: 'grid', gap: 8 }}>
      {/* Search by book and number. */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(BOOK_NAMES) as (keyof typeof BOOK_NAMES)[]).map((b) => (
          <Tap key={b} className={cx('btn sm', b === book ? 'primary' : 'soft')} style={{ width: 'auto', flex: 'none', padding: '0 12px' }} onTap={() => setBook(b)}>
            {BOOK_NAMES[b][lang]}
          </Tap>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          inputMode="numeric"
          value={num}
          maxLength={5}
          placeholder={t('admin.hadith.find.ph')}
          onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && find()}
          enterKeyHint="search"
          style={{ flex: 1 }}
        />
        <Tap className="btn soft sm" style={{ width: 'auto', flex: 'none', padding: '0 16px' }} disabled={busy || !num} onTap={find} label={t('admin.hadith.find')}>
          {state === 'finding' ? <SpinnerGap size={16} className="spin" /> : <MagnifyingGlass size={16} />}
        </Tap>
      </div>
      {book === 'muslim' ? <div className="t-tiny faint">{t('admin.hadith.find.muslim')}</div> : null}
      {missing ? <div className="t-small" style={{ color: 'var(--orange)' }}>{t('admin.hadith.find.missing')}</div> : null}
      {found ? (
        <>
          <div className="t-tiny muted">{found.id}</div>
          <div className="t-small">{found.text}</div>
          <div className="t-small" style={{ color: 'var(--orange)' }}>{t(found.why === 'sahih' ? 'admin.hadith.find.notSahih' : 'admin.hadith.find.notFit')}</div>
        </>
      ) : null}
      {cand ? (
        <>
          <Tap className="t-tiny muted" style={{ textAlign: 'left', textDecoration: 'underline' }} onTap={() => openLink(hadithSource(cand as PendingHadith))}>
            {cand.id} · sunnah.com
          </Tap>
          <div className="t-small">{cand.en}</div>
          {cand.ru ? <div className="t-small muted">{cand.ru}</div> : null}
        </>
      ) : found || missing ? null : (
        <div className="t-small muted">{t('admin.hadith.shuffle.hint')}</div>
      )}
      {state === 'none' || state === 'failed' ? (
        <div className="t-small" style={{ color: 'var(--orange)' }}>{t(state === 'none' ? 'admin.hadith.shuffle.none' : 'admin.error')}</div>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <Tap className="btn soft sm" style={{ flex: 1 }} disabled={busy} onTap={shuffle}>
          {state === 'shuffling' ? <SpinnerGap size={16} className="spin" /> : <Shuffle size={16} />}
          {t(cand ? 'admin.hadith.shuffle.again' : 'admin.hadith.shuffle')}
        </Tap>
        {cand ? (
          <Tap className="btn primary sm" style={{ flex: 1 }} disabled={busy} onTap={pick}>
            {state === 'picking' ? <SpinnerGap size={16} className="spin" /> : null}
            {t(state === 'picking' ? 'admin.hadith.picking' : 'admin.hadith.pick')}
          </Tap>
        ) : null}
      </div>
    </div>
  );
}

function HadithItem({ hadith: h, busy, onDecide }: { hadith: PendingHadith; busy: boolean; onDecide: (h: PendingHadith, ok: boolean, uz: string, daily?: boolean) => void }) {
  const [uz, setUz] = useState(h.uz);
  return (
    <div className="admin-detail" style={{ display: 'grid', gap: 8 }}>
      <Tap className="t-tiny muted" style={{ textAlign: 'left', textDecoration: 'underline' }} onTap={() => openLink(hadithSource(h))}>
        {h.id} · sunnah.com
      </Tap>
      <div className="t-small">{h.en}</div>
      <div className="t-small muted">{h.ru}{h.ruAi ? ` (${t('advice.ai')})` : ''}</div>
      <textarea className="input" rows={4} value={uz} onChange={(e) => setUz(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.45, paddingTop: 10 }} />
      <div className="row" style={{ gap: 8 }}>
        <Tap className="btn soft sm" style={{ flex: 1 }} disabled={busy} onTap={() => onDecide(h, false, uz)}>{t('admin.hadith.skip')}</Tap>
        <Tap className="btn primary sm" style={{ flex: 1 }} disabled={busy || uz.trim().length < 10} onTap={() => onDecide(h, true, uz)}>{t('admin.hadith.ok')}</Tap>
      </div>
      <Tap className="btn soft sm" disabled={busy || uz.trim().length < 10} onTap={() => onDecide(h, true, uz, true)}>{t('admin.hadith.daily')}</Tap>
    </div>
  );
}
