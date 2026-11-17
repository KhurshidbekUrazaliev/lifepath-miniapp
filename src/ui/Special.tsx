// A timely invitation on Home. Dismissal belongs only to this phone and this day.
import { useState } from 'react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { dayKey } from '../lib/dates';
import { isChecked } from '../lib/habits';
import { ramadanFasts, specialOn, whiteFasts, type SpecialKind } from '../lib/special';
import { tgUser, openLink } from '../tg/telegram';
import { HADITH_BOOK } from '../content/hadith';
import { getLang, t, type Key } from '../i18n';
import { Card, Tap } from './kit';
import { Emoji } from './Emoji';

const KEY = `lp:${tgUser.id}:special-hidden`;
const icons: Record<SpecialKind, string> = { fitr: '🌙', adha: '🕌', arafah: '⛰️', ashura: '💧', muharram9: '🌅', ramadan: '🌙', dhul: '☀️', white: '🌕', friday: '🕌' };
function hiddenDay(): string { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } }

export function Special({ day = dayKey() }: { day?: string }) {
  const settings = useStore(s => s.settings);
  const worship = useStore(s => s.worship);
  const [hidden, hide] = useState(hiddenDay);
  const special = specialOn(day, settings.hijriOffset);
  if (!special || hidden === day) return null;
  const { kind } = special;
  const done = isChecked(worship, 'fast', day);
  const count = kind === 'ramadan' ? ramadanFasts(worship, day, settings.hijriOffset) : kind === 'white' ? whiteFasts(worship, day, settings.hijriOffset) : null;
  return <Card className="special-card">
    <div className="special-heading"><span className="special-icon"><Emoji e={icons[kind]} /></span><h2>{t(`special.${kind}.title` as Key, { n: special.day })}</h2></div>
    <p>{t(`special.${kind}.body` as Key)}</p>
    {kind === 'ramadan' && special.day >= 21 ? <p>{t('special.lastTen')}</p> : null}
    {count !== null ? <p className="special-count">{t(kind === 'ramadan' ? 'special.fasted' : 'special.white.count', { n: count })}</p> : null}
    {special.source ? <Tap className="special-source" onTap={() => useNav.getState().open({ name: 'hadith', n: special.source! })}>{HADITH_BOOK[getLang()]} {special.source}</Tap> : null}
    <div className="special-actions">
      {special.fast ? <Tap className="btn soft sm" onTap={() => useStore.getState().toggleWorship('fast', day)}>{t(done ? 'special.fast.done' : 'special.fast')}</Tap> : null}
      <Tap className="btn soft sm" onTap={() => kind === 'friday' ? openLink('https://quran.com/18') : useNav.getState().push({ name: kind === 'dhul' ? 'adhkar' : 'khatm' })}>{t(kind === 'dhul' ? 'adhkar.title' : 'special.quran')}</Tap>
    </div>
    <Tap className="special-hide" onTap={() => { hide(day); try { localStorage.setItem(KEY, day); } catch { /* the open app still remembers */ } }}>{t('special.hide')}</Tap>
  </Card>;
}
