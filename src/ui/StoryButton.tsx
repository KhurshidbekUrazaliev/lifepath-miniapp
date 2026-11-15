// "Share to Story": draws the picture (lib/story.ts), puts it on the bot's server, and opens Telegram's
// story editor with it. Telegram has stories on phones only, so elsewhere nothing is shown.
import { useState } from 'react';
import { CircleDashed } from '@phosphor-icons/react';
import { api, useServer } from '../store/server';
import { useStore } from '../store/store';
import { drawStory, StoryCard, StoryStat } from '../lib/story';
import { levelInfo, visibleStreak } from '../lib/gamify';
import { BADGES } from '../lib/achievements';
import type { Challenge, ChallengeMember } from '../lib/challenges';
import type { Profile } from '../lib/types';
import { canStory, haptic, shareStory, tgUser } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { fmtNumber } from '../i18n/format';
import { Tap } from './kit';

type Body = Omit<StoryCard, 'footer' | 'link'>;

const nameOf = (p: Profile): string => p.name || tgUser.firstName || t('common.guest');

function numbers(p: Profile) {
  const level = levelInfo(p.xp).level;
  const streak = visibleStreak(p.streak, p.freezes);
  const badges = BADGES.filter((b) => p.achievements[b.id]).length;
  return {
    level: { value: fmtNumber(level), label: t('story.stat.level') },
    streak: { value: fmtNumber(streak), label: tn('story.stat.streak', streak) },
    xp: { value: fmtNumber(p.xp), label: t('story.stat.xp') },
    badges: { value: fmtNumber(badges), label: tn('story.stat.badges', badges) },
    levelN: level,
    streakN: streak,
  } satisfies Record<string, StoryStat | number>;
}

/** What each kind of story shows. */
export const storyCards = {
  level: (p: Profile, level: number): Body => {
    const n = numbers(p);
    return { emoji: '⭐', title: t('story.level', { n: level }), sub: t('story.level.sub', { name: nameOf(p) }), stats: [n.streak, n.xp, n.badges] };
  },
  progress: (p: Profile): Body => {
    const n = numbers(p);
    return {
      emoji: n.streakN >= 3 ? '🔥' : '⭐',
      title: t('story.level', { n: n.levelN }),
      sub: t('story.progress.sub', { name: nameOf(p) }),
      stats: [n.streak, n.xp, n.badges],
    };
  },
  khatm: (p: Profile): Body => {
    const n = numbers(p);
    const khatms = p.khatms ?? 1;
    return {
      emoji: '📖',
      title: t('khatm.done.title'),
      sub: t('story.khatm.sub', { name: nameOf(p) }),
      stats: [{ value: fmtNumber(khatms), label: tn('story.stat.khatm', khatms) }, n.level, n.streak],
    };
  },
  challenge: (p: Profile, c: Challenge, me: ChallengeMember): Body => ({
    emoji: me.rank === 1 ? '🏆' : '🏁',
    title: `#${me.rank}`,
    sub: t(me.rank === 1 ? 'story.challenge.won' : 'story.challenge.placed', { name: nameOf(p) }),
    stats: [
      { value: fmtNumber(me.score), label: c.kind === 'xp' ? t('story.stat.xp') : t(`ch.kind.${c.kind}` as Key) },
      { value: fmtNumber(c.members.length), label: tn('story.stat.players', c.members.length) },
      { value: fmtNumber(c.days), label: tn('story.stat.days', c.days) },
    ],
  }),
};

/** Whether stories can be shared here, and a function that shares one. */
export function useStory() {
  const server = useServer((s) => s.status);
  const bot = useServer((s) => s.botUsername);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const can = canStory && server === 'ok' && !!bot;

  const share = async (make: (p: Profile) => Body) => {
    if (!can || state === 'busy') return;
    setState('busy');
    try {
      const appLink = `https://t.me/${bot}?startapp`;
      const blob = await drawStory({ ...make(useStore.getState().profile), footer: t('story.footer'), link: `t.me/${bot}` });
      const { url } = await api<{ url: string }>('POST', '/story', blob);
      if (!shareStory(url, `${t('story.caption')} ${appLink}`, { url: appLink, name: 'LifePath' })) throw new Error('not opened');
      setState('idle');
    } catch {
      haptic('error');
      setState('failed');
    }
  };
  return { can, busy: state === 'busy', failed: state === 'failed', share };
}

export function StoryButton({ make, className = 'btn soft' }: { make: (p: Profile) => Body; className?: string }) {
  const story = useStory();
  if (!story.can) return null;
  return (
    <>
      <Tap className={className} onTap={() => void story.share(make)} disabled={story.busy}>
        <CircleDashed size={18} weight="bold" /> {story.busy ? t('story.busy') : t('story.share')}
      </Tap>
      {story.failed ? <div className="t-tiny center" style={{ color: 'var(--red)' }}>{t('story.failed')}</div> : null}
    </>
  );
}
