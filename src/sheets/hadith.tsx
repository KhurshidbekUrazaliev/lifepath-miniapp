// The whole hadith behind a quote: the Arabic, the full translation and a link to sunnah.com.
// The full texts load only when this sheet opens.
import { useEffect, useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { HADITH_BOOK, findHadith, hadithId, hadithLink, hadithSource, hadithUrl } from '../content/hadith';
import { getLang, t } from '../i18n';
import { openLink } from '../tg/telegram';
import { Card, Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';

type Full = Record<string, { en: string; ru: string; ar: string }>;
let cache: Full | null = null;

export function HadithSheet({ n, book, onClose }: { n: number; book?: 'muslim'; onClose: () => void }) {
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
  const id = hadithId({ n, book });
  const short = findHadith(id);
  const text = full?.[id];
  // There is no Uzbek edition: Uzbek readers get an AI translation, as in the bot.
  const translation = lang === 'uz' ? short?.uz : text?.[lang] || short?.[lang];

  return (
    <Sheet
      title={short ? hadithSource(short, lang) : `${HADITH_BOOK[lang]} ${n}`}
      onClose={onClose}
      foot={
        <Tap className="btn soft" onTap={() => openLink(short ? hadithUrl(short) : hadithLink(n))}>
          <ArrowSquareOut size={18} weight="duotone" />
          {t('hadith.open')}
        </Tap>
      }
    >
      {text?.ar ? (
        <Card>
          <div className="hadith-ar" dir="rtl" lang="ar">{text.ar}</div>
        </Card>
      ) : !full && !failed ? (
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
