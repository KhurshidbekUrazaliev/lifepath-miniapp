// The reciters the ayah audio can play. Every file comes from everyayah.com, one MP3 per ayah:
// https://everyayah.com/data/<folder>/<surah 3 digits><ayah 3 digits>.mp3
import type { Lang } from '../i18n';

export interface Reciter {
  id: string; // what Settings.reciter keeps
  folder: string;
  name: Record<Lang, string>;
}

export const RECITERS: Reciter[] = [
  { id: 'alafasy', folder: 'Alafasy_128kbps', name: { en: 'Mishary Rashid Alafasy', ru: 'Мишари Рашид аль-Афаси', uz: 'Mishari Roshid Alafasiy' } },
  { id: 'husary', folder: 'Husary_128kbps', name: { en: 'Mahmoud Khalil Al-Husary', ru: 'Махмуд Халиль аль-Хусари', uz: 'Mahmud Xalil al-Husariy' } },
  { id: 'abdulbasit', folder: 'Abdul_Basit_Murattal_192kbps', name: { en: 'Abdul Basit Abdul Samad', ru: 'Абдул-Басит Абдус-Самад', uz: 'Abdulbosit Abdussamad' } },
  { id: 'minshawi', folder: 'Minshawy_Murattal_128kbps', name: { en: 'Mohamed Siddiq Al-Minshawi', ru: 'Мухаммад Сиддик аль-Миншави', uz: 'Muhammad Siddiq al-Minshoviy' } },
  { id: 'sudais', folder: 'Abdurrahmaan_As-Sudais_192kbps', name: { en: 'Abdul Rahman Al-Sudais', ru: 'Абдуррахман ас-Судайс', uz: 'Abdurrahmon as-Sudays' } },
  { id: 'muaiqly', folder: 'Maher_AlMuaiqly_64kbps', name: { en: 'Maher Al-Muaiqly', ru: 'Махер аль-Муайкли', uz: 'Mohir al-Muayqiliy' } },
  { id: 'dosari', folder: 'Yasser_Ad-Dussary_128kbps', name: { en: 'Yasser Al-Dosari', ru: 'Ясир ад-Даусари', uz: 'Yosir ad-Dovsariy' } },
  { id: 'shuraim', folder: 'Saood_ash-Shuraym_128kbps', name: { en: 'Saud Al-Shuraim', ru: 'Сауд аш-Шурайм', uz: 'Saud ash-Shuraym' } },
  { id: 'rifai', folder: 'Hani_Rifai_192kbps', name: { en: 'Hani Ar-Rifai', ru: 'Хани ар-Рифаи', uz: 'Honiy ar-Rifoiy' } },
  { id: 'ayyub', folder: 'Muhammad_Ayyoub_128kbps', name: { en: 'Muhammad Ayyub', ru: 'Мухаммад Айюб', uz: 'Muhammad Ayyub' } },
];

/** The chosen reciter, or the first one when nothing (or something unknown) is chosen. */
export const reciterOf = (id?: string): Reciter => RECITERS.find((r) => r.id === id) ?? RECITERS[0];

/** The recording of one ayah ("2:255") by one reciter. */
export function ayahAudioUrl(reciter: Reciter, key: string): string {
  const [surah, ayah] = key.split(':');
  return `https://everyayah.com/data/${reciter.folder}/${surah.padStart(3, '0')}${ayah.padStart(3, '0')}.mp3`;
}

/** What the reciter list plays as a sample: "All praise is due to Allah, Lord of the worlds". */
export const SAMPLE_AYAH = '1:2';
