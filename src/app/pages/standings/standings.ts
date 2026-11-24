import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type LeagueScheduleMatrix,
  SleeperService,
  type TeamSummary,
  ToastService,
  buildLeagueScheduleMatrix,
} from '../../core';
import { PageHeaderComponent, PickerComponent, type PickerOption } from '../../shared/ui';

type StandingsSortColumn =
  | 'standings'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'diff'
  | 'allPlay'
  | 'efficiency'
  | 'luck'
  | 'power';

type StandingsScope = 'all' | 'playoffs' | 'chasing';

const VALID_SORT_COLS: readonly StandingsSortColumn[] = [
  'standings',
  'pointsFor',
  'pointsAgainst',
  'diff',
  'allPlay',
  'efficiency',
  'luck',
  'power',
];

const SORT_PICKER_OPTIONS: PickerOption<StandingsSortColumn>[] = [
  { value: 'standings', label: 'Official Seed', badge: '#' },
  { value: 'power', label: 'Power Score', badge: 'PWR' },
  { value: 'pointsFor', label: 'Points For', badge: 'PF' },
  { value: 'allPlay', label: 'All-Play Win %', badge: 'AP' },
  { value: 'luck', label: 'Schedule Luck', badge: 'LUCK' },
  { value: 'efficiency', label: 'Lineup Efficiency', badge: 'EFF%' },
  { value: 'diff', label: 'Point Differential', badge: 'DIFF' },
  { value: 'pointsAgainst', label: 'Points Against', badge: 'PA' },
];

