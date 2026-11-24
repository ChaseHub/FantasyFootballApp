import { Injectable, computed, inject, signal } from '@angular/core';
import {
  buildBracketRounds,
  buildDraftPickViews,
  buildProjectedPlayoffRounds,
  computeLeagueAwards,
  computeScheduleSwapMatrix,
  computeWeirdWeeklyMoments,
} from '../analytics/clubhouse-analytics';
import {
  AllTimeLeagueHistory,
  HistoricalSeasonSnapshot,
  computeAllTimeLeagueHistory,
} from '../analytics/history-analytics';
import {
  NFL_TEAMS,
  RosterMetaInfo,
  SeasonStatEntry,
  buildDashboardData,
  buildLeaguePlayersView,
  buildLeagueTradesView,
  buildRecentMovesView,
  buildRosterInfoMap,
  buildRosterPlayerStatsView,
  buildTradedPicksView,
  buildWeekMatchupCards,
  buildWeeklyLineupView,
  formatLoadedAtTime,
  isWeekCompleted,
  parseSeasonNflStatsMap,
  parseWeekProjectionsMap,
  resolveMatchupStatus,
  resolvePlayoffWeekCards,
  resolveTotalSeasonWeeks,
  resolveWeekCount,
  round2,
} from '../analytics/sleeper-dashboard.builder';
import {
  LeagueDashboardData,
  LeagueMoveItem,
  LeaguePlayerRow,
  LeagueTradeCard,
  RosterPlayerStat,
  SeasonOption,
  SleeperLeague,
  SleeperMatchup,
  SleeperUser,
  TeamSummary,
  TeamWeeklyScore,
  TradedPickView,
  WeeklyLineupEntry,
  WeeklyMatchupCard,
} from '../models/sleeper.models';
import { SleeperApiClient } from './sleeper-api.client';
import { SleeperPlayersService } from './sleeper-players.service';

const STORAGE_LEAGUE_KEY = 'clubhouse_sleeper_league_id';
const STORAGE_USER_KEY = 'clubhouse_sleeper_user_id';
const STORAGE_SEASONS_KEY = 'clubhouse_sleeper_seasons';

/**
 * Signal-backed Clubhouse League Store & Facade.
 * Orchestrates SleeperApiClient, SleeperPlayersService, localStorage state,
 * and pure analytics builders.
 */
@Injectable({ providedIn: 'root' })
export class SleeperService {
  private readonly api = inject(SleeperApiClient);
  private readonly playersService = inject(SleeperPlayersService);

  private readonly _dashboard = signal<LeagueDashboardData | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _discoveredLeagues = signal<SleeperLeague[]>([]);
  private readonly _discoveredUser = signal<SleeperUser | null>(null);
  private readonly _lookupLoading = signal<boolean>(false);
  private readonly _lookupError = signal<string | null>(null);
  private readonly _selectedWeek = signal<number>(1);
  private readonly _myUserId = signal<string | null>(this.readStorage(STORAGE_USER_KEY));
  private readonly _seasons = signal<SeasonOption[]>(this.readSavedSeasons());
  private readonly _projectionsByKey = signal<Record<string, Record<string, number>>>({});
  private readonly _activeNflTeamsByKey = signal<Record<string, Set<string>>>({});
  private readonly _projectionsLoading = signal<boolean>(false);
  private readonly _seasonStatsBySeason = signal<Record<string, Record<string, SeasonStatEntry>>>({});
  private readonly _refreshing = signal<boolean>(false);
  private readonly _allTimeHistory = signal<AllTimeLeagueHistory | null>(null);
  private readonly _historyLoading = signal<boolean>(false);
  private readonly _historyError = signal<string | null>(null);
  private readonly _trendingAdds = signal<Record<string, number>>({});
  private readonly _trendingDrops = signal<Record<string, number>>({});
  private readonly _trendingLoading = signal<boolean>(false);

