// Arranging Home: which cards show, in what order, and whether the time of day may lift one to the top.
// The rules are in lib/home.ts; the cards themselves are drawn by Home.
import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { ArrowCounterClockwise, DotsSixVertical } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { HomeBlock, hideHome, homeHidden, homeOrder } from '../lib/home';
import { Key, has, t } from '../i18n';
import { Card, Header, Row, Screen, Tap, Toggle } from '../ui/kit';
import { Emoji } from '../ui/Emoji';
import { haptic } from '../tg/telegram';
import { HOME_READY } from '../lib/home';

const ICON: Record<HomeBlock, string> = {
  special: '✨', prayer: '🕌', journal: '✍️', buddy: '🤝', ayah: '📖', adhkar: '📿', gkhatm: '👥', ring: '📊', quick: '⚡', habits: '🔁', plan: '🗓️', goals: '🎯',
};

const nameOf = (id: HomeBlock): string => t(`homecards.b.${id}` as Key);

export function HomeOrder() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  // Only the cards this version can draw are offered; the others keep their usual places among them.
  const saved = homeOrder(settings).filter((id) => HOME_READY.includes(id));
  const savedKey = saved.join();
  const [order, setOrder] = useState(saved);
  const latest = useRef(order);
  latest.current = order;

  // Another device may have rearranged Home while this screen was open.
  useEffect(() => {
    setOrder(savedKey.split(',') as HomeBlock[]);
  }, [savedKey]);

  const keep = () => {
    if (latest.current.join() !== savedKey) setSettings({ home: { ...settings.home, order: latest.current } });
  };
  const reset = () => {
    haptic('light');
    setSettings({ home: { ...settings.home, order: undefined } });
  };

  return (
    <Screen>
      <Header title={t('homecards.title')} noGear />

      <Card pad={false} className="list">
        <Row
          title={t('homecards.auto')}
          sub={t('homecards.auto.hint')}
          right={<Toggle on={settings.home?.auto !== false} onChange={(auto) => setSettings({ home: { ...settings.home, auto } })} label={t('homecards.auto')} />}
        />
      </Card>

      <div className="t-small muted" style={{ padding: '0 4px' }}>{t('homecards.hint')}</div>

      <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder} className="card list hc-list">
        {order.map((id) => (
          <CardRow
            key={id}
            id={id}
            shown={!homeHidden(settings, id)}
            onToggle={(on) => setSettings(hideHome(settings, id, !on))}
            onDrop={keep}
          />
        ))}
      </Reorder.Group>

      {settings.home?.order ? (
        <Tap className="btn soft" onTap={reset} hap={false}>
          <ArrowCounterClockwise size={18} weight="bold" />
          {t('homecards.reset')}
        </Tap>
      ) : null}
    </Screen>
  );
}

function CardRow({ id, shown, onToggle, onDrop }: { id: HomeBlock; shown: boolean; onToggle: (on: boolean) => void; onDrop: () => void }) {
  const drag = useDragControls();
  const hint = `homecards.s.${id}`;
  return (
    <Reorder.Item
      as="div"
      value={id}
      className="hc-row"
      dragListener={false}
      dragControls={drag}
      onDragStart={() => haptic('select')}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgba(0, 0, 0, 0.35)' }}
    >
      {/* Only the handle starts a drag, so the list still scrolls under a finger anywhere else. */}
      <span className="hc-handle" onPointerDown={(e) => drag.start(e)} role="button" aria-label={t('homecards.move', { name: nameOf(id) })}>
        <DotsSixVertical size={20} weight="bold" />
      </span>
      <span className="hc-ic"><Emoji e={ICON[id]} /></span>
      <span className="grow" style={{ minWidth: 0, opacity: shown ? 1 : 0.5 }}>
        <span className="t-body" style={{ display: 'block' }}>{nameOf(id)}</span>
        {has(hint) ? <span className="t-small muted" style={{ display: 'block', marginTop: 1 }}>{t(hint as Key)}</span> : null}
      </span>
      <Toggle on={shown} onChange={onToggle} label={nameOf(id)} />
    </Reorder.Item>
  );
}
