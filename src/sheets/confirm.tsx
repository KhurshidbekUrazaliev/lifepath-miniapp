// A small "are you sure?" dialog for destructive actions.
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { Tap } from '../ui/kit';
import { haptic } from '../tg/telegram';
import { t } from '../i18n';

interface Ask {
  title: string;
  body?: string;
  confirm: string;
  onConfirm: () => void;
}

const useConfirm = create<{ ask: Ask | null }>()(() => ({ ask: null }));

export function confirmSheet(opts: { title: string; body?: string; confirm: string }, onConfirm: () => void): void {
  haptic('warning');
  useConfirm.setState({ ask: { ...opts, onConfirm } });
}

export function ConfirmHost() {
  const ask = useConfirm((s) => s.ask);
  const close = () => useConfirm.setState({ ask: null });
  return (
    <AnimatePresence>
      {ask ? (
        <motion.div className="modal-wrap" style={{ zIndex: 80 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="modal"
            role="alertdialog"
            aria-label={ask.title}
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-title">{ask.title}</div>
            {ask.body ? <div className="t-small muted" style={{ marginTop: 8, lineHeight: 1.5 }}>{ask.body}</div> : null}
            <div className="col tight" style={{ marginTop: 20 }}>
              <Tap
                className="btn danger"
                hap="medium"
                onTap={() => {
                  close();
                  ask.onConfirm();
                }}
              >
                {ask.confirm}
              </Tap>
              <Tap className="btn soft" onTap={close}>
                {t('common.cancel')}
              </Tap>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
