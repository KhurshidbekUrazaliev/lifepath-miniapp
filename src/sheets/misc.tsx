// Sheets for naming Echo and for the ranking profile.
import { useState } from 'react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { useEcho } from '../store/echo';
import { useServer } from '../store/server';
import { HAIR_COLORS, SKIN_TONES } from '../lib/echo';
import { COUNTRIES, cleanDisplayName, flag } from '../lib/rankings';
import { haptic, tgUser } from '../tg/telegram';
import { t } from '../i18n';
import { countryName } from '../i18n/format';
import { Card, Field, Tap, Toggle, cx } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { EchoAvatar } from '../ui/EchoAvatar';

export function EchoSheet({ onClose }: { onClose: () => void }) {
  const saveEcho = useStore((s) => s.saveEcho);
  const push = useNav((s) => s.push);
  const e = useEcho();
  const [name, setName] = useState(e.echo?.name ?? '');
  const [skin, setSkin] = useState(e.echo?.skin ?? 1);
  const [hair, setHair] = useState(e.echo?.hair ?? 0);
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    const first = !e.echo;
    saveEcho({ name, skin, hair });
    haptic('success');
    onClose();
    if (first) push({ name: 'echo' });
  };

  const dots = (colors: string[], value: number, set: (i: number) => void) => (
    <div className="swatches">
      {colors.map((c, i) => (
        <button key={c} type="button" aria-label={c} className={cx('swatch', i === value && 'on')} style={{ background: c }} onClick={() => { haptic('select'); set(i); }} />
      ))}
    </div>
  );

  return (
    <Sheet
      title={e.echo ? t('echo.rename') : t('echo.create.title')}
      onClose={onClose}
      foot={<Tap className="btn primary" onTap={save} disabled={!valid} hap={false}>{e.echo ? t('echo.save') : t('echo.wake')}</Tap>}
    >
      <div className="echo-stage" style={{ minHeight: 0 }}>
        <EchoAvatar size={130} skin={skin} hair={hair} stage={e.stage.index} mood="radiant" outfit={e.outfit} accent={e.accent} />
      </div>
      {!e.echo ? <div className="t-small muted center" style={{ lineHeight: 1.5 }}>{t('echo.create.body')}</div> : null}
      <Field label={t('echo.name')}>
        <input className="input" value={name} maxLength={20} placeholder={t('echo.name.ph')} onChange={(ev) => setName(ev.target.value)} enterKeyHint="done" />
      </Field>
      <Field label={t('echo.skin')}>{dots(SKIN_TONES, skin, setSkin)}</Field>
      <Field label={t('echo.hair')}>{dots(HAIR_COLORS, hair, setHair)}</Field>
    </Sheet>
  );
}

export function RankSheet({ onClose }: { onClose: () => void }) {
  const rank = useServer((s) => s.rank);
  const saveRank = useServer((s) => s.saveRank);
  const profileName = useStore((s) => s.profile.name);
  const [optedIn, setOptedIn] = useState(rank.optedIn || !rank.name);
  const [name, setName] = useState(rank.name ?? (profileName || tgUser.firstName));
  const [country, setCountry] = useState(rank.country ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const clean = cleanDisplayName(name);

  const save = async () => {
    if (!clean || busy) return;
    setBusy(true);
    const ok = await saveRank({ optedIn, name: clean, country: country || null });
    setBusy(false);
    if (ok) {
      haptic('success');
      onClose();
    } else setFailed(true);
  };

  const sorted = [...COUNTRIES].map((c) => ({ code: c.code, name: countryName(c.code) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sheet
      title={t('board.profile')}
      onClose={onClose}
      foot={<Tap className="btn primary" onTap={save} disabled={!clean || busy} hap={false}>{t('board.save')}</Tap>}
    >
      <Card className="row" style={{ gap: 12 }}>
        <div className="grow">
          <div className="t-body">{t('board.show')}</div>
          <div className="t-small muted">{t('board.proven')}</div>
        </div>
        <Toggle on={optedIn} onChange={setOptedIn} label={t('board.show')} />
      </Card>
      <Field label={t('board.name')}>
        <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} enterKeyHint="done" />
      </Field>
      <Field label={t('board.countryField')}>
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{t('board.country.none')}</option>
          {sorted.map((c) => (
            <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>
          ))}
        </select>
      </Field>
      {failed ? <div className="t-small" style={{ color: 'var(--red)' }}>{t('board.error')}</div> : null}
    </Sheet>
  );
}
