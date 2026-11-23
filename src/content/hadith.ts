// The 180 hadith the companion quotes: the first 40 from Sahih al-Bukhari, then 140 more from Sahih
// al-Bukhari and Sahih Muslim. One of them is the hadith of the day (hadithOfDay), the same for
// everyone on a day in Busan; the Hadis chip picks among all of them.
//
// `en` and `ru` are shortened from the translations in the hadith-api collection (Muhsin Khan and
// Abdul Hamid Siddiqui; the Russian editions there), keeping the Prophet's ﷺ words; where that
// collection has no Russian, the Russian is written from the Arabic and English. There is no Uzbek
// edition, so `uz` is an AI translation and the app labels it that way (as the IlmulHaq bot does).
// The full texts, Arabic included, are in hadith-full.json (written by scripts/fetch-content.mjs).
//
// Numbers: Bukhari as on sunnah.com. For Muslim, `n` is the hadith-api number (the key of its full
// text), `no` the usual number people cite, and `ref` the book and hadith on sunnah.com.

export type HadithTag =
  | 'habit' | 'intention' | 'ease' | 'time' | 'dhikr' | 'quran' | 'knowledge' | 'prayer' | 'night'
  | 'ramadan' | 'work' | 'character' | 'mercy' | 'charity' | 'patience' | 'gratitude' | 'speech'
  | 'friends' | 'faith';

export interface Hadith {
  n: number;
  /** Missing for Sahih al-Bukhari. */
  book?: 'muslim';
  no?: string;
  ref?: [number, number];
  tags: HadithTag[];
  en: string;
  ru: string;
  uz: string;
}

type Lang = 'en' | 'ru' | 'uz';

export const HADITH_BOOKS = {
  bukhari: { en: 'Sahih al-Bukhari', ru: 'Сахих аль-Бухари', uz: 'Sahih al-Buxoriy' },
  muslim: { en: 'Sahih Muslim', ru: 'Сахих Муслим', uz: 'Sahih Muslim' },
} as const;
export const HADITH_BOOK = HADITH_BOOKS.bukhari;
export const hadithLink = (n: number): string => `https://sunnah.com/bukhari:${n}`;

/** "6464" for Bukhari, "muslim:6592" for Muslim: the key of its full text and its advice key after "hadith:". */
export const hadithId = (h: Pick<Hadith, 'n' | 'book'>): string => (h.book ? `${h.book}:${h.n}` : String(h.n));

/** "Sahih Muslim 2588" */
export const hadithSource = (h: Hadith, lang: Lang): string => `${HADITH_BOOKS[h.book ?? 'bukhari'][lang]} ${h.no ?? h.n}`;

export function hadithUrl(h: Hadith): string {
  if (h.book === 'muslim' && h.ref) return `https://sunnah.com/muslim/${h.ref[0] || 'introduction'}/${h.ref[1]}`;
  return hadithLink(h.n);
}

/** The hadith with this id ("6464" or "muslim:6592"), if it is one of the list's. */
export function findHadith(id: string): Hadith | undefined {
  return HADITHS.find((h) => hadithId(h) === id);
}

/** Busan's time zone: the day's hadith changes at midnight there. */
const KST_MS = 9 * 3_600_000;

/** The hadith of the day: the list in order, one a day, starting again after the last. */
export function hadithOfDay(now: number = Date.now()): Hadith {
  const day = Math.floor((now + KST_MS) / 86_400_000);
  return HADITHS[day % HADITHS.length];
}

