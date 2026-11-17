// Shows whichever bottom sheet the navigation store asks for.
//
// The sheets are one file (./all.ts) that is not part of the first one the app fetches: it comes the
// first time a sheet is opened, and in the background a moment after the app starts (fetchSheets).
//
// To add a sheet, write one line in SHEETS, with no import above:
//   name: from(() => import('./file'), 'Component'),
// That makes it a file of its own. To put it with the others instead, export it from ./all.ts and
// write
//   name: from(all, 'Component'),
import { ComponentType, Suspense, createElement } from 'react';
import { AnimatePresence } from 'motion/react';
import { Sheet as SheetState, useNav } from '../store/nav';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { fetchWhenIdle, from } from '../ui/onDemand';
import { ConfirmHost } from './confirm';

const all = () => import('./all');

/**
 * What a sheet is given: how to close itself, and what was asked for, both whole (`sheet`) and field
 * by field (`id`, `n` and so on), so each sheet takes whichever it needs.
 */
type Given<K extends SheetState['name']> = Omit<Extract<SheetState, { name: K }>, 'name'> & {
  sheet: Extract<SheetState, { name: K }>;
  onClose: () => void;
};

const SHEETS: { [K in SheetState['name']]: ComponentType<Given<K>> } = {
  restore: from(all, 'RestoreSheet'),
  week: from(all, 'WeekSheet'),
  gkhatmNew: from(all, 'KhatmNewSheet'),
  juz: from(all, 'JuzSheet'),
  add: from(all, 'AddSheet'),
  task: from(all, 'TaskSheet'),
  habit: from(all, 'HabitSheet'),
  goal: from(all, 'GoalSheet'),
  area: from(all, 'AreaSheet'),
  log: from(all, 'LogSheet'),
  proof: from(all, 'ProofSheet'),
  entry: from(all, 'EntrySheet'),
  planner: from(all, 'PlannerSheet'),
  reminder: from(all, 'ReminderSheet'),
  echo: from(all, 'EchoSheet'),
  hadith: from(all, 'HadithSheet'),
  ayah: from(all, 'AyahSheet'),
  place: from(all, 'PlaceSheet'),
  rank: from(all, 'RankSheet'),
  challengeNew: from(all, 'ChallengeSheet'),
};

/** Fetches the sheets in the background, so that the first one opens without a wait. */
export function fetchSheets(): void {
  fetchWhenIdle([all]);
}

function render(sheet: SheetState, close: () => void) {
  const { name, ...asked } = sheet;
  return createElement(SHEETS[name] as ComponentType<Record<string, unknown>>, { ...asked, sheet, onClose: close });
}

export function SheetHost() {
  const sheet = useNav((s) => s.sheet);
  const close = useNav((s) => s.close);
  // Each sheet is keyed by what it shows, so switching from one to another animates out and in.
  const key = sheet ? `${sheet.name}:${'id' in sheet ? sheet.id ?? '' : ''}${'taskId' in sheet ? sheet.taskId ?? '' : ''}${'entryId' in sheet ? sheet.entryId : ''}` : '';
  return (
    <>
      <AnimatePresence>
        {sheet ? (
          <div key={key}>
            {/* A sheet that fails to draw says so in a sheet of its own; the screen under it stays. */}
            <ErrorBoundary scope="sheet" name={`sheet:${sheet.name}`}>
              <Suspense fallback={null}>{render(sheet, close)}</Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </AnimatePresence>
      <ConfirmHost />
    </>
  );
}
