// What the companion says: a speech card under the stage that types itself out, plus the little
// hearts that float up when you pat its head.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, ShareNetwork } from '@phosphor-icons/react';
import type { Advice } from '../lib/advisor';
import { lowPerf } from '../tg/telegram';
import { t } from '../i18n';
import { Tap, cx } from '../ui/kit';

export type Speech = (Advice | { kind: 'say'; key: string; text: string }) & { thinking?: boolean };

/** Reveals the text a few letters at a time; `onDone` fires when it is all out. */
function useTypewriter(text: string, key: string, onDone?: () => void): [string, () => void] {
  const [shown, setShown] = useState(lowPerf ? text.length : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (lowPerf) {
      setShown(text.length);
      done.current?.();
      return;
    }
    setShown(0);
    const perTick = Math.max(1, Math.round(text.length / 90)); // long quotes type faster
    let n = 0;
    const id = setInterval(() => {
      n = Math.min(text.length, n + perTick);
      setShown(n);
      if (n >= text.length) {
        clearInterval(id);
        done.current?.();
      }
    }, 24);
    return () => clearInterval(id);
  }, [key, text]);
  return [text.slice(0, shown), () => {
    if (shown < text.length) {
      setShown(text.length);
      done.current?.();
    }
  }];
}

function label(s: Speech): string | null {
  if (s.kind === 'hadith') return `${t('advice.hadith')} · ${s.source}`;
  if (s.kind === 'hikmah') return s.from === 'ar' ? t('advice.from.ar') : s.from === 'uz' ? t('advice.from.uz') : t('advice.hikmah');
  if (s.kind === 'motivation') return t('advice.motivation');
  return null;
}

export function SpeechCard({ speech, onDone, onShare, onRead }: {
  speech: Speech;
  onDone?: () => void;
  onShare?: () => void;
  onRead?: () => void;
}) {
  const [text, finish] = useTypewriter(speech.thinking ? '' : speech.text, speech.key + (speech.thinking ? ':t' : ''), onDone);
  const head = label(speech);
  const advice = speech.kind !== 'say';
  return (
    <div className="speech" onClick={finish} role="status" aria-live="polite">
      <i className="speech-tail" />
      {speech.thinking ? (
        <div className="speech-dots" aria-label={t('advice.thinking')}>
          <i /><i /><i />
        </div>
      ) : (
        <>
          {head ? <div className={cx('speech-kind', speech.kind)}>{head}</div> : null}
          {'ar' in speech && speech.ar ? <div className="speech-ar" dir="rtl" lang="ar">{speech.ar}</div> : null}
          <p className="speech-text">
            {text}
            <span className="speech-ghost" aria-hidden="true">{speech.text.slice(text.length)}</span>
          </p>
          {advice ? (
            <div className="speech-foot">
              {'ai' in speech && speech.ai ? <span className="t-tiny faint grow">{t('advice.ai')}</span> : <span className="grow" />}
              {speech.kind === 'hadith' && onRead ? (
                <Tap className="speech-btn" onTap={onRead} label={t('advice.read')}>
                  <BookOpenText size={17} weight="duotone" />
                </Tap>
              ) : null}
              {onShare ? (
                <Tap className="speech-btn" onTap={onShare} label={t('advice.share')}>
                  <ShareNetwork size={17} weight="duotone" />
                </Tap>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Hearts that float up from the companion. Bump `burst` to send a few more. */
export function Hearts({ burst }: { burst: number }) {
  const [hearts, setHearts] = useState<{ id: number; x: number; d: number; s: number }[]>([]);
  useEffect(() => {
    if (!burst || lowPerf) return;
    const batch = Array.from({ length: 5 }, (_, i) => ({ id: burst * 10 + i, x: (Math.random() - 0.5) * 120, d: i * 0.08, s: 0.7 + Math.random() * 0.6 }));
    setHearts((h) => [...h, ...batch]);
    const id = setTimeout(() => setHearts((h) => h.filter((x) => !batch.includes(x))), 1800);
    return () => clearTimeout(id);
  }, [burst]);
  return (
    <div className="hearts" aria-hidden="true">
      <AnimatePresence>
        {hearts.map((h) => (
          <motion.span
            key={h.id}
            className="heart"
            initial={{ opacity: 0, y: 0, x: h.x * 0.3, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: -150, x: h.x, scale: h.s }}
            transition={{ duration: 1.5, delay: h.d, ease: 'easeOut' }}
          >
            ♥
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
