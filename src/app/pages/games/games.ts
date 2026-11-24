import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  type DecoratedGamePlay,
  EspnNflService,
  type GameState,
  type LeaguePlayRosterEntry,
  type NflGameCard,
  SleeperService,
  decorateGamePlays,
  groupGamesBySlate,
  normalizeNflAbbr,
} from '../../core';
import { PageHeaderComponent, WeekPickerComponent } from '../../shared/ui';

interface GameFantasyPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  fantasyTeamName: string;
  rosterId: number;
  avatarUrl: string | null;
  initials: string;
  isStarter: boolean;
  isMyTeam: boolean;
  weekPoints: number | null;
}

interface StatBarRow {
  label: string;
  awayValue: string;
  homeValue: string;
  awayPct: number;
}

@Component({
  selector: 'app-games',
  imports: [RouterLink, PageHeaderComponent, WeekPickerComponent],
  templateUrl: './games.html',
  styleUrl: './games.scss',
})
export class Games implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  protected readonly espn = inject(EspnNflService);
  private readonly route = inject(ActivatedRoute);

  protected readonly stateFilter = signal<'all' | GameState>('all');
  protected readonly playTab = signal<'all' | 'scoring' | 'fantasy'>('all');
  protected readonly selectedGameId = signal<string | null>(null);
  protected readonly pendingTeamAbbr = signal<string | null>(null);
  protected readonly selectedWeek = signal<number>(1);
  private weekInitialized = false;

  protected readonly seasonLabel = computed(() => {
    const data = this.sleeper.dashboard();
    return data?.nflState.season ?? data?.league.season ?? String(new Date().getFullYear());
  });

  protected readonly stateCounts = computed(() => {
    const list = this.espn.games();
    return {
      all: list.length,
      in: list.filter((g) => g.state === 'in').length,
      pre: list.filter((g) => g.state === 'pre').length,
      post: list.filter((g) => g.state === 'post').length,
    };
  });

  protected readonly filteredGames = computed(() => {
    const list = this.espn.games();
    const filter = this.stateFilter();
    if (filter === 'all') return list;
    return list.filter((g) => g.state === filter);
  });

  protected readonly slateGroups = computed(() => groupGamesBySlate(this.filteredGames()));

  protected readonly activeGame = computed<NflGameCard | null>(() => {
    const list = this.espn.games();
    if (list.length === 0) return null;
    const id = this.selectedGameId();
    if (id) {
      const match = list.find((g) => g.id === id);
      if (match) return match;
    }
    const teamAbbr = this.pendingTeamAbbr();
    if (teamAbbr) {
      const norm = normalizeNflAbbr(teamAbbr);
      const teamMatch = list.find(
        (g) => g.away.normalizedAbbr === norm || g.home.normalizedAbbr === norm
      );
      if (teamMatch) return teamMatch;
    }
    return list.find((g) => g.state === 'in') ?? list[0];
  });

  protected readonly fantasyPlayersByNflTeam = computed(() => {
    this.sleeper.playersMap();
    const teams = this.sleeper.teams();
    const teamMap = new Map(teams.map((t) => [t.rosterId, t]));
    const myRosterId = this.sleeper.myTeam()?.rosterId ?? null;
    const wk = this.selectedWeek();
    const matchupSides = this.sleeper.dashboard()?.weeklyMatchups[wk] ?? [];

    const weekPointsMap = new Map<string, number>();
    const starterIdsSet = new Set<string>();
    for (const m of matchupSides) {
      m.home.starterIds.forEach((pid) => starterIdsSet.add(pid));
      Object.entries(m.home.playerPoints).forEach(([pid, pts]) => weekPointsMap.set(pid, pts));
      if (m.away) {
        m.away.starterIds.forEach((pid) => starterIdsSet.add(pid));
        Object.entries(m.away.playerPoints).forEach(([pid, pts]) => weekPointsMap.set(pid, pts));
      }
    }
    if (starterIdsSet.size === 0) {
      teams.forEach((t) => t.rawStarterIds.forEach((pid) => starterIdsSet.add(pid)));
    }

    const grouped = new Map<string, GameFantasyPlayer[]>();
    const players = this.sleeper.buildLeaguePlayers();

    for (const p of players) {
      if (p.fantasyRosterId === null) continue;
      const team = teamMap.get(p.fantasyRosterId);
      if (!team) continue;
      const nflAbbr = normalizeNflAbbr(p.nflTeam);
      if (!nflAbbr || nflAbbr === 'FA') continue;

      const list = grouped.get(nflAbbr) ?? [];
      list.push({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        nflTeam: nflAbbr,
        fantasyTeamName: team.teamName,
        rosterId: team.rosterId,
        avatarUrl: team.avatarUrl,
        initials: team.initials,
        isStarter: starterIdsSet.has(p.playerId),
        isMyTeam: myRosterId === team.rosterId,
        weekPoints: weekPointsMap.get(p.playerId) ?? null,
      });
      grouped.set(nflAbbr, list);
    }

    for (const [, list] of grouped) {
      list.sort(
        (a, b) =>
          Number(b.isStarter) - Number(a.isStarter) ||
          (b.weekPoints ?? 0) - (a.weekPoints ?? 0) ||
          a.name.localeCompare(b.name)
      );
    }

    return grouped;
  });

  protected readonly activeGameFantasyPlayers = computed<GameFantasyPlayer[]>(() => {
    const game = this.activeGame();
    if (!game) return [];
    const byTeam = this.fantasyPlayersByNflTeam();
    return [
      ...(byTeam.get(game.away.normalizedAbbr) ?? []),
      ...(byTeam.get(game.home.normalizedAbbr) ?? []),
    ].sort(
      (a, b) =>
        Number(b.isMyTeam) - Number(a.isMyTeam) ||
        Number(b.isStarter) - Number(a.isStarter) ||
        (b.weekPoints ?? 0) - (a.weekPoints ?? 0)
    );
  });

  protected readonly activeGameStarters = computed(() =>
    this.activeGameFantasyPlayers().filter((p) => p.isStarter)
  );

  protected readonly activeGameBench = computed(() =>
    this.activeGameFantasyPlayers().filter((p) => !p.isStarter)
  );

  protected readonly activeLinescoreCols = computed(() => {
    const game = this.activeGame();
    if (!game) return ['Q1', 'Q2', 'Q3', 'Q4'];
    const count = Math.max(4, game.away.linescores.length, game.home.linescores.length);
    return Array.from({ length: count }, (_, idx) => (idx < 4 ? `Q${idx + 1}` : `OT${idx - 3}`));
  });

  protected readonly decoratedPlays = computed<DecoratedGamePlay[]>(() => {
    const detail = this.espn.detail();
    const game = this.activeGame();
    if (!detail || !game) return [];
    const entries: LeaguePlayRosterEntry[] = this.activeGameFantasyPlayers().map((fp) => ({
      playerId: fp.playerId,
      name: fp.name,
      nflTeam: fp.nflTeam,
      position: fp.position,
      slotLabel: fp.isStarter ? fp.position : 'BN',
      currentPoints: fp.weekPoints ?? 0,
      projectedPoints: null,
      game,
      rosterId: fp.rosterId,
      fantasyTeamName: fp.fantasyTeamName,
      avatarUrl: fp.avatarUrl,
      initials: fp.initials,
      isStarter: fp.isStarter,
      isMyTeam: fp.isMyTeam,
    }));
    return decorateGamePlays(
      detail.allPlays,
      game,
      entries,
      this.sleeper.league()?.scoring_settings ?? {},
    );
  });

  protected readonly filteredPlays = computed(() => {
    const plays = this.decoratedPlays();
    const tab = this.playTab();
    if (tab === 'scoring') return plays.filter((p) => p.isScoring);
    if (tab === 'fantasy') return plays.filter((p) => p.fantasyHits.length > 0);
    return plays;
  });

  protected readonly statBars = computed<StatBarRow[]>(() => {
    const detail = this.espn.detail();
    if (!detail || detail.teamStats.length === 0) return [];
    return detail.teamStats.map((stat) => {
      const a = Number.parseFloat(stat.awayValue);
      const h = Number.parseFloat(stat.homeValue);
      const hasNums = Number.isFinite(a) && Number.isFinite(h) && a + h > 0;
      const awayPct = hasNums ? Math.min(92, Math.max(8, Math.round((a / (a + h)) * 100))) : 50;
      return {
        label: stat.label,
        awayValue: stat.awayValue,
        homeValue: stat.homeValue,
        awayPct,
      };
    });
  });

  constructor() {
    effect(() => {
      const data = this.sleeper.dashboard();
      if (!this.weekInitialized && data) {
        this.weekInitialized = true;
        const wk = Math.max(1, Math.min(18, data.nflState.week || data.currentWeek || 1));
        this.selectedWeek.set(wk);
        void this.espn.loadScoreboard(this.seasonLabel(), wk);
      }
    });

    effect(() => {
      const game = this.activeGame();
      if (!game) return;
      const teamIdMap: Record<string, string> = {
        [game.away.id]: game.away.abbr,
        [game.home.id]: game.home.abbr,
      };
      if (game.state === 'in' || game.state === 'post') {
        void this.espn
          .fetchEventDetailCached(game.id, teamIdMap, game.state === 'in', game.state === 'post')
          .then((detail) => {
            if (detail) {
              void this.espn.loadGameDetail(game.id, teamIdMap, false);
            }
          });
      } else {
        void this.espn.loadGameDetail(game.id, teamIdMap);
      }
    });
  }

  ngOnInit(): void {
    this.sleeper.ensurePlayersLoaded();
    this.route.queryParamMap.subscribe((params) => {
      const wk = params.get('week');
      const game = params.get('game');
      const team = params.get('team');
      if (game) {
        this.selectedGameId.set(game);
        this.pendingTeamAbbr.set(null);
      } else if (team) {
        this.pendingTeamAbbr.set(team);
        this.selectedGameId.set(null);
      }
      if (wk !== null) {
        const wkNum = Number(wk);
        if (Number.isFinite(wkNum) && wkNum >= 1 && wkNum <= 18) {
          this.weekInitialized = true;
          this.selectedWeek.set(wkNum);
          void this.espn.loadScoreboard(this.seasonLabel(), wkNum);
          return;
        }
      }
      if (!this.sleeper.dashboard()) {
        void this.espn.loadScoreboard(this.seasonLabel(), this.selectedWeek());
      }
    });
  }

  protected selectWeek(week: number): void {
    this.selectedWeek.set(week);
    this.selectedGameId.set(null);
    void this.espn.loadScoreboard(this.seasonLabel(), week);
  }

  protected selectGame(gameId: string): void {
    this.selectedGameId.set(gameId);
  }

  protected refreshLive(): void {
    const active = this.activeGame();
    void this.espn.loadScoreboard(this.seasonLabel(), this.selectedWeek(), true).then(() => {
      const current = this.activeGame() ?? active;
      if (current && current.state === 'in') {
        void this.espn.fetchEventDetailCached(
          current.id,
          { [current.away.id]: current.away.abbr, [current.home.id]: current.home.abbr },
          true,
          false
        );
        void this.espn.loadGameDetail(
          current.id,
          { [current.away.id]: current.away.abbr, [current.home.id]: current.home.abbr },
          true
        );
      }
    });
  }

  protected gameStarterCount(game: NflGameCard): number {
    const byTeam = this.fantasyPlayersByNflTeam();
    const awayStarters = (byTeam.get(game.away.normalizedAbbr) ?? []).filter((p) => p.isStarter).length;
    const homeStarters = (byTeam.get(game.home.normalizedAbbr) ?? []).filter((p) => p.isStarter).length;
    return awayStarters + homeStarters;
  }

  protected stateBadgeLabel(state: GameState): string {
    if (state === 'in') return 'Live';
    if (state === 'post') return 'Final';
    return 'Upcoming';
  }
}
