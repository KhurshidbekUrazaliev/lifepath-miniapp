// Where prayer times are for: the phone's location, or a city from the list.
import { useState } from 'react';
import { Check, NavigationArrow, SpinnerGap } from '@phosphor-icons/react';
import { CITIES, searchCities } from '../content/cities';
import { useStore } from '../store/store';
import { getLang, t } from '../i18n';
import { haptic } from '../tg/telegram';
import { Card, Tap } from '../ui/kit';
import { Sheet } from '../ui/Sheet';
import { LocateProblem, useLocate } from '../screens/Prayer';

export function PlaceSheet({ onClose }: { onClose: () => void }) {
  const place = useStore((s) => s.settings.place);
  const setSettings = useStore((s) => s.setSettings);
  const [query, setQuery] = useState('');
  const { state, locate } = useLocate(onClose);
  const lang = getLang();
  const list = query ? searchCities(query).slice(0, 40) : CITIES;

  return (
    <Sheet title={t('place.title')} onClose={onClose}>
      <Tap className="btn primary" onTap={locate} disabled={state === 'locating'}>
        {state === 'locating' ? <SpinnerGap size={18} weight="bold" className="spin" /> : <NavigationArrow size={18} weight="fill" />}
        {t('place.useMine')}
      </Tap>
      <LocateProblem state={state} />
      <input
        className="input"
        type="search"
        value={query}
        placeholder={t('place.search')}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
      />
      <Card pad={false} className="list">
        {list.length ? (
          list.map((c) => (
            <Tap
              key={c.id}
              className="lrow"
              hap="select"
              scale={0.985}
              onTap={() => {
                setSettings({ place: { lat: c.lat, lon: c.lon, tz: c.tz, city: c.id } });
                haptic('success');
                onClose();
              }}
            >
              <span className="grow t-body">{c.name[lang]}</span>
              {place?.city === c.id ? <Check size={20} weight="bold" style={{ color: 'var(--blue-hi)' }} /> : null}
            </Tap>
          ))
        ) : (
          <div className="lrow t-small muted">{t('place.none')}</div>
        )}
      </Card>
      <div className="t-tiny faint center">{t('place.privacy')}</div>
    </Sheet>
  );
}
