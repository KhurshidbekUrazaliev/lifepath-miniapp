// Shows whichever bottom sheet the navigation store asks for.
import { AnimatePresence } from 'motion/react';
import { Sheet as SheetState, useNav } from '../store/nav';
import { AddSheet, HabitSheet, TaskSheet } from './create';
import { AreaSheet, GoalSheet, PlannerSheet, ReminderSheet } from './goal';
import { EntrySheet, LogSheet, ProofSheet } from './log';
import { EchoSheet, RankSheet } from './misc';
import { ConfirmHost } from './confirm';

function render(sheet: SheetState, close: () => void) {
  switch (sheet.name) {
    case 'add': return <AddSheet onClose={close} />;
    case 'task': return <TaskSheet sheet={sheet} onClose={close} />;
    case 'habit': return <HabitSheet sheet={sheet} onClose={close} />;
    case 'goal': return <GoalSheet sheet={sheet} onClose={close} />;
    case 'area': return <AreaSheet sheet={sheet} onClose={close} />;
    case 'log': return <LogSheet sheet={sheet} onClose={close} />;
    case 'proof': return <ProofSheet sheet={sheet} onClose={close} />;
    case 'entry': return <EntrySheet sheet={sheet} onClose={close} />;
    case 'planner': return <PlannerSheet sheet={sheet} onClose={close} />;
    case 'reminder': return <ReminderSheet sheet={sheet} onClose={close} />;
    case 'echo': return <EchoSheet onClose={close} />;
    case 'rank': return <RankSheet onClose={close} />;
  }
}

export function SheetHost() {
  const sheet = useNav((s) => s.sheet);
  const close = useNav((s) => s.close);
  // Each sheet is keyed by what it shows, so switching from one to another animates out and in.
  const key = sheet ? `${sheet.name}:${'id' in sheet ? sheet.id ?? '' : ''}${'taskId' in sheet ? sheet.taskId ?? '' : ''}${'entryId' in sheet ? sheet.entryId : ''}` : '';
  return (
    <>
      <AnimatePresence>{sheet ? <div key={key}>{render(sheet, close)}</div> : null}</AnimatePresence>
      <ConfirmHost />
    </>
  );
}
