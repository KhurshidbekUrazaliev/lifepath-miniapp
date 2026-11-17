// Group khatms: the list of them, and one khatm with its board of thirty juz. A free juz is taken with
// a tap; a juz of the person's own opens a sheet to mark it read or give it back (sheets/together.tsx).
// An invite link opens the khatm before joining it.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check as CheckIcon, Plus as PlusIcon, ShareNetwork } from '@phosphor-icons/react';
import { useNav } from '../store/nav';
import { ApiError, useServer } from '../store/server';
import { celebrateKhatm, fetchKhatm, useKhatms, useTogetherStatus } from '../store/together';
import {
  GroupKhatm as Khatm, JUZ_COUNT, JUZ_XP, JUZ_XP_DAY, JuzCell, KhatmMember, board, dueIn, freeCount, juzPages, myUnread, sortKhatms,
} from '../lib/together';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { haptic } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtShortDate } from '../i18n/format';
import { Card, Empty, Header, IconBtn, Ring, Row, Screen, Section, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { KHATM_GOLD, KhatmCardView } from '../ui/TogetherCards';
import { inviteToKhatm, khatmError, nameOf } from '../ui/togetherText';
import { confirmSheet } from '../sheets/confirm';
import { Loading } from './Together';

function KhatmList() {
  const status = useTogetherStatus();
  const list = useKhatms((s) => s.list);
  const failed = useKhatms((s) => s.failed);
  const open = useNav((s) => s.open);

  useEffect(() => {
    if (status === 'ok') void useKhatms.getState().refresh();
  }, [status]);

  const sorted = list ? sortKhatms(list) : [];
  const reading = sorted.filter((k) => !k.done);
  const complete = sorted.filter((k) => k.done);
  const startNew = () => open({ name: 'gkhatmNew' });

  return (
    <Screen>
      <Header
        title={t('gk.title')}
        noGear
        right={status === 'ok' && sorted.length ? <IconBtn onTap={startNew} label={t('gk.new')}><PlusIcon size={19} weight="bold" /></IconBtn> : undefined}
      />
      {status === 'off' ? (
        <Empty icon="📖" title={t('gk.off.title')} body={t('gk.off.body')} />
      ) : status === 'unknown' || (list === null && !failed) ? (
        <Loading />
      ) : failed ? (
        <Card className="t-small muted center">{t('gk.error')}</Card>
      ) : sorted.length === 0 ? (
        <Empty icon="📖" title={t('gk.empty.title')} body={t('gk.empty.body')}>
          <Tap className="btn primary" onTap={startNew}>{t('gk.new')}</Tap>
        </Empty>
      ) : (
        <>
          {reading.length ? (
            <Section title={t('gk.reading')}>
              {reading.map((k) => <KhatmCardView key={k.id} khatm={k} />)}
            </Section>
          ) : null}
          {complete.length ? (
            <Section title={t('gk.complete')}>
              {complete.map((k) => <KhatmCardView key={k.id} khatm={k} />)}
            </Section>
          ) : null}
          <div className="t-tiny faint center">{t('gk.privacy')}</div>
        </>
      )}
    </Screen>
  );
}

/** One juz on the board: its number, whose it is, and a tick once it is read. */
function Cell({ cell, busy, onTap }: { cell: JuzCell; busy: boolean; onTap: () => void }) {
  const mine = cell.state === 'mine' || cell.state === 'mineRead';
  const read = cell.state === 'read' || cell.state === 'mineRead';
  const who = cell.state === 'free' ? '' : mine ? t('ch.you') : nameOf(cell.name);
  const label = `${t('gk.juz', { n: cell.juz })}: ${who ? `${who}, ` : ''}${t(read ? 'gk.lg.read' : cell.state === 'free' ? 'gk.lg.free' : 'gk.lg.taken')}`;
  return (
    <Tap className={cx('gk-cell', cell.state, busy && 'busy')} onTap={onTap} hap={false} scale={0.92} label={label}>
      <b className="num">{cell.juz}</b>
      <span className="gk-cell-who clip">{who}</span>
      {read ? <i className="gk-cell-tick"><CheckIcon size={9} weight="bold" /></i> : null}
    </Tap>
  );
}

function KhatmBoard({ id }: { id: string }) {
  const status = useTogetherStatus();
  const bot = useServer((s) => s.botUsername);
  const mine = useKhatms((s) => s.list?.find((x) => x.id === id));
  const pop = useNav((s) => s.pop);
  const open = useNav((s) => s.open);
  // Somebody's khatm, opened by its link and not joined: it is not on the person's list.
  const [seen, setSeen] = useState<Khatm | null>(null);
  const [state, setState] = useState<'ok' | 'gone' | 'failed'>('ok');
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState<number[]>([]);
  const [error, setError] = useState('');
  // Taps on free juz go to the server one after another, so each answer's board is newer than the last.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const k = mine ?? seen;

  const load = (alive: () => boolean = () => true) =>
    fetchKhatm(id).then(
      (fresh) => {
        if (!alive()) return;
        setState('ok');
        if (fresh.joined) {
          useKhatms.getState().keep(fresh);
        } else {
          setSeen(fresh);
          // Taken out of it since the list was read: the list is out of date.
          if (useKhatms.getState().list?.some((x) => x.id === id)) void useKhatms.getState().refresh();
        }
      },
      (e) => {
        if (!alive()) return;
        const gone = e instanceof ApiError && (e.status === 404 || e.status === 400);
        setState(gone ? 'gone' : 'failed');
        if (gone && useKhatms.getState().list?.some((x) => x.id === id)) void useKhatms.getState().refresh();
      },
    );

  useEffect(() => {
    if (status !== 'ok') return;
    let alive = true;
    void load(() => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id]);

  // Everyone sees the celebration of a complete round when they next open the khatm.
  const round = mine?.done ? mine.round : 0;
  useEffect(() => {
    const done = useKhatms.getState().list?.find((x) => x.id === id);
    if (round && done) celebrateKhatm(done);
  }, [round, id]);

  /** Something the person asked for; what the server says no to is said in words, and the board is read again. */
  const run = async (what: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await what();
      haptic('success');
    } catch (e) {
      setError(khatmError(e));
      haptic('error');
      void load();
    }
    setBusy(false);
  };

  const take = (juz: number) => {
    haptic('medium');
    setError('');
    setTaking((list) => [...list, juz]);
    queue.current = queue.current.then(() =>
      useKhatms
        .getState()
        .juz(id, juz, 'take')
        .then(
          () => undefined,
          (e) => {
            setError(khatmError(e));
            haptic('error');
            return load();
          },
        )
        .then(() => setTaking((list) => list.filter((n) => n !== juz))),
    );
  };

  const tapCell = (cell: JuzCell) => {
    if (!k?.joined || k.done) return;
    if (cell.state !== 'free') open({ name: 'juz', id, juz: cell.juz });
    else if (!taking.includes(cell.juz)) take(cell.juz);
  };

  const askRemove = (m: KhatmMember) =>
    confirmSheet({ title: t('gk.remove.title', { name: nameOf(m.name) }), body: t('gk.remove.body'), confirm: t('gk.remove.yes') }, () => {
      void run(() => useKhatms.getState().remove(id, m.key));
    });
  const askLeave = () =>
    confirmSheet({ title: t('gk.leave.title'), body: t('gk.leave.body'), confirm: t('ch.leave.yes') }, () => {
      useKhatms.getState().leave(id).then(pop, (e) => setError(khatmError(e)));
    });
  const askDelete = () =>
    confirmSheet({ title: t('gk.delete.title'), body: t('gk.delete.body'), confirm: t('common.delete') }, () => {
      useKhatms.getState().destroy(id).then(pop, (e) => setError(khatmError(e)));
    });

  if (!k || status !== 'ok') {
    return (
      <Screen>
        <Header title={t('gk.title')} noGear />
        {status === 'off' ? (
          <Empty icon="📖" title={t('gk.off.title')} body={t('gk.off.body')} />
        ) : state === 'gone' ? (
          <Empty icon="📖" title={t('gk.gone.title')} body={t('gk.gone.body')} />
        ) : state === 'failed' ? (
          <Card className="t-small muted center">{t('gk.error')}</Card>
        ) : (
          <Loading />
        )}
      </Screen>
    );
  }

  const today = dayKey();
  const left = dueIn(k, today);
  const free = freeCount(k);
  const toRead = k.joined ? myUnread(k) : [];
  const live = k.joined && !k.done;

  return (
    <Screen>
      <Header title={t('gk.title')} noGear />

      <Card className="gk-hero">
        <Ring value={k.read / JUZ_COUNT} size={96} stroke={9} color={KHATM_GOLD}>
          <div className="gk-ring-n num">{k.read}</div>
          <div className="t-tiny muted">{t('gk.of', { n: JUZ_COUNT })}</div>
        </Ring>
        <div className="grow">
          <div className="t-title clip-2">{k.title}</div>
          <div className="t-small muted">
            {k.isOwner ? t('ch.byYou') : t('ch.by', { name: nameOf(k.owner) })}
            {k.round > 1 ? ` · ${t('gk.round', { n: k.round })}` : ''}
          </div>
          {k.done || left === null ? null : left > 0 ? (
            <div className="t-small muted">{t('khatm.finishBy', { date: fmtShortDate(dayKeyToMs(k.due!, 12)) })} · {tn('ch.left', left)}</div>
          ) : (
            <div className="t-small gk-late">{t(left === 0 ? 'gk.dueToday' : 'gk.overdue')}</div>
          )}
          <div className="t-small muted">{tn('gk.members', k.members.length)}{k.done ? '' : ` · ${free ? tn('gk.free', free) : t('gk.allTaken')}`}</div>
        </div>
      </Card>

      {k.done ? (
        <Card className="gk-done">
          <motion.span
            className="gk-done-ic"
            initial={{ scale: 0.5, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
          >
            <Emoji e="🤲" />
          </motion.span>
          <div className="t-h">{t('gk.done.title')}</div>
          <div className="t-small muted">{t('gk.done.body')}</div>
          {k.isOwner ? (
            <Tap className="btn primary" onTap={() => run(() => useKhatms.getState().next(id))} disabled={busy} hap={false}>{t('gk.next')}</Tap>
          ) : k.joined ? (
            <div className="t-small muted">{t('gk.next.wait', { name: nameOf(k.owner) })}</div>
          ) : null}
        </Card>
      ) : null}

      {!k.joined ? (
        <Card>
          <div className="t-body">{t('gk.join.body')}</div>
          <div className="t-small muted" style={{ margin: '6px 0 14px' }}>{t('gk.privacy')}</div>
          <Tap className="btn primary" onTap={() => run(() => useKhatms.getState().join(id))} disabled={busy} hap={false}>{t('ch.join')}</Tap>
        </Card>
      ) : null}

      {error ? <Card className="t-small center" style={{ color: 'var(--red)' }}>{error}</Card> : null}

      <Section title={t('gk.board')}>
        <Card className="gk-board-card">
          <div className="gk-board">
            {board(k).map((cell) => (
              <Cell key={cell.juz} cell={cell} busy={taking.includes(cell.juz)} onTap={() => tapCell(cell)} />
            ))}
          </div>
          <div className="gk-legend t-tiny muted">
            <span><i className="gk-dot free" />{t('gk.lg.free')}</span>
            <span><i className="gk-dot mine" />{t('gk.lg.mine')}</span>
            <span><i className="gk-dot taken" />{t('gk.lg.taken')}</span>
            <span><i className="gk-dot read" />{t('gk.lg.read')}</span>
          </div>
          {live ? <div className="t-tiny faint gk-hint">{t('gk.board.hint')}</div> : null}
        </Card>
      </Section>

      {live && toRead.length ? (
        <Section title={t('gk.yours')}>
          <Card pad={false} className="list">
            {toRead.map((juz) => (
              <Row
                key={juz}
                icon={<span className="gk-num num">{juz}</span>}
                title={t('gk.juz', { n: juz })}
                sub={t('khatm.pages', juzPages(juz))}
                onTap={() => open({ name: 'juz', id, juz })}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t('gk.readers')}>
        <Card pad={false} className="list">
          {k.members.map((m) => {
            const body = (
              <>
                <span className="gk-face">{nameOf(m.name).trim().charAt(0).toUpperCase()}</span>
                <span className="grow">
                  <span className="t-body clip gk-block">
                    {nameOf(m.name)}
                    {m.isMe ? ` · ${t('ch.you')}` : ''}
                    {m.isOwner ? ` · ${t('gk.m.owner')}` : ''}
                  </span>
                  <span className="t-small muted clip gk-block">
                    {m.taken ? t('gk.m.counts', { read: m.read, left: m.taken - m.read }) : t('gk.m.none')}
                  </span>
                </span>
              </>
            );
            // Whoever started the khatm can take anyone but themselves out of it.
            return k.isOwner && !m.isMe ? (
              <Tap key={m.key} className="lrow" onTap={() => askRemove(m)} scale={0.985}>{body}</Tap>
            ) : (
              <div key={m.key} className={cx('lrow', m.isMe && 'me')}>{body}</div>
            );
          })}
        </Card>
        {k.isOwner && k.members.length > 1 ? <div className="t-tiny faint center">{t('gk.remove.hint')}</div> : null}
        {live && k.members.length === 1 ? <div className="t-small muted center">{t('gk.alone')}</div> : null}
      </Section>

      {live ? (
        <Tap className="btn primary" onTap={() => inviteToKhatm(k, bot)}>
          <ShareNetwork size={18} weight="bold" />
          {t('gk.invite')}
        </Tap>
      ) : null}
      {k.joined ? (
        <Tap className="btn ghost danger" onTap={k.isOwner ? askDelete : askLeave}>{t(k.isOwner ? 'gk.delete' : 'gk.leave')}</Tap>
      ) : null}
      <div className="t-tiny faint center">{t('gk.xpNote', { n: JUZ_XP, max: JUZ_XP_DAY })}</div>
    </Screen>
  );
}

export function GroupKhatm({ route }: { route: { id?: string } }) {
  return route.id ? <KhatmBoard id={route.id} /> : <KhatmList />;
}
