import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AppSettingsService,
  EspnNflService,
  type MatchupOddsSummary,
  type NflGameCard,
  SleeperService,
  type WatchPartyAlertBanner,
  type WatchPartyPlayEvent,
  type WatchPartyStarter,
  type WeeklyMatchupSide,
  buildMatchupWatchPartyFeed,
  computeMatchupOdds,
  detectNewWatchPartyAlerts,
  normalizeNflAbbr,
  playAlertChime,
} from '../../core';
import { BottomSheetComponent, PageHeaderComponent } from '../../shared/ui';

interface ActiveDriveChip {
  gameId: string;
  logo: string | null;
  shortName: string;
  downDistance: string;
  isRedZone: boolean;
  startersText: string;
}

@Component({
  selector: 'app-watch-party',
  imports: [RouterLink, PageHeaderComponent, BottomSheetComponent],
  templateUrl: './watch-party.html',
  styleUrl: './watch-party.scss',
})
export class WatchParty implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly sleeper = inject(SleeperService);
  protected readonly espn = inject(EspnNflService);
  protected readonly settings = inject(AppSettingsService);
  private readonly route = inject(ActivatedRoute);

  protected readonly selectedMatchupId = signal<number | null>(null);
  protected readonly focusedPlayerId = signal<string | null>(null);
  protected readonly autoRefreshEnabled = signal<boolean>(true);
  protected readonly importantOnly = signal<boolean>(false);
  protected readonly mobileFeedSide = signal<'both' | 'home' | 'away'>('both');
  protected readonly broadcastSheetOpen = signal<boolean>(false);
  protected readonly countdown = signal<number>(this.settings.watchPartyIntervalSec());
  protected readonly syncing = signal<boolean>(false);
  protected readonly alertsEnabled = this.settings.watchPartyAlerts;
  protected readonly soundEnabled = this.settings.watchPartySound;
  protected readonly activeAlerts = signal<WatchPartyAlertBanner[]>([]);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private initializedWeek = false;
  private seenPlayIds = new Set<string>();
  private seenRzGameIds = new Set<string>();
  private seededMatchupKey = '';

  protected readonly week = computed(() => this.sleeper.selectedWeek());
  protected readonly season = computed(() => {
    const data = this.sleeper.dashboard();
    return data?.nflState.season ?? data?.league.season ?? String(new Date().getFullYear());
  });

  protected readonly activeMatchup = computed(() => {
    const list = this.sleeper.currentWeekMatchups();
    if (list.length === 0) return null;
    const chosenId = this.selectedMatchupId();
    if (chosenId !== null) {
      const found = list.find((m) => m.matchupId === chosenId);
      if (found) return found;
    }
    return this.sleeper.featuredMatchup() ?? list[0];
  });

  protected readonly oddsByMatchupId = computed(() => {
    this.sleeper.playersMap();
    this.sleeper.projectionsByKey();
    const s = this.season();
    const map = new Map<number, MatchupOddsSummary>();
    if (!s) return map;
    for (const card of this.sleeper.currentWeekMatchups()) {
      map.set(card.matchupId, computeMatchupOdds(card, this.sleeper, this.espn, s));
    }
    return map;
  });

  protected readonly activeOdds = computed<MatchupOddsSummary | null>(() => {
    const m = this.activeMatchup();
    return m ? this.oddsByMatchupId().get(m.matchupId) ?? null : null;
  });

  protected readonly homeStarters = computed(() =>
    this.buildSideStarters(this.activeMatchup()?.home ?? null)
  );
  protected readonly awayStarters = computed(() =>
    this.buildSideStarters(this.activeMatchup()?.away ?? null)
  );

  protected readonly liveHomeStarters = computed(() =>
    this.homeStarters().filter((s) => s.game?.state === 'in')
  );
  protected readonly liveAwayStarters = computed(() =>
    this.awayStarters().filter((s) => s.game?.state === 'in')
  );

  protected readonly homeCounts = computed(() => this.summarizePlayerStates(this.homeStarters()));
  protected readonly awayCounts = computed(() => this.summarizePlayerStates(this.awayStarters()));

  protected readonly activeDrives = computed<ActiveDriveChip[]>(() => {
    const seen = new Map<string, ActiveDriveChip>();
    for (const st of [...this.liveHomeStarters(), ...this.liveAwayStarters()]) {
      const g = st.game;
      if (!g || g.state !== 'in' || !g.situation) continue;
      const offTeam =
        g.away.id === g.situation.possessionTeamId
          ? g.away
          : g.home.id === g.situation.possessionTeamId
            ? g.home
            : null;
      const isStarterOnOffense = offTeam ? offTeam.normalizedAbbr === st.nflTeam : false;
      const isDstOnField = st.position === 'DEF' && !isStarterOnOffense;
      if (!isStarterOnOffense && !isDstOnField) continue;

      const existing = seen.get(g.id);
      const sitLabel = [g.situation.downDistanceText, g.situation.possessionText]
        .filter(Boolean)
        .join(' at ');
      if (existing) {
        if (!existing.startersText.includes(st.name)) {
          existing.startersText += `, ${st.name}`;
        }
      } else {
        seen.set(g.id, {
          gameId: g.id,
          logo: offTeam?.logo ?? g.away.logo,
          shortName: `${g.shortName} · ${g.statusDetail}`,
          downDistance: sitLabel || 'On the field',
          isRedZone: g.situation.isRedZone,
          startersText: st.name,
        });
      }
    }
    return Array.from(seen.values());
  });

  protected readonly rawFeeds = computed(() => {
    const scoring = this.sleeper.league()?.scoring_settings ?? {};
    const details = this.espn.detailsByEventId();
    return buildMatchupWatchPartyFeed(
      this.liveHomeStarters(),
      this.liveAwayStarters(),
      details,
      scoring
    );
  });

  protected readonly playFeeds = computed(() => {
    const { homeEvents, awayEvents } = this.rawFeeds();

    const pid = this.focusedPlayerId();
    const filterFn = (list: WatchPartyPlayEvent[]) =>
      list.filter((e) => {
        if (this.importantOnly() && e.importance === 'normal') return false;
        if (pid && e.playerId !== pid) return false;
        return true;
      });

    return {
      home: filterFn(homeEvents),
      away: filterFn(awayEvents),
      totalHome: homeEvents.length,
      totalAway: awayEvents.length,
    };
  });

  protected readonly latestSpotlight = computed<WatchPartyPlayEvent | null>(() => {
    const { home, away } = this.playFeeds();
    const combined = [...home, ...away].sort(
      (a, b) => b.sortOrder - a.sortOrder || Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta)
    );
    return (
      combined.find((e) => e.importance === 'touchdown' || e.importance === 'turnover') ??
      combined.find((e) => e.importance === 'big') ??
      combined[0] ??
      null
    );
  });

  constructor() {
    effect(() => {
      const data = this.sleeper.dashboard();
      if (data && !this.initializedWeek) {
        this.initializedWeek = true;
        if (data.currentWeek > 0 && this.sleeper.selectedWeek() !== data.currentWeek) {
          this.sleeper.setSelectedWeek(data.currentWeek);
        }
      }
    });

    effect(() => {
      const m = this.activeMatchup();
      const s = this.season();
      const wk = this.week();
      if (m && s && wk > 0) {
        this.sleeper.ensureWeekProjections(s, wk);
        void this.loadMatchupFeeds(true);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.intervalId !== null) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    });
  }

  ngOnInit(): void {
    this.sleeper.ensurePlayersLoaded();
    this.route.queryParamMap.subscribe((params) => {
      const m = params.get('matchup');
      if (m !== null) {
        const id = Number(m);
        if (Number.isFinite(id)) this.selectedMatchupId.set(id);
      }
    });
    const s = this.season();
    const wk = this.week();
    if (s && wk > 0) {
      void this.espn.loadScoreboard(s, wk);
    }

    this.intervalId = setInterval(() => {
      if (!this.autoRefreshEnabled() || this.syncing()) return;
      const next = this.countdown() - 1;
      if (next <= 0) {
        this.countdown.set(this.settings.watchPartyIntervalSec());
        void this.syncNow();
      } else {
        this.countdown.set(next);
      }
    }, 1000);
  }

  protected cardOdds(matchupId: number): MatchupOddsSummary | null {
    return this.oddsByMatchupId().get(matchupId) ?? null;
  }

  protected selectMatchup(matchupId: number): void {
    this.selectedMatchupId.set(matchupId);
    this.focusedPlayerId.set(null);
    this.resetAlertBaseline();
  }

  protected togglePlayerFilter(playerId: string): void {
    this.focusedPlayerId.update((cur) => (cur === playerId ? null : playerId));
  }

  protected toggleAlerts(): void {
    const next = !this.alertsEnabled();
    this.settings.setWatchPartyAlerts(next);
    if (!next) {
      this.activeAlerts.set([]);
    }
  }

  protected toggleSound(): void {
    const next = !this.soundEnabled();
    this.settings.setWatchPartySound(next);
    if (next) {
      playAlertChime('BIG');
    }
  }

  protected triggerTestAlert(): void {
    const m = this.activeMatchup();
    const homeName = m?.home.teamName ?? 'Your Squad';
    const sample: WatchPartyAlertBanner = {
      id: `test-${Date.now()}`,
      kind: 'TD',
      title: `Sample TD Alert · ${homeName}`,
      detail: 'Test Watch Party banner: live TDs, 12+ yd gains, turnovers, and red-zone drives will appear here.',
      fantasyTeam: homeName,
      pointsDelta: 6.4,
      logo: null,
      createdAtMs: Date.now(),
    };
    this.pushAlertBanners([sample]);
  }

  protected dismissAlert(id: string): void {
    this.activeAlerts.update((list) => list.filter((a) => a.id !== id));
  }

  protected clearAlerts(): void {
    this.activeAlerts.set([]);
  }

  protected toggleAutoRefresh(): void {
    const next = !this.autoRefreshEnabled();
    this.autoRefreshEnabled.set(next);
    if (next) {
      this.countdown.set(this.settings.watchPartyIntervalSec());
    }
  }

  protected async syncNow(): Promise<void> {
    if (this.syncing()) return;
    const s = this.season();
    const wk = this.week();
    if (!s || wk <= 0) return;

    this.syncing.set(true);
    this.countdown.set(this.settings.watchPartyIntervalSec());

    try {
      await Promise.all([this.sleeper.refreshWeek(wk), this.espn.loadScoreboard(s, wk, true)]);
      await this.loadMatchupFeeds(true);
    } finally {
      this.syncing.set(false);
    }
  }

  private async loadMatchupFeeds(forceLiveGames: boolean): Promise<void> {
    const s = this.season();
    const wk = this.week();
    if (!s || wk <= 0) return;
    await this.espn.loadScoreboard(s, wk);

    const uniqueLiveGames = new Map<string, NflGameCard>();
    for (const starter of [...this.liveHomeStarters(), ...this.liveAwayStarters()]) {
      if (starter.game && starter.game.state === 'in') {
        uniqueLiveGames.set(starter.game.id, starter.game);
      }
    }

    await Promise.all(
      Array.from(uniqueLiveGames.values()).map((g) =>
        this.espn.fetchEventDetailCached(
          g.id,
          { [g.away.id]: g.away.abbr, [g.home.id]: g.home.abbr },
          forceLiveGames,
          false
        )
      )
    );
    this.processAlertsForCurrentMatchup();
  }

  private resetAlertBaseline(): void {
    this.seededMatchupKey = '';
    this.seenPlayIds.clear();
    this.seenRzGameIds.clear();
    this.activeAlerts.set([]);
  }

  private processAlertsForCurrentMatchup(): void {
    const m = this.activeMatchup();
    if (!m) return;
    const key = `${this.season()}-${this.week()}-${m.matchupId}`;
    const raw = this.rawFeeds();
    const drives = this.activeDrives().map((d) => ({
      gameId: d.gameId,
      isRedZone: d.isRedZone,
      shortName: d.shortName,
      downDistance: d.downDistance,
      startersText: d.startersText,
      logo: d.logo,
    }));

    const newlyDetected = detectNewWatchPartyAlerts(
      this.seenPlayIds,
      this.seenRzGameIds,
      raw.homeEvents,
      raw.awayEvents,
      m.home.teamName,
      m.away?.teamName ?? null,
      drives
    );

    if (this.seededMatchupKey !== key) {
      this.seededMatchupKey = key;
      return;
    }

    if (this.alertsEnabled() && newlyDetected.length > 0) {
      this.pushAlertBanners(newlyDetected);
    }
  }

  private pushAlertBanners(alerts: WatchPartyAlertBanner[]): void {
    if (alerts.length === 0) return;
    this.activeAlerts.update((existing) => [...alerts, ...existing].slice(0, 4));
    if (this.soundEnabled()) {
      const priority: Record<WatchPartyAlertBanner['kind'], number> = {
        TD: 4,
        TO: 3,
        BIG: 2,
        RZ: 1,
      };
      const top = [...alerts].sort((a, b) => priority[b.kind] - priority[a.kind])[0];
      playAlertChime(top.kind);
    }
  }

  private buildSideStarters(side: WeeklyMatchupSide | null): WatchPartyStarter[] {
    if (!side) return [];
    const lineup = this.sleeper.buildWeeklyLineup(
      {
        week: this.week(),
        points: side.points,
        opponentPoints: null,
        opponentName: null,
        opponentRosterId: null,
        leagueAverage: 0,
        leagueRankThatWeek: 1,
        leagueSizeThatWeek: 1,
        result: 'W',
        margin: 0,
        benchPoints: 0,
        starterIds: side.starterIds,
        playerPoints: side.playerPoints,
      },
      this.season()
    );

    const s = this.season();
    const wk = this.week();
    const stateOrder: Record<string, number> = { in: 0, pre: 1, post: 2 };

    return lineup
      .filter((entry) => entry.isStarter)
      .map((entry) => {
        const normTeam = normalizeNflAbbr(entry.nflTeam);
        const game = this.espn.getTeamGame(normTeam, s, wk);
        return {
          playerId: entry.playerId,
          name: entry.name,
          position: entry.position,
          slotLabel: entry.slotLabel,
          nflTeam: normTeam,
          currentPoints: entry.points,
          projectedPoints: entry.projectedPoints,
          game,
        };
      })
      .sort((a, b) => {
        const sa = a.game ? stateOrder[a.game.state] ?? 3 : 3;
        const sb = b.game ? stateOrder[b.game.state] ?? 3 : 3;
        return sa - sb || b.currentPoints - a.currentPoints;
      });
  }

  private summarizePlayerStates(starters: WatchPartyStarter[]) {
    let live = 0;
    let pre = 0;
    let post = 0;
    for (const s of starters) {
      if (s.game?.state === 'in') live++;
      else if (s.game?.state === 'post') post++;
      else pre++;
    }
    return { live, pre, post };
  }
}
