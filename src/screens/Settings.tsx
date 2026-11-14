// Settings and its sub-pages: notifications, appearance, language, data and about.
import { useEffect, useState } from 'react';
import {
  Bell, Check as CheckIcon, Cloud, CloudOff, Database, Globe, Info, Moon, Pencil, RefreshCw, ShieldCheck, Target,
} from 'lucide-react';
import { useStore, snapshot } from '../store/store';
import { useNav } from '../store/nav';
import { exportJson, syncNow, useSync } from '../store/sync';
import { useServer } from '../store/server';
import { buildDemo } from '../store/demo';
import { buildReminders } from '../store/serverSync';
import { addToHomeScreen, canAddToHome, canFullscreen, haptic, openLink, tgUser } from '../tg/telegram';
import { LangSetting, ThemeSetting } from '../lib/types';
import { t, tn } from '../i18n';
import { fmtTime, pct } from '../i18n/format';
import { Avatar, Bar, Card, Field, Header, Row, Screen, Section, Segmented, Tap, Toggle } from '../ui/kit';
import { confirmSheet } from '../sheets/confirm';
import { RemindersSwitch } from './Inbox';

const VERSION = '0.1.0';

function syncLabel(status: string, last?: number): string {
  if (status === 'local') return t('settings.sync.local');
  if (status === 'syncing') return t('settings.sync.syncing');
  if (status === 'offline') return t('settings.sync.offline');
  if (!last) return t('settings.sync.syncing');
  const minutes = Math.floor((Date.now() - last) / 60000);
  return t('settings.sync.synced', { time: minutes < 1 ? t('settings.sync.justNow') : tn('settings.sync.minutes', minutes) });
}

export function Settings() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const setName = useStore((s) => s.setName);
  const setDailyGoal = useStore((s) => s.setDailyGoal);
  const push = useNav((s) => s.push);
  const sync = useSync();
  const [editing, setEditing] = useState(false);
  const [name, setNameDraft] = useState(profile.name || tgUser.firstName);
  const [, tick] = useState(0);

  // Keeps "2 min ago" fresh while the screen is open.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const themeName = { auto: t('theme.auto'), dark: t('theme.dark'), light: t('theme.light') }[settings.theme];
  const langName = { auto: t('lang.auto'), en: 'English', uz: 'Oʻzbekcha', ru: 'Русский' }[settings.lang];
  const goals = [20, 30, 50, 80];

  return (
    <Screen>
      <Header title={t('settings.title')} noGear />

      <Card>
        <div className="row" style={{ gap: 16 }}>
          <Avatar large />
          <div className="grow">
            <div className="t-title clip">{profile.name || tgUser.firstName || t('common.guest')}</div>
            {tgUser.username ? <div className="t-small muted clip">@{tgUser.username}</div> : null}
            <Tap className="btn soft sm pill" style={{ marginTop: 10, minHeight: 34 }} onTap={() => setEditing((v) => !v)}>
              <Pencil size={14} />
              {t('settings.editProfile')}
            </Tap>
          </div>
        </div>
        {editing ? (
          <form
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              setName(name);
              setEditing(false);
              haptic('success');
            }}
          >
            <Field label={t('settings.name')}>
              <input className="input" value={name} maxLength={32} placeholder={t('settings.name.ph')} onChange={(e) => setNameDraft(e.target.value)} enterKeyHint="done" autoFocus />
            </Field>
            <Tap className="btn primary" style={{ marginTop: 12 }} onTap={() => { setName(name); setEditing(false); }}>
              {t('common.save')}
            </Tap>
          </form>
        ) : null}
      </Card>

      <Card className="row" style={{ gap: 14 }}>
        <span className="bubble" style={{ color: sync.status === 'offline' ? 'var(--orange)' : 'var(--blue-hi)', background: 'var(--accent-soft)' }}>
          {sync.status === 'offline' || sync.status === 'local' ? <CloudOff size={21} /> : <Cloud size={21} />}
        </span>
        <div className="grow">
          <div className="t-body">{t('settings.sync')}</div>
          <div className="t-small muted">{syncLabel(sync.status, sync.lastSyncedAt)}</div>
        </div>
        {sync.status !== 'local' ? (
          <Tap className="ibtn sm" onTap={() => void syncNow()} label={t('common.retry')} scale={0.88}>
            <RefreshCw size={16} className={sync.status === 'syncing' ? 'spin' : undefined} />
          </Tap>
        ) : null}
      </Card>

      <Card pad={false} className="list">
        <Row icon={<Bell size={21} />} title={t('settings.notifications')} value={settings.reminders ? t('inbox.reminders.on') : undefined} onTap={() => push({ name: 'notifications' })} />
        <Row icon={<Moon size={21} />} title={t('settings.appearance')} value={themeName} onTap={() => push({ name: 'appearance' })} />
        <Row icon={<Globe size={21} />} title={t('settings.language')} value={langName} onTap={() => push({ name: 'language' })} />
        <Row icon={<ShieldCheck size={21} />} title={t('settings.data')} onTap={() => push({ name: 'data' })} />
        <Row icon={<Info size={21} />} title={t('settings.about')} onTap={() => push({ name: 'about' })} />
      </Card>

      <Card>
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <Target size={21} />
          <span className="t-body grow">{t('settings.dailyGoal')}</span>
          <span className="lrow-val num">{t('common.xp', { n: profile.dailyGoalXp })}</span>
        </div>
        <Segmented
          value={String(goals.includes(profile.dailyGoalXp) ? profile.dailyGoalXp : 30)}
          onChange={(v) => setDailyGoal(Number(v))}
          options={goals.map((g) => ({ id: String(g), label: String(g) }))}
        />
      </Card>

      <div className="t-tiny faint center" style={{ marginTop: 4 }}>LifePath · {t('about.version', { v: VERSION })}</div>
    </Screen>
  );
}

