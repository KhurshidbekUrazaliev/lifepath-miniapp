// First run: a welcome, then pick a few areas and habits so the app never starts empty.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check as CheckIcon } from 'lucide-react';
import { snapshot, useStore } from '../store/store';
import { buildDemo } from '../store/demo';
import { TEMPLATES, templateById } from '../lib/templates';
import { FREE_FOLDER_LIMIT } from '../lib/plus';
import { EVERY_DAY } from '../lib/habits';
import { haptic, tgUser } from '../tg/telegram';
import { Key, t } from '../i18n';
import { Tap, cx } from '../ui/kit';
import { HABIT_IDEAS } from '../sheets/create';

const AREAS = TEMPLATES.filter((x) => x.id !== 'custom');

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [habits, setHabits] = useState<string[]>([]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    haptic('select');
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (list.length < max) set([...list, id]);
    else haptic('warning');
  };

  const finish = () => {
    const s = useStore.getState();
    for (const id of areas) {
      const tpl = templateById(id);
      s.createFolder({ name: t(`tpl.${id}.name` as Key), icon: tpl.icon, color: tpl.color, templateId: id, progressType: tpl.progressType, unit: t(`tpl.${id}.unit` as Key) });
    }
    for (const key of habits) {
      const idea = HABIT_IDEAS.find((x) => x.key === key)!;
      s.createHabit({ title: t(`habit.s.${key}` as Key), icon: idea.icon, color: idea.color, days: EVERY_DAY });
    }
    if (!s.profile.name && tgUser.firstName) s.setName(tgUser.firstName);
    s.setSettings({ onboarded: true });
    haptic('success');
  };

  const demo = () => {
    useStore.getState().replaceData(buildDemo(snapshot()));
    haptic('success');
  };

  return (
    <section className="view onb">
      <AnimatePresence mode="wait">
        <motion.div key={step} className="onb-body" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.26, ease: [0.22, 0.8, 0.26, 1] }}>
          {step === 0 ? (
            <div className="onb-hero">
              <motion.img src="/icon.svg" alt="" width={92} height={92} className="onb-logo" initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} />
              <h1 className="t-display" style={{ fontSize: 36, marginTop: 28 }}>
                {t('home.title.your')} <span className="grad-text">{t('home.title.path')}</span>
              </h1>
              <div className="t-title muted" style={{ marginTop: 8, fontWeight: 600 }}>{t('home.tagline')}</div>
              <p className="t-body muted" style={{ marginTop: 18, fontWeight: 500, lineHeight: 1.55, maxWidth: 300 }}>{t('onb.welcome.body')}</p>
            </div>
          ) : null}

          {step === 1 ? (
            <>
              <h1 className="t-display" style={{ fontSize: 27 }}>{t('onb.areas.title')}</h1>
              <p className="t-body muted" style={{ marginTop: 8, marginBottom: 20, fontWeight: 500 }}>{t('onb.areas.body')}</p>
              <div className="pick-grid">
                {AREAS.map((x) => {
                  const on = areas.includes(x.id);
                  return (
                    <Tap key={x.id} className={cx('pick card', on && 'on')} onTap={() => toggle(areas, setAreas, x.id, FREE_FOLDER_LIMIT)} hap={false} scale={0.95}>
                      {on ? <span className="pick-tick"><CheckIcon size={13} strokeWidth={3.4} /></span> : null}
                      <span style={{ fontSize: 30 }}>{x.icon}</span>
                      <span className="t-small" style={{ fontWeight: 700 }}>{t(`tpl.${x.id}.name` as Key)}</span>
                      <span className="t-tiny muted clip-2">{t(`tpl.${x.id}.tagline` as Key)}</span>
                    </Tap>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="t-display" style={{ fontSize: 27 }}>{t('onb.habits.title')}</h1>
              <p className="t-body muted" style={{ marginTop: 8, marginBottom: 20, fontWeight: 500 }}>{t('onb.habits.body')}</p>
              <div className="col tight">
                {HABIT_IDEAS.map((idea) => {
                  const on = habits.includes(idea.key);
                  return (
                    <Tap key={idea.key} className={cx('card item pick-row', on && 'on')} onTap={() => toggle(habits, setHabits, idea.key, 10)} hap={false} scale={0.98}>
                      <span className="bubble sm" style={{ background: `${idea.color}26`, borderColor: `${idea.color}40` }}>{idea.icon}</span>
                      <span className="grow t-body">{t(`habit.s.${idea.key}` as Key)}</span>
                      <span className={cx('check', on && 'on')} style={{ width: 24, height: 24 }}>{on ? <CheckIcon size={14} strokeWidth={3.2} /> : null}</span>
                    </Tap>
                  );
                })}
              </div>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="onb-foot">
        <div className="onb-dots">
          {[0, 1, 2].map((i) => (
            <i key={i} className={cx(i === step && 'on')} />
          ))}
        </div>
        {step === 0 ? (
          <>
            <Tap className="btn primary" onTap={() => setStep(1)}>{t('onb.start')}</Tap>
            <Tap className="btn ghost" onTap={demo}>{t('onb.demo')}</Tap>
          </>
        ) : step === 1 ? (
          <div className="row" style={{ gap: 10 }}>
            <Tap className="btn soft" style={{ width: 'auto', flex: 'none', padding: '0 22px' }} onTap={() => setStep(0)}>{t('common.back')}</Tap>
            <Tap className="btn primary" onTap={() => setStep(2)}>{areas.length ? t('common.continue') : t('common.skip')}</Tap>
          </div>
        ) : (
          <div className="row" style={{ gap: 10 }}>
            <Tap className="btn soft" style={{ width: 'auto', flex: 'none', padding: '0 22px' }} onTap={() => setStep(1)}>{t('common.back')}</Tap>
            <Tap className="btn primary" onTap={finish} hap={false}>{t('onb.finish')}</Tap>
          </div>
        )}
      </div>
    </section>
  );
}
