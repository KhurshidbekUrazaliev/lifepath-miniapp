// Progress: the level ring, XP toward the next level, achievements and a few period totals.
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useData } from '../store/store';
import { dayKey } from '../lib/dates';
import { dayKeyToMs } from '../lib/calendar';
import { levelInfo, xpForLevel } from '../lib/gamify';
import { BADGES } from '../lib/achievements';
import { lastDays, totals, xpSeries } from '../lib/stats';
import { daysBetween } from '../lib/dates';
import { Key, t } from '../i18n';
import { fmtNumber, fmtShortDate } from '../i18n/format';
import { Bar, Card, Chips, Header, Num, Ring, Screen, Section, Tap } from '../ui/kit';
import { Hex } from '../ui/charts';
import { StatTile } from '../ui/parts';

type Range = 'month' | 'year' | 'all';

/** A title that grows with the level, like "Life Explorer". */
export function rankTitle(level: number): string {
  const tier = level >= 20 ? 6 : level >= 15 ? 5 : level >= 10 ? 4 : level >= 7 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0;
  return t(`rank.${tier}` as Key);
}

export function Progress() {
  const d = useData();
  const [range, setRange] = useState<Range>('month');
  const [all, setAll] = useState(false);
  const today = dayKey();
  const lvl = levelInfo(d.profile.xp);

  const period = useMemo(() => {
    const start = range === 'month' ? `${today.slice(0, 7)}-01` : range === 'year' ? `${today.slice(0, 4)}-01-01` : '';
    const since = start ? dayKeyToMs(start) : 0;
    const gained = start
      ? xpSeries(d, lastDays(daysBetween(start, today) + 1, today)).reduce((s, x) => s + x, 0)
      : d.profile.xp;
    return { gained, ...totals(d, since, today) };
  }, [d, range, today]);

  const badges = useMemo(() => {
    const earned = d.profile.achievements;
    return [...BADGES].sort((a, b) => Number(!!earned[b.id]) - Number(!!earned[a.id]) || (earned[b.id] ?? 0) - (earned[a.id] ?? 0));
  }, [d.profile.achievements]);
  const unlocked = badges.filter((b) => d.profile.achievements[b.id]).length;

  return (
    <Screen>
      <Header title={t('progress.title')} />
      <Chips<Range>
        value={range}
        onChange={setRange}
        options={[
          { id: 'month', label: t('progress.month') },
          { id: 'year', label: t('progress.year') },
          { id: 'all', label: t('progress.all') },
        ]}
      />

      <div style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: '6px 0 2px' }}>
        <Ring value={lvl.ratio} size={196} stroke={14}>
          <motion.div initial={{ scale: 0.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.25 }} style={{ fontSize: 30, lineHeight: 1 }}>
            ⭐
          </motion.div>
          <div className="t-display num" style={{ fontSize: 34, marginTop: 6 }}>{t('common.lv', { n: lvl.level })}</div>
          <div className="t-small muted" style={{ marginTop: 2 }}>{rankTitle(lvl.level)}</div>
        </Ring>
        <div className="t-small muted">{t('progress.next', { n: fmtNumber(xpForLevel(lvl.level + 1)) })}</div>
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="t-body num">
            <Num value={d.profile.xp} format={(n) => fmtNumber(Math.round(n))} /> <span className="muted">/ {fmtNumber(xpForLevel(lvl.level + 1))} XP</span>
          </span>
          <span className="pillnote">{t('progress.gained', { n: fmtNumber(period.gained) })}</span>
        </div>
        <Bar value={lvl.ratio} height={9} />
      </Card>

      <Section title={t('progress.achievements')} action={all ? undefined : t('common.seeAll')} onAction={() => setAll(true)}>
        {all ? (
          <Card className="badge-grid">
            {badges.map((b) => {
              const at = d.profile.achievements[b.id];
              return (
                <div key={b.id} className="badge-cell">
                  <Hex tone={b.tone} icon={b.icon} locked={!at} size={54} />
                  <div className="t-small" style={{ fontWeight: 700, marginTop: 6 }}>{t(`ach.${b.id}.title` as Key)}</div>
                  <div className="t-tiny muted">{at ? t('progress.earned', { date: fmtShortDate(at) }) : t(`ach.${b.id}.desc` as Key)}</div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Tap onTap={() => setAll(true)} scale={0.98}>
            <div className="row between" style={{ padding: '2px 4px' }}>
              {badges.slice(0, 4).map((b, i) => (
                <motion.div key={b.id} initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.1 + i * 0.07 }}>
                  <Hex tone={b.tone} icon={b.icon} locked={!d.profile.achievements[b.id]} size={66} />
                </motion.div>
              ))}
            </div>
            <div className="t-small muted center" style={{ marginTop: 8 }}>{t('progress.unlocked', { done: unlocked, total: badges.length })}</div>
          </Tap>
        )}
      </Section>

      <Card className="row" style={{ gap: 14 }}>
        <span style={{ fontSize: 38, lineHeight: 1 }}>🚀</span>
        <div>
          <div className="t-body">{t('progress.keepGoing')}</div>
          <div className="t-small muted">{t('progress.keepGoing.body')}</div>
        </div>
      </Card>

      <div className="tiles">
        <StatTile icon={<span style={{ fontSize: 24 }}>⚡</span>} value={<Num value={period.gained} format={(n) => fmtNumber(Math.round(n))} />} label={t('progress.stat.xp')} />
        <StatTile icon={<span style={{ fontSize: 24 }}>📝</span>} value={<Num value={period.logs} />} label={t('progress.stat.logs')} />
        <StatTile icon={<span style={{ fontSize: 24 }}>🔥</span>} value={<Num value={d.profile.streak.best} />} label={t('progress.stat.best')} />
        <StatTile icon={<span style={{ fontSize: 24 }}>🏁</span>} value={<Num value={period.goalsDone} />} label={t('progress.stat.finished')} />
      </div>
    </Screen>
  );
}
