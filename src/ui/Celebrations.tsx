// Toasts for XP, streaks and badges; a modal with confetti for level-ups and finished goals.
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Celebration, useStore } from '../store/store';
import { haptic, lowPerf } from '../tg/telegram';
import { badgeById } from '../lib/achievements';
import { t, tk, tn } from '../i18n';
import { Hex } from './charts';
import { Tap, spring } from './kit';
import { Emoji } from './Emoji';
import { StoryButton, storyCards } from './StoryButton';

const COLORS = ['#5f9bff', '#9b8cff', '#34d399', '#ffcf5c', '#ff6fa8', '#3dd6f5'];

/** A short burst of confetti from the upper middle of the screen. */
function fireConfetti(canvas: HTMLCanvasElement): void {
  if (lowPerf) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (canvas.width = canvas.clientWidth * dpr);
  const h = (canvas.height = canvas.clientHeight * dpr);
  const bits = Array.from({ length: 90 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = (7 + Math.random() * 10) * dpr;
    return {
      x: w / 2, y: h * 0.34, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: (5 + Math.random() * 6) * dpr, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
  const started = performance.now();
  const frame = (now: number) => {
    const life = (now - started) / 1900;
    ctx.clearRect(0, 0, w, h);
    if (life >= 1) return;
    for (const b of bits) {
      b.vy += 0.42 * dpr;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - life * life);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function describe(c: Celebration): { icon: React.ReactNode; title: string; sub?: string } {
  switch (c.kind) {
    case 'xp':
      return {
        icon: '⚡',
        title: t('cel.xp', { n: c.xp }),
        sub: c.sparks ? `${t(`cel.from.${c.from}`)} · ${t('cel.sparks', { n: c.sparks })}` : t(`cel.from.${c.from}`),
      };
    case 'complete':
      return { icon: '🏁', title: t('cel.complete'), sub: c.title };
    case 'achievement': {
      const badge = badgeById(c.badge);
      return {
        icon: badge ? <Hex tone={badge.tone} icon={badge.icon} size={30} /> : '🏅',
        title: tk(`ach.${c.badge}.title`, c.badge),
        sub: t('cel.achievement'),
      };
    }
    case 'item':
      return { icon: '🛍️', title: tk(`item.${c.item}`, c.item), sub: t('cel.item') };
    case 'khatm':
      return { icon: '📖', title: t('khatm.done.title'), sub: tn('khatm.count', c.n) };
    case 'streak':
      return {
        icon: '🔥',
        title: tn('cel.streak', c.days),
        sub: c.freezeUsed ? t('cel.freezeUsed') : c.freezeEarned ? t('cel.freezeEarned') : t('cel.streak.sub'),
      };
    default:
      return { icon: '✨', title: '' };
  }
}

function Toast({ c, onDone }: { c: Celebration; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, c.kind === 'xp' ? 2000 : 2800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const d = describe(c);
  return (
    <motion.div
      layout
      className="toast"
      initial={{ opacity: 0, y: -22, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.94 }}
      transition={spring}
    >
      <span className="toast-ic">{typeof d.icon === 'string' ? <Emoji e={d.icon} /> : d.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span className="t-body clip" style={{ display: 'block' }}>{d.title}</span>
        {d.sub ? <span className="t-small muted clip" style={{ display: 'block' }}>{d.sub}</span> : null}
      </span>
    </motion.div>
  );
}

export function Celebrations() {
  const list = useStore((s) => s.celebrations);
  const dismiss = useStore((s) => s.dismissCelebration);
  const canvas = useRef<HTMLCanvasElement>(null);
  const seen = useRef(new Set<string>());

  const levelUp = list.find((c) => c.kind === 'levelup');
  const toasts = list.filter((c) => c.kind !== 'levelup').slice(0, 3);

  // Haptics and confetti fire once per celebration.
  useEffect(() => {
    for (const c of list) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      if (c.kind === 'levelup' || c.kind === 'complete' || c.kind === 'khatm') {
        haptic('success');
        if (canvas.current) fireConfetti(canvas.current);
      } else if (c.kind === 'achievement') haptic('success');
      else if (c.kind === 'streak') haptic('medium');
    }
  }, [list]);

  return (
    <>
      <div className="toasts" aria-live="polite">
        <AnimatePresence mode="popLayout">
          {toasts.map((c) => (
            <Toast key={c.id} c={c} onDone={() => dismiss(c.id)} />
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {levelUp && levelUp.kind === 'levelup' ? (
          <motion.div
            key={levelUp.id}
            className="modal-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismiss(levelUp.id)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                style={{ lineHeight: 0 }}
                initial={{ rotate: -30, scale: 0.4 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.1 }}
              >
                <Emoji e="⭐" size={76} />
              </motion.div>
              <div className="t-display" style={{ marginTop: 12 }}>{t('cel.levelup', { n: levelUp.level })}</div>
              <div className="t-body muted" style={{ marginTop: 6, marginBottom: 20 }}>{t('cel.levelup.sub')}</div>
              <div className="modal-actions">
                <Tap className="btn primary" onTap={() => dismiss(levelUp.id)}>
                  {t('cel.continue')}
                </Tap>
                <StoryButton make={(p) => storyCards.level(p, levelUp.level)} className="btn ghost" />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <canvas ref={canvas} className="confetti" />
    </>
  );
}
