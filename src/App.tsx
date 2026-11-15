// The frame: theme, language, Telegram chrome, the four tabs, pushed screens, sheets and celebrations.
import { Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './store/store';
import { Route, Tab, openDeepLink, useNav } from './store/nav';
import { useSync } from './store/sync';
import {
  inTelegram, lowPerf, onTelegramEvent, paintChrome, setBackButton, setFullscreen, setHaptics, setSettingsButton,
  startParam, telegramScheme, tgUser,
} from './tg/telegram';
import { resolveLang, setLang } from './i18n';
import { TabBar } from './ui/TabBar';
import { Celebrations } from './ui/Celebrations';
import { SCREENS, TABS } from './screens';
import { SheetHost } from './sheets';
import { Onboarding } from './screens/Onboarding';
import { useInboxDot } from './screens/Inbox';
import { useServerSync } from './store/serverSync';
import { useFocusClock } from './store/focus';

const CHROME = { dark: '#070a13', light: '#eef2fa' } as const;

function useTheme(): void {
  const setting = useStore((s) => s.settings.theme);
  useEffect(() => {
    const apply = () => {
      const theme = setting === 'auto' ? telegramScheme() : setting;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
      paintChrome(CHROME[theme]);
      try {
        localStorage.setItem('lp:ui', JSON.stringify({ theme: setting }));
      } catch {
        // ignore
      }
    };
    apply();
    const off = onTelegramEvent('themeChanged', apply);
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!inTelegram) media?.addEventListener?.('change', apply);
    return () => {
      off();
      media?.removeEventListener?.('change', apply);
    };
  }, [setting]);
}

const viewMotion = {
  initial: { opacity: 0, x: 36 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 36 },
};

function Page({ route, top }: { route: Route; top: boolean }) {
  const Component = SCREENS[route.name];
  return (
    <motion.section
      className="view"
      initial={lowPerf ? false : viewMotion.initial}
      animate={top ? viewMotion.animate : { opacity: 0, x: -28 }}
      exit={lowPerf ? { opacity: 0 } : viewMotion.exit}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
      style={{ pointerEvents: top ? 'auto' : 'none' }}
      aria-hidden={!top}
    >
      <Suspense fallback={null}>
        <Component route={route as never} />
      </Suspense>
    </motion.section>
  );
}

/** Counts a focus session when it ends; mounted once the saved data has loaded. */
function FocusClock(): null {
  useFocusClock();
  return null;
}

function TabView({ tab, covered }: { tab: Tab; covered: boolean }) {
  const Component = TABS[tab];
  return (
    <motion.section
      key={tab}
      className="view"
      initial={lowPerf ? false : { opacity: 0, y: 10 }}
      animate={covered ? { opacity: 0, x: -28, y: 0 } : { opacity: 1, x: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
      style={{ pointerEvents: covered ? 'none' : 'auto' }}
      aria-hidden={covered}
    >
      <Component />
    </motion.section>
  );
}

export function App() {
  const lang = useStore((s) => resolveLang(s.settings.lang, tgUser.lang));
  const onboarded = useStore((s) => s.settings.onboarded);
  const fullscreen = useStore((s) => s.settings.fullscreen);
  const haptics = useStore((s) => s.profile.haptics);
  const ready = useSync((s) => s.ready);
  const tab = useNav((s) => s.tab);
  const stack = useNav((s) => s.stack);
  const sheet = useNav((s) => s.sheet);
  const inboxDot = useInboxDot();

  useTheme();
  useServerSync();
  setLang(lang); // before children render, so every string comes out in the right language

  useEffect(() => setHaptics(haptics), [haptics]);
  useEffect(() => setFullscreen(fullscreen), [fullscreen]);

  // Telegram's own back button closes the sheet first, then steps back through screens.
  const canGoBack = !!sheet || stack.length > 0;
  useEffect(() => {
    setBackButton(
      canGoBack
        ? () => {
            const nav = useNav.getState();
            if (nav.sheet) nav.close();
            else nav.pop();
          }
        : null,
    );
  }, [canGoBack]);

  useEffect(() => {
    setSettingsButton(() => useNav.getState().push({ name: 'settings' }));
  }, []);

  // A deep link (from a reminder button or a shared link) opens once the app is usable.
  useEffect(() => {
    if (ready && onboarded) openDeepLink(startParam);
  }, [ready, onboarded]);

  // A device with no saved copy waits for the first read of the cloud, showing the logo meanwhile.
  if (!ready) {
    return (
      <div className="app">
        <div className="bg" />
        <div className="splash"><img src="/icon.svg" alt="" width={72} height={72} /></div>
      </div>
    );
  }

  return (
    <div className="app" key={lang}>
      <div className="bg" />
      <div className="frame">
        <div className="topfade" />
        {onboarded ? (
          <>
            <TabView key={tab} tab={tab} covered={stack.length > 0} />
            <AnimatePresence initial={false}>
              {stack.map((route, i) => (
                <Page key={route.key} route={route} top={i === stack.length - 1} />
              ))}
            </AnimatePresence>
            <TabBar inboxDot={inboxDot} />
            <FocusClock />
          </>
        ) : (
          <Onboarding />
        )}
        <SheetHost />
        <Celebrations />
      </div>
    </div>
  );
}
