// Words for buddy streaks and group khatms, shared by their screens, sheets and cards.
import { ApiError } from '../store/server';
import { Buddy, GroupKhatm, buddyLink, freeCount, khatmLink, myUnread, pairToday } from '../lib/together';
import { shareText } from '../tg/telegram';
import { Key, t, tn } from '../i18n';

/** A first name as the server knows it, or a sign that there is none. */
export const nameOf = (name: string): string => name || '…';

export const daysText = (n: number): string => tn('common.days', n);

/** One line about who has done today's part. */
export const todayLine = (b: Buddy): string => t(`bd.today.${pairToday(b)}` as Key, { name: nameOf(b.name) });

/** What a card says under a khatm's name: the person's juz still to read, or how many nobody has taken. */
export function khatmLine(k: GroupKhatm): string {
  const mine = myUnread(k);
  if (mine.length) return t('gk.mine', { list: mine.join(', ') });
  const free = freeCount(k);
  return free ? tn('gk.free', free) : t('gk.allTaken');
}

/** What to tell the person when the server said no to something about a buddy called `name`. */
export function buddyError(e: unknown, name = ''): string {
  const code = e instanceof ApiError ? e.code : '';
  if (code === 'limit') return t('bd.inv.limit');
  if (code === 'full') return t('bd.inv.full', { name: nameOf(name) });
  if (code === 'self') return t('bd.inv.mine.title');
  if (code === 'not_found') return t('bd.inv.gone');
  if (code === 'not_done') return t('bd.err.notDone');
  if (code === 'unreachable') return t('bd.unreachable', { name: nameOf(name) });
  if (code === 'telegram') return t('bd.err.send');
  return t('ch.err.other');
}

/** The same for a group khatm. */
export function khatmError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  if (code === 'limit' || code === 'full' || code === 'taken' || code === 'complete') return t(`gk.err.${code}` as Key);
  if (code === 'not_member') return t('gk.err.member');
  if (code === 'not_found') return t('gk.gone.title');
  return t('ch.err.other');
}

/** Opens Telegram's "share to a chat" with the person's buddy invite link. */
export function shareBuddyLink(code: string, bot: string | null): void {
  shareText(t('bd.invite.text'), buddyLink(bot, code));
}

/** And with the link that opens a group khatm. */
export function inviteToKhatm(k: GroupKhatm, bot: string | null): void {
  shareText(t('gk.invite.text', { title: k.title }), khatmLink(bot, k.id));
}
