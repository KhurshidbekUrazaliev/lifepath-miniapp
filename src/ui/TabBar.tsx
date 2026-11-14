// The floating bottom bar: Home, You, the glowing "+" that opens the create menu, Analytics, Inbox.
import { motion } from 'motion/react';
import { Tab, useNav } from '../store/nav';
import { haptic } from '../tg/telegram';
import { t } from '../i18n';
import { cx } from './kit';

const ICONS: Record<Tab, string[]> = {
  home: ['M3.2 10.9 12 3.3l8.8 7.6c.2.2.2.4.2.6V19a2 2 0 0 1-2 2h-3.5v-5.2a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5V21H5a2 2 0 0 1-2-2v-7.5c0-.2 0-.4.2-.6Z'],
  you: ['M12 12.2a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Z', 'M3.8 20.2c0-3.7 3.7-6 8.2-6s8.2 2.3 8.2 6c0 .5-.4.8-.9.8H4.7c-.5 0-.9-.3-.9-.8Z'],
  stats: ['M10.8 3.6A8.8 8.8 0 1 0 20.4 13.2H12a1.2 1.2 0 0 1-1.2-1.2V3.6Z', 'M13.2 2.6v7.2c0 .6.4 1 1 1h7.2A8.6 8.6 0 0 0 13.2 2.6Z'],
  inbox: ['M12 2.6a6.2 6.2 0 0 0-6.2 6.2v3.3L4 15.6c-.4.8.1 1.7 1 1.7h14c.9 0 1.4-.9 1-1.7l-1.8-3.5V8.8A6.2 6.2 0 0 0 12 2.6Z', 'M9.3 19a2.8 2.8 0 0 0 5.4 0H9.3Z'],
};

function TabButton({ id, dot }: { id: Tab; dot?: boolean }) {
  const on = useNav((s) => s.tab === id);
  const go = useNav((s) => s.go);
  const labels: Record<Tab, string> = { home: t('nav.home'), you: t('nav.you'), stats: t('nav.stats'), inbox: t('nav.inbox') };
  return (
    <button type="button" className={cx('tab', on && 'on')} aria-label={labels[id]} aria-current={on ? 'page' : undefined} onClick={() => go(id)}>
      <motion.svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor" animate={{ scale: on ? 1.08 : 1, y: on ? -1 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
        {ICONS[id].map((d) => (
          <path key={d} d={d} />
        ))}
      </motion.svg>
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
