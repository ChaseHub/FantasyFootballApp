import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  EspnNflService,
  type LeaguePlayerRow,
  type PlayerAnalysisReport,
  SleeperService,
  ToastService,
  buildPlayerAnalysis,
  normalizeNflAbbr,
} from '../../core';
import {
  FilterBarComponent,
  PageHeaderComponent,
  PickerComponent,
  type PickerOption,
} from '../../shared/ui';

type PositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type OwnershipFilter = 'all' | 'rostered' | 'free_agent' | 'trending';
type PlayerSortColumn = 'seasonPoints' | 'avgPoints' | 'gamesPlayed' | 'proj' | 'name';
type AnalysisTab = 'gamelog' | 'peers';

interface WaiverRadarTarget {
  player: LeaguePlayerRow;
  trendingAdds: number;
  proj: number | null;
  fitsNeed: boolean;
}

const SORT_OPTIONS: PickerOption<PlayerSortColumn>[] = [
  { value: 'seasonPoints', label: 'Season Total Pts', badge: 'TOT' },
  { value: 'avgPoints', label: 'Points Per Game', badge: 'PPG' },
  { value: 'proj', label: 'Week Projection', badge: 'PROJ' },
  { value: 'gamesPlayed', label: 'Games Played', badge: 'GP' },
  { value: 'name', label: 'Player Name (A-Z)', badge: 'A-Z' },
];

