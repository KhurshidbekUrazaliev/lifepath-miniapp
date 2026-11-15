// The Hijri date from the device's own calendar data (Umm al-Qura), with no network and no tables.
// Moon-sighting countries can differ by a day; Settings lets people shift it (hijriOffset).

export interface HijriDate {
  day: number;
  month: number; // 1 = Muharram ... 9 = Ramadan ... 12 = Dhu al-Hijjah
  year: number;
}

const CALENDARS = ['islamic-umalqura', 'islamic-civil', 'islamic'];
let formatter: Intl.DateTimeFormat | null | undefined;

function getFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter;
  formatter = null;
  for (const ca of CALENDARS) {
    try {
      const f = new Intl.DateTimeFormat(`en-u-ca-${ca}-nu-latn`, { day: 'numeric', month: 'numeric', year: 'numeric' });
      if (f.resolvedOptions().calendar.startsWith('islamic')) {
        formatter = f;
        break;
      }
    } catch {
      // try the next calendar
    }
  }
  return formatter;
}

/** The Hijri date of a moment (local time), shifted by `offset` days; null where Intl has no Islamic calendar. */
export function hijriDate(at: Date = new Date(), offset = 0): HijriDate | null {
  const f = getFormatter();
  if (!f) return null;
  const d = new Date(at.getTime() + offset * 86400000);
  const parts = f.formatToParts(d);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value?.replace(/\D/g, '') ?? NaN);
  const out = { day: num('day'), month: num('month'), year: num('year') };
  return Number.isFinite(out.day) && Number.isFinite(out.month) && Number.isFinite(out.year) ? out : null;
}

export const isRamadan = (h: HijriDate | null): boolean => h?.month === 9;

/** Month names, transliterated the way each language usually writes them. */
export const HIJRI_MONTHS: Record<'en' | 'uz' | 'ru', string[]> = {
  en: ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'],
  uz: ['Muharram', 'Safar', 'Rabiul avval', 'Rabiul oxir', 'Jumodul avval', 'Jumodul oxir', 'Rajab', 'Shaʼbon', 'Ramazon', 'Shavvol', 'Zulqaʼda', 'Zulhijja'],
  ru: ['Мухаррам', 'Сафар', 'Раби аль-авваль', 'Раби ас-сани', 'Джумада аль-уля', 'Джумада ас-сания', 'Раджаб', 'Шаабан', 'Рамадан', 'Шавваль', 'Зуль-када', 'Зуль-хиджа'],
};
