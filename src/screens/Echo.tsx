// Echo, the companion that grows from your logs, and its wardrobe bought with Sparks.
import { useMemo, useState } from 'react';
import { Lock, Pencil, Shirt } from 'lucide-react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { useEcho } from '../store/echo';
import { ATTRIBUTES, STAGES, ageInDays, attrLevel } from '../lib/echo';
import { DEFAULT_OUTFIT, ITEMS, SLOTS, Slot, canBuy, isOwned, itemById, sparkBalance } from '../lib/wardrobe';
import { haptic } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { Bar, Card, Chips, Empty, Header, IconBtn, Num, Screen, Section, Tap, cx } from '../ui/kit';
import { EchoAvatar } from '../ui/EchoAvatar';

export function Echo() {
  const e = useEcho();
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);

  if (!e.echo) {
    return (
      <Screen>
        <Header title={t('echo.title')} />
        <Empty icon="🌱" title={t('you.echo.meet')} body={t('echo.create.body')}>
          <Tap className="btn primary sm pill" onTap={() => open({ name: 'echo' })}>{t('echo.wake')}</Tap>
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={e.echo.name}
        right={
          <IconBtn onTap={() => open({ name: 'echo' })} label={t('echo.rename')}>
            <Pencil size={18} />
          </IconBtn>
        }
      />

      <div className="echo-stage">
        <EchoAvatar size={190} skin={e.echo.skin} hair={e.echo.hair} stage={e.stage.index} mood={e.mood} outfit={e.outfit} accent={e.accent} />
      </div>
      <div className="center">
        <div className="t-tiny" style={{ color: e.accent, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          {t(`stage.${e.stage.index}` as Key)} · {e.archetype}
        </div>
        <div className="t-body muted" style={{ marginTop: 6, fontWeight: 500 }}>“{e.line}”</div>
        <div className="t-tiny faint" style={{ marginTop: 6 }}>{tn('echo.age', ageInDays(e.echo.bornAt))}</div>
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="t-body">{t('echo.stage', { n: e.stage.index + 1, total: STAGES.length })}</span>
          <span className="t-small muted num">{e.total}</span>
        </div>
        <Bar value={e.stage.ratio} color={e.accent} />
        <div className="t-small muted" style={{ marginTop: 10 }}>
          {e.stage.next ? t('echo.stage.next', { n: e.stage.toNext, stage: t(`stage.${e.stage.index + 1}` as Key) }) : t('echo.stage.max')}
        </div>
      </Card>

      <Tap className="btn soft" onTap={() => push({ name: 'shop' })}>
        <Shirt size={18} style={{ color: 'var(--pink)' }} />
        {t('echo.wardrobe')}
      </Tap>

      <Section title={t('echo.attrs')}>
        <div className="tiles">
          {ATTRIBUTES.map((a) => {
            const lv = attrLevel(e.attrs[a.id]);
            return (
              <Card key={a.id} pad={false} style={{ padding: 14 }}>
                <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{a.icon}</span>
                  <div className="grow">
                    <div className="t-small" style={{ fontWeight: 700 }}>{t(`attr.${a.id}` as Key)}</div>
                    <div className="t-tiny muted clip">{t(`attr.${a.id}.blurb` as Key)}</div>
                  </div>
                  <span className="t-small num" style={{ fontWeight: 800, color: a.color }}>{lv.level}</span>
                </div>
                <Bar value={lv.ratio} color={a.color} height={6} />
              </Card>
            );
          })}
        </div>
      </Section>
    </Screen>
  );
}

export function Shop() {
  const profile = useStore((s) => s.profile);
  const buyItem = useStore((s) => s.buyItem);
  const wearItem = useStore((s) => s.wearItem);
  const open = useNav((s) => s.open);
  const e = useEcho();
  const [slot, setSlot] = useState<Slot>('top');
  const [trying, setTrying] = useState<string | null>(null);

  const worn = { ...DEFAULT_OUTFIT, ...(profile.outfit ?? {}) };
  const items = useMemo(() => ITEMS.filter((i) => i.slot === slot), [slot]);
  const balance = sparkBalance(profile);
  const tryItem = itemById(trying ?? undefined);
  const preview = tryItem ? { ...worn, [tryItem.slot]: tryItem.id } : worn;

  if (!e.echo) {
    return (
      <Screen>
        <Header title={t('shop.title')} />
        <Empty icon="🛍️" title={t('shop.title')} body={t('shop.needEcho')}>
          <Tap className="btn primary sm pill" onTap={() => open({ name: 'echo' })}>{t('echo.wake')}</Tap>
        </Empty>
      </Screen>
    );
  }

  const act = () => {
    if (!tryItem) return;
    if (isOwned(profile, tryItem)) {
      wearItem(tryItem.slot, tryItem.id);
      haptic('success');
      setTrying(null);
      return;
    }
    const check = buyItem(tryItem.id);
    haptic(check.ok ? 'success' : 'error');
    if (check.ok) setTrying(null);
  };

  const check = tryItem && !isOwned(profile, tryItem) ? canBuy(profile, tryItem.id, e.stage.index) : null;
  const blocked =
    check && !check.ok
      ? check.reason === 'stage'
        ? t('shop.locked', { stage: t(`stage.${tryItem!.minStage ?? 0}` as Key) })
        : check.reason === 'poor'
          ? t('shop.poor', { n: tryItem!.price - balance })
          : ''
      : '';

  return (
    <Screen>
      <Header
        title={t('shop.title')}
        right={
          <span className="pillnote orange" style={{ height: 32, padding: '0 12px', justifySelf: 'end' }}>
            ✨ <Num value={balance} />
          </span>
        }
      />
      <div className="echo-stage">
        <EchoAvatar size={170} skin={e.echo.skin} hair={e.echo.hair} stage={e.stage.index} mood={e.mood} outfit={preview} accent={e.accent} />
      </div>

      <Chips<Slot> value={slot} onChange={(s) => { setSlot(s); setTrying(null); }} options={SLOTS.map((s) => ({ id: s.id, label: `${s.icon} ${t(`slot.${s.id}` as Key)}` }))} />

      <div className="shop-grid">
        {items.map((item) => {
          const owned = isOwned(profile, item);
          const wearing = worn[item.slot] === item.id;
          const locked = !owned && (item.minStage ?? 0) > e.stage.index;
          return (
            <Tap key={item.id} onTap={() => setTrying(item.id)} scale={0.96} hap="select">
              <Card pad={false} className={cx('shop-item', (trying === item.id || (!trying && wearing)) && 'on')}>
                <span className="shop-swatch" style={{ background: `linear-gradient(160deg, ${item.color}, ${item.color2 ?? item.color})` }}>
                  {locked ? <Lock size={16} color="#fff" /> : null}
                </span>
                <span className="t-small clip" style={{ fontWeight: 700, maxWidth: '100%' }}>{t(`item.${item.id}` as Key)}</span>
                <span className={cx('t-tiny', wearing ? 'accent' : 'muted')}>
                  {wearing ? t('shop.wearing') : owned ? (item.price === 0 ? t('shop.free') : t('shop.wear')) : `✨ ${item.price}`}
                </span>
              </Card>
            </Tap>
          );
        })}
      </div>

      {tryItem && worn[tryItem.slot] !== tryItem.id ? (
        <>
          <Tap className="btn primary" onTap={act} disabled={!!blocked} hap={false}>
            {isOwned(profile, tryItem) ? t('shop.wear') : t('shop.buy', { n: tryItem.price })}
          </Tap>
          {blocked ? <div className="t-small center" style={{ color: 'var(--orange)' }}>{blocked}</div> : null}
        </>
      ) : (
        <div className="t-small faint center">{t('shop.earn')}</div>
      )}
    </Screen>
  );
}
