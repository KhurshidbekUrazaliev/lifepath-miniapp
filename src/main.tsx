import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './styles/index.css';
import { App } from './App';
import { bootTelegram } from './tg/telegram';
import { useStore } from './store/store';
import { readCache, startSync, useSync } from './store/sync';
import { buildDemo } from './store/demo';
import { snapshot } from './store/store';
import { resolveLang, setLang } from './i18n';
import { tgUser } from './tg/telegram';

bootTelegram();

// This device's saved copy shows instantly; the cloud catches up in the background.
const cached = readCache();
if (cached) {
  useStore.getState().replaceData(cached);
  useSync.setState({ ready: true });
}
setLang(resolveLang(useStore.getState().settings.lang, tgUser.lang));

// ?demo=1 fills the app with example data (handy for previews and screenshots).
if (new URLSearchParams(window.location.search).has('demo')) {
  useStore.getState().replaceData(buildDemo(snapshot()));
}

startSync();

createRoot(document.getElementById('root')!).render(<App />);

// Development only: lets the preview be driven from the console.
if (import.meta.env.DEV) {
  void import('./store/nav').then(({ useNav }) => {
    (window as any).__lp = { nav: useNav, store: useStore };
  });
}
