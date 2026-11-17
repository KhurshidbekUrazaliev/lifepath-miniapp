// Two cards for Home: the buddy streak that needs the person most today, and the group khatm they are
// reading in. Each one reads what it shows by itself and draws nothing when there is nothing to show
// (no buddy; no khatm still being read), so Home can simply place them. The Together screen and the
// khatm list draw the same cards from lists they have already read.
import { CaretRight, Fire } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useNav } from '../store/nav';
import { useStore } from '../store/store';
import { useBuddyList, useKhatmList } from '../store/together';
import { dayKey } from '../lib/dates';
import { Buddy, GroupKhatm, JUZ_COUNT, closestPair, homeKhatm } from '../lib/together';
import { t } from '../i18n';
import { lowPerf } from '../tg/telegram';
import { Bar, Card, Tap, cx } from './kit';
import { Emoji } from './Emoji';
import { khatmLine, nameOf, todayLine } from './togetherText';

/** The gold of the Qurʼan screens (the personal khatm's ring has the same). */
export const KHATM_GOLD = '#f0b43c';

/** Has the person done something today? Their own phone knows before the server does. */
export const useActiveToday = (): boolean => useStore((s) => s.profile.streak.lastDay === dayKey());

/** A flame with the shared days in a row; grey while there is no streak. `cheer` makes it leap once. */
export function StreakFlame({ days, large, cheer }: { days: number; large?: boolean; cheer?: boolean }) {
  return (
    <motion.span
      className={cx('tg-flame', days > 0 && 'on', large && 'lg')}
      animate={cheer && !lowPerf ? { scale: [1, 1.22, 0.96, 1.1, 1], rotate: [0, -6, 5, -2, 0] } : { scale: 1, rotate: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      <Fire size={large ? 22 : 18} weight="fill" />
      <b className="num">{days}</b>
    </motion.span>
  );
}

/** One pair, today: the flame, the two names and who has done their part. Opens the buddies. */
export function BuddyCardView({ pair }: { pair: Buddy }) {
  const push = useNav((s) => s.push);
  return (
    <Tap onTap={() => push({ name: 'buddies' })} scale={0.98}>
      <Card className="tg-card">
        <StreakFlame days={pair.streak} />
        <div className="grow">
          <div className="t-body clip">{t('bd.pair', { name: nameOf(pair.name) })}</div>
          <div className="t-small muted clip-2">{todayLine(pair)}</div>
        </div>
        <CaretRight size={18} className="chev" weight="bold" />
      </Card>
    </Tap>
  );
}

/** For Home: the pair closest to breaking. Nothing unless the person has a buddy. */
export function BuddyCard() {
  const list = useBuddyList();
  const active = useActiveToday();
  const pair = list ? closestPair(list, active) : undefined;
  return pair ? <BuddyCardView pair={pair} /> : null;
}

/** One group khatm: how many of the thirty juz are read, and what waits for the person. Opens its board. */
export function KhatmCardView({ khatm }: { khatm: GroupKhatm }) {
  const push = useNav((s) => s.push);
  return (
    <Tap onTap={() => push({ name: 'gkhatm', id: khatm.id })} scale={0.98}>
      <Card className="tg-card">
        <span className="tg-book"><Emoji e="📖" /></span>
        <div className="grow">
          <div className="row between" style={{ gap: 10 }}>
            <span className="t-body clip">{khatm.title}</span>
            <span className="tg-count num">{khatm.read}<i>/{JUZ_COUNT}</i></span>
          </div>
          <div className="t-small muted clip tg-sub">{khatm.done ? t('gk.done.title') : khatmLine(khatm)}</div>
          <Bar value={khatm.read / JUZ_COUNT} color={KHATM_GOLD} height={6} />
        </div>
      </Card>
    </Tap>
  );
}

/** For Home: the khatm the person is reading in. Nothing unless one of theirs is still unfinished. */
export function GroupKhatmCard() {
  const list = useKhatmList();
  const khatm = list ? homeKhatm(list) : undefined;
  return khatm ? <KhatmCardView khatm={khatm} /> : null;
}
