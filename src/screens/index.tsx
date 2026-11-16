// Which component draws each tab and each pushed screen.
import { ComponentType, lazy } from 'react';
import { Route, Tab } from '../store/nav';
import { Home } from './Home';
import { You } from './You';
import { Stats } from './Stats';
import { Inbox } from './Inbox';
import { Tasks } from './Tasks';
import { Habits } from './Habits';
import { Calendar } from './Calendar';
import { Area, Goals } from './Goals';
import { Goal } from './Goal';
import { Progress } from './Progress';
import { About, Appearance, DataPrivacy, Faith, Language, Methods, Notifications, Reciters, Settings } from './Settings';
import { Prayer, Qibla } from './Prayer';
import { Khatm } from './Khatm';
import { Echo, Shop } from './Echo';
import { Plus, Rankings } from './Social';
import { ChallengeScreen, Challenges } from './Challenges';
import { Admin } from './Admin';
import { Journal } from '../journal/Journal';
import { PageScreen } from '../journal/PageScreen';
import { LookBack } from '../journal/LookBack';

// The adhkar texts are long, so their screen loads when it is first opened.
const Adhkar = lazy(() => import('./Adhkar').then((m) => ({ default: m.Adhkar })));
const Focus = lazy(() => import('./Focus').then((m) => ({ default: m.Focus })));

export const TABS: Record<Tab, ComponentType> = { home: Home, you: You, stats: Stats, inbox: Inbox };

export const SCREENS: { [K in Route['name']]: ComponentType<{ route: Extract<Route, { name: K }> }> } = {
  tasks: Tasks,
  habits: Habits,
  calendar: Calendar,
  goals: Goals,
  goal: Goal,
  area: Area,
  progress: Progress,
  settings: Settings,
  appearance: Appearance,
  language: Language,
  notifications: Notifications,
  data: DataPrivacy,
  about: About,
  faith: Faith,
  reciter: Reciters,
  method: Methods,
  prayer: Prayer,
  qibla: Qibla,
  adhkar: Adhkar,
  khatm: Khatm,
  focus: Focus,
  echo: Echo,
  shop: Shop,
  rankings: Rankings,
  challenges: Challenges,
  challenge: ChallengeScreen,
  plus: Plus,
  admin: Admin,
  journal: Journal,
  page: PageScreen,
  lookback: LookBack,
};
