import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type RosterPlayerStat,
  SleeperService,
  ToastService,
  type TradeEvaluationResult,
  type TradeSideSummary,
  evaluateTradePackage,
} from '../../core';
import {
  FilterBarComponent,
  PageHeaderComponent,
  PickerComponent,
  type PickerOption,
} from '../../shared/ui';

type TradeViewTab = 'trades' | 'moves' | 'picks' | 'sandbox';
type MoveKindFilter = 'all' | 'waiver' | 'free_agent' | 'bids';
type SandboxPosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';

@Component({
  selector: 'app-trades',
  imports: [RouterLink, PageHeaderComponent, FilterBarComponent, PickerComponent],
  templateUrl: './trades.html',
  styleUrl: './trades.scss',
})
export class Trades implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly activeTab = signal<TradeViewTab>('trades');
  protected readonly selectedRosterFilter = signal<number | 'all'>('all');
  protected readonly moveKindFilter = signal<MoveKindFilter>('all');
  protected readonly searchQuery = signal('');

  protected readonly sandboxTeamAId = signal<number | null>(null);
  protected readonly sandboxTeamBId = signal<number | null>(null);
  protected readonly sandboxSendIdsA = signal<string[]>([]);
  protected readonly sandboxSendIdsB = signal<string[]>([]);
  protected readonly sandboxFaabA = signal<number>(0);
  protected readonly sandboxFaabB = signal<number>(0);
  protected readonly sandboxPosA = signal<SandboxPosFilter>('ALL');
  protected readonly sandboxPosB = signal<SandboxPosFilter>('ALL');
  protected readonly posChoices: SandboxPosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];

  protected readonly allTrades = computed(() => this.sleeper.buildLeagueTrades());
  protected readonly allMoves = computed(() => this.sleeper.buildRecentMoves());
  protected readonly tradedPicks = computed(() => this.sleeper.buildTradedPicksView());

  protected readonly teamFilterOptions = computed<PickerOption<number | 'all'>[]>(() => {
    const teams = this.sleeper.teams();
    return [
      { value: 'all', label: `All Franchises (${teams.length})`, badge: 'ALL' },
      ...teams.map((t) => ({
        value: t.rosterId,
        label: t.teamName,
        sub: t.managerName,
        badge: t.recordLabel,
        avatarUrl: t.avatarUrl,
        initials: t.initials,
      })),
    ];
  });

  protected readonly sandboxTeamOptionsA = computed<PickerOption<number>[]>(() =>
    this.sleeper.teams().map((tm) => ({
      value: tm.rosterId,
      label: tm.teamName,
      sub: tm.managerName,
      badge: tm.recordLabel,
      avatarUrl: tm.avatarUrl,
      initials: tm.initials,
    }))
  );

  protected readonly sandboxTeamOptionsB = computed<PickerOption<number>[]>(() => {
    const sideA = this.sandboxEval()?.teamA.rosterId;
    return this.sleeper
      .teams()
      .filter((tm) => tm.rosterId !== sideA)
      .map((tm) => ({
        value: tm.rosterId,
        label: tm.teamName,
        sub: tm.managerName,
        badge: tm.recordLabel,
        avatarUrl: tm.avatarUrl,
        initials: tm.initials,
      }));
  });

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.selectedRosterFilter() !== 'all') n++;
    if (this.activeTab() === 'moves' && this.moveKindFilter() !== 'all') n++;
    return n;
  });

  protected readonly filteredTeam = computed(() => {
    const rid = this.selectedRosterFilter();
    if (rid === 'all') return null;
    return this.sleeper.teams().find((t) => t.rosterId === rid) ?? null;
  });

  protected readonly filteredTrades = computed(() => {
    const rid = this.selectedRosterFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return this.allTrades().filter((trade) => {
      if (rid !== 'all' && !trade.sides.some((s) => s.rosterId === rid)) {
        return false;
      }
      if (!q) return true;
      return trade.sides.some(
        (s) =>
          s.teamName.toLowerCase().includes(q) ||
          s.managerName.toLowerCase().includes(q) ||
          s.playersReceived.some((p) => p.name.toLowerCase().includes(q)) ||
          s.picksReceived.some(
            (pk) =>
              `${pk.season} round ${pk.round}`.toLowerCase().includes(q) ||
              pk.originalTeamName.toLowerCase().includes(q)
          )
      );
    });
  });

  protected readonly filteredMoves = computed(() => {
    const rid = this.selectedRosterFilter();
    const kind = this.moveKindFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return this.allMoves().filter((mv) => {
      if (rid !== 'all' && mv.rosterId !== rid) return false;
      if (kind === 'waiver' && mv.type !== 'waiver') return false;
      if (kind === 'free_agent' && mv.type !== 'free_agent') return false;
      if (kind === 'bids' && (mv.waiverBid === null || mv.waiverBid <= 0)) return false;
      if (!q) return true;
      return (
        mv.teamName.toLowerCase().includes(q) ||
        mv.addedPlayers.some((p) => p.name.toLowerCase().includes(q)) ||
        mv.droppedPlayers.some((p) => p.name.toLowerCase().includes(q))
      );
    });
  });

  protected readonly filteredPicks = computed(() => {
    const team = this.filteredTeam();
    const q = this.searchQuery().trim().toLowerCase();

    return this.tradedPicks().filter((pk) => {
      if (team) {
        const matchesOwner = pk.currentOwnerRosterId === team.rosterId;
        const matchesOriginal = pk.originalOwnerName === team.teamName;
        if (!matchesOwner && !matchesOriginal) return false;
      }
      if (!q) return true;
      return (
        `${pk.season} round ${pk.round}`.toLowerCase().includes(q) ||
        pk.originalOwnerName.toLowerCase().includes(q) ||
        pk.currentOwnerName.toLowerCase().includes(q)
      );
    });
  });

  protected readonly pickBalances = computed(() => {
    const teams = this.sleeper.teams();
    const byName = new Map(teams.map((t) => [t.teamName, t]));
    const gained = new Map<number, number>();
    const dealt = new Map<number, number>();

    for (const pk of this.tradedPicks()) {
      gained.set(pk.currentOwnerRosterId, (gained.get(pk.currentOwnerRosterId) ?? 0) + 1);
      const orig = byName.get(pk.originalOwnerName);
      if (orig) {
        dealt.set(orig.rosterId, (dealt.get(orig.rosterId) ?? 0) + 1);
      }
    }

    return teams
      .map((t) => {
        const plus = gained.get(t.rosterId) ?? 0;
        const minus = dealt.get(t.rosterId) ?? 0;
        return {
          rosterId: t.rosterId,
          teamName: t.teamName,
          gained: plus,
          dealt: minus,
          net: plus - minus,
        };
      })
      .filter((row) => row.gained > 0 || row.dealt > 0)
      .sort((a, b) => b.net - a.net || b.gained - a.gained);
  });

  protected readonly ledgerSummary = computed(() => {
    const trades = this.allTrades();
    const moves = this.allMoves();
    const teams = this.sleeper.teams();
    const data = this.sleeper.dashboard();
    const totalBudget = data?.league.settings?.waiver_budget ?? 100;
    const usesFaab = teams.some((t) => t.usesFaab);

    let playersMoved = 0;
    let picksMoved = 0;
    let faabTraded = 0;
    const countByRoster = new Map<number, number>();

    for (const tr of trades) {
      for (const side of tr.sides) {
        playersMoved += side.playersReceived.length;
        picksMoved += side.picksReceived.length;
        faabTraded += side.faabReceived;
        countByRoster.set(side.rosterId, (countByRoster.get(side.rosterId) ?? 0) + 1);
      }
    }

    let topTrader: { teamName: string; rosterId: number; count: number } | null = null;
    for (const [rid, count] of countByRoster.entries()) {
      if (!topTrader || count > topTrader.count) {
        const t = teams.find((x) => x.rosterId === rid);
        topTrader = { teamName: t?.teamName ?? `Team ${rid}`, rosterId: rid, count };
      }
    }

    let waiverCount = 0;
    let faCount = 0;
    let totalBids = 0;
    let topBid: { amount: number; playerName: string; teamName: string; rosterId: number } | null = null;
    for (const mv of moves) {
      if (mv.type === 'waiver') waiverCount += 1;
      else faCount += 1;
      if (mv.waiverBid !== null && mv.waiverBid > 0) {
        totalBids += mv.waiverBid;
        if (!topBid || mv.waiverBid > topBid.amount) {
          topBid = {
            amount: mv.waiverBid,
            playerName: mv.addedPlayers[0]?.name ?? 'Claim',
            teamName: mv.teamName,
            rosterId: mv.rosterId,
          };
        }
      }
    }

    const faabSpentLeague = usesFaab
      ? teams.reduce((sum, t) => sum + Math.max(0, totalBudget - t.faabRemaining), 0)
      : 0;
    const topCollector = this.pickBalances()[0] ?? null;
    const mostActiveMover =
      teams.length > 0 ? [...teams].sort((a, b) => b.waiverMoves - a.waiverMoves)[0] : null;

    return {
      totalTrades: trades.length,
      playersMoved,
      picksMoved,
      faabTraded,
      topTrader,
      waiverCount,
      faCount,
      usesFaab,
      faabSpentLeague,
      totalBids,
      topBid,
      topCollector,
      mostActiveMover,
      totalMoves: moves.length,
    };
  });

  protected readonly teamActivity = computed(() => {
    const trades = this.allTrades();
    const tradeCounts = new Map<number, number>();
    for (const tr of trades) {
      for (const side of tr.sides) {
        tradeCounts.set(side.rosterId, (tradeCounts.get(side.rosterId) ?? 0) + 1);
      }
    }
    const netPickMap = new Map(this.pickBalances().map((p) => [p.rosterId, p.net]));
    const budget = this.sleeper.dashboard()?.league.settings?.waiver_budget ?? 100;

    return [...this.sleeper.teams()]
      .map((t) => ({
        rosterId: t.rosterId,
        teamName: t.teamName,
        avatarUrl: t.avatarUrl,
        initials: t.initials,
        trades: tradeCounts.get(t.rosterId) ?? 0,
        moves: t.waiverMoves,
        usesFaab: t.usesFaab,
        faabRemaining: t.faabRemaining,
        faabPct: budget > 0 ? Math.min(100, Math.round((t.faabRemaining / budget) * 100)) : 0,
        waiverPriority: t.waiverPriority,
        netPicks: netPickMap.get(t.rosterId) ?? 0,
      }))
      .sort((a, b) => b.trades - a.trades || b.moves - a.moves);
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.selectedRosterFilter() !== 'all' ||
      this.searchQuery().trim().length > 0 ||
      (this.activeTab() === 'moves' && this.moveKindFilter() !== 'all')
  );

  protected readonly sandboxEval = computed<TradeEvaluationResult | null>(() => {
    const dash = this.sleeper.dashboard();
    const teams = this.sleeper.teams();
    if (!dash || teams.length < 2) return null;

    const preferredA = this.sandboxTeamAId() ?? this.sleeper.myTeam()?.rosterId ?? teams[0].rosterId;
    const teamA = teams.find((t) => t.rosterId === preferredA) ?? teams[0];

    const preferredB = this.sandboxTeamBId();
    const fallbackB = teams.find((t) => t.rosterId !== teamA.rosterId) ?? teams[1];
    const teamB =
      (preferredB !== null && preferredB !== teamA.rosterId
        ? teams.find((t) => t.rosterId === preferredB)
        : null) ?? fallbackB;

    const rosterA = this.sleeper.buildRosterPlayerStats(teamA);
    const rosterB = this.sleeper.buildRosterPlayerStats(teamB);

    return evaluateTradePackage({
      teamA,
      teamB,
      rosterA,
      rosterB,
      sendIdsA: this.sandboxSendIdsA(),
      sendIdsB: this.sandboxSendIdsB(),
      faabA: this.sandboxFaabA(),
      faabB: this.sandboxFaabB(),
      rosterPositions: dash.league.roster_positions ?? [],
    });
  });

  protected readonly filteredRosterA = computed(() => {
    const ev = this.sandboxEval();
    if (!ev) return [];
    const pos = this.sandboxPosA();
    if (pos === 'ALL') return ev.rosterA;
    return ev.rosterA.filter((p) => p.position === pos);
  });

  protected readonly filteredRosterB = computed(() => {
    const ev = this.sandboxEval();
    if (!ev) return [];
    const pos = this.sandboxPosB();
    if (pos === 'ALL') return ev.rosterB;
    return ev.rosterB.filter((p) => p.position === pos);
  });

  constructor() {
    effect(() => {
      const dash = this.sleeper.dashboard();
      if (dash) {
        this.sleeper.ensureSeasonStatsLoaded(dash.league.season);
      }
    });
  }

  ngOnInit(): void {
    this.sleeper.ensurePlayersLoaded();
    this.sleeper.ensureSeasonStatsLoaded();
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'trades' || tab === 'moves' || tab === 'picks' || tab === 'sandbox') {
        if (tab === 'picks' && this.tradedPicks().length === 0) {
          this.activeTab.set('trades');
        } else {
          this.activeTab.set(tab);
        }
      }
      const team = params.get('team');
      if (team !== null) {
        const rid = Number(team);
        if (Number.isFinite(rid)) this.selectedRosterFilter.set(rid);
      }
    });
  }

  protected setTab(tab: TradeViewTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'trades' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onSandboxTeamASelect(id: number): void {
    if (!Number.isFinite(id)) return;
    this.sandboxTeamAId.set(id);
    this.sandboxSendIdsA.set([]);
    this.sandboxFaabA.set(0);
  }

  protected onSandboxTeamBSelect(id: number): void {
    if (!Number.isFinite(id)) return;
    this.sandboxTeamBId.set(id);
    this.sandboxSendIdsB.set([]);
    this.sandboxFaabB.set(0);
  }

  protected swapSandboxSides(): void {
    const ev = this.sandboxEval();
    if (!ev) return;
    const prevA = ev.teamA.rosterId;
    const prevB = ev.teamB.rosterId;
    const prevIdsA = this.sandboxSendIdsA();
    const prevIdsB = this.sandboxSendIdsB();
    const prevFaabA = this.sandboxFaabA();
    const prevFaabB = this.sandboxFaabB();

    this.sandboxTeamAId.set(prevB);
    this.sandboxTeamBId.set(prevA);
    this.sandboxSendIdsA.set(prevIdsB);
    this.sandboxSendIdsB.set(prevIdsA);
    this.sandboxFaabA.set(prevFaabB);
    this.sandboxFaabB.set(prevFaabA);
  }

  protected toggleSandboxPlayer(side: 'A' | 'B', playerId: string): void {
    const sig = side === 'A' ? this.sandboxSendIdsA : this.sandboxSendIdsB;
    sig.update((list) =>
      list.includes(playerId) ? list.filter((id) => id !== playerId) : [...list, playerId]
    );
  }

  protected isSandboxSelected(side: 'A' | 'B', playerId: string): boolean {
    const list = side === 'A' ? this.sandboxSendIdsA() : this.sandboxSendIdsB();
    return list.includes(playerId);
  }

  protected onSandboxFaabChange(side: 'A' | 'B', event: Event): void {
    const ev = this.sandboxEval();
    const maxCap = side === 'A' ? (ev?.teamA.faabRemaining ?? 999) : (ev?.teamB.faabRemaining ?? 999);
    const raw = Math.min(maxCap, Math.max(0, Math.round(Number((event.target as HTMLInputElement).value) || 0)));
    if (side === 'A') this.sandboxFaabA.set(raw);
    else this.sandboxFaabB.set(raw);
  }

  protected resetSandbox(): void {
    this.sandboxSendIdsA.set([]);
    this.sandboxSendIdsB.set([]);
    this.sandboxFaabA.set(0);
    this.sandboxFaabB.set(0);
  }

  protected copySandboxProposal(): void {
    const s = this.sandboxEval();
    if (!s) return;
    const formatPkg = (players: RosterPlayerStat[], faab: number) => {
      const items = [
        ...players.map((p) => `${p.name} (${p.position}, ${p.avgPoints.toFixed(1)} PPG)`),
        ...(faab > 0 ? [`$${faab} FAAB`] : []),
      ];
      return items.length > 0 ? items.join(', ') : 'Nothing';
    };
    const msg = [
      `Trade Proposal (${s.teamA.teamName} <-> ${s.teamB.teamName})`,
      `${s.teamA.teamName} receives: ${formatPkg(s.sendingB, this.sandboxFaabB())}`,
      `${s.teamB.teamName} receives: ${formatPkg(s.sendingA, this.sandboxFaabA())}`,
      `Starter Impact: ${s.teamA.teamName} ${s.starterDeltaA >= 0 ? '+' : ''}${s.starterDeltaA.toFixed(1)} PPG | ${s.teamB.teamName} ${s.starterDeltaB >= 0 ? '+' : ''}${s.starterDeltaB.toFixed(1)} PPG`,
      `Verdict: ${s.verdictHeadline}`,
    ].join('\n');
    void this.toast.copyText(msg, 'Trade proposal');
  }

  protected setMoveKindFilter(kind: MoveKindFilter): void {
    this.moveKindFilter.set(kind);
  }

  protected toggleTeamFilter(rosterId: number): void {
    this.selectedRosterFilter.set(this.selectedRosterFilter() === rosterId ? 'all' : rosterId);
  }

  protected toggleMyTeamFilter(): void {
    const mine = this.sleeper.myTeam();
    if (!mine) return;
    this.toggleTeamFilter(mine.rosterId);
  }

  protected clearFilters(): void {
    this.selectedRosterFilter.set('all');
    this.moveKindFilter.set('all');
    this.searchQuery.set('');
  }

  protected sidePlayerPoints(side: TradeSideSummary): number {
    return side.playersReceived.reduce((sum, p) => sum + p.seasonPoints, 0);
  }
}
