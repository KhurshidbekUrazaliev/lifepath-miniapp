// You: profile and level, the Echo companion, and the doors to rankings, the wardrobe and Plus.
import { useRef } from 'react';
import { CaretRight, Crown, GearSix as Gear, Gift, Info, Medal, Notebook, Trophy, TShirt, UsersThree } from '@phosphor-icons/react';
import { useStore, useVisibleStreak } from '../store/store';
import { useNav } from '../store/nav';
import { growthName, useEcho } from '../store/echo';
import { usePlus, useServer, useSparksGift } from '../store/server';
import { levelInfo } from '../lib/gamify';
import { sparkBalance } from '../lib/wardrobe';
import { pendingSparks } from '../lib/evidence';
import { BADGES } from '../lib/achievements';
import { shareText, tgUser } from '../tg/telegram';
import { Key, t, tn } from '../i18n';
import { fmtNumber } from '../i18n/format';
import { Avatar, Bar, Card, Header, Num, Row, Screen, Tap } from '../ui/kit';
import { StatTile } from '../ui/parts';
import { CompanionHandle, CompanionStage } from '../companion/CompanionStage';
import { haptic } from '../tg/telegram';
import { rankTitle } from './Progress';
import { Emoji } from '../ui/Emoji';
import { StoryButton, storyCards } from '../ui/StoryButton';

