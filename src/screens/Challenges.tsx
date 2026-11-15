// Friend challenges: the list, and one challenge with its board. Starting one is a sheet
// (sheets/challenge.tsx); an invite link opens the challenge before joining it.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus as PlusIcon, ShareNetwork } from '@phosphor-icons/react';
import { useNav } from '../store/nav';
import { useStore } from '../store/store';
import { ApiError, useServer } from '../store/server';
import { fetchChallenge, useChallenges } from '../store/challenges';
import { syncActivity } from '../store/serverSync';
import { Challenge, KIND_EMOJI, daysLeft, myPlace, sortChallenges, timeRatio, upsertChallenge } from '../lib/challenges';
import { rankMedal } from '../lib/rankings';
import { haptic } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { Bar, Card, Empty, Header, IconBtn, Screen, Section, Tap, cx } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { StoryButton, storyCards } from '../ui/StoryButton';
import { challengeError, inviteFriends, kindName, scoreText } from '../ui/challengeText';
import { confirmSheet } from '../sheets/confirm';

const statusLine = (c: Challenge, now: number): string => (c.ended ? t('ch.ended') : tn('ch.left', daysLeft(c, now)));

function Medal({ rank }: { rank: number }) {
  const medal = rankMedal(rank);
  return <span className="ch-rank num">{medal ? <Emoji e={medal} /> : rank}</span>;
}

function Loading() {
  return (
    <Card pad={false} className="list">
      {[0, 1, 2].map((i) => (
        <div className="lrow" key={i}><span className="skeleton" style={{ width: `${70 - i * 12}%` }} /></div>
      ))}
    </Card>
  );
}

function ChallengeRow({ c, now }: { c: Challenge; now: number }) {
  const push = useNav((s) => s.push);
  const me = myPlace(c);
  return (
    <Tap className="lrow" onTap={() => push({ name: 'challenge', id: c.id })} scale={0.985}>
      <span className="ch-ic"><Emoji e={KIND_EMOJI[c.kind]} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="t-body clip" style={{ display: 'block' }}>{kindName(c.kind)}</span>
        <span className="t-small muted clip" style={{ display: 'block' }}>{statusLine(c, now)} · {tn('ch.members', c.members.length)}</span>
      </span>
      {me ? <span className="ch-place num">{t('ch.place', { rank: me.rank, total: c.members.length })}</span> : null}
    </Tap>
  );
}

export function Challenges() {
  const server = useServer((s) => s.status);
  const list = useChallenges((s) => s.list);
  const failed = useChallenges((s) => s.failed);
  const refresh = useChallenges((s) => s.refresh);
  const open = useNav((s) => s.open);
  const now = Date.now();

  useEffect(() => {
    if (server !== 'ok') return;
    // Your own score is sent first, so your row is current.
    void syncActivity().finally(refresh);
  }, [server, refresh]);

  const sorted = list ? sortChallenges(list) : [];
  const running = sorted.filter((c) => !c.ended);
  const ended = sorted.filter((c) => c.ended);
  const startNew = () => open({ name: 'challengeNew' });

  return (
    <Screen>
      <Header
        title={t('ch.title')}
        noGear
        right={server === 'ok' && sorted.length ? <IconBtn onTap={startNew} label={t('ch.new')}><PlusIcon size={19} weight="bold" /></IconBtn> : undefined}
      />
      {server === 'off' ? (
        <Empty icon="🤝" title={t('ch.off.title')} body={t('ch.off.body')} />
      ) : server === 'unknown' || (list === null && !failed) ? (
        <Loading />
      ) : failed ? (
        <Card className="t-small muted center">{t('ch.error')}</Card>
      ) : sorted.length === 0 ? (
        <Empty icon="🤝" title={t('ch.empty.title')} body={t('ch.empty.body')}>
          <Tap className="btn primary" onTap={startNew}>{t('ch.new')}</Tap>
        </Empty>
      ) : (
        <>
          {running.length ? (
            <Section title={t('ch.running')}>
              <Card pad={false} className="list">{running.map((c) => <ChallengeRow key={c.id} c={c} now={now} />)}</Card>
            </Section>
          ) : null}
          {ended.length ? (
            <Section title={t('ch.recent')}>
              <Card pad={false} className="list">{ended.map((c) => <ChallengeRow key={c.id} c={c} now={now} />)}</Card>
            </Section>
          ) : null}
          <div className="t-tiny faint center">{t('ch.privacy')}</div>
        </>
      )}
    </Screen>
  );
}

