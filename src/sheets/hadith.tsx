// The whole hadith behind a quote: the Arabic, the full translation and a link to sunnah.com.
// The full texts load only when this sheet opens.
import { useEffect, useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { HADITHS, HADITH_BOOK, hadithLink } from '../content/hadith';
import { getLang, t } from '../i18n';
import { openLink } from '../tg/telegram';
import { Card, Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { dailyHadithFull } from '../store/daily';

type Full = Record<string, { en: string; ru: string; ar: string }>;
let cache: Full | null = null;

export function HadithSheet({ n, onClose }: { n: number; onClose: () => void }) {
  const [full, setFull] = useState<Full | null>(cache);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache) return;
    import('../content/hadith-full.json')
      .then((m) => {
        cache = m.default as Full;
        setFull(cache);
      })
      .catch(() => setFailed(true));
  }, []);

  const lang = getLang();
  const short = HADITHS.find((h) => h.n === n);
  // The server's random hadith of the day brings its own full texts; the app's own come from the file.
  const daily = dailyHadithFull(n);
  const text = daily ? { en: daily.en, ru: daily.ru, ar: daily.ar ?? '' } : full?.[String(n)];
  // There is no Uzbek edition: Uzbek readers get an AI translation, as in the bot.
  const translation = lang === 'uz' ? daily?.uz ?? short?.uz : text?.[lang] || short?.[lang];

  return (
    <Sheet
      title={`${HADITH_BOOK[lang]} ${n}`}
      onClose={onClose}
      foot={
        <Tap className="btn soft" onTap={() => openLink(hadithLink(n))}>
          <ArrowSquareOut size={18} weight="duotone" />
          {t('hadith.open')}
        </Tap>
      }
    >
      {text?.ar ? (
        <Card>
          <div className="hadith-ar" dir="rtl" lang="ar">{text.ar}</div>
        </Card>
      ) : !daily && !full && !failed ? (
        <Card><div className="t-small muted center">{t('hadith.loading')}</div></Card>
      ) : null}
      {translation ? (
        <Card>
          <p className="hadith-text">{translation}</p>
          {lang === 'uz' ? <div className="t-tiny faint" style={{ marginTop: 10 }}>{t('advice.ai')}</div> : null}
        </Card>
      ) : null}
      <div className="t-tiny faint center">{t('hadith.numbering')}</div>
    </Sheet>
  );
}
