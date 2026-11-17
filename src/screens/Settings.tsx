// Settings and its sub-pages: notifications, appearance, language, prayer & Qurʼan, data and about.
import { useEffect, useState } from 'react';
import { ArrowsClockwise, Bell, BellRinging, BookOpen, BookOpenText, Calculator, ChatsCircle, Check as CheckIcon, Cloud, CloudSlash, Database, Globe, Headphones, Info, LockSimple, MapPin, Moon, Mosque, PencilSimple, ShieldCheck, SpeakerHigh, SpinnerGap, Sun, Target, UsersThree, WarningCircle, Waveform } from '@phosphor-icons/react';
import { useStore, snapshot } from '../store/store';
import { useNav } from '../store/nav';
import { syncNow, useSync } from '../store/sync';
import { restartWeek } from '../store/week';
import { useServer } from '../store/server';
import { buildDemo } from '../store/demo';
import { buildReminders, enableReminders } from '../store/serverSync';
import { addToHomeScreen, canAddToHome, canFullscreen, haptic, openLink, tgUser } from '../tg/telegram';
import { LangSetting, ThemeSetting } from '../lib/types';
import { getLang, t, tn } from '../i18n';
import { fmtTime, pct, weekdayShort } from '../i18n/format';
import { Avatar, Bar, Card, Field, Header, Row, Screen, Section, Segmented, Tap, Toggle, cx } from '../ui/kit';
import { confirmSheet } from '../sheets/confirm';
import { RemindersSwitch } from './Inbox';
import { RECITERS, SAMPLE_AYAH, reciterOf } from '../content/reciters';
import { stopRecitation, toggleRecitation, useRecitation } from '../store/recitation';
import { AsrSchool, METHOD_MENU, PRAYERS, alertPrayers, hijriOf, isMethod, methodName, resolveMethod } from '../lib/prayer';
import { HIJRI_MONTHS } from '../lib/hijri';
import { dayKey } from '../lib/dates';
import { BUILD } from '../lib/build';
import { placeName } from './Prayer';
import { openIlmulHaq } from '../ui/IlmulHaq';
import { useLock } from '../journal/lock';
import { copyBackup, useJournalOut } from '../journal/out';
import { House } from '@phosphor-icons/react';

const deviceZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

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
  // The bot's owner gets one more row: the admin panel.
  const admin = useServer((s) => s.admin);
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
              <PencilSimple size={14} />
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
          {sync.status === 'offline' || sync.status === 'local' ? <CloudSlash size={21} /> : <Cloud size={21} />}
        </span>
        <div className="grow">
          <div className="t-body">{t('settings.sync')}</div>
          <div className="t-small muted">{syncLabel(sync.status, sync.lastSyncedAt)}</div>
        </div>
        {sync.status !== 'local' ? (
          <Tap className="ibtn sm" onTap={() => void syncNow()} label={t('common.retry')} scale={0.88}>
            <ArrowsClockwise size={16} className={sync.status === 'syncing' ? 'spin' : undefined} />
          </Tap>
        ) : null}
      </Card>

      {admin ? (
        <Card pad={false} className="list">
          <Row icon={<UsersThree size={21} style={{ color: 'var(--gold-ink)' }} />} title={t('admin.title')} sub={t('admin.row.sub')} onTap={() => push({ name: 'admin' })} />
        </Card>
      ) : null}

      <Card pad={false} className="list">
        <Row icon={<Bell size={21} />} title={t('settings.notifications')} value={settings.reminders ? t('inbox.reminders.on') : undefined} onTap={() => push({ name: 'notifications' })} />
        <Row icon={<Moon size={21} />} title={t('settings.appearance')} value={themeName} onTap={() => push({ name: 'appearance' })} />
        <Row icon={<House size={21} />} title={t('homecards.title')} onTap={() => push({ name: 'homecards' })} />
        <Row icon={<Globe size={21} />} title={t('settings.language')} value={langName} onTap={() => push({ name: 'language' })} />
        <Row icon={<Mosque size={21} />} title={t('settings.faith')} onTap={() => push({ name: 'faith' })} />
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
        <Row title={t('appearance.haptics')} sub={t('appearance.haptics.hint')} right={<Toggle on={haptics} onChange={toggleHaptics} label={t('appearance.haptics')} />} />
        <Row title={t('j.onHome')} sub={t('j.onHome.hint')} right={<Toggle on={settings.journalCard !== false} onChange={(journalCard) => setSettings({ journalCard })} label={t('j.onHome')} />} />
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
            {lang === o.id ? <CheckIcon size={20} weight="bold" style={{ color: 'var(--blue-hi)' }} /> : null}
          </Tap>
        ))}
      </Card>
    </Screen>
  );
}

