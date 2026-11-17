// Buddy streaks: each friend the person keeps a streak with, who has done today's part, and the ways to
// invite, nudge and leave. A friend's invite link opens this screen with the invite on top of it.
import { useEffect, useState } from 'react';
import { BellRinging, Check as CheckIcon, ShareNetwork } from '@phosphor-icons/react';
import { ApiError, useServer } from '../store/server';
import { fetchInvite, takeGrown, useBuddies, useTogetherStatus } from '../store/together';
import { syncActivity } from '../store/serverSync';
import { Buddy, BuddyInvite, sortBuddies, withMyDay } from '../lib/together';
import { haptic } from '../tg/telegram';
import { t } from '../i18n';
import { Card, Empty, Header, Screen, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { StreakFlame, useActiveToday } from '../ui/TogetherCards';
import { buddyError, daysText, nameOf, shareBuddyLink } from '../ui/togetherText';
import { confirmSheet } from '../sheets/confirm';
import { Loading } from './Together';

/** One of the two, and whether they have done today's part: a tick, or "not yet". */
function Who({ name, done }: { name: string; done: boolean }) {
  return (
    <div className={cx('bd-who', done && 'done')}>
      <span className="bd-tick">{done ? <CheckIcon size={12} weight="bold" /> : null}</span>
      <div className="grow">
        <div className="t-small clip bd-who-name">{name}</div>
        <div className="t-tiny muted clip">{done ? t('bd.doneToday') : t('bd.notYet')}</div>
      </div>
    </div>
  );
}

/**
 * One pair. `pair` is what the server last said; what the person has done today is shown at once, and
 * the nudge waits for the server to say it may go out. `grew`: the streak has grown since the last look.
 */
function PairCard({ pair, active, grew, onError }: { pair: Buddy; active: boolean; grew: boolean; onError: (text: string) => void }) {
  const nudge = useBuddies((s) => s.nudge);
  const leave = useBuddies((s) => s.leave);
  const [busy, setBusy] = useState(false);
  const b = withMyDay(pair, active);
  const name = nameOf(b.name);
  // The person has done their part and the buddy has not, and still there is no nudge to send: the bot cannot write to them.
  const mute = pair.meDone && !pair.theyDone && !pair.nudged && !pair.canNudge;

  const doNudge = async () => {
    if (busy) return;
    setBusy(true);
    onError('');
    try {
      await nudge(pair.id);
      haptic('success');
    } catch (e) {
      onError(buddyError(e, b.name));
      haptic('error');
    }
    setBusy(false);
  };

  const doLeave = () =>
    confirmSheet({ title: t('bd.leave.title', { name }), body: t('bd.leave.body'), confirm: t('bd.leave') }, () => {
      leave(pair.id).catch((e) => onError(buddyError(e, b.name)));
    });

  return (
    <Card className={cx('bd-pair', grew && 'grew')}>
      <div className="row" style={{ gap: 14 }}>
        <StreakFlame days={b.streak} large cheer={grew} />
        <div className="grow">
          <div className="t-h clip">{t('bd.pair', { name })}</div>
          <div className={cx('t-small clip-2', grew ? 'bd-grew' : 'muted')}>
            {grew ? t('bd.grew', { days: daysText(b.streak) }) : b.best > 0 ? t('bd.best', { days: daysText(b.best) }) : t('bd.first')}
          </div>
        </div>
      </div>
      <div className="bd-today">
        <Who name={t('bd.you')} done={b.meDone} />
        <Who name={name} done={b.theyDone} />
      </div>
      <div className="bd-acts">
        {pair.canNudge ? (
          <Tap className="btn soft sm" onTap={doNudge} disabled={busy} hap={false}>
            <BellRinging size={16} weight="bold" />
            {t('bd.nudge')}
          </Tap>
        ) : pair.nudged ? (
          <span className="pillnote grey">{t('bd.nudged')}</span>
        ) : (
          <span className="t-tiny muted grow">{mute ? t('bd.unreachable', { name }) : ''}</span>
        )}
        <Tap className="bd-leave" onTap={doLeave} hap={false} scale={0.94}>{t('bd.leave')}</Tap>
      </div>
    </Card>
  );
}

/** The invite a link brought: who it is from and a button to accept it, or why it cannot be accepted. */
function InviteCard({ code, onClose }: { code: string; onClose: () => void }) {
  const status = useTogetherStatus();
  const bot = useServer((s) => s.botUsername);
  const accept = useBuddies((s) => s.accept);
  const [invite, setInvite] = useState<BuddyInvite | null>(null);
  const [state, setState] = useState<'ok' | 'gone' | 'failed'>('ok');
  const [again, setAgain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status !== 'ok') return;
    let alive = true;
    setState('ok');
    fetchInvite(code).then(
      (found) => {
        if (alive) setInvite(found);
      },
      (e) => {
        if (alive) setState(e instanceof ApiError && (e.status === 404 || e.status === 400) ? 'gone' : 'failed');
      },
    );
    return () => {
      alive = false;
    };
  }, [status, code, again]);

  const doAccept = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await accept(code);
      haptic('success');
      onClose();
    } catch (e) {
      setError(buddyError(e, invite?.name));
      haptic('error');
      setBusy(false);
    }
  };

  const close = <Tap className="btn ghost" onTap={onClose}>{t('common.close')}</Tap>;
  if (state === 'gone') return <Card className="bd-invite"><div className="t-body">{t('bd.inv.gone')}</div>{close}</Card>;
  if (state === 'failed') {
    return (
      <Card className="bd-invite">
        <div className="t-body">{t('bd.inv.error')}</div>
        <Tap className="btn soft" onTap={() => setAgain((n) => n + 1)}>{t('common.retry')}</Tap>
      </Card>
    );
  }
  if (!invite) return <Loading />;

  const name = nameOf(invite.name);
  if (invite.mine) {
    return (
      <Card className="bd-invite">
        <div className="t-h">{t('bd.inv.mine.title')}</div>
        <div className="t-small muted">{t('bd.inv.mine.body')}</div>
        <Tap className="btn primary" onTap={() => shareBuddyLink(code, bot)}>
          <ShareNetwork size={18} weight="bold" />
          {t('bd.invite')}
        </Tap>
        {close}
      </Card>
    );
  }
  const refusal = invite.buddy ? t('bd.inv.buddy', { name }) : invite.limit ? t('bd.inv.limit') : invite.full ? t('bd.inv.full', { name }) : '';
  if (refusal) return <Card className="bd-invite"><div className="t-body">{refusal}</div>{close}</Card>;

  return (
    <Card className="bd-invite">
      <span className="bd-invite-ic"><Emoji e="🤝" /></span>
      <div className="t-title">{t('bd.inv.title', { name })}</div>
      <div className="t-small muted">{t('bd.inv.body')}</div>
      <div className="t-tiny faint">{t('bd.privacy')}</div>
      {error ? <div className="t-small" style={{ color: 'var(--red)' }}>{error}</div> : null}
      <Tap className="btn primary" onTap={doAccept} disabled={busy} hap={false}>{t('bd.inv.accept')}</Tap>
      <Tap className="btn ghost" onTap={onClose}>{t('bd.inv.later')}</Tap>
    </Card>
  );
}

