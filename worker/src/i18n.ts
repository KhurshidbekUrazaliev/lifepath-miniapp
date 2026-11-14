// Everything the bot says, in English, Uzbek (Latin) and Russian.
import type { Lang } from './env';

/** Maps a Telegram language_code to a language the bot speaks; English when it is neither Uzbek nor Russian. */
export function pickLang(code: string | null | undefined): Lang {
  const c = (code ?? '').toLowerCase();
  return c.startsWith('uz') ? 'uz' : c.startsWith('ru') ? 'ru' : 'en';
}

export interface BotText {
  /** Label of the button that opens the Mini App. */
  open: string;
  start(name: string): string;
  help: string;
  /** `contact` is SUPPORT_CONTACT and may be empty. */
  paysupport(contact: string): string;
  terms: string;
  thanks(date: string): string;
  invoiceInvalid: string;
  alreadyPlus: string;
  invoiceDescription: string;
  /** Shown in the bot's command menu. */
  commands: { start: string; help: string; paysupport: string; terms: string };
  /** Shown in an empty chat with the bot (at most 512 characters). */
  description: string;
  /** Shown on the bot's profile and in shared links (at most 120 characters). */
  shortDescription: string;
}

export const TEXT: Record<Lang, BotText> = {
  en: {
    open: 'Open LifePath',
    start: (name) =>
      `Hi${name ? `, ${name}` : ''}! Welcome to LifePath.\n\n` +
      'Plan your goals, build habits and track your progress, one small step at a time. Tap the button below to begin.',
    help:
      'LifePath helps you plan goals, build habits and track your progress.\n\n' +
      'Open the app with the button below. Reminders you set in the app arrive in this chat.\n\n' +
      '/paysupport – payment help\n/terms – terms of use',
    paysupport: (contact) =>
      'LifePath Plus is paid for with Telegram Stars.\n\n' +
      'If something went wrong with a payment or you would like a refund, ' +
      (contact ? `write to us: ${contact}. ` : "write to the developer named in this bot's profile. ") +
      'Refunds go back to your Telegram Stars balance.\n\n' +
      'Telegram support cannot help with purchases made in this bot.',
    terms:
      'LifePath terms of use\n\n' +
      '1. LifePath is free. LifePath Plus is an optional subscription paid for with Telegram Stars.\n' +
      '2. Plus renews every 30 days until you cancel it in Telegram (Settings → My Stars). After you cancel, Plus stays active until the end of the paid period.\n' +
      '3. For payment questions and refunds, send /paysupport.\n' +
      '4. We store only what the app needs: your Telegram ID, name, language and time zone, the reminders you set, your score and, if you join the rankings, the name and country you choose.\n' +
      '5. LifePath is provided as is, without warranties.',
    thanks: (date) => `Thank you! LifePath Plus is active until ${date}.`,
    invoiceInvalid: 'This invoice is no longer valid. Open LifePath and try again.',
    alreadyPlus: 'LifePath Plus is already active on your account.',
    invoiceDescription: 'All LifePath Plus features. Renews every 30 days, cancel any time.',
    commands: { start: 'Open LifePath', help: 'Help', paysupport: 'Payment help', terms: 'Terms of use' },
    description:
      'LifePath helps you plan your goals, build habits, track your progress and grow, one small step at a time.',
    shortDescription: 'Plan goals, build habits, track progress and grow.',
  },

  uz: {
    open: 'LifePath ilovasini ochish',
    start: (name) =>
      `Assalomu alaykum${name ? `, ${name}` : ''}! LifePath ilovasiga xush kelibsiz.\n\n` +
      'Maqsadlaringizni rejalashtiring, foydali odatlar shakllantiring va natijalaringizni kuzatib boring. Boshlash uchun quyidagi tugmani bosing.',
    help:
      'LifePath maqsadlarni rejalashtirish, odatlar shakllantirish va natijalarni kuzatib borishga yordam beradi.\n\n' +
      'Ilovani quyidagi tugma orqali oching. Ilovada belgilagan eslatmalaringiz shu chatga keladi.\n\n' +
      '/paysupport – toʻlov boʻyicha yordam\n/terms – foydalanish shartlari',
    paysupport: (contact) =>
      'LifePath Plus uchun toʻlov Telegram Stars orqali qilinadi.\n\n' +
      'Toʻlovda muammo chiqsa yoki toʻlovni qaytarmoqchi boʻlsangiz, ' +
      (contact ? `bizga yozing: ${contact}. ` : 'bot profilida koʻrsatilgan ishlab chiquvchiga yozing. ') +
      'Qaytarilgan yulduzlar Telegram Stars balansingizga tushadi.\n\n' +
      'Telegram qoʻllab-quvvatlash xizmati bu botdagi xaridlar boʻyicha yordam bera olmaydi.',
    terms:
      'LifePath foydalanish shartlari\n\n' +
      '1. LifePath bepul. LifePath Plus – Telegram Stars orqali toʻlanadigan ixtiyoriy obuna.\n' +
      '2. Plus obunasi Telegram sozlamalarining yulduzlar (Stars) boʻlimida bekor qilinmaguncha har 30 kunda yangilanadi. Bekor qilganingizdan keyin Plus toʻlangan muddat oxirigacha ishlaydi.\n' +
      '3. Toʻlov va uni qaytarish boʻyicha savollar uchun /paysupport buyrugʻini yuboring.\n' +
      '4. Biz faqat ilova ishlashi uchun zarur maʼlumotlarni saqlaymiz: Telegram ID, ism, til va vaqt mintaqangiz, siz belgilagan eslatmalar, ballaringiz hamda reytingga qoʻshilsangiz, oʻzingiz tanlagan ism va davlat.\n' +
      '5. LifePath «qanday boʻlsa, shunday» holatda, kafolatlarsiz taqdim etiladi.',
    thanks: (date) => `Rahmat! LifePath Plus ${date}gacha faol.`,
    invoiceInvalid: 'Bu toʻlov havolasi yaroqsiz. LifePath ilovasini ochib, qaytadan urinib koʻring.',
    alreadyPlus: 'LifePath Plus sizda allaqachon faol.',
    invoiceDescription:
      'LifePath Plus imkoniyatlarining barchasi. Har 30 kunda yangilanadi, istalgan vaqtda bekor qilish mumkin.',
    commands: {
      start: 'LifePath ilovasini ochish',
      help: 'Yordam',
      paysupport: 'Toʻlov boʻyicha yordam',
      terms: 'Foydalanish shartlari',
    },
    description:
      'LifePath bilan maqsadlaringizni rejalashtiring, foydali odatlar shakllantiring, natijalaringizni kuzating va har kuni bir qadam oʻsing.',
    shortDescription: 'Maqsadlarni rejalashtiring, odatlar shakllantiring, natijalarni kuzating va oʻsing.',
  },

  ru: {
    open: 'Открыть LifePath',
    start: (name) =>
      `Здравствуйте${name ? `, ${name}` : ''}! Добро пожаловать в LifePath.\n\n` +
      'Планируйте цели, формируйте привычки и следите за прогрессом — шаг за шагом. Нажмите кнопку ниже, чтобы начать.',
    help:
      'LifePath помогает планировать цели, формировать привычки и следить за прогрессом.\n\n' +
      'Откройте приложение кнопкой ниже. Напоминания, которые вы настроите в приложении, будут приходить в этот чат.\n\n' +
      '/paysupport – помощь с оплатой\n/terms – условия использования',
    paysupport: (contact) =>
      'LifePath Plus оплачивается звёздами Telegram (Telegram Stars).\n\n' +
      'Если с оплатой что-то пошло не так или вы хотите вернуть платёж, ' +
      (contact ? `напишите нам: ${contact}. ` : 'напишите разработчику, указанному в профиле бота. ') +
      'Возврат поступит на ваш баланс звёзд в Telegram.\n\n' +
      'Поддержка Telegram не помогает с покупками, сделанными в этом боте.',
    terms:
      'Условия использования LifePath\n\n' +
      '1. LifePath бесплатен. LifePath Plus — необязательная подписка, которая оплачивается звёздами Telegram.\n' +
      '2. Подписка Plus продлевается каждые 30 дней, пока вы не отмените её в Telegram (Настройки → Мои звёзды). После отмены Plus действует до конца оплаченного периода.\n' +
      '3. По вопросам оплаты и возврата отправьте команду /paysupport.\n' +
      '4. Мы храним только то, что нужно для работы приложения: ваш Telegram ID, имя, язык и часовой пояс, созданные вами напоминания, ваши очки, а если вы участвуете в рейтинге — выбранные вами имя и страну.\n' +
      '5. LifePath предоставляется «как есть», без гарантий.',
    thanks: (date) => `Спасибо! LifePath Plus активен до ${date}.`,
    invoiceInvalid: 'Этот счёт недействителен. Откройте LifePath и попробуйте ещё раз.',
    alreadyPlus: 'LifePath Plus уже активен в вашем аккаунте.',
    invoiceDescription: 'Все возможности LifePath Plus. Продлевается каждые 30 дней, отменить можно в любой момент.',
    commands: {
      start: 'Открыть LifePath',
      help: 'Помощь',
      paysupport: 'Помощь с оплатой',
      terms: 'Условия использования',
    },
    description:
      'LifePath помогает планировать цели, формировать привычки, следить за прогрессом и расти — шаг за шагом.',
    shortDescription: 'Планируйте цели, формируйте привычки, следите за прогрессом и растите.',
  },
};

// The Workers runtime has no Uzbek locale data, so dates are spelled out here instead of with Intl.
const MONTHS: Record<Lang, readonly string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};

/** "December 14, 2026", "2026-yil 14-dekabr" or "14 декабря 2026 г.". */
export function formatDate(lang: Lang, date: { year: number; month: number; day: number }): string {
  const month = MONTHS[lang][date.month - 1] ?? '';
  if (lang === 'uz') return `${date.year}-yil ${date.day}-${month}`;
  if (lang === 'ru') return `${date.day} ${month} ${date.year} г.`;
  return `${month} ${date.day}, ${date.year}`;
}