  private loadedHistoryKey = '';
  private trendingLoaded = false;
  private initialized = false;
  private activeLoadToken = 0;
  private seasonMatchupsLoadedForLeague = '';
  private seasonMatchupsPromise: Promise<void> | null = null;
  private readonly _seasonMatchupsLoading = signal<boolean>(false);
  private readonly projectionFetches = new Set<string>();
  private readonly seasonStatsFetches = new Set<string>();

  readonly dashboard = this._dashboard.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly discoveredLeagues = this._discoveredLeagues.asReadonly();
  readonly discoveredUser = this._discoveredUser.asReadonly();
  readonly lookupLoading = this._lookupLoading.asReadonly();
  readonly lookupError = this._lookupError.asReadonly();
  readonly selectedWeek = this._selectedWeek.asReadonly();
  readonly myUserId = this._myUserId.asReadonly();
  readonly seasons = this._seasons.asReadonly();
  readonly projectionsLoading = this._projectionsLoading.asReadonly();
  readonly projectionsByKey = this._projectionsByKey.asReadonly();
  readonly refreshing = this._refreshing.asReadonly();
  readonly seasonMatchupsLoading = this._seasonMatchupsLoading.asReadonly();
  readonly allTimeHistory = this._allTimeHistory.asReadonly();
  readonly historyLoading = this._historyLoading.asReadonly();
  readonly historyError = this._historyError.asReadonly();
  readonly trendingAdds = this._trendingAdds.asReadonly();
  readonly trendingDrops = this._trendingDrops.asReadonly();
  readonly trendingLoading = this._trendingLoading.asReadonly();
  readonly playersLoading = this.playersService.loading;
  readonly playersReady = this.playersService.ready;
  readonly playersMap = this.playersService.players;

  readonly teams = computed(() => this._dashboard()?.teams ?? []);
  readonly league = computed(() => this._dashboard()?.league ?? null);
  readonly seasonPhase = computed<'pre_draft' | 'drafting' | 'in_season' | 'complete'>(() => {
    const data = this._dashboard();
    if (!data) return 'in_season';
    const st = data.league.status;
    if (st === 'pre_draft') return 'pre_draft';
    if (st === 'drafting') return 'drafting';
    if (st === 'complete') return 'complete';
    return 'in_season';
  });

  readonly myTeam = computed(() => {
    const uid = this._myUserId();
    if (!uid) return null;
    return this.teams().find((team) => team.ownerId === uid) ?? null;
  });

