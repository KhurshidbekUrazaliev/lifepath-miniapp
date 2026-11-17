import { createRoot } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import '@fontsource-variable/manrope';
// The Qurʼan font, for Arabic only: it downloads the first time Arabic is on screen.
import '@fontsource/amiri-quran/arabic-400.css';
import './styles/index.css';
import { App } from './App';
import { bootTelegram } from './tg/telegram';
import { useStore } from './store/store';
import { readCache, startSync, useSync } from './store/sync';
import { buildDemo } from './store/demo';
import { snapshot } from './store/store';
import { reportError, watchForErrors } from './store/report';
import { loadLang, resolveLang, setLang } from './i18n';
import { tgUser } from './tg/telegram';
import { AppBroken, ErrorBoundary } from './ui/ErrorBoundary';

bootTelegram();
// From here on the bot's server is told when the app breaks (store/report.ts).
watchForErrors();

async function start(): Promise<void> {
  // This device's saved copy shows instantly; the cloud catches up in the background.
  const cached = readCache();
  if (cached) {
    useStore.getState().replaceData(cached);
    useSync.setState({ ready: true });
  }

  // Only the language in use is fetched before the first screen is drawn (English is always here).
  // If it cannot be fetched the app starts in English and changes over once the texts arrive (App.tsx).
  const lang = resolveLang(useStore.getState().settings.lang, tgUser.lang);
  await loadLang(lang).catch(() => undefined);
  setLang(lang);

  // ?demo=1 fills the app with example data (handy for previews and screenshots).
  if (new URLSearchParams(window.location.search).has('demo')) {
    useStore.getState().replaceData(buildDemo(snapshot()));
  }

  startSync();
}

const root = createRoot(document.getElementById('root')!);
start().then(
  () =>
    // Phosphor icons default to duotone (bold or fill where a screen asks for it).
    root.render(
      <ErrorBoundary scope="app">
        <IconContext.Provider value={{ weight: 'duotone' }}>
          <App />
        </IconContext.Provider>
      </ErrorBoundary>,
    ),
  (e) => {
    // Starting failed before anything was drawn: the same screen a broken app gets, in place of the logo.
    reportError('error', e, 'start');
    root.render(<AppBroken />);
  },
);

// Development only: lets the preview be driven from the console.
if (import.meta.env.DEV) {
  void Promise.all([import('./store/nav'), import('./store/focus')]).then(([{ useNav }, { useFocus }]) => {
    (window as any).__lp = { nav: useNav, store: useStore, focus: useFocus };
  });
}
