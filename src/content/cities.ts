// Cities to pick by hand when the phone does not share its location: all of Uzbekistan's regional
// centres and larger towns, its neighbours, the Muslim world's big cities, and the places many Uzbeks
// study and work. [id, latitude, longitude, time zone, English, Russian, Uzbek]
import type { Lang } from '../i18n';

type Row = [string, number, number, string, string, string, string];

const ROWS: Row[] = [
  // Uzbekistan
  ['tashkent', 41.311, 69.24, 'Asia/Tashkent', 'Tashkent', 'Ташкент', 'Toshkent'],
  ['samarkand', 39.655, 66.976, 'Asia/Samarkand', 'Samarkand', 'Самарканд', 'Samarqand'],
  ['bukhara', 39.768, 64.421, 'Asia/Samarkand', 'Bukhara', 'Бухара', 'Buxoro'],
  ['andijan', 40.783, 72.344, 'Asia/Tashkent', 'Andijan', 'Андижан', 'Andijon'],
  ['namangan', 40.998, 71.673, 'Asia/Tashkent', 'Namangan', 'Наманган', 'Namangan'],
  ['fergana', 40.389, 71.784, 'Asia/Tashkent', 'Fergana', 'Фергана', 'Fargʻona'],
  ['kokand', 40.529, 70.943, 'Asia/Tashkent', 'Kokand', 'Коканд', 'Qoʻqon'],
  ['margilan', 40.471, 71.725, 'Asia/Tashkent', 'Margilan', 'Маргилан', 'Margʻilon'],
  ['nukus', 42.462, 59.603, 'Asia/Samarkand', 'Nukus', 'Нукус', 'Nukus'],
  ['urgench', 41.55, 60.633, 'Asia/Samarkand', 'Urgench', 'Ургенч', 'Urganch'],
  ['khiva', 41.378, 60.364, 'Asia/Samarkand', 'Khiva', 'Хива', 'Xiva'],
  ['qarshi', 38.86, 65.79, 'Asia/Samarkand', 'Qarshi', 'Карши', 'Qarshi'],
  ['shahrisabz', 39.058, 66.834, 'Asia/Samarkand', 'Shahrisabz', 'Шахрисабз', 'Shahrisabz'],
  ['termez', 37.224, 67.278, 'Asia/Samarkand', 'Termez', 'Термез', 'Termiz'],
  ['denov', 38.267, 67.899, 'Asia/Samarkand', 'Denov', 'Денау', 'Denov'],
  ['jizzakh', 40.116, 67.842, 'Asia/Samarkand', 'Jizzakh', 'Джизак', 'Jizzax'],
  ['gulistan', 40.49, 68.784, 'Asia/Tashkent', 'Gulistan', 'Гулистан', 'Guliston'],
  ['navoi', 40.084, 65.379, 'Asia/Samarkand', 'Navoiy', 'Навои', 'Navoiy'],
  ['zarafshan', 41.574, 64.209, 'Asia/Samarkand', 'Zarafshan', 'Зарафшан', 'Zarafshon'],
  ['kattakurgan', 39.899, 66.256, 'Asia/Samarkand', 'Kattakurgan', 'Каттакурган', 'Kattaqoʻrgʻon'],
  ['chirchiq', 41.469, 69.582, 'Asia/Tashkent', 'Chirchiq', 'Чирчик', 'Chirchiq'],
  ['angren', 41.017, 70.144, 'Asia/Tashkent', 'Angren', 'Ангрен', 'Angren'],
  ['olmaliq', 40.845, 69.598, 'Asia/Tashkent', 'Olmaliq', 'Алмалык', 'Olmaliq'],
  ['bekabad', 40.221, 69.27, 'Asia/Tashkent', 'Bekabad', 'Бекабад', 'Bekobod'],
  ['chust', 41.003, 71.237, 'Asia/Tashkent', 'Chust', 'Чуст', 'Chust'],
  // Central Asia and the Caucasus
  ['almaty', 43.238, 76.946, 'Asia/Almaty', 'Almaty', 'Алматы', 'Olmaota'],
  ['astana', 51.169, 71.449, 'Asia/Almaty', 'Astana', 'Астана', 'Astana'],
  ['shymkent', 42.342, 69.59, 'Asia/Almaty', 'Shymkent', 'Шымкент', 'Chimkent'],
  ['turkistan', 43.297, 68.252, 'Asia/Almaty', 'Turkistan', 'Туркестан', 'Turkiston'],
  ['bishkek', 42.875, 74.57, 'Asia/Bishkek', 'Bishkek', 'Бишкек', 'Bishkek'],
  ['osh', 40.528, 72.799, 'Asia/Bishkek', 'Osh', 'Ош', 'Oʻsh'],
  ['dushanbe', 38.56, 68.787, 'Asia/Dushanbe', 'Dushanbe', 'Душанбе', 'Dushanbe'],
  ['khujand', 40.283, 69.622, 'Asia/Dushanbe', 'Khujand', 'Худжанд', 'Xoʻjand'],
  ['ashgabat', 37.96, 58.326, 'Asia/Ashgabat', 'Ashgabat', 'Ашхабад', 'Ashxobod'],
  ['baku', 40.409, 49.867, 'Asia/Baku', 'Baku', 'Баку', 'Boku'],
  ['kabul', 34.555, 69.207, 'Asia/Kabul', 'Kabul', 'Кабул', 'Kobul'],
  // Russia
  ['moscow', 55.756, 37.617, 'Europe/Moscow', 'Moscow', 'Москва', 'Moskva'],
  ['petersburg', 59.939, 30.316, 'Europe/Moscow', 'Saint Petersburg', 'Санкт-Петербург', 'Sankt-Peterburg'],
  ['kazan', 55.796, 49.106, 'Europe/Moscow', 'Kazan', 'Казань', 'Qozon'],
  ['ufa', 54.735, 55.958, 'Asia/Yekaterinburg', 'Ufa', 'Уфа', 'Ufa'],
  ['makhachkala', 42.983, 47.504, 'Europe/Moscow', 'Makhachkala', 'Махачкала', 'Maxachqalʼa'],
  ['grozny', 43.318, 45.698, 'Europe/Moscow', 'Grozny', 'Грозный', 'Grozniy'],
  ['nizhny', 56.327, 44.006, 'Europe/Moscow', 'Nizhny Novgorod', 'Нижний Новгород', 'Nijniy Novgorod'],
  ['samara', 53.195, 50.1, 'Europe/Samara', 'Samara', 'Самара', 'Samara'],
  ['yekaterinburg', 56.838, 60.605, 'Asia/Yekaterinburg', 'Yekaterinburg', 'Екатеринбург', 'Yekaterinburg'],
  ['novosibirsk', 55.008, 82.935, 'Asia/Novosibirsk', 'Novosibirsk', 'Новосибирск', 'Novosibirsk'],
  ['krasnodar', 45.035, 38.975, 'Europe/Moscow', 'Krasnodar', 'Краснодар', 'Krasnodar'],
  // The Arabian Peninsula and the Middle East
  ['makkah', 21.4225, 39.8262, 'Asia/Riyadh', 'Makkah', 'Мекка', 'Makka'],
  ['madinah', 24.468, 39.614, 'Asia/Riyadh', 'Madinah', 'Медина', 'Madina'],
  ['riyadh', 24.713, 46.675, 'Asia/Riyadh', 'Riyadh', 'Эр-Рияд', 'Ar-Riyod'],
  ['jeddah', 21.485, 39.193, 'Asia/Riyadh', 'Jeddah', 'Джидда', 'Jidda'],
  ['dubai', 25.205, 55.271, 'Asia/Dubai', 'Dubai', 'Дубай', 'Dubay'],
  ['abudhabi', 24.454, 54.377, 'Asia/Dubai', 'Abu Dhabi', 'Абу-Даби', 'Abu-Dabi'],
  ['doha', 25.286, 51.531, 'Asia/Qatar', 'Doha', 'Доха', 'Doha'],
  ['kuwait', 29.376, 47.977, 'Asia/Kuwait', 'Kuwait City', 'Эль-Кувейт', 'Quvayt'],
  ['manama', 26.229, 50.586, 'Asia/Bahrain', 'Manama', 'Манама', 'Manama'],
  ['muscat', 23.588, 58.383, 'Asia/Muscat', 'Muscat', 'Маскат', 'Masqat'],
  ['amman', 31.954, 35.911, 'Asia/Amman', 'Amman', 'Амман', 'Ammon'],
  ['quds', 31.778, 35.235, 'Asia/Jerusalem', 'Jerusalem (Al-Quds)', 'Иерусалим (аль-Кудс)', 'Quddus'],
  ['damascus', 33.513, 36.292, 'Asia/Damascus', 'Damascus', 'Дамаск', 'Damashq'],
  ['beirut', 33.894, 35.502, 'Asia/Beirut', 'Beirut', 'Бейрут', 'Bayrut'],
  ['baghdad', 33.315, 44.366, 'Asia/Baghdad', 'Baghdad', 'Багдад', 'Bagʻdod'],
  ['tehran', 35.689, 51.389, 'Asia/Tehran', 'Tehran', 'Тегеран', 'Tehron'],
  // Turkey
  ['istanbul', 41.008, 28.978, 'Europe/Istanbul', 'Istanbul', 'Стамбул', 'Istanbul'],
  ['ankara', 39.933, 32.86, 'Europe/Istanbul', 'Ankara', 'Анкара', 'Anqara'],
  ['izmir', 38.423, 27.143, 'Europe/Istanbul', 'Izmir', 'Измир', 'Izmir'],
  ['bursa', 40.183, 29.067, 'Europe/Istanbul', 'Bursa', 'Бурса', 'Bursa'],
  ['konya', 37.871, 32.485, 'Europe/Istanbul', 'Konya', 'Конья', 'Konya'],
  ['antalya', 36.897, 30.713, 'Europe/Istanbul', 'Antalya', 'Анталья', 'Antaliya'],
  // Africa
  ['cairo', 30.044, 31.236, 'Africa/Cairo', 'Cairo', 'Каир', 'Qohira'],
  ['casablanca', 33.573, -7.59, 'Africa/Casablanca', 'Casablanca', 'Касабланка', 'Kasablanka'],
  ['algiers', 36.754, 3.059, 'Africa/Algiers', 'Algiers', 'Алжир', 'Jazoir'],
  ['tunis', 36.806, 10.181, 'Africa/Tunis', 'Tunis', 'Тунис', 'Tunis'],
  // South and Southeast Asia
  ['karachi', 24.861, 67.01, 'Asia/Karachi', 'Karachi', 'Карачи', 'Karachi'],
  ['lahore', 31.52, 74.359, 'Asia/Karachi', 'Lahore', 'Лахор', 'Lohur'],
  ['islamabad', 33.684, 73.048, 'Asia/Karachi', 'Islamabad', 'Исламабад', 'Islomobod'],
  ['delhi', 28.614, 77.209, 'Asia/Kolkata', 'Delhi', 'Дели', 'Dehli'],
  ['dhaka', 23.811, 90.413, 'Asia/Dhaka', 'Dhaka', 'Дакка', 'Dakka'],
  ['jakarta', -6.208, 106.846, 'Asia/Jakarta', 'Jakarta', 'Джакарта', 'Jakarta'],
  ['kualalumpur', 3.139, 101.687, 'Asia/Kuala_Lumpur', 'Kuala Lumpur', 'Куала-Лумпур', 'Kuala-Lumpur'],
  ['singapore', 1.352, 103.82, 'Asia/Singapore', 'Singapore', 'Сингапур', 'Singapur'],
  // East Asia
  ['seoul', 37.567, 126.978, 'Asia/Seoul', 'Seoul', 'Сеул', 'Seul'],
  ['incheon', 37.456, 126.705, 'Asia/Seoul', 'Incheon', 'Инчхон', 'Inchxon'],
  ['busan', 35.18, 129.075, 'Asia/Seoul', 'Busan', 'Пусан', 'Pusan'],
  ['daegu', 35.871, 128.601, 'Asia/Seoul', 'Daegu', 'Тэгу', 'Tegu'],
  ['gwangju', 35.16, 126.852, 'Asia/Seoul', 'Gwangju', 'Кванджу', 'Kvanju'],
  ['tokyo', 35.676, 139.65, 'Asia/Tokyo', 'Tokyo', 'Токио', 'Tokio'],
  ['beijing', 39.904, 116.407, 'Asia/Shanghai', 'Beijing', 'Пекин', 'Pekin'],
  // Europe
  ['london', 51.507, -0.128, 'Europe/London', 'London', 'Лондон', 'London'],
  ['paris', 48.857, 2.352, 'Europe/Paris', 'Paris', 'Париж', 'Parij'],
  ['berlin', 52.52, 13.405, 'Europe/Berlin', 'Berlin', 'Берлин', 'Berlin'],
  ['vienna', 48.208, 16.373, 'Europe/Vienna', 'Vienna', 'Вена', 'Vena'],
  ['amsterdam', 52.368, 4.904, 'Europe/Amsterdam', 'Amsterdam', 'Амстердам', 'Amsterdam'],
  ['brussels', 50.85, 4.352, 'Europe/Brussels', 'Brussels', 'Брюссель', 'Bryussel'],
  ['stockholm', 59.329, 18.069, 'Europe/Stockholm', 'Stockholm', 'Стокгольм', 'Stokgolm'],
  ['warsaw', 52.23, 21.012, 'Europe/Warsaw', 'Warsaw', 'Варшава', 'Varshava'],
  ['prague', 50.076, 14.438, 'Europe/Prague', 'Prague', 'Прага', 'Praga'],
  ['rome', 41.903, 12.496, 'Europe/Rome', 'Rome', 'Рим', 'Rim'],
  ['madrid', 40.417, -3.704, 'Europe/Madrid', 'Madrid', 'Мадрид', 'Madrid'],
  ['lisbon', 38.722, -9.139, 'Europe/Lisbon', 'Lisbon', 'Лиссабон', 'Lissabon'],
  ['sarajevo', 43.856, 18.413, 'Europe/Sarajevo', 'Sarajevo', 'Сараево', 'Sarayevo'],
  // The Americas and Australia
  ['newyork', 40.713, -74.006, 'America/New_York', 'New York', 'Нью-Йорк', 'Nyu-York'],
  ['washington', 38.907, -77.037, 'America/New_York', 'Washington', 'Вашингтон', 'Vashington'],
  ['chicago', 41.878, -87.63, 'America/Chicago', 'Chicago', 'Чикаго', 'Chikago'],
  ['losangeles', 34.052, -118.244, 'America/Los_Angeles', 'Los Angeles', 'Лос-Анджелес', 'Los-Anjeles'],
  ['toronto', 43.653, -79.383, 'America/Toronto', 'Toronto', 'Торонто', 'Toronto'],
  ['sydney', -33.869, 151.209, 'Australia/Sydney', 'Sydney', 'Сидней', 'Sidney'],
  ['melbourne', -37.814, 144.963, 'Australia/Melbourne', 'Melbourne', 'Мельбурн', 'Melburn'],
];