export const HADITHS: Hadith[] = [
  {
    n: 1, tags: ['intention'],
    en: 'The reward of deeds depends upon the intentions, and every person will get the reward according to what he has intended.',
    ru: 'Поистине, дела оцениваются только по намерениям, и каждому человеку достанется лишь то, что он намеревался обрести.',
    uz: 'Albatta, amallar niyatlarga koʻradir va har bir kishiga faqat niyat qilgan narsasi boʻladi.',
  },
  {
    n: 6464, tags: ['habit'],
    en: 'The most beloved deed to Allah is the most regular and constant, even if it were little.',
    ru: 'Самое любимое дело для Аллаха — то, что совершается с наибольшим постоянством, даже если его мало.',
    uz: 'Allohga eng sevimli amal — oz boʻlsa ham, eng doimiy qilinadiganidir.',
  },
  {
    n: 6465, tags: ['habit', 'ease'],
    en: 'The deeds most loved by Allah are the most regular and constant, even though they may be few. Take upon yourselves only the deeds within your ability.',
    ru: 'Самые любимые Аллахом деяния — самые постоянные, даже если их немного. Берите на себя только те дела, которые вам по силам.',
    uz: 'Allohga eng suyukli amallar — oz boʻlsa ham, eng doimiy boʻlganlaridir. Faqat kuchingiz yetadigan amallarni zimmangizga oling.',
  },
  {
    n: 39, tags: ['ease', 'habit'],
    en: 'Religion is very easy, and whoever overburdens himself in his religion will not be able to continue in that way. So do not be extremists, but try to be near to perfection, and receive the good tidings that you will be rewarded.',
    ru: 'Поистине, религия эта легка, но если кто-нибудь начинает бороться с ней, она неизменно побеждает его. Так придерживайтесь же правильного, приближайтесь к совершенству и радуйтесь.',
    uz: 'Albatta, din osondir. Kim dinda oʻziga ortiqcha ogʻirlik yuklasa, din uni yengib qoʻyadi. Bas, toʻgʻri yoʻlni tuting, kamolotga yaqinlashing va xushxabar oling.',
  },
  {
    n: 6412, tags: ['time', 'gratitude'],
    en: 'There are two blessings that many people are deceived into losing: health and free time.',
    ru: 'Многие люди обделены двумя милостями: здоровьем и свободным временем.',
    uz: 'Ikki neʼmat borki, koʻp odamlar ularda aldanib qoladi: sogʻlik va boʻsh vaqt.',
  },
  {
    n: 6416, tags: ['time'],
    en: 'Be in this world as if you were a stranger or a traveler.',
    ru: 'Будь в этом мире таким, будто ты чужеземец или путник.',
    uz: 'Dunyoda xuddi bir gʻarib yoki yoʻlovchidek boʻl.',
  },
  {
    n: 6114, tags: ['character', 'patience'],
    en: 'The strong is not the one who overcomes people by his strength, but the strong is the one who controls himself while in anger.',
    ru: 'Не тот силён, кто побеждает часто; силён лишь тот, кто способен владеть собой в гневе.',
    uz: 'Kuchli kishi — kurashda odamlarni yengadigan emas, balki gʻazab chogʻida oʻzini tuta biladigan kishidir.',
  },
  {
    n: 6116, tags: ['character', 'patience'],
    en: 'A man asked the Prophet ﷺ for advice. He said: “Do not become angry.” The man asked again and again, and each time he said: “Do not become angry.”',
    ru: 'Один человек попросил Пророка ﷺ: «Дай мне совет». Он сказал: «Не гневайся». Тот несколько раз повторил просьбу, и каждый раз он говорил: «Не гневайся».',
    uz: 'Bir kishi Paygʻambar ﷺ dan: «Menga nasihat qiling», dedi. U zot: «Gʻazablanma», dedilar. U kishi bir necha bor soʻradi, u zot har safar: «Gʻazablanma», dedilar.',
  },
  {
    n: 6407, tags: ['dhikr'],
    en: 'The example of the one who remembers his Lord and the one who does not is that of the living and the dead.',
    ru: 'Поминающий своего Господа и не поминающий своего Господа подобны живому и мёртвому.',
    uz: 'Robbini zikr qiluvchi bilan zikr qilmaydiganning misoli tirik bilan oʻlikning misolidir.',
  },
  {
    n: 7563, tags: ['dhikr'],
    en: 'Two words are dear to the Most Merciful, light on the tongue and heavy on the scale: “Subhan Allahi wa bihamdihi, Subhan Allahil-ʿAzim.”',
    ru: 'Есть два слова, которые любит Всемилостивый: они легки для языка, но тяжелы на Весах: «Субхана-Ллахи ва бихамдихи, субхана-Ллахиль-‘Азым».',
    uz: 'Ikki kalima borki, Rahmonga suyukli, tilga yengil, tarozida ogʻir: «Subhanallohi va bihamdihi, subhanallohil-azim».',
  },
  {
    n: 6405, tags: ['dhikr'],
    en: 'Whoever says “Subhan Allahi wa bihamdihi” one hundred times a day will be forgiven all his sins, even if they were as much as the foam of the sea.',
    ru: 'С того, кто по сто раз в день говорит «Субхана-Ллахи ва бихамдихи», будут сняты его грехи, даже если они подобны морской пене.',
    uz: 'Kim kuniga yuz marta «Subhanallohi va bihamdihi» desa, gunohlari dengiz koʻpigicha boʻlsa ham kechiriladi.',
  },
  {
    n: 6307, tags: ['dhikr'],
    en: 'By Allah, I ask Allah for forgiveness and turn to Him in repentance more than seventy times a day.',
    ru: 'Клянусь Аллахом, я прошу Аллаха о прощении и приношу Ему покаяние более семидесяти раз в день.',
    uz: 'Allohga qasamki, men kuniga yetmish martadan koʻp Allohdan magʻfirat soʻrayman va Unga tavba qilaman.',
  },
  {
    n: 7405, tags: ['dhikr', 'faith'],
    en: 'Allah says: “I am as My servant thinks I am, and I am with him when he remembers Me. If he comes a span nearer to Me, I go a cubit nearer to him; if he comes a cubit nearer to Me, I go an arm’s length nearer to him; and if he comes to Me walking, I go to him running.”',
    ru: 'Аллах Всевышний говорит: «Я буду таким, каким считает Меня раб Мой, и Я с ним, когда он поминает Меня. Если раб приблизится ко Мне на пядь, Я приближусь к нему на локоть; если он приблизится ко Мне на локоть, Я приближусь к нему на сажень; а если он направится ко Мне шагом, Я брошусь к нему бегом».',
    uz: 'Alloh taolo aytadi: «Men bandamning Men haqimdagi gumoni oldidaman. U Meni zikr qilganda, Men u bilan birgaman. Agar u Menga bir qarich yaqinlashsa, Men unga bir tirsak yaqinlashaman; agar u Menga bir tirsak yaqinlashsa, Men unga bir quloch yaqinlashaman; agar u Menga yurib kelsa, Men unga yugurib boraman».',
  },
  {
    n: 5027, tags: ['quran', 'knowledge'],
    en: 'The best among you are those who learn the Qur’an and teach it.',
    ru: 'Лучший из вас тот, кто изучает Коран и учит ему других.',
    uz: 'Sizlarning eng yaxshingiz Qurʼonni oʻrgangan va uni oʻrgatganingizdir.',
  },
  {
    n: 4937, tags: ['quran', 'patience'],
    en: 'The one who recites the Qur’an and masters it will be with the noble righteous scribes, and the one who recites it with great difficulty will have a double reward.',
    ru: 'Читающий Коран и знающий его будет с благородными и покорными писцами-ангелами, а тому, кто читает Коран, запинаясь и испытывая затруднения, уготована двойная награда.',
    uz: 'Qurʼonni mohirlik bilan oʻqiydigan kishi ulugʻ va itoatli farishtalar bilan birga boʻladi. Qurʼonni qiynalib, duduqlanib oʻqiydigan kishiga esa ikki hissa ajr bor.',
  },
  {
    n: 5009, tags: ['quran', 'night'],
    en: 'Whoever recites the last two verses of Surat Al-Baqara at night, they will be sufficient for him.',
    ru: 'Кто в течение ночи прочитает два последних аята из суры «аль-Бакара», тому их будет достаточно.',
    uz: 'Kim kechasi Baqara surasining oxirgi ikki oyatini oʻqisa, ular unga kifoya qiladi.',
  },
  {
    n: 71, tags: ['knowledge'],
    en: 'If Allah wants good for a person, He gives him understanding of the religion.',
    ru: 'Аллах приводит к пониманию религии того, кому желает блага.',
    uz: 'Alloh kimga yaxshilikni iroda qilsa, uni dinda tushunchali qiladi.',
  },
  {
    n: 528, tags: ['prayer'],
    en: 'If there was a river at the door of one of you and he bathed in it five times a day, would any dirt remain on him? That is the example of the five prayers, with which Allah wipes away sins.',
    ru: 'Если бы у дверей кого-нибудь из вас протекала река и он купался в ней по пять раз ежедневно, осталась бы на нём грязь? Это подобно пяти молитвам, посредством которых Аллах стирает прегрешения.',
    uz: 'Agar birortangizning eshigi oldida daryo oqib tursa va u kuniga besh marta unda yuvinsa, unda kirdan biror narsa qolarmidi? Besh vaqt namoz ham shunday: Alloh ular sababli gunohlarni oʻchiradi.',
  },
  {
    n: 645, tags: ['prayer', 'friends'],
    en: 'Prayer in congregation is twenty-seven times superior to prayer offered alone.',
    ru: 'Общая молитва превосходит индивидуальную в двадцать семь раз.',
    uz: 'Jamoat bilan oʻqilgan namoz yolgʻiz oʻqilgan namozdan yigirma yetti daraja afzaldir.',
  },
  {
    n: 1145, tags: ['night', 'dhikr'],
    en: 'Every night, when the last third of the night remains, our Lord descends to the nearest heaven and says: “Is there anyone who calls upon Me, so that I may answer? Anyone who asks Me, so that I may give? Anyone who seeks My forgiveness, so that I may forgive?”',
    ru: 'С наступлением последней трети каждой ночи наш Господь нисходит к нижнему небу, говоря: «Кто станет обращаться ко Мне с мольбами, чтобы Я ответил ему? Кто станет просить Меня, чтобы Я даровал ему? Кто станет молить Меня о прощении, чтобы Я простил его?»',
    uz: 'Har kecha, tunning oxirgi uchdan biri qolganda, Robbimiz dunyo osmoniga tushib: «Kim Menga duo qilsa, ijobat qilay? Kim Mendan soʻrasa, beray? Kim Mendan magʻfirat soʻrasa, kechiray?» deydi.',
  },
  {
    n: 38, tags: ['ramadan'],
    en: 'Whoever fasts during Ramadan out of sincere faith and hoping for Allah’s reward will have all his past sins forgiven.',
    ru: 'Тому, кто во время рамадана будет поститься с верой и надеждой на награду Аллаха, простятся его прежние грехи.',
    uz: 'Kim Ramazon roʻzasini iymon bilan va savobini Allohdan umid qilib tutsa, oʻtgan gunohlari kechiriladi.',
  },
  {
    n: 1901, tags: ['ramadan', 'night'],
    en: 'Whoever stands in prayer on the Night of Qadr out of sincere faith and hoping for a reward from Allah will have all his previous sins forgiven.',
    ru: 'Тому, кто выстаивал Ночь предопределения с верой и надеждой на награду от Аллаха, простятся его прошлые прегрешения.',
    uz: 'Kim Qadr kechasini iymon bilan va savobini Allohdan umid qilib ibodatda oʻtkazsa, oʻtgan gunohlari kechiriladi.',
  },
  {
    n: 1903, tags: ['ramadan', 'speech'],
    en: 'Whoever does not give up false speech and acting on it, Allah has no need of his giving up his food and drink.',
    ru: 'Если человек не прекратит лгать и поступать по лжи, Аллаху не нужно, чтобы он отказывался от еды и питья.',
    uz: 'Kim yolgʻon soʻzni va unga amal qilishni tark etmasa, uning yeb-ichishni tark qilishiga Allohning hojati yoʻq.',
  },
  {
    n: 2072, tags: ['work'],
    en: 'Nobody has ever eaten a better meal than what he earned by working with his own hands. The Prophet of Allah, David, used to eat from the earnings of his own labor.',
    ru: 'Никто и никогда не ел ничего лучше той еды, которую заработал трудом своих рук. И пророк Аллаха Дауд питался тем, что зарабатывал трудом своих рук.',
    uz: 'Hech kim oʻz qoʻli mehnati bilan topganidan yaxshiroq taom yemagan. Allohning paygʻambari Dovud alayhissalom ham oʻz qoʻli mehnatidan yer edilar.',
  },
  {
    n: 13, tags: ['friends', 'character'],
    en: 'None of you will have faith till he wishes for his brother what he likes for himself.',
    ru: 'Не уверует никто из вас до тех пор, пока не станет желать своему брату того же, чего желает самому себе.',
    uz: 'Sizlardan birortangiz oʻzi uchun yaxshi koʻrgan narsani birodari uchun ham yaxshi koʻrmaguncha (komil) moʻmin boʻlmaydi.',
  },
  {
    n: 6011, tags: ['friends', 'mercy'],
    en: 'You see the believers in their mercy, love and kindness toward one another like one body: if any part of it is unwell, the whole body shares the sleeplessness and fever.',
    ru: 'В своём милосердии, любви и сочувствии друг к другу верующие подобны единому телу: когда болеет одна его часть, всё тело отзывается бессонницей и жаром.',
    uz: 'Moʻminlarni bir-birlariga rahm-shafqat, muhabbat va mehribonlik qilishda bir tanaga oʻxshaganini koʻrasan: agar uning bir aʼzosi ogʻrisa, butun tana bedorlik va isitma bilan unga hamdard boʻladi.',
  },
  {
    n: 6014, tags: ['character', 'mercy'],
    en: 'Gabriel kept advising me about treating neighbors kindly so much that I thought he would make them my heirs.',
    ru: 'Джибрил так долго наставлял меня о хорошем отношении к соседу, что я даже подумал, что он включит его в число наследников.',
    uz: 'Jabroil menga qoʻshni haqida shunchalik koʻp tavsiya qildiki, hatto uni merosxoʻr qilib qoʻyadi, deb oʻyladim.',
  },
  {
    n: 6018, tags: ['speech', 'character'],
    en: 'Whoever believes in Allah and the Last Day should not harm his neighbor, should honor his guest, and should speak good or keep silent.',
    ru: 'Пусть тот, кто верует в Аллаха и в Последний день, не причиняет вреда соседу, оказывает уважение гостю и говорит благое или молчит.',
    uz: 'Kim Allohga va oxirat kuniga iymon keltirsa, qoʻshnisiga ozor bermasin, mehmonini hurmat qilsin va yaxshi gap gapirsin yoki jim tursin.',
  },
  {
    n: 6021, tags: ['charity'],
    en: 'Every good deed is a charity.',
    ru: 'Всякое одобряемое дело есть садака.',
    uz: 'Har bir yaxshilik sadaqadir.',
  },
  {
    n: 1417, tags: ['charity'],
    en: 'Protect yourselves from the Fire, even with half a date given in charity.',
    ru: 'Защитите себя от Огня хотя бы половинкой финика.',
    uz: 'Yarimta xurmo sadaqasi bilan boʻlsa ham doʻzaxdan saqlaninglar.',
  },
  {
    n: 6035, tags: ['character'],
    en: 'The best among you are those with the best character.',
    ru: 'Поистине, наилучший из вас — обладающий наилучшими нравственными качествами.',
    uz: 'Sizlarning eng yaxshingiz — xulqi eng goʻzalingizdir.',
  },
  {
    n: 6094, tags: ['speech', 'character'],
    en: 'Truthfulness leads to righteousness, and righteousness leads to Paradise. A man keeps telling the truth until he becomes a truthful person.',
    ru: 'Поистине, правдивость приводит к благочестию, а благочестие приводит к раю, и будет человек говорить правду, пока не станет правдивейшим.',
    uz: 'Albatta, rostgoʻylik yaxshilikka, yaxshilik esa jannatga yetaklaydi. Kishi rost gapiraveradi, hatto siddiq — oʻta rostgoʻy boʻlib qoladi.',
  },
  {
    n: 6064, tags: ['character', 'friends'],
    en: 'Beware of suspicion, for suspicion is the worst of false tales. Do not spy on one another, do not envy one another, do not turn your backs on one another, and do not hate one another. Be brothers, O servants of Allah!',
    ru: 'Остерегайтесь дурных мыслей о людях, ибо дурные мысли — самые лживые слова! Не шпионьте, не завидуйте друг другу, не поворачивайтесь спиной друг к другу, не питайте ненависти и будьте братьями, о рабы Аллаха!',
    uz: 'Gumondan saqlaninglar, chunki gumon — eng yolgʻon soʻzdir. Bir-biringizning aybini qidirmanglar, josuslik qilmanglar, hasad qilmanglar, bir-biringizdan yuz oʻgirmanglar, adovat qilmanglar. Ey Allohning bandalari, birodar boʻlinglar!',
  },
  {
    n: 69, tags: ['ease', 'friends'],
    en: 'Make things easy for people and do not make them hard; give them good tidings and do not drive them away.',
    ru: 'Облегчайте, а не создавайте затруднения; радуйте людей добрыми вестями, а не отталкивайте их.',
    uz: 'Osonlashtiringlar, qiyinlashtirmanglar; xushxabar beringlar, nafratlantirmanglar.',
  },
  {
    n: 5641, tags: ['patience'],
    en: 'No fatigue, disease, sorrow, sadness, hurt or distress befalls a Muslim, not even the prick of a thorn, but Allah expiates some of his sins because of it.',
    ru: 'Что бы ни постигло мусульманина — утомление, болезнь, тревога, печаль, неприятность, скорбь или даже укол колючки, — Аллах непременно простит ему за это что-нибудь из его грехов.',
    uz: 'Musulmonga yetadigan har qanday charchoq, kasallik, gʻam, qaygʻu, ozor va tashvish, hatto oyogʻiga kirgan tikan ham, albatta, Alloh u sababli uning gunohlaridan bir qismini kechiradi.',
  },
  {
    n: 6490, tags: ['gratitude'],
    en: 'If one of you looks at someone given more wealth and better looks, let him also look at the one below him.',
    ru: 'Если кто-нибудь из вас посмотрит на того, кому даровано больше богатства и красоты, пусть посмотрит и на того, кто ниже его.',
    uz: 'Agar birortangiz mol-dunyo va qiyofada oʻzidan ustun qilingan kishiga qarasa, oʻzidan pastroqdagi kishiga ham qarasin.',
  },
  {
    n: 6514, tags: ['time', 'intention'],
    en: 'Three follow the dead: his family, his wealth and his deeds. Two return, and one remains: his deeds.',
    ru: 'За покойным последуют трое: семья, имущество и дела. Двое вернутся, а останутся с ним его дела.',
    uz: 'Mayyitning ortidan uch narsa boradi: ahli, moli va amali. Ikkisi qaytadi, biri qoladi: amali qoladi.',
  },
  {
    n: 7376, tags: ['mercy'],
    en: 'Allah will not be merciful to those who are not merciful to people.',
    ru: 'Не помилует Аллах того, кто сам не проявляет милосердия к людям.',
    uz: 'Kim odamlarga rahm qilmasa, Alloh unga rahm qilmaydi.',
  },
  {
    n: 8, tags: ['faith', 'prayer'],
    en: 'Islam is built on five: testifying that there is no god but Allah and that Muhammad is the Messenger of Allah, establishing prayer, paying zakat, Hajj, and fasting in Ramadan.',
    ru: 'Ислам основывается на пяти столпах: свидетельстве о том, что нет божества, кроме Аллаха, и что Мухаммад — посланник Аллаха, совершении молитвы, выплате закята, хадже и посте в рамадан.',
    uz: 'Islom besh narsa ustiga qurilgan: Allohdan oʻzga iloh yoʻq va Muhammad Allohning Rasuli ekaniga guvohlik berish, namozni toʻkis ado etish, zakot berish, haj qilish va Ramazon roʻzasini tutish.',
  },
  {
    n: 16, tags: ['faith', 'friends'],
    en: 'Whoever has three qualities will taste the sweetness of faith: Allah and His Messenger are dearer to him than anything else; he loves a person only for Allah’s sake; and he hates to return to disbelief as he hates to be thrown into fire.',
    ru: 'Сладость веры ощутит тот, кто отличается тремя качествами: любит Аллаха и Его посланника больше всего остального, любит человека только ради Аллаха и не желает возвращаться к неверию так же, как не желает быть ввергнутым в огонь.',
    uz: 'Kimda uch xislat boʻlsa, iymon halovatini topadi: Alloh va Rasuli unga hamma narsadan suyukliroq boʻlsa; bir kishini faqat Alloh uchun sevsa; va kufrga qaytishni olovga tashlanishni yomon koʻrgandek yomon koʻrsa.',
  },
  // ---- added 2026-11-23: 140 more, from Sahih al-Bukhari and Sahih Muslim ----
  {
    n: 10, tags: ['speech', 'character'],
    en: 'A Muslim is the one from whose tongue and hands the Muslims are safe, and an emigrant is the one who gives up what Allah has forbidden.',
    ru: 'Мусульманин — это тот, кто не причиняет мусульманам вреда своим языком и своими руками, а мухаджир — тот, кто оставил запрещённое Аллахом.',
    uz: 'Musulmon — musulmonlar uning tili va qoʻlidan omonda boʻlgan kishidir. Muhojir esa Alloh qaytargan narsalarni tark etgan kishidir.',
  },
  {
    n: 15, tags: ['faith'],
    en: 'None of you will have faith till he loves me more than his father, his children and all mankind.',
    ru: 'Не уверует никто из вас, пока не станет любить меня больше, чем своего отца, своих детей и всех людей.',
    uz: 'Sizlardan biringiz meni otasidan, farzandidan va barcha odamlardan koʻproq sevmagunicha (komil) moʻmin boʻlmaydi.',
  },
  {
    n: 35, tags: ['ramadan', 'night'],
    en: 'Whoever stands in prayer on the Night of Qadr out of faith and hoping for Allah’s reward will have his past sins forgiven.',
    ru: 'Тому, кто проведёт в молитве Ночь предопределения с верой и надеждой на награду Аллаха, простятся его прежние грехи.',
    uz: 'Kim Qadr kechasini iymon bilan va savobini Allohdan umid qilib ibodatda oʻtkazsa, uning oʻtgan gunohlari kechiriladi.',
  },
  {
    n: 56, tags: ['intention', 'charity'],
    en: 'You will be rewarded for whatever you spend for Allah’s sake, even a morsel you put in your wife’s mouth.',
    ru: 'Ты непременно получишь награду за всё, что потратишь ради Аллаха, даже за кусок, который положишь в рот своей жене.',
    uz: 'Alloh roziligini istab qilgan har bir sarfing uchun ajr olasan, hatto xotiningning ogʻziga solgan bir luqma uchun ham.',
  },
  {
    n: 2446, tags: ['friends'],
    en: 'A believer to another believer is like a building whose parts support each other.',
    ru: 'Верующий для верующего — как строение, части которого укрепляют друг друга.',
    uz: 'Moʻmin moʻmin uchun bir-birini mustahkamlab turadigan bino gʻishtlari kabidir.',
  },
  {
    n: 1302, tags: ['patience'],
    en: 'True patience is at the first stroke of a calamity.',
    ru: '(Истинное) терпение проявляется при первом ударе беды.',
    uz: 'Haqiqiy sabr musibatning ilk zarbasidagi sabrdir.',
  },
  {
    n: 1426, tags: ['charity'],
    en: 'The best charity is that given out of sufficiency, and start with those you support.',
    ru: 'Лучшая милостыня — та, что подаётся из достатка. И начинай с тех, кто на твоём содержании.',
    uz: 'Eng yaxshi sadaqa — boylik (yetarlilik) holatida berilganidir. Avval qaramogʻingdagilardan boshla.',
  },
  {
    n: 1442, tags: ['charity'],
    en: 'Every morning two angels come down. One says, ‘O Allah, give more to the one who spends,’ and the other says, ‘O Allah, bring loss to the one who withholds.’',
    ru: 'Каждое утро спускаются два ангела. Один говорит: «О Аллах, возмести расходующему!», а другой: «О Аллах, приведи скупого к утрате!»',
    uz: 'Har tongda ikki farishta tushadi. Biri: «Ey Alloh, infoq qiluvchiga oʻrnini toʻldirib ber», deydi. Ikkinchisi: «Ey Alloh, baxillik qiluvchining molini yoʻq qil», deydi.',
  },
  {
    n: 1476, tags: ['charity', 'character'],
    en: 'The poor person is not the one who goes round asking for a morsel or two, but the one who has not enough and is too modest to ask people.',
    ru: 'Беден не тот, кто ходит по людям ради куска-другого, а тот, у кого нет достаточного и кто стесняется просить людей.',
    uz: 'Miskin bir-ikki luqma uchun odamlarni aylanib yuradigan kishi emas. Miskin — yetarli narsasi yoʻq, ammo odamlardan soʻrashga hayo qiladigan kishidir.',
  },
  {
    n: 1899, tags: ['ramadan'],
    en: 'When Ramadan begins, the gates of heaven are opened, the gates of Hell are closed and the devils are chained.',
    ru: 'Когда наступает рамадан, врата небес открываются, врата Геенны закрываются, а шайтаны сковываются цепями.',
    uz: 'Ramazon kirganda osmon eshiklari ochiladi, jahannam eshiklari yopiladi va shaytonlar kishanlanadi.',
  },
  {
    n: 1923, tags: ['ramadan'],
    en: 'Eat suhur, for there is blessing in it.',
    ru: 'Ешьте перед рассветом, ибо в сухуре — благодать.',
    uz: 'Saharlik qilinglar, chunki saharlikda baraka bor.',
  },
  {
    n: 1957, tags: ['ramadan'],
    en: 'People will remain in goodness as long as they hasten to break the fast.',
    ru: 'Люди будут пребывать в благе, пока спешат с разговением.',
    uz: 'Odamlar iftorga shoshilar ekan, yaxshilikda boʻlaveradilar.',
  },
  {
    n: 2017, tags: ['ramadan', 'night'],
    en: 'Seek the Night of Qadr in the odd nights of the last ten of Ramadan.',
    ru: 'Ищите Ночь предопределения в нечётные ночи последних десяти дней рамадана.',
    uz: 'Qadr kechasini Ramazonning oxirgi oʻn kunining toq kechalaridan izlanglar.',
  },
  {
    n: 2067, tags: ['friends'],
    en: 'Whoever wishes his provision to be increased and his life prolonged should keep good ties with his relatives.',
    ru: 'Пусть тот, кто желает, чтобы его удел был увеличен, а жизнь продлена, поддерживает связи с родственниками.',
    uz: 'Kim rizqi keng boʻlishini va umri uzayishini istasa, qarindoshlari bilan aloqani mahkam tutsin.',
  },
  {
    n: 2074, tags: ['work'],
    en: 'It is better for one of you to take a rope, gather firewood and carry it on his back than to ask people, who may give him or refuse.',
    ru: 'Лучше любому из вас взять вязанку дров и понести её на спине, чем просить людей, которые могут дать, а могут и отказать.',
    uz: 'Birortangiz arqonini olib, bir bogʻ oʻtin yigʻib, uni orqasida koʻtarib kelishi odamlardan soʻrashidan yaxshiroqdir — ular berishi ham, bermasligi ham mumkin.',
  },
  {
    n: 2076, tags: ['work', 'character'],
    en: 'May Allah have mercy on the one who is easygoing when he sells, when he buys and when he asks for repayment.',
    ru: 'Да помилует Аллах человека, проявляющего великодушие, когда он продаёт, покупает и требует возврата долга.',
    uz: 'Sotganda, sotib olganda va qarzini talab qilganda bagʻrikenglik qiladigan kishiga Alloh rahm qilsin.',
  },
  {
    n: 2320, tags: ['work', 'charity'],
    en: 'No Muslim plants a tree or sows a field, and a bird, a person or an animal eats from it, but it counts as charity for him.',
    ru: 'Если мусульманин посадит дерево или посеет что-то, а затем птица, человек или животное поест из этого, это непременно зачтётся ему как милостыня.',
    uz: 'Qaysi bir musulmon daraxt eksa yoki ekin eksa, undan qush, inson yoki hayvon yesa, bu albatta uning uchun sadaqa boʻladi.',
  },
  {
    n: 2387, tags: ['intention', 'work'],
    en: 'Whoever takes people’s money intending to repay it, Allah will repay it for him; whoever takes it intending to waste it, Allah will ruin him.',
    ru: 'За того, кто берёт деньги у людей, желая вернуть их, Аллах вернёт долг; а того, кто берёт, желая растратить их, Аллах погубит.',
    uz: 'Kim odamlarning molini qaytarish niyatida olsa, Alloh uning oʻrniga ado qiladi. Kim uni yoʻq qilish niyatida olsa, Alloh uni halok qiladi.',
  },
  {
    n: 2443, tags: ['friends', 'character'],
    en: 'Help your brother, whether he is the oppressor or the oppressed.',
    ru: 'Помогай своему брату, будь он притеснителем или притесняемым.',
    uz: 'Birodaringga yordam ber, u zolim boʻlsa ham, mazlum boʻlsa ham.',
  },
  {
    n: 2447, tags: ['character'],
    en: 'Oppression will be darkness on the Day of Resurrection.',
    ru: 'В День воскресения притеснение обернётся мраком.',
    uz: 'Zulm Qiyomat kuni zulmatlardir.',
  },
  {
    n: 2457, tags: ['speech', 'character'],
    en: 'The most hated person to Allah is the one who is most quarrelsome.',
    ru: 'Самый ненавистный из людей для Аллаха — непримиримый в спорах.',
    uz: 'Allohning nazdida odamlarning eng yomon koʻrilgani — eng janjalkash, oʻjar tortishuvchi kishidir.',
  },
  {
    n: 2472, tags: ['mercy', 'charity'],
    en: 'A man walking on a road found a thorny branch and moved it out of the way. Allah thanked him for it and forgave him.',
    ru: 'Человек, шедший по дороге, увидел ветку с колючками и убрал её с пути, и Аллах отблагодарил его, простив ему.',
    uz: 'Bir kishi yoʻlda ketayotib tikanli shoxni koʻrdi va uni yoʻldan olib tashladi. Alloh uning bu ishini qadrladi va uni magʻfirat qildi.',
  },
  {
    n: 2528, tags: ['intention', 'mercy'],
    en: 'Allah has forgiven my people what their hearts whisper to them, as long as they do not act on it or speak of it.',
    ru: 'Аллах простил моей общине то, что внушают им их сердца, если только они не действуют согласно этому и не говорят об этом.',
    uz: 'Alloh ummatimning qalbidan oʻtgan vasvasalarni, toki unga amal qilmasa yoki uni gapirmasa, kechirgan.',
  },
  {
    n: 2566, tags: ['friends', 'charity'],
    en: 'No neighbour should think little of a gift to her neighbour, even if it is only a sheep’s hoof.',
    ru: 'Пусть ни одна соседка не пренебрегает подарком своей соседке, даже если это всего лишь овечье копыто.',
    uz: 'Hech bir qoʻshni ayol qoʻshnisiga beradigan hadyani arzimas sanamasin, garchi u bir qoʻy tuyogʻi boʻlsa ham.',
  },
  {
    n: 2591, tags: ['charity'],
    en: 'Give, and do not count, or Allah will count what He gives you; do not hoard, or Allah will hold back from you.',
    ru: 'Раздавай и не подсчитывай, а иначе и Аллах будет отсчитывать тебе; и не придерживай, а иначе Аллах придержит от тебя.',
    uz: 'Sarf qil, sanab oʻtirma, aks holda Alloh ham senga sanab beradi. Yigʻib yashirma, aks holda Alloh ham sendan ushlab qoladi.',
  },
  {
    n: 2682, tags: ['speech', 'character'],
    en: 'The signs of a hypocrite are three: when he speaks, he lies; when he is trusted, he betrays; and when he promises, he breaks it.',
    ru: 'Признаков лицемера три: когда говорит — лжёт, когда ему доверяют — предаёт, а когда обещает — нарушает обещание.',
    uz: 'Munofiqning belgisi uchta: gapirsa, yolgʻon gapiradi; omonat berilsa, xiyonat qiladi; vaʼda bersa, vaʼdasiga xilof qiladi.',
  },
  {
    n: 2692, tags: ['speech', 'friends'],
    en: 'The one who makes peace between people by passing on good words is not a liar.',
    ru: 'Не является лжецом тот, кто примиряет людей, передавая им благие слова.',
    uz: 'Odamlar orasini isloh qilib, yaxshi soʻz yetkazgan kishi yolgʻonchi emas.',
  },
  {
    n: 2697, tags: ['faith'],
    en: 'Whoever introduces into this matter of ours something that is not part of it, it is rejected.',
    ru: 'Если кто-нибудь внесёт в это наше дело нечто, не имеющее к нему отношения, это будет отвергнуто.',
    uz: 'Kim bizning bu ishimizda (dinimizda) undan boʻlmagan yangi narsa paydo qilsa, u rad etiladi.',
  },
  {
    n: 3046, tags: ['mercy', 'charity'],
    en: 'Free the captive, feed the hungry and visit the sick.',
    ru: 'Освобождайте пленного, кормите голодного и навещайте больного.',
    uz: 'Asirni ozod qilinglar, ochni toʻydiringlar va bemorni ziyorat qilinglar.',
  },
  {
    n: 3194, tags: ['mercy'],
    en: 'When Allah completed creation, He wrote in His Book, which is with Him above the Throne: ‘My mercy prevails over My anger.’',
    ru: 'Завершив творение, Аллах записал в Своей Книге, которая у Него над Троном: «Поистине, Моя милость превосходит Мой гнев».',
    uz: 'Alloh maxluqotni yaratib boʻlgach, Arsh ustida Oʻz huzuridagi Kitobga: «Albatta, Mening rahmatim gʻazabimdan gʻolibdir», deb yozdi.',
  },
  {
    n: 3250, tags: ['time'],
    en: 'A place in Paradise the size of a whip is better than the world and all that is in it.',
    ru: 'Место в Раю размером с плеть лучше, чем этот мир и всё, что в нём.',
    uz: 'Jannatdagi bir qamchi joy dunyo va undagi barcha narsalardan yaxshiroqdir.',
  },
  {
    n: 3257, tags: ['ramadan'],
    en: 'Paradise has eight gates, and one of them is called Ar-Rayyan; none will enter through it but those who fast.',
    ru: 'В Раю восемь врат, и одни из них называются ар-Райян: через них войдут только постившиеся.',
    uz: 'Jannatning sakkizta eshigi bor. Ulardan biri Rayyon deb ataladi, undan faqat roʻzadorlar kiradi.',
  },
  {
    n: 3318, tags: ['mercy'],
    en: 'A woman entered the Fire because of a cat she tied up, neither feeding it nor letting it eat the creatures of the earth.',
    ru: 'Одна женщина вошла в Огонь из-за кошки: она держала её на привязи, не кормила и не давала ей есть то, что ползает по земле.',
    uz: 'Bir ayol mushuk sababli doʻzaxga kirdi: uni bogʻlab qoʻydi, na oʻzi yedirdi, na yerdagi hasharotlardan yeyishi uchun qoʻyib yubordi.',
  },
  {
    n: 3467, tags: ['mercy'],
    en: 'A dog was circling a well, about to die of thirst, when a sinful woman saw it, took off her shoe and gave it water. Allah forgave her because of it.',
    ru: 'Собака кружила вокруг колодца, умирая от жажды, и одна грешная женщина увидела её, сняла свой башмак и напоила её. За это ей были прощены грехи.',
    uz: 'Bir it chanqoqdan oʻlay deb quduq atrofida aylanib yurgan edi. Uni bir gunohkor ayol koʻrib qoldi, kavushini yechib, unga suv ichirdi. Shu sababli Alloh uni kechirdi.',
  },
  {
    n: 3483, tags: ['character'],
    en: 'Among the words people have kept from earlier prophethood: if you feel no shame, do as you wish.',
    ru: 'Из слов первых пророков до людей дошло: если ты не чувствуешь стыда, то делай что хочешь.',
    uz: 'Odamlarga avvalgi paygʻambarlik soʻzlaridan yetib kelgan narsa shuki: agar hayo qilmasang, xohlaganingni qilaver.',
  },
  {
    n: 3445, tags: ['faith'],
    en: 'Do not exaggerate in praising me as the Christians did with the son of Mary. I am only a servant, so say: the servant of Allah and His Messenger.',
    ru: 'Не превозносите меня, как христиане превозносили сына Марьям. Я — лишь раб, так говорите же: раб Аллаха и Его посланник.',
    uz: 'Nasorolar Maryam oʻgʻlini haddan oshirib maqtaganidek meni haddan oshirib maqtamanglar. Men faqat bir bandaman. «Allohning bandasi va Rasuli», denglar.',
  },
  {
    n: 3673, tags: ['faith', 'speech'],
    en: 'Do not abuse my companions. If one of you spent gold equal to Uhud, it would not equal a handful spent by one of them, nor even half of it.',
    ru: 'Не поносите моих сподвижников! Если бы любой из вас потратил золота столько, сколько весит гора Ухуд, это не сравнилось бы ни с горстью, ни с половиной горсти, пожертвованной любым из них.',
    uz: 'Sahobalarimni soʻkmanglar! Agar birortangiz Uhud togʻicha oltin infoq qilsa ham, ulardan birining bir hovuch, hatto yarim hovuch sadaqasiga yetmaydi.',
  },
  {
    n: 4522, tags: ['dhikr'],
    en: 'O Allah, our Lord, give us good in this world and good in the Hereafter, and save us from the punishment of the Fire.',
    ru: 'О Аллах, Господь наш, даруй нам в этом мире благо и в мире вечном благо и защити нас от мук Огня!',
    uz: 'Ey Alloh, Robbimiz! Bizga dunyoda ham yaxshilik ber, oxiratda ham yaxshilik ber va bizni doʻzax azobidan saqla.',
  },
  {
    n: 5033, tags: ['quran', 'habit'],
    en: 'Keep up the Qur’an, for by Him in whose hand is my soul, it escapes faster than a camel from its rope.',
    ru: 'Читайте Коран постоянно, ибо, клянусь Тем, в Чьей длани моя душа, он ускользает быстрее, чем верблюды избавляются от своих пут.',
    uz: 'Qurʼonni doimo takrorlab turinglar. Jonim Uning qoʻlida boʻlgan Zotga qasamki, u (xotiradan) tuyaning arqonidan qochishidan ham tezroq qochadi.',
  },
  {
    n: 5090, tags: ['faith', 'friends'],
    en: 'A woman is married for four things: her wealth, her lineage, her beauty and her religion. Choose the one with religion, and you will prosper.',
    ru: 'Женщину берут в жёны из-за четырёх вещей: её богатства, происхождения, красоты и религии. Выбери же ту, что привержена религии, — и преуспеешь.',
    uz: 'Ayolga toʻrt narsa uchun uylaniladi: moli, nasl-nasabi, goʻzalligi va dini uchun. Sen dindorini tanla, (shunda) baraka topasan.',
  },
  {
    n: 5304, tags: ['mercy', 'charity'],
    en: 'I and the one who looks after an orphan will be in Paradise like these two (fingers).',
    ru: 'Я и опекающий сироту будем в Раю вот так (рядом, как эти два пальца).',
    uz: 'Men va yetimni oʻz qaramogʻiga olgan kishi jannatda mana bu (ikki barmoq) kabi (yonma-yon) boʻlamiz.',
  },
  {
    n: 5352, tags: ['charity'],
    en: 'Allah said: ‘Spend, O son of Adam, and I will spend on you.’',
    ru: 'Аллах сказал: «Расходуй, о сын Адама, и Я буду расходовать на тебя».',
    uz: 'Alloh aytdi: «Ey Odam bolasi, infoq qil, Men ham senga infoq qilaman».',
  },
  {
    n: 5353, tags: ['mercy', 'charity'],
    en: 'The one who looks after a widow or a poor person is like one who strives in Allah’s cause, or who prays all night and fasts all day.',
    ru: 'Пекущийся о вдове и неимущем подобен сражающемуся на пути Аллаха или тому, кто молится ночи напролёт и постится днём.',
    uz: 'Beva va miskinning ishini bitirish uchun harakat qilgan kishi Alloh yoʻlida jihod qiluvchi kabi yoki tunlari namoz oʻqib, kunduzlari roʻza tutadigan kishi kabidir.',
  },
  {
    n: 5392, tags: ['charity', 'friends'],
    en: 'Food for two is enough for three, and food for three is enough for four.',
    ru: 'Еды двоих хватит и на троих, а еды троих хватит и на четверых.',
    uz: 'Ikki kishining taomi uch kishiga, uch kishining taomi toʻrt kishiga yetadi.',
  },
  {
    n: 5678, tags: ['patience', 'faith'],
    en: 'Allah has not sent down any disease without also sending down its cure.',
    ru: 'Какую бы болезнь ни ниспослал Аллах, Он непременно ниспосылает и её исцеление.',
    uz: 'Alloh qaysi bir dardni tushirgan boʻlsa, albatta uning shifosini ham tushirgan.',
  },
  {
    n: 5688, tags: ['gratitude'],
    en: 'There is healing in black seed for every disease except death.',
    ru: 'В чёрном тмине — исцеление от любой болезни, кроме смерти.',
    uz: 'Qora sedanada oʻlimdan boshqa har bir dardga shifo bor.',
  },
  {
    n: 5728, tags: ['patience'],
    en: 'If you hear of plague in a land, do not go there; and if it breaks out in a land where you are, do not leave it.',
    ru: 'Если услышите, что в какой-то земле чума, не входите туда, а если она начнётся там, где вы находитесь, не покидайте это место.',
    uz: 'Biror yerda vabo borligini eshitsangiz, u yerga kirmanglar. Agar siz turgan yerda vabo tarqalsa, u yerdan chiqib ketmanglar.',
  },
  {
    n: 5984, tags: ['friends'],
    en: 'The one who cuts the ties of kinship will not enter Paradise.',
    ru: 'Не войдёт в Рай тот, кто порывает родственные связи.',
    uz: 'Qarindoshlik aloqasini uzuvchi jannatga kirmaydi.',
  },
  {
    n: 6133, tags: ['knowledge', 'character'],
    en: 'A believer is not stung twice from the same hole.',
    ru: 'Верующего не жалят дважды из одной и той же норы.',
    uz: 'Moʻmin bir teshikdan ikki marta chaqilmaydi.',
  },
  {
    n: 6168, tags: ['friends', 'faith'],
    en: 'A person will be with those he loves.',
    ru: 'Человек будет с тем, кого любит.',
    uz: 'Kishi oʻzi sevgan kishisi bilan birga boʻladi.',
  },
  {
    n: 6236, tags: ['character', 'charity'],
    en: 'The best of Islam is to feed people and to greet those you know and those you do not know.',
    ru: 'Наилучшее в исламе — угощать людей и приветствовать тех, кого знаешь, и тех, кого не знаешь.',
    uz: 'Islomning eng yaxshisi — taom yedirishing va taniganingga ham, tanimaganingga ham salom berishingdir.',
  },
  {
    n: 6288, tags: ['speech', 'friends'],
    en: 'When three are together, two should not whisper to each other leaving out the third.',
    ru: 'Если вас трое, пусть двое не перешёптываются без третьего.',
    uz: 'Uch kishi birga boʻlsa, ikkisi uchinchisini chetda qoldirib pichirlashmasin.',
  },
  {
    n: 6340, tags: ['dhikr', 'patience'],
    en: 'The prayer of any of you is answered as long as he is not impatient, saying, ‘I prayed, but I was not answered.’',
    ru: 'Каждому из вас будет дан ответ, если только он не станет торопить и говорить: «Я молил, но не получил ответа!»',
    uz: 'Sizlardan birortangizning duosi, toki shoshilib: «Duo qildim, ammo ijobat boʻlmadi», demasa, ijobat qilinadi.',
  },
  {
    n: 6446, tags: ['gratitude'],
    en: 'Richness is not having many possessions; true richness is the richness of the soul.',
    ru: 'Богатство не в обилии имущества, истинное богатство — богатство души.',
    uz: 'Boylik mol-dunyoning koʻpligida emas, haqiqiy boylik — qalb (nafs) boyligidir.',
  },
  {
    n: 6439, tags: ['gratitude', 'time'],
    en: 'If the son of Adam had a valley of gold, he would want a second. Nothing fills his mouth but dust, and Allah accepts the repentance of whoever repents.',
    ru: 'Если бы у сына Адама была долина золота, он пожелал бы вторую. Ничто не наполнит его рот, кроме земли, а Аллах принимает покаяние кающегося.',
    uz: 'Agar Odam bolasining bir vodiy oltini boʻlsa, ikkinchisini ham istaydi. Uning ogʻzini faqat tuproq toʻldiradi. Kim tavba qilsa, Alloh uning tavbasini qabul qiladi.',
  },
  {
    n: 6474, tags: ['speech', 'character'],
    en: 'Whoever guarantees me what is between his jaws and what is between his legs, I guarantee him Paradise.',
    ru: 'Тому, кто поручится мне за то, что между его челюстями и между его ногами, я поручусь за Рай.',
    uz: 'Kim menga ikki jagʻi orasidagi va ikki oyogʻi orasidagi narsaga kafil boʻlsa, men unga jannatga kafil boʻlaman.',
  },
  {
    n: 6479, tags: ['dhikr', 'night'],
    en: 'Among the seven whom Allah will shade in His shade is one who remembered Allah alone and his eyes flowed with tears.',
    ru: 'Среди семерых, кого Аллах укроет Своей тенью, — человек, который поминал Аллаха в уединении, и его глаза наполнялись слезами.',
    uz: 'Alloh Oʻz soyasida soyalantiradigan yetti toifadan biri — yolgʻizlikda Allohni zikr qilib, koʻzlaridan yosh oqqan kishidir.',
  },
  {
    n: 6487, tags: ['patience', 'habit'],
    en: 'The Fire is veiled by desires, and Paradise is veiled by hardships.',
    ru: 'Огонь скрыт за страстями, а Рай — за неприятным.',
    uz: 'Doʻzax nafs xohishlari bilan, jannat esa nafsga yoqmaydigan narsalar bilan oʻralgan.',
  },
  {
    n: 6488, tags: ['time', 'faith'],
    en: 'Paradise is nearer to each of you than the strap of his sandal, and so is the Fire.',
    ru: 'Рай ближе к каждому из вас, чем ремешок его сандалии, и столь же близок Огонь.',
    uz: 'Jannat har biringizga kavushingizning ipidan ham yaqinroqdir. Doʻzax ham shunday.',
  },
  {
    n: 6508, tags: ['faith'],
    en: 'Whoever loves to meet Allah, Allah loves to meet him; and whoever dislikes meeting Allah, Allah dislikes meeting him.',
    ru: 'Аллах желает встречи с тем, кто желает встречи с Ним, а не желающего встречи с Аллахом и Аллах не желает встретить.',
    uz: 'Kim Allohga yoʻliqishni yaxshi koʻrsa, Alloh ham unga yoʻliqishni yaxshi koʻradi. Kim Allohga yoʻliqishni yomon koʻrsa, Alloh ham unga yoʻliqishni yomon koʻradi.',
  },
  {
    n: 7120, tags: ['charity', 'time'],
    en: 'Give charity, for a time will come when a man will walk about with his charity and find no one to accept it.',
    ru: 'Подавайте милостыню, ибо настанет время, когда человек будет ходить со своей милостыней и не найдёт того, кто её примет.',
    uz: 'Sadaqa qilinglar, chunki shunday zamon keladiki, kishi sadaqasini koʻtarib yuradi-yu, uni qabul qiladigan odam topmaydi.',
  },
  {
    n: 7179, tags: ['speech', 'character'],
    en: 'The worst of people is the two-faced one, who comes to some with one face and to others with another.',
    ru: 'Худший из людей — двуличный, который к одним приходит с одним лицом, а к другим — с другим.',
    uz: 'Odamlarning eng yomoni — ikki yuzlamachi: bir guruhga bir yuz bilan, boshqasiga boshqa yuz bilan keladi.',
  },
  {
    n: 73, tags: ['knowledge', 'charity'],
    en: 'Do not envy anyone except in two cases: a man whom Allah gave wealth and who spends it rightly, and a man whom Allah gave wisdom and who judges by it and teaches it.',
    ru: 'Не следует завидовать никому, кроме двоих: человеку, которому Аллах даровал богатство и который тратит его на должное, и человеку, которому Аллах даровал мудрость и который поступает по ней и обучает ей.',
    uz: 'Faqat ikki kishiga havas qilish mumkin: Alloh mol bergan va uni haq yoʻlda sarflagan kishiga hamda Alloh hikmat bergan va u bilan hukm qilib, uni oʻrgatadigan kishiga.',
  },
  {
    n: 2766, tags: ['faith'],
    en: 'Avoid the seven destroying sins: associating others with Allah, sorcery, killing a soul unjustly, consuming usury, consuming an orphan’s wealth, fleeing the battlefield, and slandering chaste believing women.',
    ru: 'Избегайте семи губительных грехов: придания Аллаху сотоварищей, колдовства, убийства человека без права, ростовщичества, присвоения имущества сироты, бегства с поля боя и клеветы на целомудренных верующих женщин.',
    uz: 'Yetti halok qiluvchi gunohdan saqlaninglar: Allohga shirk keltirish, sehr, Alloh harom qilgan jonni nohaq oʻldirish, ribo yeyish, yetim molini yeyish, jang kuni qochish va pokiza moʻmina ayollarga tuhmat qilish.',
  },
  {
    n: 450, tags: ['prayer', 'charity'],
    en: 'Whoever builds a mosque for Allah’s sake, Allah will build for him the like of it in Paradise.',
    ru: 'Для того, кто построит мечеть ради Аллаха, Аллах построит подобное ей в Раю.',
    uz: 'Kim Alloh roziligini istab masjid qursa, Alloh unga jannatda xuddi shunday (uy) quradi.',
  },
  {
    n: 5971, tags: ['mercy', 'friends'],
    en: 'Asked who most deserves good companionship, he said: your mother, then your mother, then your mother, then your father.',
    ru: 'На вопрос, кто больше всех достоин хорошего отношения, он ответил: твоя мать, затем твоя мать, затем твоя мать, затем твой отец.',
    uz: 'Odamlardan kim yaxshi muomalaga eng haqli, deb soʻralganda, u zot: «Onang, keyin onang, keyin onang, keyin otang», dedilar.',
  },
  {
    n: 3461, tags: ['knowledge', 'speech'],
    en: 'Convey from me, even if it is one verse.',
    ru: 'Передавайте от меня, даже если это всего один аят.',
    uz: 'Mendan bir oyat boʻlsa ham yetkazinglar.',
  },
  {
    n: 1429, tags: ['charity', 'work'],
    en: 'The upper hand is better than the lower hand. The upper hand is the one that gives, and the lower is the one that asks.',
    ru: 'Высшая рука лучше низшей. Высшая рука — рука дающего, а низшая — рука просящего.',
    uz: 'Yuqoridagi qoʻl pastdagi qoʻldan yaxshiroqdir. Yuqoridagi qoʻl — beruvchi, pastdagisi — soʻrovchi qoʻldir.',
  },
  {
    n: 2442, tags: ['friends', 'mercy'],
    en: 'A Muslim is the brother of a Muslim: he does not wrong him or abandon him. Whoever meets his brother’s need, Allah will meet his need; and whoever covers a Muslim, Allah will cover him on the Day of Resurrection.',
    ru: 'Мусульманин мусульманину брат: он не притесняет его и не предаёт. Тому, кто поможет брату в нужде, Аллах поможет в его нужде, а того, кто покроет мусульманина, Аллах покроет в День воскресения.',
    uz: 'Musulmon musulmonning birodaridir: unga zulm qilmaydi, uni (dushmanga) topshirib qoʻymaydi. Kim birodarining hojatini chiqarsa, Alloh uning hojatini chiqaradi. Kim bir musulmonning aybini yashirsa, Alloh Qiyomat kuni uning aybini yashiradi.',
  },
  {
    n: 1240, tags: ['friends'],
    en: 'The rights of a Muslim over a Muslim are five: returning the greeting, visiting the sick, following the funeral, accepting the invitation and replying to one who sneezes.',
    ru: 'У мусульманина перед мусульманином пять обязанностей: отвечать на приветствие, навещать больного, провожать покойного, принимать приглашение и отвечать чихнувшему.',
    uz: 'Musulmonning musulmon ustidagi haqqi beshta: salomga alik olish, bemorni ziyorat qilish, janozaga ergashish, daʼvatni qabul qilish va aksa urganga javob qaytarish.',
  },
  {
    n: 5376, tags: ['habit'],
    en: 'Say the name of Allah, eat with your right hand, and eat from what is in front of you.',
    ru: 'Скажи: «С именем Аллаха», ешь правой рукой и бери то, что перед тобой.',
    uz: 'Bismilloh de, oʻng qoʻling bilan ye va oʻz oldingdan ye.',
  },
  {
    n: 6117, tags: ['character'],
    en: 'Modesty brings nothing but good.',
    ru: 'Стыдливость не приносит ничего, кроме блага.',
    uz: 'Hayo faqat yaxshilik keltiradi.',
  },
  {
    n: 6024, tags: ['character', 'speech'],
    en: 'Allah loves gentleness in every matter.',
    ru: 'Поистине, Аллах любит мягкость во всех делах.',
    uz: 'Albatta, Alloh har bir ishda yumshoqlikni yaxshi koʻradi.',
  },
  {
    n: 52, tags: ['faith', 'character'],
    en: 'The lawful is clear and the unlawful is clear, and between them are doubtful things. Whoever avoids the doubtful keeps his religion and honour safe. In the body there is a piece of flesh: if it is sound, the whole body is sound. It is the heart.',
    ru: 'Дозволенное очевидно и запретное очевидно, а между ними сомнительное. Кто остерегается сомнительного, тот очищает свою религию и честь. В теле есть кусок плоти: если он здоров, здорово всё тело. Это сердце.',
    uz: 'Halol ochiq-ravshan, harom ham ochiq-ravshan, ikkisining orasida shubhali ishlar bor. Kim shubhalilardan saqlansa, dini va obroʻsini pok saqlaydi. Tanada bir parcha goʻsht bor: u soʻgʻlom boʻlsa, butun tana soʻgʻlom boʻladi. Bilib qoʻyinglar, u — qalbdir.',
  },
  {
    n: 152, book: 'muslim', no: '35', ref: [1, 59], tags: ['faith', 'character'],
    en: 'Faith has over seventy branches, and modesty is a branch of faith.',
    ru: 'Вера включает более семидесяти ответвлений, и стыдливость — одно из ответвлений веры.',
    uz: 'Iymon yetmishdan ortiq shoxobchadir, hayo ham iymonning bir shoxobchasidir.',
  },
  {
    n: 290, book: 'muslim', no: '105', ref: [1, 196], tags: ['speech'],
    en: 'The tale-bearer will not enter Paradise.',
    ru: 'Сплетник не войдёт в Рай.',
    uz: 'Chaqimchi jannatga kirmaydi.',
  },
  {
    n: 372, book: 'muslim', no: '145', ref: [1, 279], tags: ['faith', 'patience'],
    en: 'Islam began as something strange and will return to being strange as it began, so glad tidings to the strangers.',
    ru: 'Ислам начался чуждым и вернётся чуждым, каким начался. Так радуйтесь же чужие!',
    uz: 'Islom gʻariblikda boshlandi va boshlangani kabi yana gʻarib boʻlib qoladi. Gʻariblarga xushxabar boʻlsin!',
  },
  {
    n: 534, book: 'muslim', no: '223', ref: [2, 1], tags: ['dhikr', 'prayer', 'faith'],
    en: 'Purity is half of faith. ‘Al-hamdu lillah’ fills the scale. Prayer is light, charity is proof, patience is brightness, and the Qur’an is a proof for you or against you.',
    ru: 'Чистота — половина веры. «Хвала Аллаху» заполняет Весы. Молитва — свет, милостыня — доказательство, терпение — сияние, а Коран — довод за тебя или против тебя.',
    uz: 'Poklik iymonning yarmidir. «Alhamdulillah» tarozini toʻldiradi. Namoz — nur, sadaqa — hujjat, sabr — ziyo, Qurʼon esa sening foydangga yoki zarariga hujjatdir.',
  },
  {
    n: 550, book: 'muslim', no: '233', ref: [2, 17], tags: ['prayer'],
    en: 'The five prayers, and one Friday to the next, wipe out what is between them, as long as major sins are avoided.',
    ru: 'Пять молитв и пятничная молитва до следующей пятничной искупают грехи, совершённые между ними, если не совершены большие грехи.',
    uz: 'Besh vaqt namoz va bir jumadan keyingi jumagacha boʻlgan oraliqdagi gunohlar uchun kafforatdir, modomiki katta gunohlardan saqlanilsa.',
  },
  {
    n: 912, book: 'muslim', no: '408', ref: [4, 74], tags: ['dhikr'],
    en: 'Whoever sends blessings upon me once, Allah sends blessings upon him ten times.',
    ru: 'Того, кто призовёт на меня благословение один раз, Аллах благословит десять раз.',
    uz: 'Kim menga bir marta salavot aytsa, Alloh unga oʻn marta salavot (rahmat) yuboradi.',
  },
  {
    n: 1083, book: 'muslim', no: '482', ref: [4, 245], tags: ['prayer', 'dhikr'],
    en: 'A servant is nearest to his Lord when he is in prostration, so make much supplication then.',
    ru: 'Ближе всего к своему Господу раб бывает в земном поклоне, так обращайтесь же к Нему с мольбами почаще.',
    uz: 'Banda Robbisiga eng yaqin boʻladigan holat — sajda holatidir. Bas, (sajdada) duoni koʻpaytiringlar.',
  },
  {
    n: 1528, book: 'muslim', no: '671', ref: [5, 361], tags: ['prayer'],
    en: 'The places dearest to Allah are the mosques, and the places most disliked by Allah are the markets.',
    ru: 'Самые любимые Аллахом места — мечети, а самые нелюбимые — рынки.',
    uz: 'Allohga eng sevimli joylar — masjidlar, eng yoqimsiz joylar esa bozorlardir.',
  },
  {
    n: 1688, book: 'muslim', no: '725', ref: [6, 118], tags: ['prayer', 'habit'],
    en: 'The two rak‘ahs before Fajr are better than the world and all it contains.',
    ru: 'Два ракаата перед утренней молитвой лучше этого мира и всего, что в нём.',
    uz: 'Bomdodning ikki rakat (sunnati) dunyo va undagi narsalardan yaxshiroqdir.',
  },
  {
    n: 1771, book: 'muslim', no: '757', ref: [6, 200], tags: ['night', 'dhikr'],
    en: 'There is an hour in every night in which no Muslim asks Allah for any good of this world or the next but He gives it to him.',
    ru: 'Поистине, есть ночью такой час, когда мусульманин, просящий Аллаха о благе этого мира и вечного, непременно получит просимое.',
    uz: 'Albatta, kechada shunday bir soat borki, qaysi bir musulmon unda Allohdan dunyo va oxirat yaxshiligini soʻrasa, Alloh unga albatta beradi.',
  },
  {
    n: 1823, book: 'muslim', no: '779', ref: [6, 251], tags: ['dhikr'],
    en: 'The house in which Allah is remembered and the house in which He is not remembered are like the living and the dead.',
    ru: 'Дом, в котором поминают Аллаха, и дом, в котором Его не поминают, подобны живому и мёртвому.',
    uz: 'Allohni zikr qilinadigan uy bilan zikr qilinmaydigan uyning misoli tirik bilan oʻlikning misoli kabidir.',
  },
  {
    n: 1824, book: 'muslim', no: '780', ref: [6, 252], tags: ['quran'],
    en: 'Do not make your houses graveyards. Satan flees from the house in which Surah al-Baqarah is recited.',
    ru: 'Не превращайте свои дома в кладбища! Шайтан бежит из дома, в котором читают суру «аль-Бакара».',
    uz: 'Uylaringizni qabristonga aylantirmanglar. Shayton Baqara surasi oʻqiladigan uydan qochadi.',
  },
  {
    n: 1973, book: 'muslim', no: '852', ref: [7, 23], tags: ['dhikr'],
    en: 'There is an hour on Friday in which no Muslim asks Allah for good but He gives it to him, and it is a short time.',
    ru: 'Есть в пятницу такой час, когда Аллах непременно дарует мусульманину благо, о котором тот просит. И это короткое время.',
    uz: 'Juma kunida shunday bir soat borki, qaysi bir musulmon unda Allohdan yaxshilik soʻrasa, Alloh unga beradi. U qisqa vaqtdir.',
  },
  {
    n: 1976, book: 'muslim', no: '854', ref: [7, 26], tags: ['dhikr', 'prayer'],
    en: 'The best day on which the sun has risen is Friday: on it Adam was created, on it he entered Paradise, and on it he was sent out of it.',
    ru: 'Лучший из дней, в которые восходило солнце, — пятница: в этот день был создан Адам, в этот день он был введён в Рай и в этот день выведен из него.',
    uz: 'Quyosh chiqqan kunlarning eng yaxshisi juma kunidir: unda Odam yaratildi, unda jannatga kiritildi va unda jannatdan chiqarildi.',
  },
  {
    n: 2123, book: 'muslim', no: '916', ref: [11, 1], tags: ['faith'],
    en: 'Prompt your dying to say: ‘There is no god but Allah.’',
    ru: 'Внушайте своим умирающим слова: «Нет бога, кроме Аллаха».',
    uz: 'Oʻlim yoqasidagilaringizga «Lā ilāha illalloh»ni talqin qilinglar.',
  },
  {
    n: 6572, book: 'muslim', no: '2577', ref: [45, 70], tags: ['mercy', 'character', 'dhikr'],
    en: 'Allah said: ‘O My servants, I have forbidden injustice for Myself and made it forbidden among you, so do not wrong one another. You sin by night and by day, and I forgive all sins, so ask Me for forgiveness and I will forgive you.’',
    ru: 'Аллах сказал: «О рабы Мои, Я запретил несправедливость Себе и сделал её запретной между вами, так не притесняйте же друг друга. Вы грешите ночью и днём, а Я прощаю все грехи, так просите же у Меня прощения, и Я прощу вас».',
    uz: 'Alloh aytdi: «Ey bandalarim! Men zulmni Oʻzimga harom qildim va uni oralaringizda ham harom qildim, bas, bir-biringizga zulm qilmanglar. Sizlar kechayu kunduz gunoh qilasizlar, Men esa barcha gunohlarni kechiraman. Mendan magʻfirat soʻranglar, sizlarni magʻfirat qilaman».',
  },
  {
    n: 2426, book: 'muslim', no: '1054', ref: [12, 163], tags: ['gratitude'],
    en: 'Successful is the one who has accepted Islam, has been given enough provision, and whom Allah has made content with what He gave him.',
    ru: 'Преуспел тот, кто принял ислам, получил достаточное пропитание и кого Аллах сделал довольным тем, что Он ему даровал.',
    uz: 'Islomni qabul qilgan, rizqi yetarli qilib berilgan va Alloh bergan narsasiga qanoatli qilib qoʻygan kishi najot topdi.',
  },
  {
    n: 2758, book: 'muslim', no: '1164', ref: [13, 264], tags: ['ramadan', 'habit'],
    en: 'Whoever fasts Ramadan and follows it with six days of Shawwal, it is as if he fasted the whole year.',
    ru: 'Кто постился в рамадан, а затем добавил к нему шесть дней шавваля, тот словно постился весь год.',
    uz: 'Kim Ramazon roʻzasini tutib, ortidan Shavvoldan olti kun roʻza tutsa, butun yil roʻza tutgandek boʻladi.',
  },
  {
    n: 2755, book: 'muslim', no: '1163', ref: [13, 261], tags: ['night', 'prayer', 'habit'],
    en: 'The best fasting after Ramadan is in Allah’s month of Muharram, and the best prayer after the obligatory prayers is the prayer at night.',
    ru: 'Лучший пост после рамадана — в месяц Аллаха мухаррам, а лучшая молитва после обязательной — ночная молитва.',
    uz: 'Ramazondan keyingi eng afzal roʻza — Allohning oyi Muharram roʻzasidir. Farzdan keyingi eng afzal namoz — tungi namozdir.',
  },
  {
    n: 3289, book: 'muslim', no: '1349', ref: [15, 493], tags: ['faith'],
    en: 'One ‘Umrah to the next wipes out what is between them, and the accepted Hajj has no reward but Paradise.',
    ru: 'Умра — искупление грехов, совершённых до следующей умры, а за принятый хадж нет иной награды, кроме Рая.',
    uz: 'Bir umra keyingi umragacha boʻlgan gunohlarga kafforatdir. Maqbul hajning mukofoti esa faqat jannatdir.',
  },
  {
    n: 3643, book: 'muslim', no: '715', ref: [17, 76], tags: ['friends', 'gratitude'],
    en: 'The world is an enjoyment, and the best enjoyment of the world is a righteous wife.',
    ru: 'Этот мир — блага, и лучшее из благ этого мира — праведная жена.',
    uz: 'Dunyo bir matoʻdir, dunyo matoʻlarining eng yaxshisi — solih ayoldir.',
  },
  {
    n: 3648, book: 'muslim', no: '1468', ref: [17, 81], tags: ['friends', 'character'],
    en: 'A believing man should not hate a believing woman: if he dislikes one trait in her, he will be pleased with another.',
    ru: 'Пусть верующий не питает ненависти к верующей: если ему не нравится в ней одна черта, то понравится другая.',
    uz: 'Moʻmin erkak moʻmina ayolni yomon koʻrmasin: agar uning bir xulqi yoqmasa, boshqa bir xulqidan rozi boʻladi.',
  },
  {
    n: 5587, book: 'muslim', no: '2132', ref: [38, 2], tags: ['faith'],
    en: 'The names most beloved to Allah are ‘Abdullah and ‘Abd ar-Rahman.',
    ru: 'Самые любимые Аллахом имена — Абдуллах и Абдуррахман.',
    uz: 'Allohga eng sevimli ismlar — Abdulloh va Abdurrahmondir.',
  },
  {
    n: 5883, book: 'muslim', no: '2253', ref: [40, 22], tags: ['friends', 'gratitude'],
    en: 'Whoever is offered sweet basil should not refuse it, for it is light to carry and pleasant in scent.',
    ru: 'Пусть тот, кому предложат базилик, не отвергает его, ибо его легко нести, и он приятно пахнет.',
    uz: 'Kimga rayhon taklif qilinsa, uni rad etmasin, chunki u koʻtarishga yengil va hidi xushboʻydir.',
  },
  {
    n: 6514, book: 'muslim', no: '2552', ref: [45, 14], tags: ['friends', 'mercy'],
    en: 'The finest goodness is for a man to keep ties with the people his father loved.',
    ru: 'Наилучшее проявление благочестия — поддерживать связь с теми, кого любил твой отец.',
    uz: 'Yaxshiliklarning eng yaxshisi — kishining otasi yaxshi koʻrgan odamlar bilan aloqani davom ettirishidir.',
  },
  {
    n: 6519, book: 'muslim', no: '2555', ref: [45, 19], tags: ['friends'],
    en: 'Kinship hangs from the Throne and says: ‘Whoever keeps me, Allah will keep him; whoever cuts me, Allah will cut him off.’',
    ru: 'Родство подвешено к Трону и говорит: «Того, кто поддерживает меня, Аллах будет поддерживать, а того, кто порывает со мной, Аллах отвергнет».',
    uz: 'Qarindoshlik Arshga osilgan holda: «Kim meni bogʻlasa, Alloh uni bogʻlaydi, kim meni uzsa, Alloh uni uzadi», deydi.',
  },
  {
    n: 6534, book: 'muslim', no: '2561', ref: [45, 33], tags: ['friends', 'character'],
    en: 'It is not lawful for a Muslim to shun his brother for more than three days.',
    ru: 'Не дозволено мусульманину порывать с братом более чем на три дня.',
    uz: 'Musulmonga birodarini uch kundan ortiq tark etishi (araz qilishi) halol emas.',
  },
  {
    n: 6540, book: 'muslim', no: '2563', ref: [45, 39], tags: ['friends', 'character'],
    en: 'Do not hate one another, do not envy one another, and be, O servants of Allah, brothers.',
    ru: 'Не питайте друг к другу ненависти, не завидуйте друг другу и будьте, о рабы Аллаха, братьями.',
    uz: 'Bir-biringizni yomon koʻrmanglar, bir-biringizga hasad qilmanglar va ey Allohning bandalari, birodar boʻlinglar.',
  },
  {
    n: 6543, book: 'muslim', no: '2564', ref: [45, 42], tags: ['intention', 'faith'],
    en: 'Allah does not look at your forms or your wealth, but He looks at your hearts and your deeds.',
    ru: 'Поистине, Аллах не смотрит ни на ваш облик, ни на ваше имущество, но смотрит на ваши сердца и ваши дела.',
    uz: 'Albatta, Alloh suratlaringizga ham, mollaringizga ham qaramaydi, balki qalblaringiz va amallaringizga qaraydi.',
  },
  {
    n: 6552, book: 'muslim', no: '2568', ref: [45, 50], tags: ['mercy', 'friends'],
    en: 'Whoever visits a sick person remains in the harvest of Paradise until he returns.',
    ru: 'Тот, кто навещает больного, пребывает среди плодов Рая, пока не вернётся.',
    uz: 'Kim bemorni ziyorat qilsa, qaytgunicha jannat mevazorida boʻladi.',
  },
  {
    n: 6580, book: 'muslim', no: '2582', ref: [45, 78], tags: ['character'],
    en: 'Rights will be given to those owed them on the Day of Resurrection, even the hornless sheep will get its due from the horned one.',
    ru: 'В День воскресения права непременно будут возвращены тем, кому они принадлежат, — даже комолая овца получит своё с рогатой.',
    uz: 'Qiyomat kuni haqlar albatta egalariga qaytariladi, hatto shoxsiz qoʻy uchun shoxli qoʻydan qasos olinadi.',
  },
  {
    n: 6588, book: 'muslim', no: '2586', ref: [45, 86], tags: ['friends', 'mercy'],
    en: 'The believers are like one body: if the head aches, the whole body aches with fever and sleeplessness.',
    ru: 'Верующие подобны одному телу: если болит голова, всё тело откликается жаром и бессонницей.',
    uz: 'Moʻminlar bir tana kabidir: boshi ogʻrisa, butun tana isitma va uyqusizlik bilan unga sherik boʻladi.',
  },
  {
    n: 6592, book: 'muslim', no: '2588', ref: [45, 90], tags: ['charity', 'character', 'mercy'],
    en: 'Charity does not decrease wealth. Allah only adds honour to one who forgives, and whoever humbles himself for Allah, Allah raises him.',
    ru: 'Милостыня не уменьшает богатства. Прощающему Аллах лишь добавляет славы, а того, кто проявляет скромность ради Аллаха, Аллах возвышает.',
    uz: 'Sadaqa moldan hech narsani kamaytirmaydi. Afv qilgan bandaning Alloh faqat izzatini oshiradi. Kim Alloh uchun kamtar boʻlsa, Alloh uni yuksaltiradi.',
  },
  {
    n: 6502, tags: ['habit', 'prayer', 'dhikr'],
    en: 'Allah said: ‘My servant draws near to Me with nothing dearer to Me than what I have made obligatory, and he keeps drawing near to Me with voluntary deeds until I love him. If he asks Me, I will give him; if he seeks refuge in Me, I will protect him.’',
    ru: 'Аллах сказал: «Раб Мой не приближается ко Мне ничем более любимым Мною, чем то, что Я вменил ему в обязанность, и он продолжает приближаться ко Мне добровольными делами, пока Я не полюблю его. Если он попросит Меня, Я непременно дам ему, а если обратится ко Мне за защитой, непременно защищу его».',
    uz: 'Alloh aytdi: «Bandam Menga Men unga farz qilgan narsadan koʻra sevimliroq narsa bilan yaqinlashmaydi. Bandam nafl amallar bilan Menga yaqinlashib boraveradi, toki Men uni sevib qolaman. Agar Mendan soʻrasa, albatta beraman. Agar Mendan panoh tilasa, albatta panoh beraman».',
  },
  {
    n: 6599, book: 'muslim', no: '2592', ref: [45, 97], tags: ['character', 'mercy'],
    en: 'Whoever is deprived of gentleness is deprived of all good.',
    ru: 'Тот, кто лишён мягкости, лишён всякого блага.',
    uz: 'Kim yumshoqlikdan mahrum boʻlsa, butun yaxshilikdan mahrum boʻladi.',
  },
  {
    n: 6602, book: 'muslim', no: '2594', ref: [45, 100], tags: ['character', 'speech'],
    en: 'Gentleness is not found in anything but it adorns it, and it is not taken from anything but it spoils it.',
    ru: 'Мягкость, в чём бы она ни была, непременно украшает это, а то, из чего она изымается, непременно портится.',
    uz: 'Yumshoqlik qaysi narsada boʻlsa, uni ziynatlaydi, qaysi narsadan olinsa, uni xunuk qiladi.',
  },
  {
    n: 6690, book: 'muslim', no: '2626', ref: [45, 187], tags: ['character', 'friends'],
    en: 'Do not think little of any good deed, even meeting your brother with a cheerful face.',
    ru: 'Не пренебрегай никаким добрым делом, даже если это встреча с братом с приветливым лицом.',
    uz: 'Yaxshilikdan hech narsani arzimas sanama, hatto birodaringni ochiq yuz bilan qarshi olishni ham.',
  },
  {
    n: 6688, book: 'muslim', no: '2625', ref: [45, 185], tags: ['friends', 'charity'],
    en: 'When you cook a stew, add more water to it and give some to your neighbours.',
    ru: 'Когда готовишь похлёбку, добавь в неё воды и угости соседей.',
    uz: 'Shoʻrva pishirsang, suvini koʻpaytir va qoʻshnilaringdan xabar ol.',
  },
  {
    n: 6811, book: 'muslim', no: '2678', ref: [48, 7], tags: ['dhikr', 'faith'],
    en: 'When one of you supplicates, let him ask with resolve and not say, ‘O Allah, give me if You wish,’ for no one can compel Allah.',
    ru: 'Когда кто-нибудь из вас обращается с мольбой, пусть просит решительно и не говорит: «О Аллах, дай мне, если пожелаешь», ибо никто не может принудить Аллаха.',
    uz: 'Birortangiz duo qilsa, qatʼiyat bilan soʻrasin va: «Ey Alloh, xohlasang, menga ber», demasin. Chunki Allohni majburlovchi hech kim yoʻq.',
  },
  {
    n: 6927, book: 'muslim', no: '2732', ref: [48, 119], tags: ['dhikr', 'friends'],
    en: 'No believer prays for his brother in his absence but the angel says: ‘And for you the same.’',
    ru: 'Когда верующий молится за своего брата заочно, ангел непременно говорит: «И тебе того же».',
    uz: 'Qaysi bir moʻmin birodarining ortidan (gʻoyibona) duo qilsa, farishta: «Senga ham xuddi shunday boʻlsin», deydi.',
  },
  {
    n: 6932, book: 'muslim', no: '2734', ref: [48, 123], tags: ['gratitude', 'dhikr'],
    en: 'Allah is pleased with the servant who eats a morsel and praises Him for it, or drinks a drink and praises Him for it.',
    ru: 'Поистине, Аллах доволен рабом, который съест что-то и восхвалит Его за это или выпьет что-то и восхвалит Его за это.',
    uz: 'Albatta, Alloh bir luqma yeb, buning uchun Unga hamd aytgan yoki bir qultum ichib, buning uchun Unga hamd aytgan bandasidan rozi boʻladi.',
  },
  {
    n: 6953, book: 'muslim', no: '2675', ref: [50, 2], tags: ['mercy', 'faith'],
    en: 'Allah is more pleased with the repentance of His servant than one of you who finds his lost camel.',
    ru: 'Аллах радуется покаянию Своего раба сильнее, чем любой из вас, нашедший своего потерянного верблюда.',
    uz: 'Alloh bandasining tavbasidan, sizlardan birortangiz yoʻqolgan tuyasini topib olgandagidan ham koʻproq xursand boʻladi.',
  },
  {
    n: 6973, book: 'muslim', no: '2752', ref: [50, 21], tags: ['mercy'],
    en: 'Allah created mercy in one hundred parts. He sent one part among His creation and kept ninety-nine with Himself for the Day of Resurrection.',
    ru: 'Аллах создал милость из ста частей. Одну часть Он распределил среди творений, а девяносто девять оставил у Себя для Дня воскресения.',
    uz: 'Alloh rahmatni yuz qism qilib yaratdi. Bir qismini maxluqotlari orasida taqsimladi, toʻqson toʻqqizini esa Qiyomat kuni uchun Oʻz huzurida qoldirdi.',
  },
  {
    n: 7121, book: 'muslim', no: '2817', ref: [52, 74], tags: ['mercy', 'faith'],
    en: 'None of you will enter Paradise by his deeds alone, nor be saved from the Fire by them, not even I, except by the mercy of Allah.',
    ru: 'Никого из вас не введут в Рай одни лишь его дела и не спасут от Огня, даже меня, — только милость Аллаха.',
    uz: 'Sizlardan hech kimni amali jannatga kiritmaydi va doʻzaxdan qutqarmaydi, hatto meni ham. Faqat Allohning rahmati bilan (kiriladi).',
  },
  {
    n: 7229, book: 'muslim', no: '2877', ref: [53, 98], tags: ['faith', 'time'],
    en: 'Let none of you die except while thinking well of Allah.',
    ru: 'Пусть никто из вас не умирает иначе, как ожидая от Аллаха лишь хорошего.',
    uz: 'Sizlardan hech biringiz Alloh haqida yaxshi gumonda boʻlmagan holda vafot etmasin.',
  },
  {
    n: 7417, book: 'muslim', no: '2956', ref: [55, 1], tags: ['patience', 'time'],
    en: 'The world is a prison for the believer and a paradise for the disbeliever.',
    ru: 'Этот мир — тюрьма для верующего и рай для неверующего.',
    uz: 'Dunyo moʻmin uchun zindon, kofir uchun jannatdir.',
  },
  {
    n: 7477, book: 'muslim', no: '2987', ref: [55, 60], tags: ['intention'],
    en: 'Whoever does deeds to be heard of, Allah will expose him; and whoever does deeds to be seen, Allah will show him up.',
    ru: 'Того, кто делает дела, чтобы о них услышали, Аллах ославит, а того, кто делает их напоказ, Аллах выставит напоказ.',
    uz: 'Kim (amalini) odamlar eshitsin deb qilsa, Alloh uni sharmanda qiladi. Kim koʻrsin deb qilsa, Alloh uni (aybini) koʻrsatib qoʻyadi.',
  },
  {
    n: 7481, book: 'muslim', no: '2988', ref: [55, 64], tags: ['speech'],
    en: 'A servant may speak a word without thinking about it, and because of it fall into the Fire farther than the distance between east and west.',
    ru: 'Раб может произнести слово, не задумываясь о нём, и из-за него низвергнуться в Огонь дальше, чем расстояние между востоком и западом.',
    uz: 'Banda oʻylamasdan bir soʻz aytadi-yu, u sababli doʻzaxga mashriq bilan magʻrib orasidan ham uzoqroq masofaga qulaydi.',
  },
  {
    n: 136, book: 'muslim', no: '26', ref: [1, 43], tags: ['faith'],
    en: 'Whoever dies knowing that there is no god but Allah will enter Paradise.',
    ru: 'Тот, кто умер, зная, что нет бога, кроме Аллаха, войдёт в Рай.',
    uz: 'Kim Allohdan oʻzga iloh yoʻqligini bilgan holda vafot etsa, jannatga kiradi.',
  },
  {
    n: 6758, book: 'muslim', no: '2658', ref: [46, 36], tags: ['faith'],
    en: 'Every child is born upon the fitrah, the natural faith.',
    ru: 'Каждый ребёнок рождается в естественном состоянии (фитре).',
    uz: 'Har bir bola fitrat (sof tabiat) ustida tugʻiladi.',
  },
  {
    n: 6749, book: 'muslim', no: '2653', ref: [46, 27], tags: ['faith', 'patience'],
    en: 'Allah wrote the destinies of creation fifty thousand years before He created the heavens and the earth.',
    ru: 'Аллах записал судьбы творений за пятьдесят тысяч лет до того, как сотворил небеса и землю.',
    uz: 'Alloh osmonlar va yerni yaratishdan ellik ming yil oldin maxluqotlarning taqdirini yozib qoʻygan.',
  },
  {
    n: 176, book: 'muslim', no: '48', ref: [1, 83], tags: ['speech', 'friends'],
    en: 'Whoever believes in Allah and the Last Day should be good to his neighbour, honour his guest, and speak good or keep silent.',
    ru: 'Пусть тот, кто верует в Аллаха и в Последний день, делает добро соседу, оказывает уважение гостю и говорит благое или молчит.',
    uz: 'Kim Allohga va oxirat kuniga iymon keltirsa, qoʻshnisiga yaxshilik qilsin, mehmonini hurmat qilsin va yaxshi gapirsin yoki jim tursin.',
  },
  {
    n: 196, book: 'muslim', no: '55', ref: [1, 103], tags: ['faith', 'character'],
    en: 'Religion is sincerity: to Allah, to His Book, to His Messenger, to the leaders of the Muslims and to all of them.',
    ru: 'Религия — это искренность: по отношению к Аллаху, Его Книге, Его посланнику, руководителям мусульман и всем мусульманам.',
    uz: 'Din — nasihat (samimiyat)dir: Allohga, Uning Kitobiga, Rasuliga, musulmonlarning rahbarlariga va barcha musulmonlarga.',
  },
  {
    n: 265, book: 'muslim', no: '91', ref: [1, 171], tags: ['character'],
    en: 'Whoever has an atom’s weight of pride in his heart will not enter Paradise. Allah is beautiful and loves beauty. Pride is rejecting the truth and looking down on people.',
    ru: 'Не войдёт в Рай тот, в чьём сердце высокомерие весом хотя бы с пылинку. Аллах прекрасен и любит прекрасное, а высокомерие — это отвержение истины и презрение к людям.',
    uz: 'Qalbida zarra misqolicha kibr boʻlgan kishi jannatga kirmaydi. Alloh goʻzaldir va goʻzallikni sevadi. Kibr — haqni inkor etish va odamlarni mensimaslikdir.',
  },
  {
    n: 2346, book: 'muslim', no: '1015', ref: [12, 83], tags: ['work', 'faith'],
    en: 'Allah is good and accepts only what is good.',
    ru: 'Поистине, Аллах благой, и Он не принимает ничего, кроме благого.',
    uz: 'Albatta, Alloh pokdir va faqat pok narsani qabul qiladi.',
  },
  {
    n: 4223, book: 'muslim', no: '1631', ref: [25, 20], tags: ['knowledge', 'charity', 'time'],
    en: 'When a person dies, his deeds end except for three: ongoing charity, knowledge that benefits, or a righteous child who prays for him.',
    ru: 'Когда человек умирает, его дела прекращаются, кроме трёх: непрекращающейся милостыни, знания, приносящего пользу, и праведного ребёнка, который молится за него.',
    uz: 'Inson vafot etsa, amali uziladi, faqat uch narsa qoladi: joriy sadaqa, foyda beradigan ilm yoki unga duo qiladigan solih farzand.',
  },
  {
    n: 4899, book: 'muslim', no: '1893', ref: [33, 195], tags: ['knowledge', 'charity'],
    en: 'Whoever guides someone to good has a reward like the one who does it.',
    ru: 'Тому, кто указал на благое, достанется такая же награда, как и совершившему его.',
    uz: 'Kim yaxshilikka yoʻl koʻrsatsa, unga shu yaxshilikni qilgan kishining ajri kabi ajr bor.',
  },
  {
    n: 6948, book: 'muslim', no: '2742', ref: [49, 12], tags: ['time', 'work'],
    en: 'The world is sweet and green, and Allah has placed you in it to see how you act.',
    ru: 'Этот мир сладок и зелен, и Аллах сделал вас в нём преемниками, чтобы посмотреть, как вы будете поступать.',
    uz: 'Dunyo shirin va yam-yashildir. Alloh sizlarni unda oʻrinbosar qilib, qanday amal qilishingizga qaraydi.',
  },
  {
    n: 7500, book: 'muslim', no: '2999', ref: [55, 82], tags: ['patience', 'gratitude'],
    en: 'How wonderful is the affair of the believer! All of it is good: if good comes to him he is grateful, and that is good for him; if hardship comes to him he is patient, and that is good for him.',
    ru: 'Сколь удивительно положение верующего! Всё в нём — благо: если его постигает радость, он благодарит, и это благо для него; если его постигает беда, он терпит, и это тоже благо для него.',
    uz: 'Moʻminning ishi naqadar ajoyib! Uning har bir ishi yaxshilikdir: unga xursandchilik yetsa, shukr qiladi va bu uning uchun yaxshilik boʻladi. Unga zarar yetsa, sabr qiladi va bu ham uning uchun yaxshilik boʻladi.',
  },
  {
    n: 6774, book: 'muslim', no: '2664', ref: [46, 52], tags: ['work', 'patience', 'habit'],
    en: 'The strong believer is better and dearer to Allah than the weak believer, and there is good in both. Strive for what benefits you, seek Allah’s help and do not give up.',
    ru: 'Сильный верующий лучше и любимее Аллахом, чем слабый верующий, но в каждом из них есть благо. Стремись к тому, что приносит тебе пользу, проси помощи у Аллаха и не опускай руки.',
    uz: 'Kuchli moʻmin zaif moʻmindan yaxshiroq va Allohga suyukliroqdir, ikkisida ham yaxshilik bor. Senga foyda beradigan narsaga intil, Allohdan yordam soʻra va ojiz boʻlma.',
  },
  {
    n: 5601, book: 'muslim', no: '2137', ref: [38, 16], tags: ['dhikr'],
    en: 'The words dearest to Allah are four: Subhan Allah, al-hamdu lillah, la ilaha illallah and Allahu akbar. It does not matter which you begin with.',
    ru: 'Больше всего Аллах любит четыре слова: «Субхана-Ллах», «Аль-хамду ли-Ллях», «Ля иляха илля-Ллах» и «Аллаху акбар», — и неважно, с какого начать.',
    uz: 'Allohga eng sevimli soʻzlar toʻrtta: «Subhanalloh», «Alhamdulillah», «Lā ilāha illalloh» va «Allohu akbar». Qaysi biri bilan boshlasang ham zarari yoʻq.',
  },
  {
    n: 1493, book: 'muslim', no: '657', ref: [5, 326], tags: ['prayer'],
    en: 'Whoever prays the morning prayer is under the protection of Allah.',
    ru: 'Тот, кто совершил утреннюю молитву, находится под защитой Аллаха.',
    uz: 'Kim bomdod namozini oʻqisa, u Allohning himoyasidadir.',
  },
  {
    n: 578, book: 'muslim', no: '245', ref: [2, 45], tags: ['prayer', 'habit'],
    en: 'Whoever performs ablution well, his sins leave his body, even from under his nails.',
    ru: 'Грехи того, кто совершит омовение наилучшим образом, покидают его тело, выходя даже из-под ногтей.',
    uz: 'Kim tahoratni chiroyli qilsa, gunohlari tanasidan chiqib ketadi, hatto tirnoqlari ostidan ham chiqadi.',
  },
  {
    n: 194, book: 'muslim', no: '54', ref: [1, 101], tags: ['friends', 'faith'],
    en: 'You will not enter Paradise until you believe, and you will not believe until you love one another. Shall I tell you what will make you love one another? Spread the greeting of peace among you.',
    ru: 'Вы не войдёте в Рай, пока не уверуете, и не уверуете, пока не полюбите друг друга. Указать ли вам на то, что приведёт вас к взаимной любви? Распространяйте между собой приветствие мира!',
    uz: 'Iymon keltirmaguningizcha jannatga kirmaysizlar, bir-biringizni sevmaguningizcha (komil) iymon keltirmaysizlar. Sizlarga bir narsani aytaymi, uni qilsangiz, bir-biringizni sevasizlar? Oʻrtangizda salomni yoyinglar.',
  },
  {
    n: 5055, book: 'muslim', no: '1955', ref: [34, 84], tags: ['character', 'work', 'mercy'],
    en: 'Allah has prescribed excellence in everything.',
    ru: 'Поистине, Аллах предписал совершенство во всём.',
    uz: 'Albatta, Alloh har bir narsada ehsonni (ishni chiroyli qilishni) farz qilgan.',
  },
  {
    n: 6853, book: 'muslim', no: '2699', ref: [48, 48], tags: ['knowledge', 'friends', 'quran'],
    en: 'Whoever relieves a believer of a hardship of this world, Allah will relieve him of a hardship of the Day of Resurrection. Allah helps a servant as long as he helps his brother. Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise.',
    ru: 'Того, кто избавит верующего от одной из печалей этого мира, Аллах избавит от одной из печалей Дня воскресения. Аллах помогает рабу, пока раб помогает своему брату. Тому, кто встанет на путь поиска знания, Аллах облегчит путь в Рай.',
    uz: 'Kim bir moʻminning dunyo gʻamlaridan birini ketkazsa, Alloh undan Qiyomat kuni gʻamlaridan birini ketkazadi. Banda birodariga yordam berar ekan, Alloh unga yordam beradi. Kim ilm izlab yoʻlga chiqsa, Alloh unga jannatga yoʻlni oson qiladi.',
  },
];
