// Name ideas for the companion: short names with a good meaning, spelled the way each language writes
// them. They are offered under the name field; any other name can still be typed.
import type { Gender } from './companion';

export type NameLang = 'en' | 'uz' | 'ru';

export interface NameIdea {
  name: string;
  meaning: string;
}

type Rows = [name: string, meaning: string][];

const IDEAS: Record<NameLang, Record<Gender, Rows>> = {
  en: {
    boy: [
      ['Zayd', 'growth'],
      ['Anas', 'good company'],
      ['Amin', 'trustworthy'],
      ['Hakim', 'wise'],
      ['Sabir', 'patient'],
      ['Karim', 'generous'],
      ['Rashid', 'rightly guided'],
      ['Shakir', 'grateful'],
      ['Rayyan', 'the gate of Paradise for those who fast'],
      ['Salih', 'righteous'],
    ],
    girl: [
      ['Nur', 'light'],
      ['Safiya', 'pure'],
      ['Amina', 'trustworthy'],
      ['Sakina', 'calm of the heart'],
      ['Sabira', 'patient'],
      ['Shakira', 'grateful'],
      ['Hidaya', 'guidance'],
      ['Munira', 'full of light'],
      ['Rayhana', 'sweet basil'],
      ['Tasnim', 'a spring in Paradise'],
    ],
  },
  uz: {
    boy: [
      ['Zayd', 'oʻsish, ziyoda boʻlish'],
      ['Anas', 'ulfat, yaxshi hamroh'],
      ['Amin', 'ishonchli'],
      ['Hakim', 'dono, hikmatli'],
      ['Sobir', 'sabrli'],
      ['Karim', 'saxiy, karamli'],
      ['Rashid', 'toʻgʻri yoʻldan yuruvchi'],
      ['Shokir', 'shukr qiluvchi'],
      ['Rayyon', 'roʻzadorlar kiradigan jannat eshigi'],
      ['Solih', 'yaxshi amalli'],
    ],
    girl: [
      ['Nur', 'yorugʻlik'],
      ['Safiya', 'sof, pokiza'],
      ['Omina', 'ishonchli'],
      ['Sakina', 'qalb xotirjamligi'],
      ['Sobira', 'sabrli'],
      ['Shokira', 'shukr qiluvchi'],
      ['Hidoyat', 'toʻgʻri yoʻl'],
      ['Munira', 'nur sochuvchi'],
      ['Rayhona', 'xushboʻy rayhon'],
      ['Tasnim', 'jannatdagi buloq'],
    ],
  },
  ru: {
    boy: [
      ['Зайд', 'рост, прибавление'],
      ['Анас', 'добрый спутник'],
      ['Амин', 'надёжный'],
      ['Хаким', 'мудрый'],
      ['Сабир', 'терпеливый'],
      ['Карим', 'щедрый'],
      ['Рашид', 'идущий верным путём'],
      ['Шакир', 'благодарный'],
      ['Райян', 'врата Рая для постящихся'],
      ['Салих', 'праведный'],
    ],
    girl: [
      ['Нур', 'свет'],
      ['Сафия', 'чистая'],
      ['Амина', 'надёжная'],
      ['Сакина', 'покой в сердце'],
      ['Сабира', 'терпеливая'],
      ['Шакира', 'благодарная'],
      ['Хидая', 'верный путь'],
      ['Мунира', 'сияющая'],
      ['Райхана', 'душистый базилик'],
      ['Тасним', 'источник в Раю'],
    ],
  },
};

export const NAME_LANGS = Object.keys(IDEAS) as NameLang[];

/** The names offered for a boy or a girl, in the app's language (English when there is no list for it). */
export function nameIdeas(lang: string, gender: Gender): NameIdea[] {
  const rows = (IDEAS[lang as NameLang] ?? IDEAS.en)[gender];
  return rows.map(([name, meaning]) => ({ name, meaning }));
}

/** The idea a typed name matches, whatever its capitals and outer spaces. */
export function matchIdea(ideas: NameIdea[], typed: string): NameIdea | undefined {
  const wanted = typed.trim().toLowerCase();
  return wanted ? ideas.find((idea) => idea.name.toLowerCase() === wanted) : undefined;
}
