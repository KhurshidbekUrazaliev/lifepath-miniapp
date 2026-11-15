// Prayer times: the calculation the app and the bot's server share (the server sends prayer
// reminders with it, so they keep coming on days the app is not opened). Only adhan.js, no app code.
//
// Times follow the IlmulHaq bot (prayer.py there): left on "automatic", the method and the Asr school
// follow the place's time zone. Uzbekistan uses islom.uz's own settings: Fajr and Isha at 15.5°, the
// Hanafi Asr, Maghrib 4 minutes after sunset, and "middle of the night" at high latitudes.
import { CalculationMethod, CalculationParameters, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof PRAYERS)[number];
export const TIMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type TimeKey = (typeof TIMES)[number];

// ---------- calculation methods ----------

export type MethodKey =
  | 'uz' | 'mwl' | 'turkey' | 'russia' | 'makkah' | 'egypt' | 'karachi' | 'isna' | 'jakim' | 'kemenag' | 'singapore'
  | 'gulf' | 'kuwait' | 'qatar' | 'dubai' | 'france' | 'tunisia' | 'algeria' | 'morocco' | 'portugal' | 'jordan' | 'moonsighting';
export type AsrSchool = 'standard' | 'hanafi';

function custom(fajr: number, isha: number, ishaInterval = 0, maghribMinutes = 0): CalculationParameters {
  const p = new CalculationParameters('Other', fajr, isha, ishaInterval);
  p.methodAdjustments.maghrib = maghribMinutes;
  return p;
}

const METHODS: Record<MethodKey, { name: string; params: () => CalculationParameters }> = {
  uz: { name: 'Uzbekistan, islom.uz', params: () => custom(15.5, 15.5, 0, 4) },
  mwl: { name: 'Muslim World League', params: () => CalculationMethod.MuslimWorldLeague() },
  turkey: { name: 'Diyanet (Turkey)', params: () => CalculationMethod.Turkey() },
  russia: { name: 'Spiritual Administration of Muslims of Russia', params: () => custom(16, 15) },
  makkah: { name: 'Umm al-Qura, Makkah', params: () => CalculationMethod.UmmAlQura() },
  egypt: { name: 'Egyptian General Authority of Survey', params: () => CalculationMethod.Egyptian() },
  karachi: { name: 'University of Islamic Sciences, Karachi', params: () => CalculationMethod.Karachi() },
  isna: { name: 'ISNA (North America)', params: () => CalculationMethod.NorthAmerica() },
  jakim: { name: 'JAKIM (Malaysia)', params: () => custom(20, 18) },
  kemenag: { name: 'KEMENAG (Indonesia)', params: () => custom(20, 18) },
  singapore: { name: 'MUIS (Singapore)', params: () => CalculationMethod.Singapore() },
  gulf: { name: 'Gulf Region', params: () => custom(19.5, 0, 90) },
  kuwait: { name: 'Kuwait', params: () => CalculationMethod.Kuwait() },
  qatar: { name: 'Qatar', params: () => CalculationMethod.Qatar() },
  dubai: { name: 'UAE (Dubai)', params: () => CalculationMethod.Dubai() },
  france: { name: 'UOIF (France)', params: () => custom(12, 12) },
  tunisia: { name: 'Tunisia', params: () => custom(18, 18) },
  algeria: { name: 'Algeria', params: () => custom(18, 17) },
  morocco: { name: 'Morocco', params: () => custom(19, 17) },
  portugal: { name: 'Islamic Community of Lisbon', params: () => custom(18, 0, 77, 3) },
  jordan: { name: 'Jordan (Awqaf)', params: () => custom(18, 18, 0, 5) },
  moonsighting: { name: 'Moonsighting Committee', params: () => CalculationMethod.MoonsightingCommittee() },
};

/** The methods offered in Settings, in the bot's order (the others are only chosen automatically). */
export const METHOD_MENU: MethodKey[] = ['uz', 'mwl', 'turkey', 'russia', 'makkah', 'egypt', 'karachi', 'isna', 'jakim', 'kemenag', 'gulf', 'moonsighting'];

export const isMethod = (key: unknown): key is MethodKey => typeof key === 'string' && key in METHODS;

export function methodName(key: MethodKey, lang: 'en' | 'uz' | 'ru'): string {
  if (key === 'uz') return { en: 'Uzbekistan, islom.uz', uz: 'Oʻzbekiston, islom.uz', ru: 'Узбекистан, islom.uz' }[lang];
  return METHODS[key].name;
}

