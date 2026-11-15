// Rankings (boards kept by the bot's server) and LifePath Plus (bought with Telegram Stars).
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDots, Crown, FlagCheckered, Heart, Infinity as InfinityIcon, MagicWand, UserGear } from '@phosphor-icons/react';
import { useNav } from '../store/nav';
import { Board, api, useServer } from '../store/server';
import { useStore } from '../store/store';
import { FREE_FOLDER_LIMIT } from '../lib/plus';
import { daysLeftInWeek, flag, rankMedal } from '../lib/rankings';
import { provenXp } from '../lib/stats';
import { haptic, openInvoice } from '../tg/telegram';
import { t, tn } from '../i18n';
import { fmtLongDate, fmtNumber } from '../i18n/format';
import { Card, Chips, Empty, Header, IconBtn, Row, Screen, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';

type Period = 'week' | 'all';
type Scope = 'global' | 'country';

export function Rankings() {
  const server = useServer((s) => s.status);
  const rank = useServer((s) => s.rank);
  const entries = useStore((s) => s.entries);
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<Scope>('global');
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (server !== 'ok') return;
    let alive = true;
    setBoard(null);
    setFailed(false);
    api<Board>('GET', `/rankings?scope=${scope}&period=${period}`)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [server, scope, period, rank.optedIn, rank.country]);

  const mine = provenXp(entries);

  return (
    <Screen>
      <Header
        title={t('board.title')}
        right={
          <IconBtn onTap={() => open({ name: 'rank' })} label={t('board.profile')}>
            <UserGear size={19} />
          </IconBtn>
        }
      />

      {server !== 'ok' ? (
        <Empty icon="🏆" title={t('board.off.title')} body={t('board.off.body')} />
      ) : (
        <>
          <Card pad={false} className="list">
            <Row
              icon={<FlagCheckered size={21} style={{ color: 'var(--blue)' }} />}
              title={t('ch.title')}
              sub={t('ch.card.body')}
              onTap={() => push({ name: 'challenges' })}
            />
          </Card>
          <Chips<Period> value={period} onChange={setPeriod} options={[{ id: 'week', label: t('board.week') }, { id: 'all', label: t('board.all') }]} />
          <Chips<Scope> value={scope} onChange={setScope} options={[{ id: 'global', label: `🌍 ${t('board.global')}` }, { id: 'country', label: `${flag(rank.country)} ${t('board.country')}` }]} />

          {!rank.optedIn ? (
            <Card>
              <div className="t-body">{t('board.join.title')}</div>
              <div className="t-small muted" style={{ margin: '6px 0 14px', lineHeight: 1.5 }}>{t('board.join.body')}</div>
              <Tap className="btn primary" onTap={() => open({ name: 'rank' })}>{t('board.join.cta')}</Tap>
            </Card>
          ) : (
            <Card className="row" style={{ gap: 14 }}>
              <span className="bubble" style={{ background: 'var(--accent-soft)' }}><Emoji e="🏅" /></span>
              <div className="grow">
                <div className="t-body">{board?.me ? `#${board.me.rank}` : '–'} · {t('board.rank')}</div>
                <div className="t-small muted">
                  {period === 'week' ? tn('board.ends', daysLeftInWeek()) : t('board.proven')}
                </div>
              </div>
              <span className="t-body num">{fmtNumber(board?.me?.xp ?? (period === 'all' ? mine : 0))} XP</span>
            </Card>
          )}

          {scope === 'country' && !rank.country ? (
            <Card className="t-small muted center">{t('board.country.need')}</Card>
          ) : failed ? (
            <Card className="t-small muted center">{t('board.error')}</Card>
          ) : !board ? (
            <Card pad={false} className="list">
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="lrow" key={i}><span className="skeleton" style={{ width: `${70 - i * 8}%` }} /></div>
              ))}
            </Card>
          ) : board.rows.length === 0 ? (
            <Card className="t-small muted center">{t('board.empty')}</Card>
          ) : (
            <Card pad={false} className="list">
              {board.rows.map((r, i) => (
                <motion.div
                  key={`${r.rank}-${r.name}`}
                  className={cx('lrow', r.isMe && 'me')}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                >
                  <span className="t-body num" style={{ width: 30, textAlign: 'center' }}>{rankMedal(r.rank) || r.rank}</span>
                  <span className="grow">
                    <span className="t-body clip" style={{ display: 'block' }}>{r.name}{r.isMe ? ` · ${t('board.you')}` : ''}</span>
                    <span className="t-tiny muted">{flag(r.country)} {t('common.lv', { n: r.level })}</span>
                  </span>
                  <span className="t-small num" style={{ fontWeight: 700 }}>{fmtNumber(r.xp)} XP</span>
                </motion.div>
              ))}
            </Card>
          )}
          <div className="t-tiny faint center">{t('board.proven')}</div>
        </>
      )}
    </Screen>
  );
}

