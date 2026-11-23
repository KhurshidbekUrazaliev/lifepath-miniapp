// The phone app's link to Telegram: sign in through the bot, so the data, rankings and friends of the
// Mini App are here too (native/account.ts). Shown in the phone app and in a browser, never in Telegram.
import { useEffect, useState } from 'react';
import { AndroidLogo, DownloadSimple, SignOut, SpinnerGap, TelegramLogo } from '@phosphor-icons/react';
import { t } from '../i18n';
import { useServer } from '../store/server';
import { useSync } from '../store/sync';
import { openLink, tgUser } from '../tg/telegram';
import { Card, Glyph, Tap } from '../ui/kit';
import { appToken, cancelSignIn, signIn, signOut, useSignIn } from './account';
import { APK_URL, BOT_URL, LATEST_ANDROID_BUILD, androidBuild } from './bridge';

/** The button alone, with what is happening under it (the first screen uses this). */
export function SignInButton({ className = 'btn soft' }: { className?: string }) {
  const state = useSignIn((s) => s.state);
  const server = useServer((s) => s.status);
  if (appToken()) {
    // Signed in, but nothing came down yet: the Mini App has not sent its data to the shared copy.
    return (
      <div className="t-small muted center" style={{ lineHeight: 1.5 }}>
        <div className="t-body" style={{ color: 'var(--text)', marginBottom: 4 }}>
          {tgUser.username ? `@${tgUser.username}` : tgUser.firstName || t('app.signedIn')}
        </div>
        {server === 'ok' ? t('app.signin.empty') : t('app.signedIn.offline')}
        <Tap className="btn soft sm" style={{ margin: '10px auto 0', width: 'auto', padding: '0 18px' }} onTap={() => openLink(`${BOT_URL}?startapp`)}>
          <TelegramLogo size={17} weight="fill" />
          {t('web.telegram')}
        </Tap>
      </div>
    );
  }
  const waiting = state === 'waiting';
  return (
    <>
      <Tap className={className} onTap={() => (waiting ? cancelSignIn() : void signIn())}>
        {waiting ? <SpinnerGap size={18} className="spin" /> : <TelegramLogo size={18} weight="fill" />}
        {waiting ? t('app.signin.waiting') : t('app.signin')}
      </Tap>
      {state === 'expired' || state === 'failed' ? (
        <div className="t-small center" style={{ color: 'var(--orange)' }}>{t(state === 'expired' ? 'app.signin.expired' : 'app.signin.failed')}</div>
      ) : null}
    </>
  );
}

/** Settings: signed in as whom, or the way to sign in. */
export function AccountCard() {
  const server = useServer((s) => s.status);
  const shared = useSync((s) => s.shared);
  const signedIn = !!appToken();

  if (!signedIn) {
    return (
      <Card>
        <div className="row" style={{ gap: 14, marginBottom: 12 }}>
          <Glyph className="bubble" color="var(--blue-hi)" icon={<TelegramLogo size={21} />} />
          <div className="grow">
            <div className="t-body">{t('app.signin.title')}</div>
            <div className="t-small muted">{t('app.signin.hint')}</div>
          </div>
        </div>
        <SignInButton className="btn primary" />
      </Card>
    );
  }

  const sub =
    server === 'off' ? t('app.signedIn.offline')
    : shared === 'syncing' || shared === 'off' ? t('app.signedIn.syncing')
    : shared === 'offline' ? t('app.signedIn.offline')
    : t('app.signedIn.synced');
  return (
    <Card className="row" style={{ gap: 14 }}>
      <Glyph className="bubble" color="var(--blue-hi)" icon={<TelegramLogo size={21} />} />
      <div className="grow">
        <div className="t-body clip">{tgUser.username ? `@${tgUser.username}` : tgUser.firstName || t('app.signedIn')}</div>
        <div className="t-small muted">{sub}</div>
      </div>
      <Tap className="ibtn sm" onTap={() => void signOut()} label={t('app.signout')} scale={0.88}>
        <SignOut size={16} />
      </Tap>
    </Card>
  );
}

/** Settings: shown when GitHub has a newer Android build than this phone's. */
export function UpdateCard() {
  const [old, setOld] = useState(false);
  useEffect(() => {
    void androidBuild().then((build) => setOld(build > 0 && build < LATEST_ANDROID_BUILD));
  }, []);
  if (!old) return null;
  return (
    <Card className="row" style={{ gap: 14 }}>
      <Glyph className="bubble" color="var(--green)" icon={<DownloadSimple size={21} />} />
      <div className="grow">
        <div className="t-body">{t('app.update')}</div>
        <div className="t-small muted">{t('app.update.hint')}</div>
      </div>
      <Tap className="btn primary sm pill" style={{ width: 'auto' }} onTap={() => openLink(APK_URL)}>
        <DownloadSimple size={16} />
      </Tap>
    </Card>
  );
}

/** The two other ways to use LifePath, for the browser (the first screen and Settings). */
export function GetTheApp() {
  return (
    <div className="row" style={{ gap: 10 }}>
      <Tap className="btn soft sm" style={{ flex: 1 }} onTap={() => (window.location.href = APK_URL)}>
        <AndroidLogo size={17} weight="fill" />
        Android
      </Tap>
      <Tap className="btn soft sm" style={{ flex: 1 }} onTap={() => openLink(BOT_URL)}>
        <TelegramLogo size={17} weight="fill" />
        Telegram
      </Tap>
    </div>
  );
}

/** Settings in a browser: the phone app and the Mini App. */
export function GetAppCard() {
  return (
    <Card>
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <Glyph className="bubble" color="var(--green)" icon={<AndroidLogo size={21} />} />
        <div className="grow">
          <div className="t-body">{t('web.android')}</div>
          <div className="t-small muted">{t('web.android.hint')}</div>
        </div>
      </div>
      <GetTheApp />
    </Card>
  );
}
