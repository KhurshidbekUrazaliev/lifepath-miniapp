// Hadith the companion quotes: all from Sahih al-Bukhari, numbered as on sunnah.com.
//
// `en` and `ru` are shortened from the translations in the hadith-api collection (Muhsin Khan; the
// Russian edition there), keeping the Prophet's ﷺ words. There is no Uzbek edition, so `uz` is an AI
// translation and the app labels it that way (as the IlmulHaq bot does). The full texts, Arabic
// included, are in hadith-full.json (written by scripts/fetch-content.mjs).

export type HadithTag =
  | 'habit' | 'intention' | 'ease' | 'time' | 'dhikr' | 'quran' | 'knowledge' | 'prayer' | 'night'
  | 'ramadan' | 'work' | 'character' | 'mercy' | 'charity' | 'patience' | 'gratitude' | 'speech'
  | 'friends' | 'faith';

export interface Hadith {
  n: number;
  tags: HadithTag[];
  en: string;
  ru: string;
  uz: string;
}

export const HADITH_BOOK = { en: 'Sahih al-Bukhari', ru: 'Сахих аль-Бухари', uz: 'Sahih al-Buxoriy' } as const;
export const hadithLink = (n: number): string => `https://sunnah.com/bukhari:${n}`;

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
];
