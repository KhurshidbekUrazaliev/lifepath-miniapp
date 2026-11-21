// "Your week": the week so far in numbers, its seven days, a word from the companion about the best of
// it, and a story to share. The numbers are lib/week.ts's, which leaves the journal out altogether; the
// story is the one thing here that goes to the bot's server, and it carries only those numbers.
import { Check, Fire, LockSimple, Sparkle } from '@phosphor-icons/react';
import { useEcho } from '../store/echo';
import { useWeek, weekRange } from '../store/week';
import { PRAYERS_A_WEEK, Week, weekBest } from '../lib/week';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { t, tn } from '../i18n';
import { fmtHours, fmtNumber, weekdayMini } from '../i18n/format';
import { Card, Empty, cx, Glyph } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { StatTile, streakText } from '../ui/parts';
import { Emoji } from '../ui/Emoji';
import { StoryButton, storyCards } from '../ui/StoryButton';
import { CompanionThumb } from '../companion/CompanionThumb';

/** What the companion says: the best thing of the week by its number, or a kind word about a thin one. */
function sentence(w: Week): string {
  switch (weekBest(w)) {
    case 'prayersAll':
      return t('week.say.prayersAll');
    case 'prayers':
      return t('week.say.prayers', { n: w.prayers, due: 5 * w.soFar });
    case 'habits':
      return t('week.say.habits', { done: w.habits.done, due: w.habits.due });
    case 'quran':
      return tn('week.say.quran', w.quran);
    case 'focus':
      return t('week.say.focus', { n: w.focus });
    case 'tasks':
      return tn('week.say.tasks', w.tasks);
    case 'streak':
      return tn('week.say.streak', w.streak);
    default:
      return t('week.say.thin');
  }
}

const icon = (e: string) => (
  <span style={{ fontSize: 24 }}>
    <Emoji e={e} />
  </span>
);

export function WeekSheet({ onClose }: { onClose: () => void }) {
  const w = useWeek();
  const echo = useEcho();
  const today = dayKey();
  return (
    <Sheet title={t('week.title')} onClose={onClose}>
      <Card pad={false} className="week-days">
        <div className="week-days-head">
          <b>{weekRange(w)}</b>
          <span className={cx('pillnote', w.streak > 0 ? 'orange' : 'grey')}>
            <Fire size={12} weight="bold" />
            {streakText(w.streak)}
          </span>
        </div>
        <div className="week-strip">
          {w.days.map((x) => (
            <div key={x.day} className={cx('week-day', x.active && 'on', x.later && 'later', x.day === today && 'today')}>
              <i>{x.active ? <Check size={13} weight="bold" /> : null}</i>
              {weekdayMini(new Date(dayKeyToMs(x.day, 12)).getDay())}
            </div>
          ))}
        </div>
        <div className="week-days-foot">{t('week.active', { n: w.active })}</div>
      </Card>

      {w.empty ? (
        <Empty icon="🌱" title={t('week.empty.title')} body={t('week.empty.body')} />
      ) : (
        <>
          <div className="tiles">
            <StatTile icon={icon('🕌')} value={`${w.prayers}/${PRAYERS_A_WEEK}`} label={t('ch.kind.prayer')} />
            <StatTile icon={icon('📖')} value={fmtNumber(w.quran)} label={t('ch.kind.quran')} />
            <StatTile icon={icon('🔁')} value={w.habits.due ? `${w.habits.done}/${w.habits.due}` : '0'} label={t('habits.title')} />
            <StatTile icon={icon('✅')} value={fmtNumber(w.tasks)} label={t('stats.tasksDone')} />
            <StatTile icon={icon('⏱')} value={fmtHours(w.focus)} label={t('focus.title')} />
            <StatTile icon={icon('⚡')} value={fmtNumber(w.xp)} label={t('story.stat.xp')} />
          </div>

          <Card pad={false} className="week-say">
            {echo.echo ? (
              <div className="advisor-thumb">
                <CompanionThumb size={64} />
              </div>
            ) : (
              <Glyph className="bubble" color="var(--violet)" icon={<Sparkle size={22} weight="fill" />} />
            )}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t-tiny advisor-kind">{echo.echo ? t('lb.noticed', { name: echo.echo.name }) : t('lb.noticed.plain')}</div>
              <p>{sentence(w)}</p>
            </div>
          </Card>

          <StoryButton make={() => storyCards.week(w)} />
        </>
      )}

      <div className="week-private">
        <LockSimple size={14} weight="fill" />
        <span>{t('week.private')}</span>
      </div>
    </Sheet>
  );
}
