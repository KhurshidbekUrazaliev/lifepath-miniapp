// IlmulHaq (@islam_q_a_bot): a Telegram bot that answers questions about Islam with evidence from the
// Qurʼan and Sunnah. The prayer and Qurʼan screens point to it.
import { CaretRight } from '@phosphor-icons/react';
import { openLink } from '../tg/telegram';
import { t } from '../i18n';
import { Card, Tap } from './kit';
import { Emoji } from './Emoji';

export const ILMULHAQ_URL = 'https://t.me/islam_q_a_bot';

export const openIlmulHaq = (): void => openLink(ILMULHAQ_URL);

export function IlmulHaqCard() {
  return (
    <Tap onTap={openIlmulHaq} scale={0.98}>
      <Card pad={false} className="prayer-card">
        <span className="prayer-ic glyph"><Emoji e="💬" /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body" style={{ display: 'block', fontWeight: 700 }}>{t('ilmulhaq.title')}</span>
          <span className="t-small muted">{t('ilmulhaq.body')}</span>
        </span>
        <CaretRight size={18} weight="bold" className="chev" />
      </Card>
    </Tap>
  );
}