@Component({
  selector: 'app-players',
  imports: [FormsModule, RouterLink, PageHeaderComponent, FilterBarComponent, PickerComponent],
  templateUrl: './players.html',
  styleUrl: './players.scss',
})
export class Players implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly espn = inject(EspnNflService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly searchQuery = signal('');
  protected readonly positionFilter = signal<PositionFilter>('ALL');
  protected readonly ownershipFilter = signal<OwnershipFilter>('all');
  protected readonly sortColumn = signal<PlayerSortColumn>('seasonPoints');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly inspectedWeek = signal<number | null>(null);
  protected readonly analysisTab = signal<AnalysisTab>('gamelog');
  protected readonly mobilePane = signal<'pool' | 'detail'>('pool');
  protected readonly rowLimit = signal<number>(40);
  protected readonly compareIds = signal<string[]>([]);
  protected readonly compareOpen = signal<boolean>(false);

  protected readonly positions: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.positionFilter() !== 'ALL') n++;
    if (this.ownershipFilter() !== 'all') n++;
    if (this.sortColumn() !== 'seasonPoints') n++;
    return n;
  });

  constructor() {
    effect(() => {
      const data = this.sleeper.dashboard();
      if (!data) return;
      this.sleeper.ensureSeasonStatsLoaded(data.league.season);
      this.sleeper.ensureWeekProjections(data.league.season, data.currentWeek);
      void this.espn.loadScoreboard(data.league.season, data.currentWeek);
    });
  }

  protected readonly allLeaguePlayers = computed<LeaguePlayerRow[]>(() => {
    if (!this.sleeper.dashboard()) return [];
    const base = this.sleeper.buildLeaguePlayers();
    const trendAdds = this.sleeper.trendingAdds();
    const trendIds = Object.keys(trendAdds);
    if (trendIds.length === 0) return base;

    const season = this.sleeper.dashboard()?.league.season;
    const existingIds = new Set(base.map((p) => p.playerId));
    const extras: LeaguePlayerRow[] = [];
    for (const pid of trendIds) {
      if (existingIds.has(pid)) continue;
      const meta = this.sleeper.resolvePlayer(pid);
      if (meta.position === '—') continue;
      const nflStat = this.sleeper.getSeasonNflStat(pid, season);
      extras.push({
        playerId: pid,
        name: meta.name,
        position: meta.position,
        nflTeam: meta.nflTeam,
        injuryStatus: meta.injuryStatus,
        fantasyTeamName: null,
        fantasyRosterId: null,
        gamesPlayed: nflStat?.gamesPlayed ?? 0,
        seasonPoints: nflStat?.seasonPoints ?? 0,
        avgPoints: nflStat?.avgPoints ?? 0,
        weeklyPoints: [],
      });
    }
    return [...base, ...extras];
  });

  protected readonly myNeedPositions = computed<Set<string>>(() => {
    const mine = this.sleeper.myTeam();
    const all = this.allLeaguePlayers();
    if (!mine || all.length === 0) return new Set<string>();

    const core = ['QB', 'RB', 'WR', 'TE'];
    const needs = new Set<string>();
    const leagueTeams = Math.max(1, this.sleeper.teams().length);

    for (const pos of core) {
      const myAvgPool = all
        .filter((p) => p.fantasyRosterId === mine.rosterId && p.position === pos)
        .sort((a, b) => b.avgPoints - a.avgPoints)
        .slice(0, pos === 'QB' || pos === 'TE' ? 1 : 2);
      const myTopPpg = myAvgPool.reduce((s, p) => s + p.avgPoints, 0) / Math.max(1, myAvgPool.length);

      const leaguePool = all
        .filter((p) => p.fantasyRosterId !== null && p.position === pos)
        .sort((a, b) => b.avgPoints - a.avgPoints)
        .slice(0, leagueTeams * (pos === 'QB' || pos === 'TE' ? 1 : 2));
      const leaguePosPpg =
        leaguePool.reduce((s, p) => s + p.avgPoints, 0) / Math.max(1, leaguePool.length);

      if (myAvgPool.length === 0 || myTopPpg < leaguePosPpg * 0.94) {
        needs.add(pos);
      }
    }
    return needs;
  });

  protected readonly myNeedsLabel = computed(() => Array.from(this.myNeedPositions()).join(', '));

  protected readonly waiverRadar = computed<WaiverRadarTarget[]>(() => {
    const trendAdds = this.sleeper.trendingAdds();
    const needs = this.myNeedPositions();
    const freeAgents = this.allLeaguePlayers().filter((p) => p.fantasyRosterId === null);
    if (freeAgents.length === 0) return [];

    return freeAgents
      .map((p) => ({
        player: p,
        trendingAdds: trendAdds[p.playerId] ?? 0,
        proj: this.playerProjection(p),
        fitsNeed: needs.has(p.position),
      }))
      .filter((item) => item.trendingAdds > 0 || item.player.seasonPoints > 0 || (item.proj ?? 0) > 0)
      .sort((a, b) => {
        const scoreA =
          (a.trendingAdds > 0 ? 40 : 0) +
          Math.min(40, a.trendingAdds / 400) +
          a.player.avgPoints * 2 +
          (a.fitsNeed ? 12 : 0);
        const scoreB =
          (b.trendingAdds > 0 ? 40 : 0) +
          Math.min(40, b.trendingAdds / 400) +
          b.player.avgPoints * 2 +
          (b.fitsNeed ? 12 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 6);
  });

  protected readonly compareReports = computed<PlayerAnalysisReport[]>(() => {
    const data = this.sleeper.dashboard();
    const all = this.allLeaguePlayers();
    if (!data || all.length === 0) return [];
    const byId = new Map(all.map((p) => [p.playerId, p]));
    return this.compareIds()
      .map((id) => byId.get(id))
      .filter((p): p is LeaguePlayerRow => Boolean(p))
      .map((p) => buildPlayerAnalysis(p, all, this.sleeper.resolvePlayer(p.playerId), data));
  });

  protected readonly compareWinners = computed(() => {
    const reps = this.compareReports();
    if (reps.length < 2) return null;
    const maxPts = Math.max(...reps.map((r) => r.player.seasonPoints));
    const maxPpg = Math.max(...reps.map((r) => r.player.avgPoints));
    const maxMed = Math.max(...reps.map((r) => r.medianPoints));
    const maxBoom = Math.max(...reps.map((r) => r.boomWeeks20));
    const maxFloor = Math.max(...reps.map((r) => r.floorWeeks12));
    const minStd = Math.min(...reps.map((r) => r.stdDevPoints));
    const maxProj = Math.max(...reps.map((r) => this.playerProjection(r.player) ?? -1));
    return { maxPts, maxPpg, maxMed, maxBoom, maxFloor, minStd, maxProj };
  });

  protected readonly positionalLeaders = computed(() => {
    const all = this.allLeaguePlayers();
    return (['QB', 'RB', 'WR', 'TE'] as const)
      .map((pos) => all.find((p) => p.position === pos))
      .filter((item): item is LeaguePlayerRow => Boolean(item));
  });

  protected readonly projectionsReady = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data) return false;
    return Boolean(this.sleeper.projectionsByKey()[`${data.league.season}-${data.currentWeek}`]);
  });

  protected playerProjection(player: LeaguePlayerRow): number | null {
    const data = this.sleeper.dashboard();
    if (!data) return null;
    if (this.sleeper.isPlayerOnBye(player.nflTeam, data.league.season, data.currentWeek)) {
      return 0;
    }
    return this.sleeper.getPlayerProjection(player.playerId, data.league.season, data.currentWeek);
  }

  protected isPlayerOnBye(player: LeaguePlayerRow): boolean {
    const data = this.sleeper.dashboard();
    if (!data) return false;
    return this.sleeper.isPlayerOnBye(player.nflTeam, data.league.season, data.currentWeek);
  }

  protected readonly filteredPlayers = computed<LeaguePlayerRow[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const pos = this.positionFilter();
    const own = this.ownershipFilter();
    const col = this.sortColumn();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    const trendAdds = this.sleeper.trendingAdds();
    const filtered = this.allLeaguePlayers().filter((p) => {
      if (pos !== 'ALL' && p.position !== pos) return false;
      if (own === 'rostered' && p.fantasyRosterId === null) return false;
      if (own === 'free_agent' && p.fantasyRosterId !== null) return false;
      if (own === 'trending' && (p.fantasyRosterId !== null || !(trendAdds[p.playerId] > 0))) {
        return false;
      }
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.nflTeam.toLowerCase().includes(query) ||
        (p.fantasyTeamName?.toLowerCase().includes(query) ?? false)
      );
    });

    return [...filtered].sort((a, b) => {
      if (col === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      if (col === 'proj') {
        const pa = this.playerProjection(a) ?? -1;
        const pb = this.playerProjection(b) ?? -1;
        return (pa - pb) * dir;
      }
      return (a[col] - b[col]) * dir;
    });
  });

  protected readonly visiblePlayers = computed(() =>
    this.filteredPlayers().slice(0, this.rowLimit())
  );

  protected readonly spotlightPlayer = computed<LeaguePlayerRow | null>(() => {
    const chosenId = this.selectedPlayerId();
    if (chosenId) {
      const exact = this.allLeaguePlayers().find((p) => p.playerId === chosenId);
      if (exact) return exact;
    }
    return this.filteredPlayers()[0] ?? this.allLeaguePlayers()[0] ?? null;
  });

  protected readonly analysis = computed(() => {
    const player = this.spotlightPlayer();
    const data = this.sleeper.dashboard();
    if (!player || !data) return null;
    const meta = this.sleeper.resolvePlayer(player.playerId);
    return buildPlayerAnalysis(player, this.allLeaguePlayers(), meta, data);
  });

  protected readonly nflMatchupContext = computed(() => {
    const player = this.spotlightPlayer();
    const data = this.sleeper.dashboard();
    if (!player || !data) return null;

    this.espn.games();
    const onBye = this.isPlayerOnBye(player);
    const proj = this.playerProjection(player);
    const game = this.espn.getTeamGame(player.nflTeam, data.league.season, data.currentWeek);
    if (!game) {
      return {
        onBye,
        proj,
        hasGame: false,
        teamLogo: null as string | null,
        oppAbbr: null as string | null,
        prefix: '',
        statusLabel: onBye ? 'BYE WEEK' : `Week ${data.currentWeek}`,
        state: 'pre' as const,
        scoreLine: null as string | null,
        odds: null as string | null,
      };
    }

    const norm = normalizeNflAbbr(player.nflTeam);
    const isHome = game.home.normalizedAbbr === norm;
    const mySide = isHome ? game.home : game.away;
    const oppSide = isHome ? game.away : game.home;
    const scoreLine = game.state !== 'pre' ? `${mySide.score}–${oppSide.score}` : null;
    const oddsParts = [game.oddsLine, game.overUnder ? `O/U ${game.overUnder}` : null].filter(Boolean);

    return {
      onBye,
      proj,
      hasGame: true,
      teamLogo: mySide.logo,
      oppAbbr: oppSide.abbr,
      prefix: isHome ? 'vs' : '@',
      statusLabel: game.state === 'pre' ? game.kickoffLabel : game.statusDetail,
      state: game.state,
      scoreLine,
      odds: oddsParts.join(' · ') || null,
    };
  });

  protected readonly chartGeometry = computed(() => {
    const report = this.analysis();
    if (!report || report.weekLogs.length === 0) return null;

    const logs = report.weekLogs;
    const width = 600;
    const height = 186;
    const padL = 36;
    const padR = 14;
    const padT = 16;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const maxVal = Math.max(15, ...logs.map((l) => l.points), report.player.avgPoints);
    const scaleMax = Math.ceil((maxVal + 4) / 5) * 5;
    const slotW = plotW / logs.length;
    const barW = Math.min(28, Math.max(12, slotW * 0.56));

    const nodes = logs.map((log, i) => {
      const cx = padL + slotW * i + slotW / 2;
      const barH = Math.max(3, (log.points / scaleMax) * plotH);
      return {
        log,
        x: cx - barW / 2,
        y: padT + plotH - barH,
        w: barW,
        h: barH,
        cx,
      };
    });

    const avgY = padT + plotH - (report.player.avgPoints / scaleMax) * plotH;
    const ticks = [0, 0.5, 1].map((r) => ({
      val: Math.round(scaleMax * r),
      y: padT + plotH * (1 - r),
    }));

    return { width, height, padL, padR, avgY, scaleMax, nodes, ticks };
  });

  protected readonly spotlightBioLine = computed(() => {
    const report = this.analysis();
    if (!report) return '';
    const m = report.meta;
    const parts: string[] = [m.nflTeam];
    if (m.jersey !== null && m.jersey !== undefined) parts.push(`#${m.jersey}`);
    if (m.age) parts.push(`Age ${m.age}`);
    if (m.yearsExp !== null && m.yearsExp !== undefined) {
      parts.push(m.yearsExp === 0 ? 'Rookie' : `Yr ${m.yearsExp + 1}`);
    }
    if (m.college) parts.push(m.college);
    return parts.join(' · ');
  });

  ngOnInit(): void {
    this.sleeper.ensurePlayersLoaded();
    void this.sleeper.loadTrendingPlayers();
    this.route.queryParamMap.subscribe((params) => {
      const player = params.get('player');
      if (player) {
        this.selectedPlayerId.set(player);
        this.inspectedWeek.set(null);
        this.mobilePane.set('detail');
      }
      const pos = params.get('pos') as PositionFilter | null;
      if (pos && this.positions.includes(pos)) {
        this.positionFilter.set(pos);
      }
      const filter = params.get('filter');
      if (
        filter === 'all' ||
        filter === 'rostered' ||
        filter === 'free_agent' ||
        filter === 'trending'
      ) {
        this.ownershipFilter.set(filter);
      }
      const compare = params.get('compare');
      if (compare) {
        const ids = compare
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
        if (ids.length > 0) {
          this.compareIds.set(ids);
          if (ids.length >= 2) this.compareOpen.set(true);
        }
      }
    });
  }

  protected setPosition(pos: PositionFilter): void {
    this.positionFilter.set(pos);
    this.rowLimit.set(40);
    this.syncQueryParams();
  }

  protected setOwnership(own: OwnershipFilter): void {
    this.ownershipFilter.set(own);
    this.rowLimit.set(40);
    this.syncQueryParams();
  }

  protected setAnalysisTab(tab: AnalysisTab): void {
    this.analysisTab.set(tab);
  }

  protected clearAllFilters(): void {
    this.searchQuery.set('');
    this.positionFilter.set('ALL');
    this.ownershipFilter.set('all');
    this.sortColumn.set('seasonPoints');
    this.sortDir.set('desc');
    this.rowLimit.set(40);
    this.syncQueryParams();
  }

  protected onSortSelect(col: PlayerSortColumn): void {
    this.sortColumn.set(col);
    this.sortDir.set(col === 'name' ? 'asc' : 'desc');
  }

  protected selectPlayer(playerId: string): void {
    this.selectedPlayerId.set(playerId);
    this.inspectedWeek.set(null);
    this.syncQueryParams();
  }

  protected isInCompare(playerId: string): boolean {
    return this.compareIds().includes(playerId);
  }

  protected toggleCompare(playerId: string, event?: Event): void {
    event?.stopPropagation();
    const cur = this.compareIds();
    if (cur.includes(playerId)) {
      const next = cur.filter((id) => id !== playerId);
      this.compareIds.set(next);
      if (next.length < 2) this.compareOpen.set(false);
    } else {
      const next = [...cur, playerId].slice(-3);
      this.compareIds.set(next);
      if (next.length >= 2) this.compareOpen.set(true);
    }
    this.syncQueryParams();
  }

  protected clearCompare(): void {
    this.compareIds.set([]);
    this.compareOpen.set(false);
    this.syncQueryParams();
  }

  protected trendingCount(playerId: string): number {
    return this.sleeper.trendingAdds()[playerId] ?? 0;
  }

  protected copyShareLink(): void {
    if (typeof window === 'undefined') return;
    void this.toast.copyText(window.location.href, 'Player view link copied');
  }

  private syncQueryParams(): void {
    const queryParams: Record<string, string | null> = {
      player: this.selectedPlayerId(),
      pos: this.positionFilter() !== 'ALL' ? this.positionFilter() : null,
      filter: this.ownershipFilter() !== 'all' ? this.ownershipFilter() : null,
      compare: this.compareIds().length > 0 ? this.compareIds().join(',') : null,
    };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  protected pickPlayerFromDirectory(playerId: string): void {
    this.selectPlayer(playerId);
    this.mobilePane.set('detail');
  }

  protected inspectWeek(week: number): void {
    this.inspectedWeek.set(this.inspectedWeek() === week ? null : week);
    this.analysisTab.set('gamelog');
  }

  protected showMore(): void {
    this.rowLimit.update((n) => n + 40);
  }

  protected toggleSort(column: PlayerSortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDir.set(column === 'name' ? 'asc' : 'desc');
    }
  }

  protected ariaSort(column: PlayerSortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected sortArrow(column: PlayerSortColumn): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }
}