export function You() {
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const push = useNav((s) => s.push);
  const open = useNav((s) => s.open);
  const go = useNav((s) => s.go);
  const streak = useVisibleStreak();
  const echo = useEcho();
  const plus = usePlus();
  const gift = useSparksGift();
  const bot = useServer((s) => s.botUsername);
  const lvl = levelInfo(profile.xp);
  const name = profile.name || tgUser.firstName || t('common.guest');
  const waiting = pendingSparks(entries);
  const unlocked = BADGES.filter((b) => profile.achievements[b.id]).length;
  const link = bot ? `https://t.me/${bot}?startapp` : 'https://t.me';
  const stage = useRef<CompanionHandle>(null);
  const earn = (about: 'xp' | 'sparks' | 'rank') => open({ name: 'earn', about });

  return (
    <Screen>
      <Header title={t('you.title')} />

      {/* Who you are: the name opens your levels and badges, the bar says how XP is earned. */}
      <Card className="you-card">
        <Tap className="row you-who" onTap={() => push({ name: 'progress' })} scale={0.98}>
          <Avatar large />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="t-title clip">{name}</div>
            {tgUser.username ? <div className="t-small muted clip">@{tgUser.username}</div> : null}
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="pillnote">{t('common.lv', { n: lvl.level })} · {rankTitle(lvl.level)}</span>
              {plus ? <span className="pillnote orange"><Crown size={12} /> Plus</span> : null}
            </div>
          </div>
          <CaretRight size={18} className="chev" weight="bold" />
        </Tap>
        <Tap className="you-bar" onTap={() => earn('xp')} scale={0.98}>
          <Bar value={lvl.ratio} />
          <div className="row between t-small muted" style={{ marginTop: 8 }}>
            <span className="num">{fmtNumber(lvl.into)} / {fmtNumber(lvl.needed)} XP</span>
            <span className="row" style={{ gap: 4 }}>
              {t('you.toNext', { n: fmtNumber(lvl.needed - lvl.into), level: lvl.level + 1 })}
              <Info size={14} weight="bold" />
            </span>
          </div>
        </Tap>
        <StoryButton make={storyCards.progress} className="btn soft sm you-story" />
      </Card>

      {/* The companion, large: touch it and it waves; the buttons open it and its wardrobe. */}
      {echo.echo ? (
        <Card pad={false} className="you-echo">
          <CompanionStage
            ref={stage}
            gender={echo.gender}
            stage={echo.growth.index}
            accent={echo.accent}
            outfit={echo.outfit}
            mood={echo.mood}
            skin={echo.echo.skin}
            hair={echo.echo.hair}
            height={250}
            onTap={(part) => {
              haptic('light');
              stage.current?.play(part === 'head' ? 'nod' : 'wave');
            }}
          />
          <div className="you-echo-body">
            <div className="row between" style={{ gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="t-title clip">{echo.echo.name}</div>
                <div className="t-tiny" style={{ color: echo.accent, marginTop: 2 }}>
                  {growthName(echo.growth.index, echo.gender)} · {echo.archetype}
                </div>
              </div>
            </div>
            <div className="t-small muted clip-2" style={{ marginTop: 8 }}>“{echo.line}”</div>
            <div className="you-echo-actions">
              <Tap className="btn primary sm" onTap={() => push({ name: 'echo' })}>{t('you.echo.open')}</Tap>
              <Tap className="btn soft sm" onTap={() => push({ name: 'shop' })}>
                <TShirt size={16} weight="bold" /> {t('you.shop')}
              </Tap>
            </div>
          </div>
        </Card>
      ) : (
        <Tap onTap={() => open({ name: 'echo' })} scale={0.98}>
          <Card className="row echo-card" style={{ gap: 14 }}>
            <span className="bubble lg" style={{ background: 'var(--accent-soft)' }}><Emoji e="🌱" /></span>
            <div className="grow">
              <div className="t-body">{t('you.echo.meet')}</div>
              <div className="t-small muted">{t('you.echo.meet.body')}</div>
            </div>
          </Card>
        </Tap>
      )}

      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <StatTile icon={<span style={{ fontSize: 22 }}><Emoji e="⚡" /></span>} value={<Num value={profile.xp} format={(n) => fmtNumber(Math.round(n))} />} label={t('you.totalXp')} onTap={() => earn('xp')} />
        <StatTile icon={<span style={{ fontSize: 22 }}><Emoji e="✨" /></span>} value={<Num value={sparkBalance(profile, gift)} />} label={t('you.sparks')} onTap={() => earn('sparks')} />
        <StatTile icon={<span style={{ fontSize: 22 }}><Emoji e="🔥" /></span>} value={<Num value={streak} />} label={t('you.streak')} onTap={() => push({ name: 'progress' })} />
        <StatTile icon={<span style={{ fontSize: 22 }}><Emoji e="🧊" /></span>} value={<Num value={profile.freezes} />} label={t('you.freezes')} onTap={() => push({ name: 'progress' })} />
      </div>

      {waiting ? (
        <Tap onTap={() => go('inbox')} scale={0.98}>
          <Card className="row" style={{ gap: 12, padding: '12px 16px' }}>
            <span style={{ fontSize: 20 }}>⏳</span>
            <span className="t-small grow" style={{ color: 'var(--orange)', fontWeight: 600 }}>{tn('you.pending', waiting)}</span>
          </Card>
        </Tap>
      ) : null}

      <Card pad={false} className="list">
        <Row icon={<Notebook size={21} style={{ color: 'var(--violet)' }} />} title={t('j.title')} sub={t('you.journal.body')} onTap={() => push({ name: 'journal' })} />
        <Row icon={<Medal size={21} style={{ color: 'var(--gold)' }} />} title={t('you.progress')} sub={t('you.progress.body', { done: unlocked, total: BADGES.length })} onTap={() => push({ name: 'progress' })} />
        <Row icon={<Info size={21} style={{ color: 'var(--blue-hi)' }} />} title={t('you.earn')} sub={t('you.earn.body')} onTap={() => earn('sparks')} />
        <Row icon={<Trophy size={21} style={{ color: 'var(--orange)' }} />} title={t('you.rankings')} sub={t('you.rankings.body')} onTap={() => push({ name: 'rankings' })} />
        <Row icon={<UsersThree size={21} style={{ color: 'var(--blue)' }} />} title={t('tg.title')} sub={t('tg.body')} onTap={() => push({ name: 'together' })} />
        <Row icon={<TShirt size={21} style={{ color: 'var(--pink)' }} />} title={t('you.shop')} sub={t('you.shop.body')} onTap={() => push({ name: 'shop' })} />
        <Row icon={<Crown size={21} style={{ color: 'var(--violet)' }} />} title={t('you.plus')} sub={plus ? t('you.plus.active') : t('you.plus.body')} onTap={() => push({ name: 'plus' })} />
        <Row icon={<Gift size={21} style={{ color: 'var(--green)' }} />} title={t('you.invite')} sub={t('you.invite.body')} onTap={() => shareText(t('you.invite.text'), link)} />
        <Row icon={<Gear size={21} />} title={t('settings.title')} onTap={() => push({ name: 'settings' })} />
      </Card>
    </Screen>
  );
}