@Component({
  selector: 'app-standings',
  imports: [RouterLink, PageHeaderComponent, PickerComponent],
  templateUrl: './standings.html',
  styleUrl: './standings.scss',
})
export class Standings implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sortPickerOptions = SORT_PICKER_OPTIONS;
  protected readonly sortColumn = signal<StandingsSortColumn>('standings');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly scopeFilter = signal<StandingsScope>('all');
  protected readonly sosView = signal<'all' | 'remaining' | 'played'>('all');
  protected readonly mobileSosRosterId = signal<number | null>(null);
  protected readonly futureMatchups = signal<Record<number, Array<[number, number]>>>({});
  protected readonly futureLoading = signal(false);
  protected readonly futureSynced = signal(false);

  protected readonly scheduleMatrix = computed<LeagueScheduleMatrix | null>(() => {
    const data = this.sleeper.dashboard();
    if (!data || data.teams.length === 0) return null;
    return buildLeagueScheduleMatrix({
      teams: data.teams,
      weeklyMatchups: data.weeklyMatchups,
      futureMatchups: this.futureMatchups(),
      currentWeek: data.currentWeek,
      playoffStartWeek: data.league.settings?.playoff_week_start ?? 15,
    });
  });

  protected readonly visibleSosWeeks = computed(() => {
    const matrix = this.scheduleMatrix();
    const data = this.sleeper.dashboard();
    if (!matrix || !data) return [];
    const view = this.sosView();
    if (view === 'remaining') {
      return matrix.weeks.filter((w) => w >= data.currentWeek);
    }
    if (view === 'played') {
      return matrix.weeks.filter(
        (w) =>
          w < data.currentWeek ||
          (data.weeklyMatchups[w]?.some((m) => m.isCompleted) ?? false)
      );
    }
    return matrix.weeks;
  });

  protected readonly sosTeamOptions = computed<PickerOption<number>[]>(() =>
    this.sleeper.teams().map((t) => ({
      value: t.rosterId,
      label: t.teamName,
      sub: t.managerName,
      badge: `#${t.standingsRank}`,
      avatarUrl: t.avatarUrl,
      initials: t.initials,
    }))
  );

  protected readonly activeMobileSosRow = computed(() => {
    const matrix = this.scheduleMatrix();
    if (!matrix || matrix.rows.length === 0) return null;
    const chosen = this.mobileSosRosterId() ?? this.myRosterId();
    if (chosen !== null) {
      const match = matrix.rows.find((r) => r.rosterId === chosen);
      if (match) return match;
    }
    return matrix.rows[0];
  });

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const sort = qp.get('sort') as StandingsSortColumn | null;
    if (sort && VALID_SORT_COLS.includes(sort)) {
      this.sortColumn.set(sort);
    }
    const dir = qp.get('dir');
    if (dir === 'asc' || dir === 'desc') {
      this.sortDir.set(dir);
    }
    const scope = qp.get('scope');
    if (scope === 'all' || scope === 'playoffs' || scope === 'chasing') {
      this.scopeFilter.set(scope);
    }
  }

  protected readonly myRosterId = computed(() => this.sleeper.myTeam()?.rosterId ?? null);

  protected readonly playoffTeamsCount = computed(
    () => this.sleeper.league()?.settings?.playoff_teams ?? 4
  );

  protected readonly sortedTeams = computed<TeamSummary[]>(() => {
    const cut = this.playoffTeamsCount();
    const scope = this.scopeFilter();
    const teams = this.sleeper.teams().filter((t) => {
      if (scope === 'playoffs') return t.standingsRank <= cut;
      if (scope === 'chasing') return t.standingsRank > cut;
      return true;
    });
    const col = this.sortColumn();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    return [...teams].sort((a, b) => {
      switch (col) {
        case 'standings':
          return (a.standingsRank - b.standingsRank) * dir;
        case 'pointsFor':
          return (a.pointsFor - b.pointsFor) * dir;
        case 'pointsAgainst':
          return (a.pointsAgainst - b.pointsAgainst) * dir;
        case 'diff':
          return (a.pointDifferential - b.pointDifferential) * dir;
        case 'allPlay': {
          const apA = a.allPlayWins / Math.max(a.allPlayWins + a.allPlayLosses, 1);
          const apB = b.allPlayWins / Math.max(b.allPlayWins + b.allPlayLosses, 1);
          return (apA - apB) * dir;
        }
        case 'efficiency':
          return (a.lineupEfficiencyPct - b.lineupEfficiencyPct) * dir;
        case 'luck':
          return (a.luckScore - b.luckScore) * dir;
        case 'power':
          return (a.powerScore - b.powerScore) * dir;
      }
    });
  });

  protected readonly scoringComparison = computed(() => {
    const teams = [...this.sleeper.teams()].sort((a, b) => b.pointsFor - a.pointsFor);
    const maxPts = Math.max(...teams.map((t) => Math.max(t.pointsFor, t.pointsAgainst)), 1);
    return teams.map((team) => ({
      rosterId: team.rosterId,
      teamName: team.teamName,
      pf: team.pointsFor,
      pa: team.pointsAgainst,
      pfPct: (team.pointsFor / maxPts) * 100,
      paPct: (team.pointsAgainst / maxPts) * 100,
    }));
  });

  protected readonly rankMovers = computed(() => {
    return [...this.sleeper.teams()]
      .map((t) => ({
        rosterId: t.rosterId,
        teamName: t.teamName,
        standingsRank: t.standingsRank,
        powerRank: t.powerRank,
        delta: t.standingsRank - t.powerRank,
        allPlay: `${t.allPlayWins}-${t.allPlayLosses}`,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.standingsRank - b.standingsRank)
      .slice(0, 6);
  });

  protected readonly playoffSummary = computed(() => {
    const teams = [...this.sleeper.teams()].sort((a, b) => a.standingsRank - b.standingsRank);
    const cut = this.playoffTeamsCount();
    if (teams.length === 0) return null;

    const topSeed = teams[0];
    const lastSeed = teams[Math.min(cut - 1, teams.length - 1)];
    const firstOut = teams[cut] ?? null;
    const topScorer = [...teams].sort((a, b) => b.pointsFor - a.pointsFor)[0];
    const powerLeader = [...teams].sort((a, b) => a.powerRank - b.powerRank)[0];

    return { topSeed, lastSeed, firstOut, topScorer, powerLeader, cut };
  });

  protected avgPpg(team: TeamSummary): string {
    const games = Math.max(1, team.wins + team.losses + team.ties);
    return (team.pointsFor / games).toFixed(1);
  }

  protected setScope(scope: StandingsScope): void {
    this.scopeFilter.set(scope);
    this.syncQueryParams();
  }

  protected onSortSelect(col: StandingsSortColumn): void {
    this.sortColumn.set(col);
    this.sortDir.set(col === 'standings' ? 'asc' : 'desc');
    this.syncQueryParams();
  }

  protected flipSortDir(): void {
    this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    this.syncQueryParams();
  }

  protected resetSort(): void {
    this.sortColumn.set('standings');
    this.sortDir.set('asc');
    this.scopeFilter.set('all');
    this.syncQueryParams();
  }

  protected toggleSort(column: StandingsSortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDir.set(column === 'standings' ? 'asc' : 'desc');
    }
    this.syncQueryParams();
  }

  protected async syncFutureSchedule(): Promise<void> {
    const data = this.sleeper.dashboard();
    if (!data || this.futureLoading()) return;
    const playoffStart = data.league.settings?.playoff_week_start ?? 15;
    const fromWeek = Math.max(1, data.completedWeek + 1);
    const toWeek = Math.min(18, playoffStart + 2);
    this.futureLoading.set(true);
    try {
      const pairs = await this.sleeper.fetchFutureScheduleMatchups(
        data.league.league_id,
        fromWeek,
        toWeek
      );
      this.futureMatchups.set(pairs);
      this.futureSynced.set(true);
      this.toast.show('Loaded upcoming & playoff schedule matrix');
    } finally {
      this.futureLoading.set(false);
    }
  }

  protected setSosView(view: 'all' | 'remaining' | 'played'): void {
    this.sosView.set(view);
  }

  protected copyShareLink(): void {
    if (typeof window === 'undefined') return;
    void this.toast.copyText(window.location.href, 'Standings link');
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        sort: this.sortColumn() === 'standings' ? null : this.sortColumn(),
        dir: this.sortColumn() === 'standings' && this.sortDir() === 'asc' ? null : this.sortDir(),
        scope: this.scopeFilter() === 'all' ? null : this.scopeFilter(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected ariaSort(column: StandingsSortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected sortArrow(column: StandingsSortColumn): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  protected isWinStreak(streak: string): boolean {
    return streak.toUpperCase().endsWith('W');
  }
}