export interface City {
  id: string;
  lat: number;
  lon: number;
  tz: string;
  name: Record<Lang, string>;
}

export const CITIES: City[] = ROWS.map(([id, lat, lon, tz, en, ru, uz]) => ({ id, lat, lon, tz, name: { en, ru, uz } }));

export const cityById = (id?: string): City | undefined => (id ? CITIES.find((c) => c.id === id) : undefined);

// "Qoʻqon", "qo'qon" and "qoqon" all match.
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ'ʻʼ`’‘\s-]/g, '').replace(/ё/g, 'е');

/** Cities whose name in any language starts with (or, failing that, contains) the query. */
export function searchCities(query: string): City[] {
  const q = fold(query);
  if (!q) return CITIES;
  const names = (c: City) => [c.name.en, c.name.ru, c.name.uz, c.id].map(fold);
  const starts = CITIES.filter((c) => names(c).some((n) => n.startsWith(q)));
  const within = CITIES.filter((c) => !starts.includes(c) && names(c).some((n) => n.includes(q)));
  return [...starts, ...within];
}

/** The nearest listed city within `maxKm`, to name a place found by the phone's location. */
export function nearestCity(lat: number, lon: number, maxKm = 35): City | undefined {
  let best: City | undefined;
  let bestKm = maxKm;
  for (const c of CITIES) {
    const dLat = (c.lat - lat) * 111;
    const dLon = (c.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    const km = Math.hypot(dLat, dLon);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
