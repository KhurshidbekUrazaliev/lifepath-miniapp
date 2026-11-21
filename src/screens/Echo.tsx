// The companion: a 3D friend that grows up with your level, quotes hadith and wisdom, and wears what
// you buy with Sparks.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Lock, Lightbulb, PencilSimple, Sparkle, Timer, TShirt } from '@phosphor-icons/react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { growthName, useEcho } from '../store/echo';
import { useAdvisor } from '../store/advisor';
import { useLevelsOpen, useServer, useSparksGift, useWardrobeOpen } from '../store/server';
import { ATTRIBUTES, ageInDays, attrLevel } from '../lib/echo';
import { GROWTH_IDS, GROWTH_LEVELS, TOP_STAGE } from '../lib/companion';
import type { Advice, AdviceKind } from '../lib/advisor';
import { ITEMS, Item, SLOTS, Slot, canBuy, earnProgress, isOwned, itemById, sparkBalance, wornOutfit } from '../lib/wardrobe';
import { haptic, shareText } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { fmtNumber } from '../i18n/format';
import { Bar, Card, Chips, Empty, Header, IconBtn, Num, Screen, Section, Tap, cx } from '../ui/kit';
import { CompanionHandle, CompanionStage } from '../companion/CompanionStage';
import { Hearts, Speech, SpeechCard } from '../companion/Speech';
import { ItemPicture } from '../companion/ItemPicture';
import { itemAvailable } from '../companion/models';
import type { TapPart } from '../companion/types';
import { Emoji } from '../ui/Emoji';

const REACTIONS = 6;

