// The bottom sheet: slides up, can be dragged down by its handle, and stays above the keyboard.
import { ReactNode, useEffect, useRef } from 'react';
import { motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { IconBtn, spring } from './kit';
import { t } from '../i18n';
import { hideKeyboard } from '../tg/telegram';

/** Keeps --kb equal to the height the on-screen keyboard covers (iOS does not resize the page). */
function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${covered > 60 ? covered : 0}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.setProperty('--kb', '0px');
    };
  }, []);
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
}

export function Sheet({ title, onClose, children, foot }: SheetProps) {
  const controls = useDragControls();
  const body = useRef<HTMLDivElement>(null);
  useKeyboardInset();

  // Bring a focused field into view once the keyboard is up.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!/^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, []);

  const close = () => {
    hideKeyboard();
    onClose();
  };

  return (
    <>
      <motion.div
        className="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={close}
      />
      <motion.div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 650) close();
        }}
      >
        <div className="sheet-grab" onPointerDown={(e) => controls.start(e)}>
          <i />
        </div>
        <div className="sheet-head" onPointerDown={(e) => controls.start(e)}>
          <h2 className="t-title clip">{title}</h2>
          <span onPointerDown={(e) => e.stopPropagation()}>
            <IconBtn small onTap={close} label={t('common.close')}>
              <X size={18} />
            </IconBtn>
          </span>
        </div>
        <div className="sheet-body" ref={body}>
          <div className="col">{children}</div>
        </div>
        {foot ? <div className="sheet-foot">{foot}</div> : null}
      </motion.div>
    </>
  );
}
