// The whole ayah of the day: the Arabic, the full translation with the translators' notes, the
// recitation with a choice of reciter, and a link to quran.com.
import { ArrowSquareOut } from '@phosphor-icons/react';
import { TRANSLATOR, passageByKey, passageLink, passageOfDay, passageRef } from '../lib/ayah';
import { dayKey } from '../lib/dates';
import { RECITERS, reciterOf } from '../content/reciters';
import { getLang, t } from '../i18n';
import { openLink } from '../tg/telegram';
import { playRecitation, useRecitation } from '../store/recitation';
import { useStore } from '../store/store';
import { Card, Chips, Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { AyahArabic, AyahTranslation, ListenButton } from '../ui/Ayah';

export function AyahSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const p = passageByKey(id) ?? passageOfDay(dayKey());
  const lang = getLang();
  const reciter = reciterOf(useStore((s) => s.settings.reciter));
  const setSettings = useStore((s) => s.setSettings);
  const rec = useRecitation();
  const active = rec.id === p.key && rec.status && rec.status !== 'error' ? rec.part : -1;

  const pick = (rid: string) => {
    setSettings({ reciter: rid });
    // Hearing the new voice right away is the point of choosing here.
    if (rec.id === p.key && rec.status !== 'paused') playRecitation(p.key, p.ayat.map((a) => a.k), rid);
  };

  return (
    <Sheet
      title={passageRef(p)}
      onClose={onClose}
      foot={
        <Tap className="btn soft" onTap={() => openLink(passageLink(p))}>
          <ArrowSquareOut size={18} />
          {t('verse.open')}
        </Tap>
      }
    >
      <Card className="ayah-sheet">
        <div className="ayah-ar big" dir="rtl" lang="ar">
          <AyahArabic p={p} active={active} />
        </div>
        <div className="row" style={{ gap: 12, marginTop: 6 }}>
          <ListenButton p={p} large />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="t-small" style={{ fontWeight: 700 }}>{rec.id === p.key && rec.status === 'error' ? t('verse.audioError') : reciter.name[lang]}</div>
            <div className="t-tiny muted">{t('verse.reciter')}</div>
          </div>
        </div>
      </Card>
      <Chips options={RECITERS.map((r) => ({ id: r.id, label: r.name[lang] }))} value={reciter.id} onChange={pick} />
      <Card>
        <p className="ayah-tr full">
          <AyahTranslation p={p} lang={lang} active={active} />
        </p>
        <div className="t-tiny faint" style={{ marginTop: 10 }}>{t('verse.translation', { name: TRANSLATOR[lang] })}</div>
      </Card>
    </Sheet>
  );
}