export function Buddies({ route }: { route: { invite?: string } }) {
  const status = useTogetherStatus();
  const bot = useServer((s) => s.botUsername);
  const list = useBuddies((s) => s.list);
  const failed = useBuddies((s) => s.failed);
  const max = useBuddies((s) => s.max);
  const active = useActiveToday();
  const [asked, setAsked] = useState(!!route.invite);
  const [grown, setGrown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status !== 'ok') return;
    // The person's own day goes first, so the list that comes back counts it.
    void syncActivity().finally(() => useBuddies.getState().refresh());
  }, [status]);

  // A streak that has grown since the person last looked gets a moment of its own.
  useEffect(() => {
    if (!list) return;
    const news = takeGrown(list).map((b) => b.id);
    if (!news.length) return;
    haptic('success');
    setGrown((ids) => [...ids, ...news]);
  }, [list]);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      shareBuddyLink(await useBuddies.getState().invite(), bot);
    } catch (e) {
      setError(buddyError(e));
      haptic('error');
    }
    setBusy(false);
  };

  const pairs = list ? sortBuddies(list, active) : [];
  const inviteButton = (
    <Tap className="btn primary" onTap={share} disabled={busy}>
      <ShareNetwork size={18} weight="bold" />
      {t('bd.invite')}
    </Tap>
  );

  return (
    <Screen>
      <Header title={t('bd.title')} noGear />
      {status === 'off' ? (
        <Empty icon="🤝" title={t('bd.off.title')} body={t('bd.off.body')} />
      ) : (
        <>
          {asked && route.invite ? <InviteCard code={route.invite} onClose={() => setAsked(false)} /> : null}
          {status === 'unknown' || (list === null && !failed) ? (
            <Loading />
          ) : failed ? (
            <Card className="t-small muted center">{t('bd.error')}</Card>
          ) : pairs.length === 0 ? (
            // While an invite is being decided on, it is the only thing to do here.
            asked && route.invite ? null : <Empty icon="🤝" title={t('bd.empty.title')} body={t('bd.empty.body')}>{inviteButton}</Empty>
          ) : (
            <>
              {pairs.map((b) => (
                <PairCard key={b.id} pair={b} active={active} grew={grown.includes(b.id)} onError={setError} />
              ))}
              {pairs.length < max ? inviteButton : <div className="t-small muted center">{t('bd.max')}</div>}
            </>
          )}
          {error ? <Card className="t-small center" style={{ color: 'var(--red)' }}>{error}</Card> : null}
          <div className="t-tiny faint center bd-how">{t('bd.how')} {t('bd.privacy')}</div>
        </>
      )}
    </Screen>
  );
}
