// "How to earn": what gives XP, what gives Sparks and what moves the weekly rating, with the real numbers
// from the rules (lib/gamify, lib/evidence, lib/habits, lib/prayer, lib/focus, lib/khatm, lib/journal).
// It opens from the profile's tiles and level bar, the wardrobe and the rankings, at the part asked for.
import { ReactNode, useEffect, useRef } from 'react';
import { useNav } from '../store/nav';
import { useServer } from '../store/server';
import { XP } from '../lib/gamify';
import { EVIDENCE_WINDOW_DAYS, MIN_SUMMARY_CHARS } from '../lib/evidence';
import { HABIT_XP, TODO_XP } from '../lib/habits';
import { WORSHIP_XP } from '../lib/prayer';
import { FOCUS_XP_DAILY_MINUTES, FOCUS_XP_EVERY } from '../lib/focus';
import { PAGE_XP_CAP } from '../lib/khatm';
import { JOURNAL_XP } from '../lib/journal';
import { t } from '../i18n';
import { Card, Tap, cx } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { Emoji } from '../ui/Emoji';

export type EarnPart = 'xp' | 'sparks' | 'rank';

function Line({ icon, what, gets, muted }: { icon: string; what: string; gets: string; muted?: boolean }) {
  return (
    <div className={cx('earn-line', muted && 'muted')}>
      <span className="earn-ic"><Emoji e={icon} /></span>
      <span className="grow t-small">{what}</span>
      <b className="num">{gets}</b>
    </div>
  );
}

function Part({ id, icon, title, body, children, here }: { id: EarnPart; icon: string; title: string; body: string; children: ReactNode; here: boolean }) {
  return (
    <Card className={cx('earn-part', here && 'here')} pad={false}>
      <div className="earn-head" data-part={id}>
        <span className="earn-badge"><Emoji e={icon} /></span>
        <div className="grow">
          <div className="t-body" style={{ fontWeight: 700 }}>{title}</div>
          <div className="t-tiny muted">{body}</div>
        </div>
      </div>
      <div className="earn-lines">{children}</div>
    </Card>
  );
}

export function EarnSheet({ about, onClose }: { about?: EarnPart; onClose: () => void }) {
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const optedIn = useServer((s) => s.rank.optedIn);
  const box = useRef<HTMLDivElement>(null);

  // Open at the part that was asked about.
  useEffect(() => {
    if (!about || about === 'xp') return;
    const id = setTimeout(() => box.current?.querySelector(`[data-part="${about}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(id);
  }, [about]);

  const go = (then: () => void) => {
    onClose();
    setTimeout(then, 200);
  };
  const prayer = WORSHIP_XP.fajr;

  return (
    <Sheet title={t('earn.title')} onClose={onClose}>
      <div ref={box} className="col" style={{ gap: 14 }}>
        <Part id="xp" icon="⚡" title={t('earn.xp.title')} body={t('earn.xp.body')} here={about === 'xp'}>
          <Line icon="🎯" what={t('earn.xp.log')} gets={t('earn.from', { n: XP.baseLog })} />
          <Line icon="📎" what={t('earn.xp.proof')} gets="+25%" />
          <Line icon="🏁" what={t('earn.xp.finish')} gets={`+${XP.taskComplete}`} />
          <Line icon="✅" what={t('earn.xp.habit')} gets={`+${HABIT_XP}`} />
          <Line icon="📝" what={t('earn.xp.todo')} gets={`+${TODO_XP}`} />
          <Line icon="🕌" what={t('earn.xp.prayer')} gets={`+${prayer}`} />
          <Line icon="🌙" what={t('earn.xp.fast')} gets={`+${WORSHIP_XP.fast}`} />
          <Line icon="📖" what={t('earn.xp.quran', { cap: PAGE_XP_CAP })} gets="+1" />
          <Line icon="⏱️" what={t('earn.xp.focus', { min: FOCUS_XP_EVERY, h: FOCUS_XP_DAILY_MINUTES / 60 })} gets="+1" />
          <Line icon="📔" what={t('earn.xp.journal')} gets={`+${JOURNAL_XP}`} />
          <Line icon="🔥" what={t('earn.xp.streak')} gets="+50%" />
        </Part>

        <Part id="sparks" icon="✨" title={t('earn.sparks.title')} body={t('earn.sparks.body')} here={about === 'sparks'}>
          <Line icon="📎" what={t('earn.sparks.proof', { n: MIN_SUMMARY_CHARS })} gets={t('earn.sparks.rate')} />
          <Line icon="⏳" what={t('earn.sparks.wait', { n: EVIDENCE_WINDOW_DAYS })} gets={t('earn.sparks.later')} />
          <Line icon="🏁" what={t('earn.sparks.finish')} gets={`+${XP.taskComplete / 10}`} />
          <Line icon="⏱️" what={t('earn.sparks.focus')} gets={t('earn.sparks.rate')} />
          <Line icon="🕌" what={t('earn.sparks.none')} gets="0" muted />
          <div className="earn-actions">
            <Tap className="btn primary sm" onTap={() => go(() => open({ name: 'add' }))}>{t('earn.sparks.do')}</Tap>
            <Tap className="btn soft sm" onTap={() => go(() => push({ name: 'shop' }))}>{t('earn.sparks.spend')}</Tap>
          </div>
        </Part>

        <Part id="rank" icon="🏆" title={t('earn.rank.title')} body={t('earn.rank.body')} here={about === 'rank'}>
          <Line icon="📎" what={t('earn.rank.proof')} gets="XP" />
          <Line icon="📅" what={t('earn.rank.week')} gets="0" />
          <Line icon="🕌" what={t('earn.rank.not')} gets="—" muted />
          <Line icon={optedIn ? '👁️' : '🙈'} what={t(optedIn ? 'earn.rank.shown' : 'earn.rank.hidden')} gets={optedIn ? '✓' : '!'} muted={optedIn} />
          <div className="earn-actions">
            {!optedIn ? (
              <Tap className="btn primary sm" onTap={() => go(() => open({ name: 'rank' }))}>{t('earn.rank.join')}</Tap>
            ) : null}
            <Tap className={cx('btn sm', optedIn ? 'primary' : 'soft')} onTap={() => go(() => push({ name: 'rankings' }))}>{t('earn.rank.open')}</Tap>
          </div>
        </Part>
      </div>
    </Sheet>
  );
}
