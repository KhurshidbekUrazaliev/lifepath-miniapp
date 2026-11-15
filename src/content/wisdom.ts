// Hikmah: well-known proverbs, labelled by where they come from (none is presented as a hadith).
// Motivation: the companion's own words.

export interface Hikmah {
  id: string;
  from: 'ar' | 'uz' | 'common';
  ar?: string; // the Arabic original, for Arabic proverbs
  en: string;
  ru: string;
  uz: string;
}

export const HIKMAH: Hikmah[] = [
  { id: 'jadda', from: 'ar', ar: 'مَنْ جَدَّ وَجَدَ', en: 'Whoever strives, finds.', ru: 'Кто усердствует, тот находит.', uz: 'Kim harakat qilsa, topadi.' },
  { id: 'zaraa', from: 'ar', ar: 'مَنْ زَرَعَ حَصَدَ', en: 'Whoever sows, reaps.', ru: 'Кто сеет, тот пожинает.', uz: 'Kim eksa, oʻradi.' },
  { id: 'sabara', from: 'ar', ar: 'مَنْ صَبَرَ ظَفِرَ', en: 'Whoever is patient, wins in the end.', ru: 'Кто терпелив, тот побеждает.', uz: 'Kim sabr qilsa, zafar quchadi.' },
  { id: 'saara', from: 'ar', ar: 'مَنْ سَارَ عَلَى الدَّرْبِ وَصَلَ', en: 'Whoever keeps walking the path arrives.', ru: 'Кто идёт по пути, тот доходит.', uz: 'Kim yoʻldan yursa, manzilga yetadi.' },
  { id: 'naqsh', from: 'ar', ar: 'الْعِلْمُ فِي الصِّغَرِ كَالنَّقْشِ عَلَى الْحَجَرِ', en: 'Learning in youth is like engraving on stone.', ru: 'Знание в юности — как резьба по камню.', uz: 'Yoshlikda olingan ilm toshga oʻyilgan naqshdek.' },
  { id: 'sayf', from: 'ar', ar: 'الْوَقْتُ كَالسَّيْفِ إِنْ لَمْ تَقْطَعْهُ قَطَعَكَ', en: 'Time is like a sword: if you do not cut it, it cuts you.', ru: 'Время — как меч: если не разрубишь его ты, оно разрубит тебя.', uz: 'Vaqt qilichga oʻxshaydi: sen uni kesmasang, u seni kesadi.' },
  { id: 'awsat', from: 'ar', ar: 'خَيْرُ الْأُمُورِ أَوْسَطُهَا', en: 'The best of matters is the middle way.', ru: 'Лучшее в делах — середина.', uz: 'Ishlarning yaxshisi — oʻrtachasi.' },
  { id: 'faraj', from: 'ar', ar: 'الصَّبْرُ مِفْتَاحُ الْفَرَجِ', en: 'Patience is the key to relief.', ru: 'Терпение — ключ к облегчению.', uz: 'Sabr — kushoyish kaliti.' },
  { id: 'hasa', from: 'ar', ar: 'لَا تَحْقِرَنَّ صَغِيرَةً إِنَّ الْجِبَالَ مِنَ الْحَصَى', en: 'Never belittle a small thing: mountains are made of pebbles.', ru: 'Не пренебрегай малым: горы состоят из камешков.', uz: 'Kichik narsani mensimagin: togʻlar ham mayda toshlardan.' },
  { id: 'kulluhu', from: 'ar', ar: 'مَا لَا يُدْرَكُ كُلُّهُ لَا يُتْرَكُ جُلُّهُ', en: 'What cannot be done in full should not be left out in full.', ru: 'То, что нельзя сделать целиком, не оставляют целиком.', uz: 'Hammasini qilib boʻlmaydigan ishning hammasi tashlab qoʻyilmaydi.' },
  { id: 'ghayth', from: 'ar', ar: 'أَوَّلُ الْغَيْثِ قَطْرٌ ثُمَّ يَنْهَمِرُ', en: 'Rain begins with a single drop, then it pours.', ru: 'Ливень начинается с одной капли.', uz: 'Yomgʻir bir tomchidan boshlanadi, soʻng quyib beradi.' },
  { id: 'mujtahid', from: 'ar', ar: 'لِكُلِّ مُجْتَهِدٍ نَصِيبٌ', en: 'Everyone who works hard gets their share.', ru: 'Каждому усердному — своя доля.', uz: 'Har bir tirishqoqning nasibasi bor.' },
  { id: 'ula', from: 'ar', ar: 'مَنْ طَلَبَ الْعُلَا سَهِرَ اللَّيَالِي', en: 'Whoever seeks the heights stays up the nights.', ru: 'Кто стремится к высотам, тот не спит ночами.', uz: 'Kim yuksaklikni istasa, tunlarni bedor oʻtkazadi.' },
  { id: 'akh', from: 'ar', ar: 'رُبَّ أَخٍ لَكَ لَمْ تَلِدْهُ أُمُّكَ', en: 'Many a brother of yours was not born of your mother.', ru: 'Бывает брат, которого не родила тебе мать.', uz: 'Onang tugʻmagan qancha birodaring bor.' },
  { id: 'nur', from: 'ar', ar: 'الْعِلْمُ نُورٌ', en: 'Knowledge is light.', ru: 'Знание — свет.', uz: 'Ilm — nur.' },
  { id: 'oltin', from: 'uz', en: 'At the bottom of patience lies gold.', ru: 'На дне терпения — золото.', uz: 'Sabr tagi — sariq oltin.' },
  { id: 'qatra', from: 'uz', en: 'Learning bit by bit makes one wise; drop by drop a river is made.', ru: 'Понемногу учась, становятся мудрыми; капля за каплей собирается река.', uz: 'Oz-oz oʻrganib dono boʻlur, qatra-qatra yigʻilib daryo boʻlur.' },
  { id: 'rohat', from: 'uz', en: 'At the bottom of hard work lies rest.', ru: 'За трудом приходит отдых.', uz: 'Mehnatning tagi — rohat.' },
  { id: 'bugun', from: 'uz', en: 'Do not leave today’s work for tomorrow.', ru: 'Не откладывай сегодняшнее дело на завтра.', uz: 'Bugungi ishni ertaga qoldirma.' },
  { id: 'yetti', from: 'uz', en: 'Measure seven times, cut once.', ru: 'Семь раз отмерь, один раз отрежь.', uz: 'Yetti oʻlchab, bir kes.' },
  { id: 'igna', from: 'uz', en: 'Gaining knowledge is digging a well with a needle.', ru: 'Учиться — что колодец иголкой рыть.', uz: 'Ilm olish — igna bilan quduq qazish.' },
  { id: 'kol', from: 'uz', en: 'Drop by drop, a lake is made.', ru: 'По капле собирается озеро.', uz: 'Tomchi-tomchi koʻl boʻlur.' },
  { id: 'botir', from: 'uz', en: 'The eyes are afraid, but the hands get it done.', ru: 'Глаза боятся, а руки делают.', uz: 'Koʻz qoʻrqoq, qoʻl botir.' },
  { id: 'soz', from: 'uz', en: 'A kind word is food for the soul.', ru: 'Доброе слово — пища для души.', uz: 'Yaxshi soʻz — jon ozigʻi.' },
  { id: 'aql', from: 'uz', en: 'Wisdom is not in the years but in the head.', ru: 'Ум не в годах, а в голове.', uz: 'Aql yoshda emas, boshda.' },
  { id: 'dost', from: 'uz', en: 'A friend tells you bitter truths; an enemy makes you laugh.', ru: 'Друг говорит горькую правду, враг — смешит.', uz: 'Doʻst achitib gapirar, dushman — kuldirib.' },
  { id: 'birlash', from: 'uz', en: 'Those who stand together move ahead; those who don’t fall apart.', ru: 'Объединившиеся идут вперёд, разобщённые — рассыпаются.', uz: 'Birlashgan oʻzar, birlashmagan toʻzar.' },
  { id: 'ishlagan', from: 'uz', en: 'The one who works is the one who eats.', ru: 'Кто трудится, тот и ест.', uz: 'Ishlagan tishlar.' },
];

