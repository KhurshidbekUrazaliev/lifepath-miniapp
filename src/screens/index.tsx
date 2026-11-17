// Which component draws each tab and each pushed screen.
//
// The four tabs are in the first file the app fetches, and so are the screens whose pieces Home and
// You draw (Prayer, Journal, Progress). Every other screen is fetched when it is wanted, and all of
// them in the background a moment after the app starts (fetchScreens), so opening one does not wait.
// Most belong to a group (./groups/*.ts): a handful of screens in one file.
//
// To add a screen, write one line in SCREENS, with no import above:
//   name: from(() => import('./File'), 'Component'),
// That makes it a file of its own. To put it in a group instead, export it from ./groups/<group>.ts
// and write
//   name: from(group, 'Component'),
import { ComponentType } from 'react';
import { Route, Tab } from '../store/nav';
import { fetchWhenIdle, from, whenOpened } from '../ui/onDemand';
import { Home } from './Home';
import { You } from './You';
import { Stats } from './Stats';
import { Inbox } from './Inbox';
import { Progress } from './Progress';
import { Prayer, Qibla } from './Prayer';
import { Journal } from '../journal/Journal';

const daily = () => import('./groups/daily');
const journal = () => import('./groups/journal');
const companion = () => import('./groups/companion');
const settings = () => import('./groups/settings');
const social = () => import('./groups/social');
// The adhkar texts are long, so their screen is a file of its own.
const adhkar = () => import('./Adhkar');
// The owner's panel is for one person: it is fetched when the owner opens it.
const admin = whenOpened(() => import('./Admin'));

export const TABS: Record<Tab, ComponentType> = { home: Home, you: You, stats: Stats, inbox: Inbox };

export const SCREENS: { [K in Route['name']]: ComponentType<{ route: Extract<Route, { name: K }> }> } = {
  homecards: from(settings, 'HomeOrder'),
  tasks: from(daily, 'Tasks'),
  habits: from(daily, 'Habits'),
  calendar: from(daily, 'Calendar'),
  goals: from(daily, 'Goals'),
  goal: from(daily, 'Goal'),
  area: from(daily, 'Area'),
  progress: Progress,
  settings: from(settings, 'Settings'),
  appearance: from(settings, 'Appearance'),
  language: from(settings, 'Language'),
  notifications: from(settings, 'Notifications'),
  data: from(settings, 'DataPrivacy'),
  about: from(settings, 'About'),
  faith: from(settings, 'Faith'),
  reciter: from(settings, 'Reciters'),
  method: from(settings, 'Methods'),
  prayer: Prayer,
  qibla: Qibla,
  adhkar: from(adhkar, 'Adhkar'),
  khatm: from(daily, 'Khatm'),
  focus: from(daily, 'Focus'),
  echo: from(companion, 'Echo'),
  shop: from(companion, 'Shop'),
  rankings: from(social, 'Rankings'),
  together: from(social, 'Together'),
  buddies: from(social, 'Buddies'),
  gkhatm: from(social, 'GroupKhatm'),
  challenges: from(social, 'Challenges'),
  challenge: from(social, 'ChallengeScreen'),
  plus: from(social, 'Plus'),
  admin: from(admin, 'Admin'),
  journal: Journal,
  page: from(journal, 'PageScreen'),
  lookback: from(journal, 'LookBack'),
};

/** Fetches the groups in the background, the ones opened most first. */
export function fetchScreens(): void {
  fetchWhenIdle([daily, journal, companion, settings, social, adhkar]);
}
