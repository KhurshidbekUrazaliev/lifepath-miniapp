// Which component draws each tab and each pushed screen.
import { ComponentType } from 'react';
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
import { About, Appearance, DataPrivacy, Language, Notifications, Settings } from './Settings';
import { Echo, Shop } from './Echo';
import { Plus, Rankings } from './Social';

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
  echo: Echo,
  shop: Shop,
  rankings: Rankings,
  plus: Plus,
};
