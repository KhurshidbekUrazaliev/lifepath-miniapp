// The frame: theme, language, Telegram chrome, the four tabs, pushed screens, sheets and celebrations.
import { Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './store/store';
import { Route, Tab, openDeepLink, useNav } from './store/nav';
import { useSync } from './store/sync';
import {
  inTelegram, lowPerf, onTelegramEvent, paintChrome, setBackButton, setFullscreen, setHaptics, setSettingsButton,
  startParam, telegramScheme, tgUser,
} from './tg/telegram';
import { Lang, getLang, hasLang, loadLang, resolveLang, setLang } from './i18n';
import { TabBar } from './ui/TabBar';
import { Celebrations } from './ui/Celebrations';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Fetching, fetchWhenIdle, from, whenOpened } from './ui/onDemand';
import { SCREENS, TABS, fetchScreens } from './screens';
import { SheetHost, fetchSheets } from './sheets';
import { useInboxDot } from './screens/Inbox';
import { useServerSync } from './store/serverSync';
import { useFocusClock } from './store/focus';
import { growthFor } from './lib/companion';
import { warmCompanion } from './companion/warm';

// Only someone new sees the first-run screens, so they are not part of the first file.
const Onboarding = from(whenOpened(() => import('./screens/Onboarding')), 'Onboarding');

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
      {/* A screen that fails to draw says so here, and the rest of the app goes on. */}
      <ErrorBoundary scope="screen" name={route.name}>
        <Suspense fallback={<Fetching />}>
          <Component route={route as never} />
        </Suspense>
      </ErrorBoundary>
    </motion.section>
  );
}

/**
 * The language on screen. It is the one asked for as soon as its texts are here; while they are
 * being fetched (the language was just changed, here or on another device) the one before stays.
 */
function useShownLang(wanted: Lang): Lang {
  const [shown, setShown] = useState<Lang>(() => (hasLang(wanted) ? wanted : getLang()));
  useEffect(() => {
    if (shown === wanted) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      loadLang(wanted).then(
        () => alive && setShown(wanted),
        () => {
          // Offline, most likely: the old language stays and this asks again, less and less often.
          if (alive) timer = setTimeout(() => attempt(n + 1), Math.min(15_000, 1000 * 2 ** n));
        },
      );
    };
    attempt(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [wanted, shown]);
  return shown;
}

/**
 * Fetches the screens and sheets that are not in the first file, in the background, once the first
 * screen has been drawn: by the time something is tapped it is already here.
 */
function useFetchTheRest(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => {
      fetchSheets();
      fetchScreens();
      fetchWhenIdle(); // and a screen or sheet that is a file of its own
    }, 300);
    return () => clearTimeout(timer);
  }, [on]);
}

/**
 * Starts loading the 3D companion a moment after the app is up, so that its screen opens without a wait.
 * Runs again when the companion grows or changes clothes (what is loaded already is not loaded twice).
 */
function useWarmCompanion(on: boolean): void {
  // A companion from before there were girls has no gender written down and is a boy, as everywhere else.
  const gender = useStore((s) => (s.profile.echo ? s.profile.echo.gender ?? 'boy' : undefined));
  const stage = useStore((s) => growthFor(s.profile.xp).index);
  const outfit = useStore((s) => s.profile.outfit);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => warmCompanion(gender, stage, outfit), 800);
    return () => clearTimeout(timer);
  }, [on, gender, stage, outfit]);
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
      <ErrorBoundary scope="tab" name={`tab:${tab}`}>
        <Component />
      </ErrorBoundary>
    </motion.section>
  );
}

export function App() {
  const lang = useShownLang(useStore((s) => resolveLang(s.settings.lang, tgUser.lang)));
  const onboarded = useStore((s) => s.settings.onboarded);
  const fullscreen = useStore((s) => s.settings.fullscreen);
  const haptics = useStore((s) => s.profile.haptics);
  const ready = useSync((s) => s.ready);
  const tab = useNav((s) => s.tab);
  const stack = useNav((s) => s.stack);
  const sheet = useNav((s) => s.sheet);
  // The writing page is a page and nothing else: its own tools sit where the tab bar would be.
  const writing = useNav((s) => s.stack[s.stack.length - 1]?.name === 'page');
  const inboxDot = useInboxDot();

  useTheme();
  useServerSync();
  useWarmCompanion(ready);
  useFetchTheRest(ready);
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
            {writing ? null : <TabBar inboxDot={inboxDot} />}
            <FocusClock />
          </>
        ) : (
          <Suspense fallback={<div className="splash"><img src="/icon.svg" alt="" width={72} height={72} /></div>}>
            <Onboarding />
          </Suspense>
        )}
        <SheetHost />
        <Celebrations />
      </div>
    </div>
  );
}