export function Echo() {
  const e = useEcho();
  const open = useNav((s) => s.open);
  const push = useNav((s) => s.push);
  const bot = useServer((s) => s.botUsername);
  const advisor = useAdvisor();
  const stage = useRef<CompanionHandle>(null);
  const [speech, setSpeech] = useState<Speech>({ kind: 'say', key: 'greet', text: e.line });
  const [hearts, setHearts] = useState(0);
  const reaction = useRef(Math.floor(Math.random() * REACTIONS));
  const busy = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(busy.current), []);

  const onState = useCallback((s: string) => {
    if (s === 'ready') setTimeout(() => stage.current?.play('wave'), 350);
  }, []);

  const ask = (kind: AdviceKind) => {
    clearTimeout(busy.current);
    const advice: Advice = advisor.next(kind);
    const thinks = stage.current?.play('think') ?? false;
    setSpeech({ ...advice, thinking: true });
    busy.current = setTimeout(() => {
      setSpeech(advice);
      stage.current?.play('talk');
      haptic('soft');
    }, thinks ? 1100 : 450);
  };

  const onTap = (part: TapPart) => {
    haptic('light');
    if (part === 'head') {
      setHearts((n) => n + 1);
      stage.current?.play('nod');
      setSpeech({ kind: 'say', key: `pat-${Date.now()}`, text: t('echo.pat') });
      return;
    }
    const i = reaction.current++ % REACTIONS;
    const moves = ['wave', 'cheer', 'nod', 'wave', 'cheer', 'think'] as const;
    stage.current?.play(moves[i]);
    setSpeech({ kind: 'say', key: `react-${Date.now()}`, text: t(`echo.react.${i}` as Key) });
  };

  const share = () => {
    if (speech.kind === 'say') return;
    const by = speech.kind === 'hadith' ? `\n— ${speech.source}` : '';
    shareText(`${speech.ar ? `${speech.ar}\n` : ''}${speech.text}${by}`, bot ? `https://t.me/${bot}?startapp` : 'https://t.me');
  };

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

  const g = e.growth;
  const chips: { kind: AdviceKind; icon: ReactNode; label: string }[] = [
    { kind: 'hadith', icon: <BookOpenText size={18} weight="duotone" />, label: t('advice.hadith') },
    { kind: 'hikmah', icon: <Lightbulb size={18} weight="duotone" />, label: t('advice.hikmah') },
    { kind: 'motivation', icon: <Sparkle size={18} weight="duotone" />, label: t('advice.motivation') },
  ];

  return (
    <Screen>
      <Header
        title={e.echo.name}
        right={
          <IconBtn onTap={() => open({ name: 'echo' })} label={t('echo.rename')}>
            <PencilSimple size={19} weight="duotone" />
          </IconBtn>
        }
      />

      <div className="companion">
        <CompanionStage
          ref={stage}
          gender={e.gender}
          stage={g.index}
          accent={e.accent}
          outfit={e.outfit}
          mood={e.mood}
          skin={e.echo.skin}
          hair={e.echo.hair}
          height={340}
          onTap={onTap}
          onState={onState}
        >
          <Hearts burst={hearts} />
          <div className="cstage-badge">
            {growthName(g.index, e.gender)} · {t('common.lv', { n: g.level })}
          </div>
        </CompanionStage>
        <SpeechCard
          speech={speech}
          onDone={() => stage.current?.play('idle')}
          onShare={share}
          onRead={speech.kind === 'hadith' ? () => open({ name: 'hadith', n: Number(speech.key.split(':')[1]) }) : undefined}
        />
      </div>

      <div className="advice-chips">
        {chips.map((c) => (
          <Tap key={c.kind} className={cx('advice-chip', c.kind)} onTap={() => ask(c.kind)} scale={0.94}>
            {c.icon}
            <span>{c.label}</span>
          </Tap>
        ))}
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="t-body">{t('growth.title')}</span>
          <span className="t-small muted">{tn('echo.age', ageInDays(e.echo.bornAt))}</span>
        </div>
        <div className="growth-steps">
          {GROWTH_IDS.map((id, i) => (
            <div key={id} className={cx('growth-step', i <= g.index && 'on', i === g.index && 'now')}>
              <i />
              <span className="t-tiny">{growthName(i, e.gender)}</span>
              <span className="t-tiny faint num">{t('common.lv', { n: GROWTH_LEVELS[i] })}</span>
            </div>
          ))}
        </div>
        <Bar value={g.ratio} color={e.accent} />
        <div className="t-small muted" style={{ marginTop: 10 }}>
          {g.nextLevel
            ? t('growth.next', { stage: growthName(g.index + 1, e.gender), level: g.nextLevel, xp: fmtNumber(g.xpToNext) })
            : t('growth.max')}
        </div>
      </Card>

      <div className="echo-actions">
        <Tap className="btn soft" onTap={() => push({ name: 'focus' })}>
          <Timer size={19} weight="duotone" style={{ color: 'var(--blue-hi)' }} />
          {t('focus.open')}
        </Tap>
        <Tap className="btn soft" onTap={() => push({ name: 'shop' })}>
          <TShirt size={19} weight="duotone" style={{ color: 'var(--pink)' }} />
          {t('echo.wardrobe')}
        </Tap>
      </div>

      <Section title={t('echo.attrs')}>
        <div className="tiles">
          {ATTRIBUTES.map((a) => {
            const lv = attrLevel(e.attrs[a.id]);
            return (
              <Card key={a.id} pad={false} style={{ padding: 14 }}>
                <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}><Emoji e={a.icon} /></span>
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
  const worship = useStore((s) => s.worship);
  const pages = useStore((s) => s.pages);
  const profile = useStore((s) => s.profile);
  const buyItem = useStore((s) => s.buyItem);
  const wearItem = useStore((s) => s.wearItem);
  const open = useNav((s) => s.open);
  const e = useEcho();
  const stage = useRef<CompanionHandle>(null);
  const [picked, setSlot] = useState<Slot | null>(null);
  const [trying, setTrying] = useState<string | null>(null);

  const worn = wornOutfit(profile.outfit, e.gender);
  const tryItem = itemById(trying ?? undefined);
  const preview = tryItem ? { ...worn, [tryItem.slot]: tryItem.id } : worn;
  const gift = useSparksGift();
  const allOpen = useWardrobeOpen();
  /** Bought, free, earned, or opened by the owner (then every item is theirs to wear). */
  const has = (item: Item) => allOpen || isOwned(profile, item);
  const balance = sparkBalance(profile, gift);
  // Items wait for the companion to grow, unless the bot's owner opened the levels for this person.
  const lockStage = useLevelsOpen() ? TOP_STAGE : e.growth.index;

  // Only slots with something to offer (3D items appear once their file exists).
  const offered = useMemo(
    () => ITEMS.filter((i) => (!i.gender || i.gender === e.gender) && itemAvailable(i.id)),
    [e.gender],
  );
  const slots = SLOTS.filter((s) => offered.some((i) => i.slot === s.id && (i.price > 0 || !!i.earn)));
  // The first kind of item is open until another is picked.
  const slot = picked && slots.some((s) => s.id === picked) ? picked : slots[0]?.id ?? 'sky';
  const items = offered.filter((i) => i.slot === slot);

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
    if (has(tryItem)) {
      wearItem(tryItem.slot, tryItem.id);
      haptic('success');
      stage.current?.play('nod');
      setTrying(null);
      return;
    }
    const check = buyItem(tryItem.id);
    haptic(check.ok ? 'success' : 'error');
    if (check.ok) {
      stage.current?.play('cheer');
      setTrying(null);
    }
  };

  const check = tryItem && !has(tryItem) ? canBuy(profile, tryItem.id, lockStage, e.gender, gift) : null;
  const blocked =
    check && !check.ok
      ? check.reason === 'earned'
        ? t(`earn.${tryItem!.earn!.by}.hint` as Key)
        : check.reason === 'stage'
        ? t('shop.locked', { stage: growthName(tryItem!.minStage ?? 0, e.gender) })
        : check.reason === 'poor'
          ? t('shop.poor', { n: tryItem!.price - balance })
          : ''
      : '';

  return (
    <Screen>
      <Header
        title={t('shop.title')}
        right={
          <Tap className="pillnote orange" style={{ height: 32, padding: '0 12px', justifySelf: 'end' }} onTap={() => useNav.getState().open({ name: 'earn', about: 'sparks' })} label={t('earn.sparks.how')}>
            <Emoji e="✨" /> <Num value={balance} />
          </Tap>
        }
      />
      <CompanionStage
        ref={stage}
        gender={e.gender}
        stage={e.growth.index}
        accent={e.accent}
        outfit={preview}
        mood="radiant"
        skin={e.echo.skin}
        hair={e.echo.hair}
        height={270}
        onTap={() => stage.current?.play('wave')}
      />

      <Chips<Slot>
        value={slot}
        onChange={(s) => {
          setSlot(s);
          setTrying(null);
        }}
        options={slots.map((s) => ({ id: s.id, label: t(`slot.${s.id}` as Key) }))}
      />

      <div className="shop-grid">
        {items.map((item) => {
          const owned = has(item);
          const wearing = worn[item.slot] === item.id;
          const earned = !owned ? earnProgress({ profile, worship, pages }, item) : null;
          const locked = !owned && (item.minStage ?? 0) > lockStage;
          return (
            <Tap key={item.id} onTap={() => setTrying(item.id)} scale={0.96} hap="select">
              <Card pad={false} className={cx('shop-item', (trying === item.id || (!trying && wearing)) && 'on')}>
                <ItemPicture item={item} />
                {locked ? <span className="shop-lock"><Lock size={14} weight="fill" /></span> : null}
                <span className="t-small clip" style={{ fontWeight: 700, maxWidth: '100%' }}>{t(`item.${item.id}` as Key)}</span>
                <span className={cx('t-tiny', wearing ? 'accent' : 'muted')}>
                  {wearing ? t('shop.wearing') : owned ? (item.price === 0 && !item.earn ? t('shop.free') : t('shop.wear')) : earned ? t(`earn.${item.earn!.by}` as Key, { have: Math.min(earned.have, earned.need), need: earned.need }) : <><Emoji e="✨" /> {item.price}</>}
                </span>
                {earned ? <div className="earn-bar"><Bar value={earned.have / earned.need} height={4} /></div> : null}
              </Card>
            </Tap>
          );
        })}
      </div>

      {tryItem && worn[tryItem.slot] !== tryItem.id ? (
        <>
          <Tap className="btn primary" onTap={act} disabled={!!blocked} hap={false}>
            {has(tryItem) ? t('shop.wear') : tryItem.earn ? t('earn.deeds') : t('shop.buy', { n: tryItem.price })}
          </Tap>
          {blocked ? <div className="t-small center" style={{ color: 'var(--orange)' }}>{blocked}</div> : null}
        </>
      ) : (
        <div className="t-small faint center">{t('shop.earn')}</div>
      )}
    </Screen>
  );
}