const RUSSIA = [
  'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan',
  'Europe/Kirov', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk',
  'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita', 'Asia/Yakutsk', 'Asia/Khandyga', 'Asia/Vladivostok', 'Asia/Ust-Nera',
  'Asia/Magadan', 'Asia/Sakhalin', 'Asia/Srednekolymsk', 'Asia/Kamchatka', 'Asia/Anadyr',
];
const NORTH_AMERICA = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
  'America/Detroit', 'America/Boise', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/Regina',
  'America/St_Johns', 'America/Montreal',
];
const TZ_METHOD: Record<string, MethodKey> = {
  'Asia/Tashkent': 'uz', 'Asia/Samarkand': 'uz',
  'Europe/Istanbul': 'turkey', 'Asia/Istanbul': 'turkey',
  'Asia/Riyadh': 'makkah', 'Africa/Cairo': 'egypt',
  'Asia/Karachi': 'karachi', 'Asia/Kolkata': 'karachi', 'Asia/Calcutta': 'karachi', 'Asia/Dhaka': 'karachi', 'Asia/Kabul': 'karachi',
  'Asia/Kuala_Lumpur': 'jakim', 'Asia/Kuching': 'jakim',
  'Asia/Jakarta': 'kemenag', 'Asia/Pontianak': 'kemenag', 'Asia/Makassar': 'kemenag', 'Asia/Jayapura': 'kemenag',
  'Asia/Singapore': 'singapore',
  'Asia/Kuwait': 'kuwait', 'Asia/Qatar': 'qatar', 'Asia/Dubai': 'dubai', 'Asia/Bahrain': 'gulf', 'Asia/Muscat': 'gulf',
  'Europe/Paris': 'france', 'Africa/Tunis': 'tunisia', 'Africa/Algiers': 'algeria', 'Africa/Casablanca': 'morocco',
  'Europe/Lisbon': 'portugal', 'Asia/Amman': 'jordan',
  ...Object.fromEntries(RUSSIA.map((tz) => [tz, 'russia' as const])),
  ...Object.fromEntries(NORTH_AMERICA.map((tz) => [tz, 'isna' as const])),
};
// Where most Muslims follow the Hanafi school, Asr defaults to the Hanafi time. Turkey is left out on
// purpose: Diyanet publishes the earlier time.
const HANAFI_TZ = new Set([
  'Asia/Tashkent', 'Asia/Samarkand', 'Asia/Dushanbe', 'Asia/Bishkek', 'Asia/Almaty', 'Asia/Qyzylorda', 'Asia/Qostanay', 'Asia/Aqtobe',
  'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Ashgabat', 'Asia/Kabul', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Dhaka',
  ...RUSSIA,
]);

/** The method and Asr school to use: the ones chosen in Settings, or what is usual at the place. */
/** What Settings holds about the method; anything unknown counts as automatic. */
export interface MethodChoice {
  prayerMethod?: string;
  asr?: string;
}

export function resolveMethod(s: MethodChoice, tz: string): { method: MethodKey; asr: AsrSchool; autoMethod: MethodKey; autoAsr: AsrSchool } {
  const autoMethod = TZ_METHOD[tz] ?? 'mwl';
  const autoAsr: AsrSchool = HANAFI_TZ.has(tz) ? 'hanafi' : 'standard';
  return {
    method: isMethod(s.prayerMethod) ? s.prayerMethod : autoMethod,
    asr: s.asr === 'hanafi' || s.asr === 'standard' ? s.asr : autoAsr,
    autoMethod,
    autoAsr,
  };
}

// ---------- times ----------

export type DayTimes = Record<TimeKey, Date>;

/** The day ("YYYY-MM-DD") it is at the place right now. */
export function dayAt(tz: string, at: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** The six times of one day at a place. */
export interface LatLon {
  lat: number;
  lon: number;
}

export function timesFor(place: LatLon, day: string, method: MethodKey, asr: AsrSchool): DayTimes {
  const params = METHODS[method].params();
  params.madhab = asr === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  // islom.uz keeps Fajr and Isha at the middle of the night up north; elsewhere this follows aladhan.com, as the bot does.
  params.highLatitudeRule = method === 'uz' ? HighLatitudeRule.MiddleOfTheNight : HighLatitudeRule.TwilightAngle;
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const pt = new PrayerTimes(new Coordinates(place.lat, place.lon), new Date(y, m - 1, d, 12), params);
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha };
}

/** The day `delta` days after a "YYYY-MM-DD" day. */
export function shiftDate(day: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * When a reminder for one prayer next fires: `before` minutes ahead of its time, strictly after
 * `after`. Null when the prayer has no time (it cannot happen with a high-latitude rule set).
 */
export function nextPrayerAt(
  place: LatLon & { tz: string },
  method: MethodKey,
  asr: AsrSchool,
  key: PrayerKey,
  before: number,
  after: number,
): number | null {
  const day = dayAt(place.tz, after);
  // From yesterday: far north, Isha can fall after midnight, on the next calendar day.
  for (let i = -1; i <= 2; i++) {
    const at = timesFor(place, shiftDate(day, i), method, asr)[key].getTime() - before * 60_000;
    if (at > after) return at;
  }
  return null;
}
