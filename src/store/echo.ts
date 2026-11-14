// Everything the Echo screens need, derived from the logs (LifePath's echoState.ts, for the web).
import { useMemo } from 'react';
import { useStore } from './store';
import { archetypeFor, computeAttributes, dominantAttr, echoMood, stageFor, totalPoints } from '../lib/echo';
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
      attrs,
      total,
      stage: stageFor(total),
      mood,
      line: t(`mood.${mood}.${h % 4}` as Key),
      outfit: profile.outfit,
      accent: dominantAttr(attrs)?.color ?? '#8B82FF',
      archetype: t(`arch.${archetypeFor(attrs)}` as Key),
    };
  }, [profile, entries, tasks, folders, checks]);
}