export function ChallengeScreen({ route }: { route: { id: string } }) {
  const server = useServer((s) => s.status);
  const bot = useServer((s) => s.botUsername);
  const join = useChallenges((s) => s.join);
  const leave = useChallenges((s) => s.leave);
  const pop = useNav((s) => s.pop);
  const [c, setC] = useState<Challenge | null>(() => useChallenges.getState().list?.find((x) => x.id === route.id) ?? null);
  const [state, setState] = useState<'ok' | 'gone' | 'failed'>('ok');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (server !== 'ok') return;
    let alive = true;
    void syncActivity()
      .then(() => fetchChallenge(route.id))
      .then((fresh) => {
        if (!alive) return;
        setC(fresh);
        setState('ok');
        if (fresh.joined) useChallenges.setState((s) => (s.list ? { list: upsertChallenge(s.list, fresh) } : {}));
      })
      .catch((e) => {
        if (!alive) return;
        setState(e instanceof ApiError && (e.status === 404 || e.status === 400) ? 'gone' : 'failed');
      });
    return () => {
      alive = false;
    };
  }, [server, route.id]);

  const doJoin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setC(await join(route.id));
      haptic('success');
    } catch (e) {
      setError(challengeError(e));
      haptic('error');
    }
    setBusy(false);
  };

  const doLeave = () =>
    confirmSheet({ title: t('ch.leave.title'), body: t('ch.leave.body'), confirm: t('ch.leave.yes') }, () => {
      leave(route.id).then(pop, (e) => setError(challengeError(e)));
    });

  const now = Date.now();
  const me = c ? myPlace(c) : undefined;
  // Winning (against at least one friend) is a badge.
  const won = !!c?.ended && me?.rank === 1 && c.members.length >= 2;
  useEffect(() => {
    if (won) useStore.getState().unlockBadge('challenge-win');
  }, [won]);

  return (
    <Screen>
      <Header title={c ? kindName(c.kind) : t('ch.title')} noGear />
      {server === 'off' ? (
        <Empty icon="🤝" title={t('ch.off.title')} body={t('ch.off.body')} />
      ) : state === 'gone' ? (
        <Empty icon="🏁" title={t('ch.gone.title')} body={t('ch.gone.body')} />
      ) : !c ? (
        state === 'failed' ? <Card className="t-small muted center">{t('ch.error')}</Card> : <Loading />
      ) : (
        <>
          <Card className="ch-hero">
            <div className="row" style={{ gap: 14 }}>
              <span className="ch-hero-ic"><Emoji e={KIND_EMOJI[c.kind]} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t-title clip">{kindName(c.kind)}</div>
                <div className="t-small muted clip">
                  {c.isOwner ? t('ch.byYou') : t('ch.by', { name: c.owner })} · {tn('ch.days', c.days)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Bar value={c.ended ? 1 : timeRatio(c, now)} />
            </div>
            <div className="row between t-small muted" style={{ marginTop: 8 }}>
              <span>{statusLine(c, now)}</span>
              {me ? <span className="num">{t('ch.place', { rank: me.rank, total: c.members.length })}</span> : null}
            </div>
            <div className="t-small muted ch-how">{t(`ch.how.${c.kind}` as Key)}</div>
          </Card>

          {c.ended && me ? (
            <Card className="ch-result">
              <span className="ch-result-ic"><Emoji e={me.rank === 1 ? '🏆' : '🏁'} /></span>
              <div className="t-h">{me.rank === 1 ? t('ch.won') : t('ch.placed', { rank: me.rank, total: c.members.length })}</div>
              {me.rank !== 1 && c.members[0] ? <div className="t-small muted">{t('ch.winner', { name: c.members[0].name })}</div> : null}
              <StoryButton make={(p) => storyCards.challenge(p, c, me)} />
            </Card>
          ) : null}

          {!c.joined && !c.ended ? (
            <Card>
              <div className="t-body">{t('ch.join.body')}</div>
              <div className="t-small muted" style={{ margin: '6px 0 14px' }}>{t('ch.privacy')}</div>
              <Tap className="btn primary" onTap={doJoin} disabled={busy}>{t('ch.join')}</Tap>
            </Card>
          ) : null}

          {error ? <Card className="t-small center" style={{ color: 'var(--red)' }}>{error}</Card> : null}

          <Section title={t('ch.standings')}>
            <Card pad={false} className="list">
              {c.members.map((m, i) => (
                <motion.div
                  key={`${m.rank}-${m.name}`}
                  className={cx('lrow', m.isMe && 'me')}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                >
                  <Medal rank={m.rank} />
                  <span className="grow t-body clip">{m.name || '…'}{m.isMe ? ` · ${t('ch.you')}` : ''}</span>
                  <span className="t-small num" style={{ fontWeight: 700 }}>{scoreText(c.kind, m.score)}</span>
                </motion.div>
              ))}
            </Card>
            {c.joined && !c.ended && c.members.length === 1 ? <div className="t-small muted center">{t('ch.alone')}</div> : null}
          </Section>

          {c.joined && !c.ended ? (
            <Tap className="btn primary" onTap={() => inviteFriends(c, bot)}>
              <ShareNetwork size={18} weight="bold" /> {t('ch.invite')}
            </Tap>
          ) : null}
          {c.joined ? <Tap className="btn ghost danger" onTap={doLeave}>{t('ch.leave')}</Tap> : null}
        </>
      )}
    </Screen>
  );
}
