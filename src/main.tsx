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

// Phosphor icons default to duotone (bold or fill where a screen asks for it).
createRoot(document.getElementById('root')!).render(
  <IconContext.Provider value={{ weight: 'duotone' }}>
    <App />
  </IconContext.Provider>,
);

// Development only: lets the preview be driven from the console.
if (import.meta.env.DEV) {
  void Promise.all([import('./store/nav'), import('./store/focus')]).then(([{ useNav }, { useFocus }]) => {
    (window as any).__lp = { nav: useNav, store: useStore, focus: useFocus };
  });
}
