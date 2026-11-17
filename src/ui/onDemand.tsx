// Parts of the app that are fetched when they are wanted, not with the first file: most pushed
// screens and every sheet. A part that is already here is drawn at once, exactly as if it had been
// in the first file; one that is not makes its screen wait (the nearest <Suspense>) until it is.
// Everything is also fetched in the background a moment after the app starts (fetchWhenIdle), so on
// an ordinary connection nothing ever waits.
import { ComponentType, createElement, use } from 'react';

type Loaded = Record<string, unknown>;
type Loader<M extends Loaded = Loaded> = () => Promise<M>;

interface Source {
  load: Loader;
  /** The fetch that is under way or over. */
  fetching: Promise<Loaded> | null;
  here: Loaded | null;
  /** Fetched in the background after the app starts (true), or only when it is opened. */
  ahead: boolean;
  /** A screen is waiting for it. */
  awaited: boolean;
  /** The fetch failed while a screen was waiting. */
  failed: boolean;
}

/** Every file `from` was told of, in the order they were first named. */
const sources = new Map<Loader, Source>();

function sourceOf(load: Loader): Source {
  let source = sources.get(load);
  if (!source) {
    source = { load, fetching: null, here: null, ahead: true, awaited: false, failed: false };
    sources.set(load, source);
  }
  return source;
}

function fetchSource(source: Source): Promise<Loaded> {
  return (source.fetching ??= source.load().then(
    (loaded) => {
      source.here = loaded;
      return loaded;
    },
    (e) => {
      // With a screen waiting, the failed fetch is kept: React draws the screen again, meets the same
      // failure and hands it to the error boundary, which says so and offers to try again
      // (forgetFailed). Dropped here, every redraw would start a new fetch, without end.
      if (source.awaited) source.failed = true;
      else source.fetching = null;
      throw e;
    },
  ));
}

/**
 * The component `name` of the file `load` fetches. Several components may come from one file (a
 * group of screens): pass the same `load` and the file is fetched once.
 *
 *   const plan = () => import('./groups/plan');
 *   tasks: from(plan, 'Tasks'),
 */
export function from<M extends Loaded, N extends keyof M & string>(load: Loader<M>, name: N): M[N] {
  const source = sourceOf(load as Loader);
  function OnDemand(props: Record<string, unknown>) {
    let loaded = source.here;
    if (!loaded) {
      source.awaited = true;
      // `use` waits here (showing the nearest Suspense fallback) and throws to the nearest error
      // boundary if the file cannot be fetched.
      loaded = use(fetchSource(source));
    }
    return createElement(loaded[name] as ComponentType<Record<string, unknown>>, props);
  }
  OnDemand.displayName = name;
  return OnDemand as unknown as M[N];
}

/** What stands in for a screen that is still being fetched. It only appears when that takes a while. */
export function Fetching() {
  return (
    <div className="wait" aria-busy="true">
      <i />
    </div>
  );
}

/** Marks a file as one to fetch only when it is opened: something few people ever see. */
export function whenOpened<M extends Loaded>(load: Loader<M>): Loader<M> {
  sourceOf(load as Loader).ahead = false;
  return load;
}

/** Lets what could not be fetched be asked for again. An error boundary calls it once it shows the failure. */
export function forgetFailed(): void {
  for (const source of sources.values()) {
    if (!source.failed) continue;
    source.failed = false;
    source.awaited = false;
    source.fetching = null;
  }
}

const waiting: Source[] = [];
let draining = false;

/** Runs `then` when the browser has a quiet moment, or soon when it has none (or cannot say). */
function whenQuiet(then: () => void): void {
  const idle = (window as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(then, { timeout: 400 });
  else setTimeout(then, 120);
}

function drain(): void {
  let next = waiting.shift();
  while (next?.here) next = waiting.shift();
  if (!next) {
    draining = false;
    return;
  }
  // One at a time, so that this never competes with what the user is looking at.
  const on = () => whenQuiet(drain);
  fetchSource(next).then(on, on);
}

/**
 * Fetches files in the background, one after another: the ones given, in that order (put first what
 * is most likely to be opened first), or with no list every file `from` was told of except those
 * marked whenOpened. What cannot be fetched now is fetched when it is opened.
 */
export function fetchWhenIdle(loads?: Loader[]): void {
  const wanted = loads ? loads.map(sourceOf) : [...sources.values()].filter((source) => source.ahead);
  for (const source of wanted) {
    if (!source.here && !waiting.includes(source)) waiting.push(source);
  }
  if (draining || waiting.length === 0) return;
  draining = true;
  whenQuiet(drain);
}
