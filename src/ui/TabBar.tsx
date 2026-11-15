// The floating bottom bar: Home, You, the glowing "+" that opens the create menu, Analytics, Inbox.
import { motion } from 'motion/react';
import { Bell, ChartPieSlice, House, Icon, User } from '@phosphor-icons/react';
import { Tab, useNav } from '../store/nav';
import { haptic } from '../tg/telegram';
import { t } from '../i18n';
import { cx } from './kit';

const ICONS: Record<Tab, Icon> = { home: House, you: User, stats: ChartPieSlice, inbox: Bell };

function TabButton({ id, dot }: { id: Tab; dot?: boolean }) {
  const on = useNav((s) => s.tab === id);
  const go = useNav((s) => s.go);
  const labels: Record<Tab, string> = { home: t('nav.home'), you: t('nav.you'), stats: t('nav.stats'), inbox: t('nav.inbox') };
  const Glyph = ICONS[id];
  return (
    <button type="button" className={cx('tab', on && 'on')} aria-label={labels[id]} aria-current={on ? 'page' : undefined} onClick={() => go(id)}>
      <motion.span style={{ display: 'grid' }} animate={{ scale: on ? 1.08 : 1, y: on ? -1 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
        <Glyph size={26} weight={on ? 'fill' : 'duotone'} />
      </motion.span>
      {dot ? <i className="tab-dot" /> : null}
    </button>
  );
}

export function TabBar({ inboxDot }: { inboxDot: boolean }) {
  const open = useNav((s) => s.open);
  const menuOpen = useNav((s) => s.sheet?.name === 'add');
  return (
    <nav className="tabbar">
      <TabButton id="home" />
      <TabButton id="you" />
      <motion.button
        type="button"
        className="tab-orb"
        aria-label={t('nav.add')}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          haptic('medium');
          open({ name: 'add' });
        }}
      >
        <motion.svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" animate={{ rotate: menuOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
          <path d="M12 5v14M5 12h14" />
        </motion.svg>
      </motion.button>
      <TabButton id="stats" />
      <TabButton id="inbox" dot={inboxDot} />
    </nav>
  );
}
