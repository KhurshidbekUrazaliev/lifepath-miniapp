// The companion's advice for the current moment: the day, the hour, Friday and Ramadan decide the order.
import { useMemo, useRef } from 'react';
import { Advice, AdviceContext, AdviceKind, dayNumber, pickAdvice } from '../lib/advisor';
import { hijriDate, isRamadan } from '../lib/hijri';
import { getLang } from '../i18n';
import { useStore } from './store';
import { useDailyHadith } from './daily';

export function adviceContext(hijriOffset = 0): AdviceContext {
  const now = new Date();
  return { lang: getLang(), hour: now.getHours(), weekday: now.getDay(), ramadan: isRamadan(hijriDate(now, hijriOffset)) };
}

/** `next(kind)` gives a new piece of advice each call; `today` is the hadith of the day. */
export function useAdvisor() {
  const offset = useStore((s) => s.settings.hijriOffset ?? 0);
  const taps = useRef<Record<AdviceKind, number>>({ hadith: 1, hikmah: 0, motivation: 0 });
  // The server's random hadith of the day when it has come in this language; the list's otherwise.
  const daily = useDailyHadith(getLang());
  return useMemo(() => {
    const ctx = adviceContext(offset);
    const day = dayNumber();
    return {
      today: daily ?? pickAdvice('hadith', ctx, day, 0),
      next(kind: AdviceKind): Advice {
        const n = taps.current[kind]++;
        return pickAdvice(kind, adviceContext(offset), day, n);
      },
    };
  }, [offset, daily?.key, daily?.text]);
}