  readonly availableWeeks = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return Object.keys(data.weeklyMatchups)
      .map(Number)
      .filter((week) => (data.weeklyMatchups[week]?.length ?? 0) > 0)
      .sort((a, b) => a - b);
  });

  readonly seasonWeeks = computed(() => {
    const data = this._dashboard();
    if (!data || data.league.status === 'pre_draft') return [];
    const total = resolveTotalSeasonWeeks(data.league, data.winnersBracket);
    return Array.from({ length: total }, (_, idx) => idx + 1);
  });

  readonly currentWeekMatchups = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return this.getMatchupsForWeek(this._selectedWeek());
  });

  getMatchupsForWeek(week: number): WeeklyMatchupCard[] {
    const data = this._dashboard();
    if (!data || week <= 0) return [];
    const playoffStart = data.league.settings?.playoff_week_start ?? 15;
    return resolvePlayoffWeekCards({
      week,
      existingCards: data.weeklyMatchups[week] ?? [],
      teams: data.teams,
      winnersRounds: this.winnersBracketRounds(),
      projectedRounds: this.projectedBracketRounds(),
      playoffStartWeek: playoffStart,
    });
  }

  readonly featuredMatchup = computed<WeeklyMatchupCard | null>(() => {
    const matchups = this.currentWeekMatchups();
    if (matchups.length === 0) return null;

    const mine = this.myTeam();
    if (mine) {
      const userMatchup = matchups.find(
        (m) => m.home.rosterId === mine.rosterId || m.away?.rosterId === mine.rosterId,
      );
      if (userMatchup) return userMatchup;
    }

    const active = matchups.filter((m) => m.away !== null);
    if (active.length === 0) return matchups[0];

    const hasScores = active.some((m) => m.home.points > 0 || (m.away?.points ?? 0) > 0);
    if (!hasScores) return active[0];

    return [...active].sort((a, b) => a.margin - b.margin)[0];
  });

  readonly scheduleSwapMatrix = computed(() =>
    computeScheduleSwapMatrix(this.teams(), this.league()?.settings?.playoff_week_start ?? 15),
  );
  readonly leagueAwards = computed(() => computeLeagueAwards(this.teams()));
  readonly weirdMoments = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return computeWeirdWeeklyMoments(data.teams, data.weeklyMatchups);
  });

  readonly winnersBracketRounds = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return buildBracketRounds(
      data.winnersBracket,
      data.teams,
      data.weeklyMatchups,
      data.league.settings?.playoff_week_start ?? 15,
      false,
    );
  });

  readonly losersBracketRounds = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return buildBracketRounds(
      data.losersBracket,
      data.teams,
      data.weeklyMatchups,
      data.league.settings?.playoff_week_start ?? 15,
      true,
    );
  });

  readonly projectedBracketRounds = computed(() => {
    const data = this._dashboard();
    if (!data) return [];
    return buildProjectedPlayoffRounds(
      data.teams,
      data.league.settings?.playoff_teams ?? 4,
      data.league.settings?.playoff_week_start ?? 15,
    );
  });

  readonly draftPicksView = computed(() => {
    const data = this._dashboard();
    if (!data || data.draftPicks.length === 0) return [];
    return buildDraftPickViews(
      data.draftPicks,
      data.teams,
      this.buildLeaguePlayers(),
      data.draft?.settings?.teams ?? data.league.total_rosters,
    );
  });

  initialize(): void {
    if (this.initialized || this._loading() || this._dashboard()) return;
    this.initialized = true;

    const savedLeagueId = this.readStorage(STORAGE_LEAGUE_KEY);
    if (savedLeagueId) {
      void this.loadLeague(savedLeagueId);
    }
  }

  setSelectedWeek(week: number): void {
    this._selectedWeek.set(week);
  }

  setMyUserId(userId: string | null): void {
    const clean = userId?.trim() || null;
    this._myUserId.set(clean);
    if (clean) {
      this.writeStorage(STORAGE_USER_KEY, clean);
    } else {
      this.removeStorage(STORAGE_USER_KEY);
    }
  }

  ensurePlayersLoaded(): void {
    void this.playersService.ensureLoaded();
  }

  async loadTrendingPlayers(force = false): Promise<void> {
    if (this.trendingLoaded && !force) return;
    this._trendingLoading.set(true);
    try {
      const { adds, drops } = await this.api.fetchTrendingPlayers();
      this._trendingAdds.set(adds);
      this._trendingDrops.set(drops);
      this.trendingLoaded = true;
    } catch {
      // Optional radar feed; ignore transient failures silently
    } finally {
      this._trendingLoading.set(false);
    }
  }

  async fetchFutureScheduleMatchups(
    leagueId: string,
    fromWeek: number,
    toWeek: number,
  ): Promise<Record<number, Array<[number, number]>>> {
    return this.api.fetchFutureScheduleMatchups(leagueId, fromWeek, toWeek);
  }

  async ensureSeasonMatchupsLoaded(): Promise<void> {
    const current = this._dashboard();
    if (!current || current.league.status === 'pre_draft') return;

    const leagueId = current.league.league_id;
    if (this.seasonMatchupsLoadedForLeague === leagueId) return;
    if (this.seasonMatchupsPromise) return this.seasonMatchupsPromise;

    const run = async (): Promise<void> => {
      const totalWeeks = resolveTotalSeasonWeeks(current.league, current.winnersBracket);
      const missingWeeks: number[] = [];
      for (let wk = 1; wk <= totalWeeks; wk += 1) {
        if ((current.weeklyMatchups[wk]?.length ?? 0) === 0) {
          missingWeeks.push(wk);
        }
      }

      if (missingWeeks.length === 0) {
        this.seasonMatchupsLoadedForLeague = leagueId;
        return;
      }

      this._seasonMatchupsLoading.set(true);
      try {
        const fetched = await Promise.all(
          missingWeeks.map(async (wk) => {
            try {
              const entries = await this.api.fetchWeekMatchups(leagueId, wk);
              return [wk, entries ?? []] as const;
            } catch {
              return [wk, [] as SleeperMatchup[]] as const;
            }
          }),
        );

        const latest = this._dashboard();
        if (!latest || latest.league.league_id !== leagueId) return;

        const rosterInfo = buildRosterInfoMap(latest.teams);
        const mergedWeekly = { ...latest.weeklyMatchups };
        let changed = false;

        for (const [wk, entries] of fetched) {
          if (entries.length === 0 || (mergedWeekly[wk]?.length ?? 0) > 0) continue;
          const completed = isWeekCompleted(latest.league, latest.nflState, wk, entries);
          const status = resolveMatchupStatus(entries, completed);
          const cards = buildWeekMatchupCards(wk, entries, status, completed, rosterInfo);
          if (cards.length > 0) {
            mergedWeekly[wk] = cards;
            changed = true;
          }
        }

        if (changed) {
          this._dashboard.update((cur) => {
            if (!cur || cur.league.league_id !== leagueId) return cur;
            return {
              ...cur,
              weeklyMatchups: mergedWeekly,
            };
          });
        }
        this.seasonMatchupsLoadedForLeague = leagueId;
      } finally {
        this._seasonMatchupsLoading.set(false);
        this.seasonMatchupsPromise = null;
      }
    };

    this.seasonMatchupsPromise = run();
    return this.seasonMatchupsPromise;
  }

  removeSavedSeason(leagueId: string): void {
    const next = this._seasons().filter((s) => s.leagueId !== leagueId);
    this._seasons.set(next);
    this.saveSeasons(next);
  }

  async clearCachedDataAndResync(): Promise<void> {
    await this.playersService.clearCache();
    this.trendingLoaded = false;
    this.projectionFetches.clear();
    this.seasonStatsFetches.clear();
    this.seasonMatchupsLoadedForLeague = '';
    this.seasonMatchupsPromise = null;
    this._projectionsByKey.set({});
    this._seasonStatsBySeason.set({});
    this.loadedHistoryKey = '';
    this._allTimeHistory.set(null);
    await this.refreshCurrentLeague(true);
  }

  disconnectCurrentLeague(): void {
    this.seasonMatchupsLoadedForLeague = '';
    this.seasonMatchupsPromise = null;
    this._dashboard.set(null);
    this._myUserId.set(null);
    this._seasons.set([]);
    this._allTimeHistory.set(null);
    this.removeStorage(STORAGE_LEAGUE_KEY);
    this.removeStorage(STORAGE_USER_KEY);
    this.removeStorage(STORAGE_SEASONS_KEY);
  }

  ensureWeekProjections(season: string, week: number): void {
    const key = `${season}-${week}`;
    if (this._projectionsByKey()[key] || this.projectionFetches.has(key)) return;
    this.projectionFetches.add(key);
    void this.fetchWeekProjections(season, week, key);
  }

  ensureSeasonStatsLoaded(season?: string): void {
    const targetSeason =
      season || this._dashboard()?.league.season || this._dashboard()?.nflState.season;
    if (!targetSeason) return;
    if (this._seasonStatsBySeason()[targetSeason] || this.seasonStatsFetches.has(targetSeason)) {
      return;
    }
    this.seasonStatsFetches.add(targetSeason);
    void this.fetchSeasonNflStats(targetSeason);
  }

  getSeasonNflStat(playerId: string, season?: string): SeasonStatEntry | null {
    const targetSeason =
      season || this._dashboard()?.league.season || this._dashboard()?.nflState.season;
    if (!targetSeason) return null;
    return this._seasonStatsBySeason()[targetSeason]?.[playerId] ?? null;
  }

  getSideProjectedTotal(starterIds: string[], season: string, week: number): number | null {
    const map = this._projectionsByKey()[`${season}-${week}`];
    if (!map || starterIds.length === 0) return null;
    this._activeNflTeamsByKey();
    let total = 0;
    let matched = 0;
    for (const id of starterIds) {
      const meta = this.playersService.resolvePlayer(id);
      if (this.isPlayerOnBye(meta.nflTeam, season, week)) {
        continue;
      }
      const val = map[id];
      if (typeof val === 'number') {
        total += val;
        matched += 1;
      }
    }
    return matched > 0 ? round2(total) : null;
  }

  resolvePlayer(playerId: string) {
    this.playersMap();
    return this.playersService.resolvePlayer(playerId);
  }

  getPlayerProjection(playerId: string, season: string, week: number): number | null {
    const map = this._projectionsByKey()[`${season}-${week}`];
    if (!map) return null;
    const val = map[playerId];
    return typeof val === 'number' ? round2(val) : null;
  }

  isPlayerOnBye(nflTeam: string, season: string, week: number): boolean {
    const activeTeams = this._activeNflTeamsByKey()[`${season}-${week}`];
    if (!activeTeams || activeTeams.size < 10) return false;
    const code = nflTeam.toUpperCase();
    return NFL_TEAMS.has(code) && !activeTeams.has(code);
  }

  async refreshCurrentLeague(preserveWeek = false): Promise<void> {
    const currentId = this._dashboard()?.league.league_id;
    if (!currentId) return;
    await this.loadLeague(currentId, undefined, preserveWeek);
  }

  async refreshWeek(week: number): Promise<void> {
    const current = this._dashboard();
    if (!current || this._loading() || this._refreshing() || week <= 0) return;

    const leagueId = current.league.league_id;
    const projKey = `${current.league.season}-${week}`;
    this._refreshing.set(true);

    try {
      const [league, nflState, entries] = await Promise.all([
        this.api.fetchLeague(leagueId),
        this.api.fetchNflState(),
        this.api.fetchWeekMatchups(leagueId, week),
      ]);

      this.projectionFetches.add(projKey);
      void this.fetchWeekProjections(league?.season ?? current.league.season, week, projKey);

      const safeLeague = league?.league_id ? league : current.league;
      const safeEntries = entries ?? [];
      const wasCompleted = (current.weeklyMatchups[week] ?? []).some((m) => m.isCompleted);
      const completed = isWeekCompleted(safeLeague, nflState, week, safeEntries);

      if (!wasCompleted && completed) {
        this._refreshing.set(false);
        await this.loadLeague(leagueId, undefined, true);
        return;
      }

      const rosterInfo = buildRosterInfoMap(current.teams);

      const weekStatus = resolveMatchupStatus(safeEntries, completed);
      const updatedCards = buildWeekMatchupCards(
        week,
        safeEntries,
        weekStatus,
        completed,
        rosterInfo,
      );
      const now = new Date();

      this._dashboard.update((cur) => {
        if (!cur || cur.league.league_id !== leagueId) return cur;
        return {
          ...cur,
          league: safeLeague,
          nflState,
          weeklyMatchups: {
            ...cur.weeklyMatchups,
            [week]: updatedCards,
          },
          loadedAtIso: now.toISOString(),
          loadedAtTime: formatLoadedAtTime(now),
        };
      });
    } catch {
      // Preserve existing matchup view if transient network failure occurs during live polling
    } finally {
      this._refreshing.set(false);
    }
  }

  async lookupUserLeagues(username: string, seasonOverride?: string): Promise<SleeperLeague[]> {
    const trimmed = username.trim();
    if (!trimmed) {
      this._lookupError.set('Enter a Sleeper username.');
      return [];
    }

    this._lookupLoading.set(true);
    this._lookupError.set(null);
    this._discoveredLeagues.set([]);

    try {
      const user = await this.api.fetchUser(trimmed);
      if (!user || !user.user_id) {
        this._lookupError.set(`No Sleeper user found for "${trimmed}".`);
        return [];
      }

      this._discoveredUser.set(user);
      const nflState = await this.api.fetchNflState();
      const targetSeason = seasonOverride ?? nflState.season;
      const leagues = await this.api.fetchUserLeagues(user.user_id, targetSeason);

      if (!leagues || leagues.length === 0) {
        this._lookupError.set(
          `Found @${user.display_name || user.username}, but no ${targetSeason} NFL leagues were returned.`,
        );
        return [];
      }

      this._discoveredLeagues.set(leagues);
      return leagues;
    } catch {
      this._lookupError.set('Unable to reach Sleeper API. Check the username and try again.');
      return [];
    } finally {
      this._lookupLoading.set(false);
    }
  }

  async loadLeague(
    leagueId: string,
    ownerUserId?: string,
    preserveSelectedWeek = false,
  ): Promise<void> {
    const trimmed = leagueId.trim();
    if (!trimmed) {
      this._error.set('Enter a valid Sleeper League ID.');
      return;
    }

    if (ownerUserId !== undefined) {
      this.setMyUserId(ownerUserId);
    }

    const requestToken = ++this.activeLoadToken;
    this.seasonMatchupsLoadedForLeague = '';
    this.seasonMatchupsPromise = null;
    this._loading.set(true);
    this._error.set(null);

    try {
      const [league, users, rosters, nflState, tradedPicks, winnersBracket, losersBracket, drafts] =
        await Promise.all([
          this.api.fetchLeague(trimmed),
          this.api.fetchLeagueUsers(trimmed),
          this.api.fetchLeagueRosters(trimmed),
          this.api.fetchNflState(),
          this.api.fetchTradedPicks(trimmed),
          this.api.fetchBracket(trimmed, 'winners_bracket'),
          this.api.fetchBracket(trimmed, 'losers_bracket'),
          this.api.fetchDrafts(trimmed),
        ]);

      if (requestToken !== this.activeLoadToken) return;
      if (!league || !league.league_id) {
        throw new Error('League not found');
      }

      const primaryDraft = drafts.find((d) => d.status === 'complete') ?? drafts[0] ?? null;
      const maxWeek = resolveWeekCount(league, nflState);
      const [matchupsByWeek, transactions, draftPicks] = await Promise.all([
        this.api.fetchMatchupsRange(league.league_id, maxWeek),
        this.api.fetchTransactionsRange(league.league_id, maxWeek),
        primaryDraft ? this.api.fetchDraftPicks(primaryDraft.draft_id) : Promise.resolve([]),
      ]);

      if (requestToken !== this.activeLoadToken) return;

      const existingSeasons = this._seasons();
      const isInKnownChain = existingSeasons.some((s) => s.leagueId === league.league_id);
      const seasonList: SeasonOption[] = isInKnownChain
        ? existingSeasons
        : [{ leagueId: league.league_id, season: league.season, name: league.name }];

      this._seasons.set(seasonList);
      this.saveSeasons(seasonList);

      const built = buildDashboardData({
        league,
        nflState,
        users: users ?? [],
        rosters: rosters ?? [],
        matchupsByWeek,
        seasons: seasonList,
        transactions,
        tradedPicks,
        winnersBracket,
        losersBracket,
        draft: primaryDraft,
        draftPicks,
      });

      this._dashboard.set(built);
      const scoredWeeks = Object.keys(built.weeklyMatchups)
        .map(Number)
        .filter((week) => (built.weeklyMatchups[week]?.length ?? 0) > 0);
      const prevWeek = this._selectedWeek();
      if (preserveSelectedWeek && scoredWeeks.includes(prevWeek)) {
        this._selectedWeek.set(prevWeek);
      } else {
        this._selectedWeek.set(scoredWeeks.length > 0 ? Math.max(...scoredWeeks) : 1);
      }
      this.writeStorage(STORAGE_LEAGUE_KEY, league.league_id);

      if (league.previous_league_id) {
        void this.populateSeasonHistory(league, requestToken);
      }
    } catch {
      if (requestToken !== this.activeLoadToken) return;
      this._error.set(
        `Could not load Sleeper league "${trimmed}". Verify the League ID is public and accurate.`,
      );
    } finally {
      if (requestToken === this.activeLoadToken) {
        this._loading.set(false);
      }
    }
  }

  buildRosterPlayerStats(team: TeamSummary): RosterPlayerStat[] {
    this.playersMap();
    const dash = this._dashboard();
    const season = dash?.league.season || dash?.nflState.season || '';
    const seasonStats = season ? this._seasonStatsBySeason()[season] : undefined;
    return buildRosterPlayerStatsView({
      team,
      dashboard: dash,
      seasonStats,
      resolvePlayer: (id) => this.playersService.resolvePlayer(id),
    });
  }

  buildWeeklyLineup(weekScore: TeamWeeklyScore, season?: string): WeeklyLineupEntry[] {
    this.playersMap();
    if (season) {
      this._projectionsByKey();
      this._activeNflTeamsByKey();
    }
    return buildWeeklyLineupView({
      weekScore,
      dashboard: this._dashboard(),
      season,
      resolvePlayer: (id) => this.playersService.resolvePlayer(id),
      getPlayerProjection: (pid, s, wk) => this.getPlayerProjection(pid, s, wk),
      isPlayerOnBye: (team, s, wk) => this.isPlayerOnBye(team, s, wk),
    });
  }

  buildLeaguePlayers(): LeaguePlayerRow[] {
    this.playersMap();
    const dash = this._dashboard();
    const season = dash?.league.season || dash?.nflState.season || '';
    const seasonStats = season ? this._seasonStatsBySeason()[season] : undefined;
    return buildLeaguePlayersView({
      dashboard: dash,
      seasonStats,
      resolvePlayer: (id) => this.playersService.resolvePlayer(id),
    });
  }

  buildLeagueTrades(): LeagueTradeCard[] {
    this.playersMap();
    const dash = this._dashboard();
    if (!dash) return [];
    return buildLeagueTradesView({
      dashboard: dash,
      leaguePlayers: this.buildLeaguePlayers(),
      resolvePlayer: (id) => this.playersService.resolvePlayer(id),
    });
  }

  buildRecentMoves(): LeagueMoveItem[] {
    this.playersMap();
    const dash = this._dashboard();
    if (!dash) return [];
    return buildRecentMovesView({
      dashboard: dash,
      leaguePlayers: this.buildLeaguePlayers(),
      resolvePlayer: (id) => this.playersService.resolvePlayer(id),
    });
  }

  buildTradedPicksView(): TradedPickView[] {
    const dash = this._dashboard();
    return dash ? buildTradedPicksView(dash) : [];
  }

  async loadAllTimeHistory(force = false): Promise<void> {
    const data = this._dashboard();
    if (!data) return;

    const seasons = this._seasons();
    const list =
      seasons.length > 0
        ? seasons
        : [{ leagueId: data.league.league_id, season: data.league.season, name: data.league.name }];
    const chainKey = list.map((s) => s.leagueId).join(',');

    if (!force && this._allTimeHistory() && this.loadedHistoryKey === chainKey) {
      return;
    }

    this._historyLoading.set(true);
    this._historyError.set(null);

    try {
      const snapshots: HistoricalSeasonSnapshot[] = [];
      for (const s of list.slice(0, 8)) {
        const [league, users, rosters, winnersBracket] = await Promise.all([
          this.api.fetchLeague(s.leagueId),
          this.api.fetchLeagueUsers(s.leagueId),
          this.api.fetchLeagueRosters(s.leagueId),
          this.api.fetchBracket(s.leagueId, 'winners_bracket'),
        ]);

        if (!league || !league.league_id) continue;
        const maxWk = resolveWeekCount(league, data.nflState);
        const matchupsByWeek = await this.api.fetchMatchupsRange(league.league_id, maxWk);
        snapshots.push({
          league,
          users: users ?? [],
          rosters: rosters ?? [],
          winnersBracket,
          matchupsByWeek,
        });
      }

      this._allTimeHistory.set(computeAllTimeLeagueHistory(snapshots));
      this.loadedHistoryKey = chainKey;
    } catch {
      this._historyError.set('Unable to compile historical season records right now.');
    } finally {
      this._historyLoading.set(false);
    }
  }

  private async fetchWeekProjections(season: string, week: number, key: string): Promise<void> {
    this._projectionsLoading.set(true);
    try {
      const raw = await this.api.fetchWeekProjections(season, week);
      if (raw && typeof raw === 'object') {
        const scoring = this._dashboard()?.league.scoring_settings ?? {};
        const { projections, activeNflTeams } = parseWeekProjectionsMap(
          raw,
          scoring,
          (id) => this.playersService.resolvePlayer(id).position,
        );
        this._projectionsByKey.update((cur) => ({ ...cur, [key]: projections }));
        if (activeNflTeams.size > 0) {
          this._activeNflTeamsByKey.update((cur) => ({ ...cur, [key]: activeNflTeams }));
        }
      }
    } catch {
      // Projections endpoint unavailable; UI retains '—' cleanly
    } finally {
      this._projectionsLoading.set(false);
    }
  }

  private async fetchSeasonNflStats(season: string): Promise<void> {
    try {
      const raw = await this.api.fetchSeasonNflStats(season);
      if (!raw || typeof raw !== 'object') return;
      const scoring = this._dashboard()?.league.scoring_settings ?? {};
      const mapped = parseSeasonNflStatsMap(
        raw,
        scoring,
        (id) => this.playersService.resolvePlayer(id).position,
      );
      this._seasonStatsBySeason.update((cur) => ({ ...cur, [season]: mapped }));
    } catch {
      // Season stats endpoint optional; matchup history still applies cleanly
    }
  }

  private async populateSeasonHistory(
    latestLeague: SleeperLeague,
    requestToken: number,
  ): Promise<void> {
    const chain = [...this._seasons()];
    const seen = new Set(chain.map((s) => s.leagueId));
    if (!seen.has(latestLeague.league_id)) {
      chain.push({
        leagueId: latestLeague.league_id,
        season: latestLeague.season,
        name: latestLeague.name,
      });
      seen.add(latestLeague.league_id);
    }

    let prevId = latestLeague.previous_league_id;
    let depth = 0;

    while (prevId && depth < 5) {
      if (seen.has(prevId)) break;
      try {
        const prev = await this.api.fetchLeague(prevId);
        if (requestToken !== this.activeLoadToken) return;
        if (!prev?.league_id) break;
        chain.push({ leagueId: prev.league_id, season: prev.season, name: prev.name });
        seen.add(prev.league_id);
        prevId = prev.previous_league_id;
        depth += 1;
      } catch {
        break;
      }
    }

    if (requestToken === this.activeLoadToken) {
      chain.sort((a, b) => Number(b.season) - Number(a.season));
      this._seasons.set(chain);
      this.saveSeasons(chain);
    }
  }

  private readSavedSeasons(): SeasonOption[] {
    try {
      const raw = this.readStorage(STORAGE_SEASONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SeasonOption[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveSeasons(seasons: SeasonOption[]): void {
    try {
      this.writeStorage(STORAGE_SEASONS_KEY, JSON.stringify(seasons));
    } catch {
      // Ignore storage errors
    }
  }

  private readStorage(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private removeStorage(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage errors
    }
  }
}