/** The companion's own encouragement. */
export interface Line {
  en: string;
  ru: string;
  uz: string;
}

export const MOTIVATION: Line[] = [
  { en: 'One small step today is still a step. Shall we take it together?', ru: 'Маленький шаг сегодня — всё равно шаг. Сделаем его вместе?', uz: 'Bugungi kichik qadam ham qadam. Birga qoʻyamizmi?' },
  { en: 'Starting small is still starting. Let’s begin.', ru: 'Начать с малого — всё равно начать. Поехали!', uz: 'Kichikdan boshlash ham boshlash. Qani, boshladik.' },
  { en: 'Five minutes counts. Five minutes every day changes everything.', ru: 'Пять минут — это уже что-то. Пять минут каждый день меняют всё.', uz: 'Besh daqiqa ham hisob. Har kuni besh daqiqa hamma narsani oʻzgartiradi.' },
  { en: 'Progress, not perfection. I’m proud of every bit.', ru: 'Прогресс, а не идеал. Я горжусь каждой мелочью.', uz: 'Mukammallik emas, oʻsish muhim. Har bir qadamingdan faxrlanaman.' },
  { en: 'Say Bismillah and begin. The rest gets easier.', ru: 'Скажи «Бисмиллях» и начни. Дальше будет легче.', uz: 'Bismilloh deb boshla. Qolgani osonlashadi.' },
  { en: 'Missed a day? That’s fine. Today is a fresh page.', ru: 'Пропустил день? Ничего страшного. Сегодня — чистая страница.', uz: 'Bir kun oʻtkazib yubordingmi? Hechqisi yoʻq. Bugun — yangi sahifa.' },
  { en: 'Your future self is watching. Let’s make them smile.', ru: 'Твоё будущее «я» смотрит на тебя. Давай порадуем его.', uz: 'Kelajakdagi sen bugungi seni kuzatyapti. Uni xursand qilaylik.' },
  { en: 'Big goals are just small tasks in a row.', ru: 'Большие цели — это просто маленькие дела подряд.', uz: 'Katta maqsadlar — ketma-ket kichik ishlar xolos.' },
  { en: 'Rest if you must, but don’t quit.', ru: 'Отдохни, если нужно, но не сдавайся.', uz: 'Kerak boʻlsa dam ol, lekin taslim boʻlma.' },
  { en: 'Every page you read is a seed. I can’t wait to see the garden.', ru: 'Каждая прочитанная страница — семечко. Не терпится увидеть сад.', uz: 'Oʻqigan har bir sahifang — urugʻ. Bogʻni koʻrishga shoshyapman.' },
  { en: 'Discipline is choosing what you want most over what you want now.', ru: 'Дисциплина — это выбор того, чего хочешь больше всего, вместо того, чего хочешь сейчас.', uz: 'Intizom — hozir xohlagan narsang oʻrniga eng koʻp xohlagan narsangni tanlash.' },
  { en: 'Do your part, then trust Allah with the rest.', ru: 'Сделай свою часть, а остальное доверь Аллаху.', uz: 'Oʻz ishingni qil, qolganini Allohga topshir.' },
  { en: 'The hardest part is opening the book. You’ve got this.', ru: 'Самое трудное — открыть книгу. У тебя получится.', uz: 'Eng qiyini — kitobni ochish. Sen uddalaysan.' },
  { en: 'Slow is fine. Stopped is the only thing we avoid.', ru: 'Медленно — это нормально. Мы избегаем только остановки.', uz: 'Sekin boʻlsa ham mayli. Faqat toʻxtab qolmaylik.' },
  { en: 'Today’s effort is tomorrow’s ease.', ru: 'Сегодняшнее усилие — завтрашняя лёгкость.', uz: 'Bugungi mehnat — ertangi osonlik.' },
  { en: 'Let’s finish one thing before we start another.', ru: 'Давай закончим одно, прежде чем браться за другое.', uz: 'Boshqasini boshlashdan oldin bittasini tugataylik.' },
  { en: 'A streak is just today, done again.', ru: 'Серия — это просто сегодняшний день, повторённый снова.', uz: 'Ketma-ketlik — bu shunchaki takrorlangan bugun.' },
  { en: 'When it feels heavy, make the step smaller, not the dream.', ru: 'Когда тяжело, уменьшай шаг, а не мечту.', uz: 'Ogʻir tuyulsa, orzuni emas, qadamni kichraytir.' },
  { en: 'Gratitude turns what we have into enough. Alhamdulillah.', ru: 'Благодарность превращает то, что есть, в достаточное. Альхамдулиллях.', uz: 'Shukr bor narsani yetarli qiladi. Alhamdulilloh.' },
  { en: 'Pray first, plan second, act third.', ru: 'Сначала молитва, потом план, потом дело.', uz: 'Avval duo, keyin reja, soʻng amal.' },
];
