import { Routes } from '@angular/router';
import { Shell } from './pages/shell/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/overview/overview').then((m) => m.Overview),
      },
      {
        path: 'matchups',
        loadComponent: () => import('./pages/matchups/matchups').then((m) => m.Matchups),
      },
      {
        path: 'games',
        loadComponent: () => import('./pages/games/games').then((m) => m.Games),
      },
      {
        path: 'watch-party',
        loadComponent: () => import('./pages/watch-party/watch-party').then((m) => m.WatchParty),
      },
      {
        path: 'standings',
        loadComponent: () => import('./pages/standings/standings').then((m) => m.Standings),
      },
      {
        path: 'playoffs',
        loadComponent: () => import('./pages/playoffs/playoffs').then((m) => m.Playoffs),
      },
      {
        path: 'draft',
        loadComponent: () => import('./pages/draft/draft').then((m) => m.Draft),
      },
      {
        path: 'teams',
        loadComponent: () => import('./pages/teams/teams').then((m) => m.Teams),
      },
      {
        path: 'teams/:rosterId',
        loadComponent: () => import('./pages/teams/teams').then((m) => m.Teams),
      },
      {
        path: 'players',
        loadComponent: () => import('./pages/players/players').then((m) => m.Players),
      },
      {
        path: 'trades',
        loadComponent: () => import('./pages/trades/trades').then((m) => m.Trades),
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/history/history').then((m) => m.History),
      },
      {
        path: 'recaps',
        loadComponent: () => import('./pages/recaps/recaps').then((m) => m.Recaps),
      },
      {
        path: 'insights',
        loadComponent: () => import('./pages/insights/insights').then((m) => m.Insights),
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/about/about').then((m) => m.About),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
