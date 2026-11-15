// Everything the companion screens need, derived from the logs and the level.
import { useMemo } from 'react';
import { useStore } from './store';
import { archetypeFor, computeAttributes, dominantAttr, echoMood, totalPoints } from '../lib/echo';
import { GROWTH_IDS, Gender, growthFor } from '../lib/companion';
import { visibleStreak } from '../lib/gamify';
import { checksOn } from '../lib/habits';
import { dayKey } from '../lib/dates';
import { Key, t } from '../i18n';

export function useEcho() {
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const tasks = useStore((s) => s.tasks);
  const folders = useStore((s) => s.folders);
  const checks = useStore((s) => s.checks);
  return useMemo(() => {
    const attrs = computeAttributes(entries, tasks, folders);
    const total = totalPoints(attrs);
    const today = dayKey();
    const active = entries.some((e) => dayKey(e.at) === today) || checksOn(checks, today) > 0;
    const mood = echoMood(active, visibleStreak(profile.streak, profile.freezes));
    // The same line all day (the hash LifePath uses), so it does not flicker between visits.
    let h = 0;
    for (const ch of today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return {
      echo: profile.echo,
      gender: profile.echo?.gender ?? 'boy',
      attrs,
      total,
      growth: growthFor(profile.xp),
      mood,
      line: t(`mood.${mood}.${h % 4}` as Key),
      outfit: profile.outfit,
      accent: dominantAttr(attrs)?.color ?? '#8B82FF',
      archetype: t(`arch.${archetypeFor(attrs)}` as Key),
    };
  }, [profile, entries, tasks, folders, checks]);
}

/** A growth stage's name (Russian needs the feminine form for a girl). */
export const growthName = (stage: number, gender: Gender): string =>
  t((gender === 'girl' && GROWTH_IDS[stage] === 'grown' ? 'growth.grown.girl' : `growth.${GROWTH_IDS[stage]}`) as Key);