export function Appearance() {
  const settings = useStore((s) => s.settings);
  const haptics = useStore((s) => s.profile.haptics);
  const setSettings = useStore((s) => s.setSettings);
  const toggleHaptics = useStore((s) => s.toggleHaptics);
  return (
    <Screen>
      <Header title={t('settings.appearance')} noGear />
      <Card>
        <div className="t-body" style={{ marginBottom: 12 }}>{t('appearance.theme')}</div>
        <Segmented<ThemeSetting>
          value={settings.theme}
          onChange={(theme) => setSettings({ theme })}
          options={[
            { id: 'auto', label: t('theme.auto') },
            { id: 'dark', label: t('theme.dark') },
            { id: 'light', label: t('theme.light') },
          ]}
        />
      </Card>
      <Card pad={false} className="list">
        {canFullscreen ? (
          <Row title={t('appearance.fullscreen')} sub={t('appearance.fullscreen.hint')} right={<Toggle on={settings.fullscreen} onChange={(fullscreen) => setSettings({ fullscreen })} label={t('appearance.fullscreen')} />} />
        ) : null}
        <Row title={t('appearance.verse')} sub={t('appearance.verse.hint')} right={<Toggle on={settings.verse} onChange={(verse) => setSettings({ verse })} label={t('appearance.verse')} />} />
        <Row title={t('appearance.haptics')} sub={t('appearance.haptics.hint')} right={<Toggle on={haptics} onChange={toggleHaptics} label={t('appearance.haptics')} />} />
      </Card>
    </Screen>
  );
}

export function Language() {
  const lang = useStore((s) => s.settings.lang);
  const setSettings = useStore((s) => s.setSettings);
  const options: { id: LangSetting; label: string }[] = [
    { id: 'auto', label: t('lang.auto') },
    { id: 'en', label: 'English' },
    { id: 'uz', label: 'Oʻzbekcha' },
    { id: 'ru', label: 'Русский' },
  ];
  return (
    <Screen>
      <Header title={t('settings.language')} noGear />
      <Card pad={false} className="list">
        {options.map((o) => (
          <Tap key={o.id} className="lrow" onTap={() => setSettings({ lang: o.id })} hap="select" scale={0.985}>
            <span className="grow t-body">{o.label}</span>
            {lang === o.id ? <CheckIcon size={20} strokeWidth={2.8} style={{ color: 'var(--blue-hi)' }} /> : null}
          </Tap>
        ))}
      </Card>
    </Screen>
  );
}