export function Faith() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const lang = getLang();
  const place = settings.place;
  const resolved = resolveMethod(settings, place?.tz ?? deviceZone());
  const asrName = (school: AsrSchool) => t(school === 'hanafi' ? 'asr.hanafi' : 'asr.standard');
  const offset = settings.hijriOffset ?? 0;
  const hijri = hijriOf(dayKey(), offset);
  return (
    <Screen>
      <Header title={t('settings.faith')} noGear />
      <Section title={t('prayer.title')}>
        <Card pad={false} className="list">
          <Row icon={<MapPin size={21} />} title={t('place.title')} value={place ? placeName(place) : t('place.unset')} onTap={() => open({ name: 'place' })} />
          <Row icon={<Calculator size={21} />} title={t('method.title')} value={methodName(resolved.method, lang)} onTap={() => push({ name: 'method' })} />
          <Row title={t('prayer.onHome')} sub={t('prayer.onHome.hint')} right={<Toggle on={settings.prayerCard !== false} onChange={(prayerCard) => setSettings({ prayerCard })} label={t('prayer.onHome')} />} />
        </Card>
      </Section>
      <Card>
        <div className="t-body" style={{ marginBottom: 4 }}>{t('asr.title')}</div>
        <div className="t-small muted" style={{ marginBottom: 12 }}>{t('asr.hint')}</div>
        <Segmented
          value={settings.asr ?? 'auto'}
          onChange={(v) => setSettings({ asr: v === 'auto' ? undefined : (v as AsrSchool) })}
          options={[
            { id: 'auto', label: t('asr.auto', { school: asrName(resolved.autoAsr) }) },
            { id: 'standard', label: t('asr.standard') },
            { id: 'hanafi', label: t('asr.hanafi') },
          ]}
        />
      </Card>
      <Card>
        <div className="t-body" style={{ marginBottom: 4 }}>{t('hijri.title')}</div>
        <div className="t-small muted" style={{ marginBottom: 12 }}>
          {hijri ? t('hijri.today', { date: `${hijri.day} ${HIJRI_MONTHS[lang][hijri.month - 1]} ${hijri.year}` }) : t('hijri.none')}
        </div>
        <Segmented
          value={String(offset)}
          onChange={(v) => setSettings({ hijriOffset: Number(v) || undefined })}
          options={[-2, -1, 0, 1, 2].map((n) => ({ id: String(n), label: n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0' }))}
        />
      </Card>
      <PrayerAlerts />
      <Section title={t('adhkar.title')}>
        <Card pad={false} className="list">
          <Row icon={<Sun size={21} />} title={t('faith.adhkar')} sub={t('faith.adhkar.hint')} onTap={() => push({ name: 'adhkar' })} />
          <Row title={t('adhkar.translit')} sub={t('adhkar.translit.hint')} right={<Toggle on={settings.adhkarTr !== false} onChange={(adhkarTr) => setSettings({ adhkarTr })} label={t('adhkar.translit')} />} />
        </Card>
      </Section>
      <Section title={t('faith.quran')}>
        <Card pad={false} className="list">
          <Row icon={<BookOpen size={21} />} title={t('khatm.title')} sub={t('khatm.card')} onTap={() => push({ name: 'khatm' })} />
          <Row title={t('faith.verse')} sub={t('faith.verse.hint')} right={<Toggle on={settings.verse} onChange={(verse) => setSettings({ verse })} label={t('faith.verse')} />} />
          <Row icon={<Headphones size={21} />} title={t('verse.reciter')} value={reciterOf(settings.reciter).name[lang]} onTap={() => push({ name: 'reciter' })} />
        </Card>
      </Section>
      <Section title={t('ilmulhaq.section')}>
        <Card pad={false} className="list">
          <Row icon={<ChatsCircle size={21} />} title={t('ilmulhaq.title')} sub={t('ilmulhaq.body')} onTap={openIlmulHaq} />
        </Card>
      </Section>
    </Screen>
  );
}

const BEFORE = [0, 10, 15, 30];

/** Messages from the bot at prayer times and on Friday mornings. They need bot reminders, so turning one on asks for them. */
function PrayerAlerts() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const open = useNav((s) => s.open);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const prayers = alertPrayers(settings);
  const prayerOn = settings.reminders && !!settings.prayerAlerts && !!settings.place;

  /** Turns on bot reminders when they are off; false (and why) when that is not possible. */
  const withBot = async (then: () => void) => {
    if (busy) return;
    if (settings.reminders) return then();
    setBusy(true);
    const result = await enableReminders();
    setBusy(false);
    setProblem(result === 'denied' ? t('notif.denied') : result === 'off' ? t('notif.off') : '');
    if (result === 'ok') then();
  };
  const togglePrayers = (on: boolean) => {
    setProblem('');
    if (!on) return setSettings({ prayerAlerts: false });
    if (!settings.place) {
      setProblem(t('faith.alerts.needPlace'));
      return open({ name: 'place' });
    }
    void withBot(() => setSettings({ prayerAlerts: true }));
  };
  const toggleJumuah = (on: boolean) => {
    setProblem('');
    if (!on) return setSettings({ jumuah: false });
    void withBot(() => setSettings({ jumuah: true }));
  };
  const flip = (p: (typeof PRAYERS)[number]) => {
    const has = prayers.includes(p);
    if (has && prayers.length === 1) return haptic('error'); // at least one stays on
    const next = PRAYERS.filter((x) => (x === p ? !has : prayers.includes(x)));
    setSettings({ prayerAlertList: next.length === PRAYERS.length ? undefined : next });
  };

  return (
    <Section title={t('faith.alerts')}>
      <Card pad={false} className="list">
        <Row
          icon={<BellRinging size={21} />}
          title={t('faith.alerts.prayer')}
          sub={t('faith.alerts.prayer.hint')}
          right={<Toggle on={prayerOn} onChange={togglePrayers} label={t('faith.alerts.prayer')} />}
        />
        {prayerOn ? (
          <div className="lrow alerts-more">
            <div className="t-small muted">{t('faith.alerts.which')}</div>
            <div className="chips wrap">
              {PRAYERS.map((p) => (
                <Tap key={p} className={cx('chip', prayers.includes(p) && 'on solid')} onTap={() => flip(p)} hap="select" scale={0.95}>
                  <span>{t(`prayer.${p}`)}</span>
                </Tap>
              ))}
            </div>
            <div className="t-small muted">{t('faith.alerts.when')}</div>
            <Segmented
              value={String(settings.prayerBefore ?? 0)}
              onChange={(v) => setSettings({ prayerBefore: Number(v) || undefined })}
              options={BEFORE.map((n) => ({ id: String(n), label: n ? t('faith.alerts.min', { n }) : t('faith.alerts.atTime') }))}
            />
          </div>
        ) : null}
        <Row
          icon={<BookOpenText size={21} />}
          title={t('faith.alerts.jumuah')}
          sub={t('faith.alerts.jumuah.hint')}
          right={<Toggle on={settings.reminders && !!settings.jumuah} onChange={toggleJumuah} label={t('faith.alerts.jumuah')} />}
        />
      </Card>
      {problem ? <div className="t-small" style={{ color: 'var(--orange)', padding: '8px 4px 0' }}>{problem}</div> : null}
    </Section>
  );
}

/** The calculation methods: automatic (what is usual at the place) or one chosen by hand. */
export function Methods() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const lang = getLang();
  const { autoMethod } = resolveMethod(settings, settings.place?.tz ?? deviceZone());
  const chosen = isMethod(settings.prayerMethod) ? settings.prayerMethod : 'auto';
  const options: { id: string; label: string; sub?: string }[] = [
    { id: 'auto', label: t('method.auto'), sub: methodName(autoMethod, lang) },
    ...METHOD_MENU.map((m) => ({ id: m, label: methodName(m, lang) })),
  ];
  return (
    <Screen>
      <Header title={t('method.title')} noGear />
      <Card pad={false} className="list">
        {options.map((o) => (
          <Tap key={o.id} className="lrow" onTap={() => setSettings({ prayerMethod: o.id === 'auto' ? undefined : o.id })} hap="select" scale={0.985}>
            <span className="grow">
              <span className="t-body" style={{ display: 'block' }}>{o.label}</span>
              {o.sub ? <span className="t-small muted">{o.sub}</span> : null}
            </span>
            {chosen === o.id ? <CheckIcon size={20} weight="bold" style={{ color: 'var(--blue-hi)' }} /> : null}
          </Tap>
        ))}
      </Card>
      <div className="t-small muted" style={{ padding: '0 4px' }}>{t('method.hint')}</div>
    </Screen>
  );
}

/** The reciters: a tap chooses one and plays a short sample. */
export function Reciters() {
  const chosen = reciterOf(useStore((s) => s.settings.reciter)).id;
  const setSettings = useStore((s) => s.setSettings);
  const rec = useRecitation();
  const lang = getLang();
  const failed = !!rec.id?.startsWith('sample:') && rec.status === 'error';

  // A sample stops when you leave; the ayah of the day keeps playing.
  useEffect(() => () => {
    if (useRecitation.getState().id?.startsWith('sample:')) stopRecitation();
  }, []);

  return (
    <Screen>
      <Header title={t('verse.reciter')} noGear />
      <Card pad={false} className="list">
        {RECITERS.map((r) => {
          const status = rec.id === `sample:${r.id}` ? rec.status : null;
          return (
            <Tap
              key={r.id}
              className="lrow"
              hap="select"
              scale={0.985}
              onTap={() => {
                setSettings({ reciter: r.id });
                toggleRecitation(`sample:${r.id}`, [SAMPLE_AYAH], r.id);
              }}
            >
              <span className={status ? 'lrow-ic on' : 'lrow-ic'}>
                {status === 'loading' ? <SpinnerGap size={20} weight="bold" className="spin" /> : status === 'playing' ? <Waveform size={21} /> : status === 'error' ? <WarningCircle size={21} /> : <SpeakerHigh size={21} />}
              </span>
              <span className="grow t-body">{r.name[lang]}</span>
              {chosen === r.id ? <CheckIcon size={20} weight="bold" style={{ color: 'var(--blue-hi)' }} /> : null}
            </Tap>
          );
        })}
      </Card>
      <div className="t-small" style={{ padding: '0 4px', color: failed ? 'var(--orange)' : 'var(--text-3)' }}>{failed ? t('verse.audioError') : t('reciter.hint')}</div>
    </Screen>
  );
}

export function Notifications() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const setNudge = useStore((s) => s.setNudge);
  const setSettings = useStore((s) => s.setSettings);
  const server = useServer((s) => s.status);
  const [problem, setProblem] = useState('');
  // The journal asks on each of the next evenings; the list names it once.
  const items = buildReminders(snapshot()).filter((r, i, all) => !r.id.startsWith('j_') || all.findIndex((x) => x.id.startsWith('j_')) === i);
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
        <Row
          title={t('notif.journal')}
          sub={t('notif.journal.hint')}
          right={<Toggle on={!!settings.journalAt} onChange={(on) => setSettings({ journalAt: on ? '21:00' : undefined })} label={t('notif.journal')} />}
        />
        {settings.journalAt ? (
          <div className="lrow">
            <span className="grow t-body">{t('notif.nudge.time')}</span>
            <input
              className="input time"
              type="time"
              value={settings.journalAt}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) setSettings({ journalAt: e.target.value });
              }}
            />
          </div>
        ) : null}
        <Row
          title={t('notif.week')}
          sub={t('notif.week.hint')}
          right={<Toggle on={settings.weekLetter !== false} onChange={(weekLetter) => setSettings({ weekLetter })} label={t('notif.week')} />}
        />
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
                {/* The weekly letter comes on one day of the week, so its day is named with its time. */}
                <span className="lrow-val num">{r.id.startsWith('w_') ? `${weekdayShort(0)} ` : ''}{fmtTime(r.hour, r.minute)}</span>
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
  const open = useNav((s) => s.open);
  const usage = useSync((s) => s.usage);
  // How the last thing done here went, said under the list: green when it worked.
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const journal = useJournalOut((text, ok) => setNote(text ? { text, ok } : null));
  const lock = useLock();
  const [lockNote, setLockNote] = useState('');

  const setLock = async (on: boolean) => {
    setLockNote('');
    if (!on) {
      await lock.turnOff(t('lock.reason'));
      return;
    }
    const result = await lock.turnOn(t('lock.reason'));
    if (result !== 'ok') setLockNote(t(result === 'unavailable' ? 'lock.unavailable' : 'lock.refused'));
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
        <Row
          icon={<LockSimple size={21} style={{ color: 'var(--violet)' }} />}
          title={t('lock.setting')}
          sub={t('lock.setting.hint')}
          right={<Toggle on={lock.on} onChange={(on) => void setLock(on)} label={t('lock.setting')} />}
        />
      </Card>
      {lockNote ? <div className="t-small" style={{ color: 'var(--orange)', padding: '0 4px' }}>{lockNote}</div> : null}

      <Card pad={false} className="list">
        <Row title={t('data.export')} onTap={() => void copyBackup().then(setNote)} />
        <Row title={t('data.restore')} onTap={() => open({ name: 'restore' })} />
        {/* The journal as plain text: copied always, and through the share sheet where the phone has one. */}
        <div className="lrow">
          <Tap className="grow t-body" onTap={journal.copy} scale={0.985}>
            {t('data.jtext')}
          </Tap>
          {journal.canShare ? (
            <Tap className="btn soft sm pill" onTap={journal.share}>
              {t('jtext.share')}
            </Tap>
          ) : null}
        </div>
        <Row
          title={t('data.examples')}
          onTap={() => {
            replaceData(buildDemo(snapshot()));
            restartWeek(); // the examples' totals are not this week's doing
            setNote({ text: t('data.examples.done'), ok: true });
            haptic('success');
          }}
        />
      </Card>
      {note ? <div className="t-small center" style={{ color: note.ok ? 'var(--green)' : 'var(--orange)' }}>{note.text}</div> : null}

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
        {/* Which build this is: an error report carries the same name, so the two can be matched. */}
        <div className="t-tiny faint num" style={{ marginTop: 2 }}>{t('about.build', { id: BUILD })}</div>
      </Card>
      <Card pad={false} className="list">
        {canAddToHome ? <Row title={t('about.home')} onTap={addToHomeScreen} /> : null}
        <Row title={t('about.app')} onTap={() => openLink('https://github.com/KhurshidbekUrazaliev/lifepath-miniapp')} />
      </Card>
    </Screen>
  );
}