export function Plus() {
  const server = useServer((s) => s.status);
  const plus = useServer((s) => s.plus);
  const refreshPlus = useServer((s) => s.refreshPlus);
  const [state, setState] = useState<'idle' | 'waiting' | 'thanks' | 'failed' | 'cancelled'>('idle');

  const buy = async () => {
    setState('waiting');
    try {
      const { url } = await api<{ url: string }>('POST', '/plus/invoice');
      const status = await openInvoice(url);
      if (status !== 'paid') {
        setState(status === 'cancelled' ? 'cancelled' : 'failed');
        return;
      }
      // Telegram tells the bot about the payment a moment later; ask until Plus shows up.
      for (let i = 0; i < 8; i++) {
        const now = await refreshPlus();
        if (now?.active) break;
        await new Promise((r) => setTimeout(r, 1200));
      }
      haptic('success');
      setState('thanks');
    } catch {
      setState('failed');
    }
  };

  const benefits = [
    { icon: <InfinityIcon size={22} />, color: '#3d7bff', title: t('plus.b1'), body: t('plus.b1.body', { n: FREE_FOLDER_LIMIT }) },
    { icon: <MagicWand size={22} />, color: '#9b8cff', title: t('plus.b2'), body: t('plus.b2.body') },
    { icon: <Heart size={22} />, color: '#ff6fa8', title: t('plus.b3'), body: t('plus.b3.body') },
  ];

  return (
    <Screen>
      <Header title={t('plus.title')} />
      <div className="plus-hero">
        <motion.span className="plus-crown" initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
          <Crown size={40} />
        </motion.span>
        <div className="t-display" style={{ fontSize: 28, marginTop: 14 }}>
          LifePath <span className="grad-text">Plus</span>
        </div>
        <div className="t-body muted" style={{ marginTop: 6, fontWeight: 500 }}>{t('plus.tagline')}</div>
      </div>

      <Card pad={false} className="list">
        {benefits.map((b) => (
          <div className="lrow" key={b.title} style={{ paddingTop: 14, paddingBottom: 14 }}>
            <span className="bubble" style={{ color: b.color, background: `${b.color}24`, borderColor: `${b.color}3a` }}>{typeof b.icon === 'string' ? <Emoji e={b.icon} /> : b.icon}</span>
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{b.title}</span>
              <span className="t-small muted" style={{ display: 'block' }}>{b.body}</span>
            </span>
          </div>
        ))}
      </Card>

      {plus.active ? (
        <Card className="row" style={{ gap: 14 }}>
          <span className="bubble" style={{ background: 'var(--accent-soft)' }}><Emoji e="✅" /></span>
          <div className="grow">
            <div className="t-body">{state === 'thanks' ? t('plus.thanks') : t('plus.active')}</div>
            {plus.expiresAt ? (
              <div className="t-small muted row" style={{ gap: 6 }}>
                <CalendarDots size={14} />
                {t('plus.until', { date: fmtLongDate(plus.expiresAt) })}
              </div>
            ) : null}
          </div>
        </Card>
      ) : server !== 'ok' ? (
        <Card className="t-small muted center">{t('plus.off')}</Card>
      ) : (
        <>
          <Tap className="btn primary" onTap={buy} disabled={state === 'waiting'} hap="medium">
            <Emoji e="⭐" /> {state === 'waiting' ? t('plus.waiting') : t('plus.cta', { n: plus.priceStars })}
          </Tap>
          {state === 'failed' || state === 'cancelled' ? (
            <div className="t-small center" style={{ color: 'var(--orange)' }}>{t(state === 'failed' ? 'plus.failed' : 'plus.cancelled')}</div>
          ) : null}
        </>
      )}
      <div className="t-tiny faint center" style={{ lineHeight: 1.5 }}>{t('plus.terms')}</div>
    </Screen>
  );
}
