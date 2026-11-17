// What shows when a part of the app fails to draw: a screen that says so, in place of a blank window.
// There is one around the whole app, one around each tab, each pushed screen and each sheet, so a
// screen that breaks leaves the rest of the app working. Whatever is caught is reported (store/report.ts).
import { Component, ErrorInfo, ReactNode } from 'react';
import { CloudSlash, WarningCircle } from '@phosphor-icons/react';
import { isLoadError } from '../lib/errors';
import { reportError } from '../store/report';
import { useNav } from '../store/nav';
import { t } from '../i18n';
import { Card, Header, Screen, Tap } from './kit';
import { forgetFailed } from './onDemand';
import { Sheet } from './Sheet';

/** How much went with it: the whole app, a tab, a pushed screen, or a sheet. */
type Scope = 'app' | 'tab' | 'screen' | 'sheet';

interface Props {
  scope: Scope;
  /** What to call the place in the report: a route's name, "tab:home", "sheet:task". */
  name?: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
  /** It could not be fetched (the connection, or a new version replaced the files): trying again may be enough. */
  unfetched: boolean;
}

/** Reloads the page. Inside Telegram this starts the Mini App again from the server's copy. */
export function reloadApp(): void {
  try {
    window.location.reload();
  } catch {
    // nothing else to try
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, unfetched: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : error;
    return { failed: true, unfetched: isLoadError(message) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The failure is on screen now, so a file that could not be fetched may be asked for again.
    forgetFailed();
    reportError('render', error, this.props.name, info.componentStack);
  }

  /** Draws the children again. For something that could not be fetched this asks for it again. */
  retry = (): void => this.setState({ failed: false, unfetched: false });

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { scope } = this.props;
    if (scope === 'app') return <AppBroken />;
    if (scope === 'sheet') return <SheetBroken unfetched={this.state.unfetched} retry={this.retry} />;
    return <ScreenBroken tab={scope === 'tab'} unfetched={this.state.unfetched} retry={this.retry} />;
  }
}

/**
 * The whole app failed (or could not start). Nothing here uses the app's own pieces: one of them may
 * be what broke.
 */
export function AppBroken() {
  return (
    <div className="app">
      <div className="bg" />
      <div className="oops" role="alert">
        <img className="oops-logo" src="/icon.svg" alt="" width={72} height={72} />
        <h1 className="oops-title">{t('err.app.title')}</h1>
        <p className="oops-body">{t('err.app.body')}</p>
        <button type="button" className="btn primary" onClick={reloadApp}>
          {t('err.reload')}
        </button>
      </div>
    </div>
  );
}

function Message({ unfetched }: { unfetched: boolean }) {
  return (
    <>
      <div className="empty-ic oops-ic">{unfetched ? <CloudSlash size={34} /> : <WarningCircle size={34} />}</div>
      <div className="t-h">{t(unfetched ? 'err.load.title' : 'err.screen.title')}</div>
      <div className="t-small muted">{t(unfetched ? 'err.load.body' : 'err.screen.body')}</div>
    </>
  );
}

/** A tab or a pushed screen failed: the tab bar and every other screen go on working. */
function ScreenBroken({ tab, unfetched, retry }: { tab: boolean; unfetched: boolean; retry: () => void }) {
  const pop = useNav((s) => s.pop);
  // A tab has nowhere to go back to, so there the first button draws it again.
  const again = unfetched || tab;
  return (
    <Screen>
      <Header title="LifePath" noGear />
      <Card className="empty" pad={false}>
        <Message unfetched={unfetched} />
        <div className="oops-actions" role="alert">
          {again ? <Tap className="btn primary" onTap={retry}>{t('common.retry')}</Tap> : null}
          {tab ? null : <Tap className={again ? 'btn soft' : 'btn primary'} onTap={pop}>{t('common.back')}</Tap>}
          <Tap className={again && !tab ? 'btn ghost' : 'btn soft'} onTap={reloadApp}>{t('err.reload')}</Tap>
        </div>
      </Card>
    </Screen>
  );
}

function SheetBroken({ unfetched, retry }: { unfetched: boolean; retry: () => void }) {
  const close = useNav((s) => s.close);
  return (
    <Sheet title="LifePath" onClose={close}>
      <div className="empty oops-sheet" role="alert">
        <Message unfetched={unfetched} />
        <div className="oops-actions">
          {unfetched ? <Tap className="btn primary" onTap={retry}>{t('common.retry')}</Tap> : null}
          <Tap className={unfetched ? 'btn soft' : 'btn primary'} onTap={close}>{t('common.close')}</Tap>
          <Tap className={unfetched ? 'btn ghost' : 'btn soft'} onTap={reloadApp}>{t('err.reload')}</Tap>
        </div>
      </div>
    </Sheet>
  );
}