export function Notifications() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const setNudge = useStore((s) => s.setNudge);
  const server = useServer((s) => s.status);
  const [problem, setProblem] = useState('');
  const items = buildReminders(snapshot());
  const time = `${String(profile.nudge.hour).padStart(2, '0')}:${String(profile.nudge.minute).padStart(2, '0')}`;

  return (
    <Screen>
      <Header title={t('settings.notifications')} noGear />
      <Card pad={false} className="list">
        <Row title={t('notif.bot')} sub={t('notif.bot.hint')} right={<RemindersSwitch onProblem={setProblem} />} />
        <Row
          title={t('notif.nudge')}
          sub={t('notif.nudge.hint')}
          right={<Toggle on={profile.nudge.enabled} onChange={(enabled) => setNudge({ enabled })} label={t('notif.nudge')} />}
        />
        {profile.nudge.enabled ? (
          <div className="lrow">
            <span className="grow t-body">{t('notif.nudge.time')}</span>
            <input
              className="input time"
              type="time"
              value={time}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) setNudge({ hour: h, minute: m });
              }}
            />
          </div>
        ) : null}
      </Card>
      {problem || server === 'off' ? (
        <div className="t-small" style={{ color: problem ? 'var(--orange)' : 'var(--text-3)', padding: '0 4px' }}>{problem || t('notif.off')}</div>
      ) : null}

      <Section title={t('notif.list')}>
        {items.length ? (
          <Card pad={false} className="list" style={{ opacity: settings.reminders ? 1 : 0.55 }}>
            {items.map((r) => (
              <div className="lrow" key={r.id}>
                <span className="grow t-small clip" style={{ fontWeight: 600 }}>{r.text}</span>
                <span className="lrow-val num">{fmtTime(r.hour, r.minute)}</span>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="t-small muted center">{t('notif.none')}</Card>
        )}
      </Section>
    </Screen>
  );
}

export function DataPrivacy() {
  const resetAll = useStore((s) => s.resetAll);
  const replaceData = useStore((s) => s.replaceData);
  const usage = useSync((s) => s.usage);
  const [note, setNote] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setNote(t('data.export.done'));
      haptic('success');
    } catch {
      setNote(t('data.export.failed'));
    }
  };

  return (
    <Screen>
      <Header title={t('settings.data')} noGear />
      <Card>
        <div className="row" style={{ gap: 12, marginBottom: 10 }}>
          <Database size={21} style={{ color: 'var(--blue-hi)' }} />
          <span className="t-body">{t('data.where')}</span>
        </div>
        <div className="t-small muted" style={{ lineHeight: 1.5 }}>{t('data.where.body')}</div>
        <div style={{ marginTop: 14 }}>
          <Bar value={Math.max(usage.share, 0.01)} />
          <div className="t-small muted" style={{ marginTop: 8 }}>{t('data.usage', { pct: pct(usage.share) })}</div>
        </div>
      </Card>

      <Card pad={false} className="list">
        <Row title={t('data.export')} onTap={copy} />
        <Row
          title={t('data.examples')}
          onTap={() => {
            replaceData(buildDemo(snapshot()));
            setNote(t('data.examples.done'));
            haptic('success');
          }}
        />
      </Card>
      {note ? <div className="t-small center" style={{ color: 'var(--green)' }}>{note}</div> : null}

      <Tap
        className="btn danger"
        onTap={() =>
          confirmSheet({ title: t('data.reset.title'), body: t('data.reset.body'), confirm: t('data.reset.confirm') }, () => {
            resetAll();
            useNav.setState({ stack: [], tab: 'home', sheet: null });
          })
        }
      >
        {t('settings.reset')}
      </Tap>
    </Screen>
  );
}

export function About() {
  return (
    <Screen>
      <Header title={t('settings.about')} noGear />
      <Card style={{ textAlign: 'center', padding: '26px 20px' }}>
        <img src="/icon.svg" alt="" width={76} height={76} style={{ borderRadius: 24, boxShadow: 'var(--accent-glow)' }} />
        <div className="t-display" style={{ fontSize: 26, marginTop: 14 }}>LifePath</div>
        <div className="t-small muted" style={{ marginTop: 4 }}>{t('home.tagline')}</div>
        <div className="t-small muted" style={{ marginTop: 14, lineHeight: 1.55 }}>{t('about.body')}</div>
        <div className="t-tiny faint" style={{ marginTop: 14 }}>{t('about.version', { v: VERSION })}</div>
      </Card>
      <Card pad={false} className="list">
        {canAddToHome ? <Row title={t('about.home')} onTap={addToHomeScreen} /> : null}
        <Row title={t('about.app')} onTap={() => openLink('https://github.com/KhurshidbekUrazaliev/lifepath-miniapp')} />
      </Card>
    </Screen>
  );
}
