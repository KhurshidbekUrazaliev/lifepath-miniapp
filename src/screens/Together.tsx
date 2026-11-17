// Together: what the person does with other people. Buddy streaks, friend challenges and group khatms
// each have a section that shows how things stand now, with their own screen one tap away.
import { useEffect } from 'react';
import { FlagCheckered, Handshake, UsersThree } from '@phosphor-icons/react';
import { useNav } from '../store/nav';
import { useServer } from '../store/server';
import { useChallenges } from '../store/challenges';
import { useBuddies, useKhatms, useTogetherStatus } from '../store/together';
import { syncActivity } from '../store/serverSync';
import { KIND_EMOJI, daysLeft, myPlace, sortChallenges } from '../lib/challenges';
import { closestPair, homeKhatm } from '../lib/together';
import { t, tn } from '../i18n';
import { Card, Header, Row, Screen, Section, Tap } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { kindName } from '../ui/challengeText';
import { BuddyCardView, KhatmCardView, useActiveToday } from '../ui/TogetherCards';

/** Rows that shimmer while a list is on its way. */
export function Loading() {
  return (
    <Card pad={false} className="list">
      {[0, 1, 2].map((i) => (
        <div className="lrow" key={i}><span className="skeleton" style={{ width: `${70 - i * 12}%` }} /></div>
      ))}
    </Card>
  );
}

export function Together() {
  const status = useTogetherStatus();
  const server = useServer((s) => s.status);
  const push = useNav((s) => s.push);
  const buddies = useBuddies((s) => s.list);
  const khatms = useKhatms((s) => s.list);
  const challenges = useChallenges((s) => s.list);
  const active = useActiveToday();

  useEffect(() => {
    if (status !== 'ok') return;
    // The person's own day and score go first, so that what comes back counts them.
    void syncActivity().finally(() => {
      void useBuddies.getState().refresh();
      void useKhatms.getState().refresh();
      if (server === 'ok') void useChallenges.getState().refresh();
    });
  }, [status, server]);

  const pair = buddies ? closestPair(buddies, active) : undefined;
  const khatm = khatms ? homeKhatm(khatms) : undefined;
  const race = challenges ? sortChallenges(challenges).find((c) => !c.ended) : undefined;
  const running = challenges?.filter((c) => !c.ended).length ?? 0;
  const place = race ? myPlace(race) : undefined;
  const toBuddies = () => push({ name: 'buddies' });
  const toChallenges = () => push({ name: 'challenges' });
  const toKhatms = () => push({ name: 'gkhatm' });

  return (
    <Screen>
      <Header title={t('tg.title')} noGear />
      {status === 'off' ? <Card className="t-small muted center">{t('tg.off')}</Card> : null}

      <Section title={t('bd.title')} action={pair ? t('common.seeAll') : undefined} onAction={toBuddies}>
        {pair ? (
          <BuddyCardView pair={pair} />
        ) : (
          <Card pad={false} className="list">
            <Row icon={<Handshake size={22} style={{ color: 'var(--orange)' }} />} title={t('bd.door.title')} sub={t('bd.door.body')} onTap={toBuddies} />
          </Card>
        )}
      </Section>

      <Section title={t('ch.title')} action={race ? t('common.seeAll') : undefined} onAction={toChallenges}>
        {race ? (
          <Tap onTap={() => push({ name: 'challenge', id: race.id })} scale={0.98}>
            <Card className="tg-card">
              <span className="ch-ic"><Emoji e={KIND_EMOJI[race.kind]} /></span>
              <div className="grow">
                <div className="t-body clip">{kindName(race.kind)}</div>
                <div className="t-small muted clip">
                  {tn('ch.left', daysLeft(race, Date.now()))}
                  {place ? ` · ${t('ch.place', { rank: place.rank, total: race.members.length })}` : ''}
                  {running > 1 ? ` · ${t('tg.ch.running', { n: running })}` : ''}
                </div>
              </div>
            </Card>
          </Tap>
        ) : (
          <Card pad={false} className="list">
            <Row icon={<FlagCheckered size={22} style={{ color: 'var(--blue)' }} />} title={t('ch.body')} sub={t('ch.card.body')} onTap={toChallenges} />
          </Card>
        )}
      </Section>

      <Section title={t('gk.title')} action={khatm || khatms?.length ? t('common.seeAll') : undefined} onAction={toKhatms}>
        {khatm ? (
          <KhatmCardView khatm={khatm} />
        ) : (
          <Card pad={false} className="list">
            <Row icon={<UsersThree size={22} style={{ color: 'var(--gold-ink)' }} />} title={t('gk.door.title')} sub={t('gk.door.body')} onTap={toKhatms} />
          </Card>
        )}
      </Section>
    </Screen>
  );
}
