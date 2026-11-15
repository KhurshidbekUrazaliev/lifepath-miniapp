// Words for friend challenges, shared by their screens and the sheet that starts one.
import { ApiError } from '../store/server';
import { Challenge, ChallengeKind, inviteLink } from '../lib/challenges';
import { shareText } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { fmtNumber } from '../i18n/format';

export const kindName = (k: ChallengeKind): string => t(`ch.kind.${k}` as Key);

/** "120 XP", "14 prayers", "30 pages", "95 min". */
export function scoreText(kind: ChallengeKind, n: number): string {
  const shown = fmtNumber(n);
  return kind === 'prayer' || kind === 'quran' ? tn(`ch.score.${kind}`, n, { n: shown }) : t(`ch.score.${kind}` as Key, { n: shown });
}

/** What to tell the user when the server said no. */
export function challengeError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  return code === 'limit' || code === 'full' || code === 'ended' ? t(`ch.err.${code}` as Key) : t('ch.err.other');
}

/** Opens Telegram's "share to a chat" with the invite link. */
export function inviteFriends(c: Challenge, bot: string | null): void {
  shareText(t('ch.invite.text', { kind: kindName(c.kind), days: tn('ch.days', c.days) }), inviteLink(bot, c.id));
}
