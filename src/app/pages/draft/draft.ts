import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { type DraftPickView, SleeperService } from '../../core';
import {
  FilterBarComponent,
  PageHeaderComponent,
  PickerComponent,
  type PickerOption,
} from '../../shared/ui';

type DraftViewTab = 'board' | 'list' | 'teams';

interface BoardColumnHeader {
  slot: number;
  rosterId: number;
  teamName: string;
  initials: string;
  avatarUrl: string | null;
}

@Component({
  selector: 'app-draft',
  imports: [FormsModule, RouterLink, PageHeaderComponent, FilterBarComponent, PickerComponent],
  templateUrl: './draft.html',
  styleUrl: './draft.scss',
})
export class Draft implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);

  protected readonly viewTab = signal<DraftViewTab>('board');
  protected readonly posFilter = signal<string>('ALL');
  protected readonly rosterFilter = signal<number | 'all'>('all');
  protected readonly searchQuery = signal<string>('');
  protected readonly selectedPick = signal<DraftPickView | null>(null);

  protected readonly positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  protected readonly myRosterId = computed(() => this.sleeper.myTeam()?.rosterId ?? null);
  protected readonly picks = this.sleeper.draftPicksView;
  protected readonly draftMeta = computed(() => this.sleeper.dashboard()?.draft ?? null);
  protected readonly isAuction = computed(() => this.draftMeta()?.type === 'auction');
  protected readonly isSnake = computed(() => (this.draftMeta()?.type ?? 'snake') === 'snake');

  protected readonly teamFilterOptions = computed<PickerOption<number | 'all'>[]>(() => {
    const teams = this.sleeper.teams();
    return [
      { value: 'all', label: `All Teams (${teams.length})`, badge: 'ALL' },
      ...teams.map((t) => ({
        value: t.rosterId,
        label: t.teamName,
        sub: t.managerName,
        badge: `#${t.standingsRank}`,
        avatarUrl: t.avatarUrl,
        initials: t.initials,
      })),
    ];
  });

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.posFilter() !== 'ALL') n++;
    if (this.rosterFilter() !== 'all') n++;
    return n;
  });

  protected readonly draftSummary = computed(() => {
    const all = this.picks();
    if (all.length === 0) return null;

    const firstOverall = all[0];
    const laterRoundPicks = all.filter((p) => p.round >= 3 && p.seasonPoints > 0);
    const stealPool = laterRoundPicks.length > 0 ? laterRoundPicks : all;
    const bestSteal = [...stealPool].sort((a, b) => b.seasonPoints - a.seasonPoints)[0];

    const byTeam = new Map<number, { teamName: string; rosterId: number; pts: number }>();
    for (const p of all) {
      const entry = byTeam.get(p.rosterId) ?? {
        teamName: p.teamName,
        rosterId: p.rosterId,
        pts: 0,
      };
      entry.pts += p.seasonPoints;
      byTeam.set(p.rosterId, entry);
    }
    const bestClass = Array.from(byTeam.values()).sort((a, b) => b.pts - a.pts)[0] ?? null;

    return {
      totalPicks: all.length,
      rounds: this.draftMeta()?.settings?.rounds ?? Math.max(...all.map((p) => p.round)),
      firstOverall,
      bestSteal,
      bestClass,
    };
  });

  protected readonly positionBreakdown = computed(() => {
    const all = this.picks();
    if (all.length === 0) return [];
    const counts = new Map<string, number>();
    for (const p of all) {
      counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
    }
    const order = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'];
    return order
      .map((pos) => {
        const count = counts.get(pos) ?? 0;
        return {
          pos,
          count,
          pct: (count / all.length) * 100,
        };
      })
      .filter((item) => item.count > 0);
  });

  protected readonly boardColumns = computed<BoardColumnHeader[]>(() => {
    const all = this.picks();
    if (all.length === 0) return [];
    const teams = this.sleeper.teams();
    const teamMap = new Map(teams.map((t) => [t.rosterId, t]));
    const slotMap = this.draftMeta()?.slot_to_roster_id;

    if (slotMap && Object.keys(slotMap).length > 0) {
      return Object.entries(slotMap)
        .map(([slotStr, rosterId]) => {
          const slot = Number(slotStr);
          const team = teamMap.get(rosterId);
          return {
            slot,
            rosterId,
            teamName: team?.teamName ?? `Slot ${slot}`,
            initials: team?.initials ?? `S${slot}`,
            avatarUrl: team?.avatarUrl ?? null,
          };
        })
        .sort((a, b) => a.slot - b.slot);
    }

    const round1 = all.filter((p) => p.round === 1).sort((a, b) => a.draftSlot - b.draftSlot);
    return round1.map((p) => {
      const team = teamMap.get(p.rosterId);
      return {
        slot: p.draftSlot,
        rosterId: p.rosterId,
        teamName: p.teamName,
        initials: team?.initials ?? `S${p.draftSlot}`,
        avatarUrl: team?.avatarUrl ?? null,
      };
    });
  });

  protected readonly boardRounds = computed(() => {
    const all = this.picks();
    if (all.length === 0) return [];
    const cols = this.boardColumns();
    const colCount = cols.length || 1;
    const byRound = new Map<number, DraftPickView[]>();
    for (const pick of all) {
      const list = byRound.get(pick.round) ?? [];
      list.push(pick);
      byRound.set(pick.round, list);
    }

    return Array.from(byRound.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => {
        const slotIndex = new Map<number, DraftPickView>();
        for (const p of list) {
          slotIndex.set(p.draftSlot, p);
        }
        const orderedCells = cols.length
          ? cols.map((c) => slotIndex.get(c.slot) ?? null)
          : [...list].sort((a, b) => a.draftSlot - b.draftSlot);
        const chronoPicks = [...list].sort((a, b) => a.pickNo - b.pickNo);
        return {
          round,
          colCount,
          direction: this.isSnake() ? (round % 2 === 1 ? '→' : '←') : '→',
          cells: orderedCells,
          chronoPicks,
        };
      });
  });

  protected readonly filteredPicks = computed(() => {
    const pos = this.posFilter();
    const rid = this.rosterFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return this.picks().filter((p) => {
      if (pos !== 'ALL' && p.position !== pos) return false;
      if (rid !== 'all' && p.rosterId !== rid) return false;
      if (!q) return true;
      return (
        p.playerName.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.nflTeam.toLowerCase().includes(q)
      );
    });
  });

  protected readonly selectedPickInsights = computed(() => {
    const sel = this.selectedPick();
    if (!sel) return null;
    const all = this.picks();
    const samePos = all.filter((p) => p.position === sel.position);
    const draftedPosRank =
      [...samePos].sort((a, b) => a.pickNo - b.pickNo).findIndex((p) => p.pickNo === sel.pickNo) + 1;
    const actualPosRank =
      [...samePos]
        .sort((a, b) => b.seasonPoints - a.seasonPoints)
        .findIndex((p) => p.pickNo === sel.pickNo) + 1;

    return {
      pick: sel,
      draftedPosRank: draftedPosRank > 0 ? draftedPosRank : null,
      actualPosRank: actualPosRank > 0 ? actualPosRank : null,
      roiDelta: draftedPosRank > 0 && actualPosRank > 0 ? draftedPosRank - actualPosRank : null,
    };
  });

  protected readonly teamRecaps = computed(() => {
    const all = this.picks();
    const teams = this.sleeper.teams();
    const byRoster = new Map<number, DraftPickView[]>();
    for (const p of all) {
      const list = byRoster.get(p.rosterId) ?? [];
      list.push(p);
      byRoster.set(p.rosterId, list);
    }

    const raw = teams.map((team) => {
      const teamPicks = byRoster.get(team.rosterId) ?? [];
      const totalPoints = teamPicks.reduce((sum, p) => sum + p.seasonPoints, 0);
      const earlyPoints = teamPicks
        .filter((p) => p.round <= 5)
        .reduce((sum, p) => sum + p.seasonPoints, 0);
      const latePoints = totalPoints - earlyPoints;
      const topPick =
        teamPicks.length > 0
          ? [...teamPicks].sort((a, b) => b.seasonPoints - a.seasonPoints)[0]
          : null;
      const posCounts = new Map<string, number>();
      for (const p of teamPicks) {
        posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
      }
      const mixLabel = ['QB', 'RB', 'WR', 'TE']
        .map((pos) => (posCounts.get(pos) ? `${posCounts.get(pos)} ${pos}` : ''))
        .filter(Boolean)
        .join(' · ');

      return {
        team,
        pickCount: teamPicks.length,
        totalPoints,
        earlyPoints,
        latePoints,
        topPick,
        mixLabel,
        picks: teamPicks,
      };
    });

    const maxPts = Math.max(...raw.map((r) => r.totalPoints), 1);
    return raw
      .map((r) => ({ ...r, pctOfLeader: (r.totalPoints / maxPts) * 100 }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((r, idx) => ({ ...r, classRank: idx + 1 }));
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.posFilter() !== 'ALL' ||
      this.rosterFilter() !== 'all' ||
      this.searchQuery().trim().length > 0
  );

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'board' || tab === 'list' || tab === 'teams') {
        this.viewTab.set(tab);
      }
      const team = params.get('team');
      if (team !== null) {
        const rid = Number(team);
        if (Number.isFinite(rid)) this.rosterFilter.set(rid);
      }
    });
  }

  protected setViewTab(tab: DraftViewTab): void {
    this.viewTab.set(tab);
  }

  protected setPos(pos: string): void {
    this.posFilter.set(this.posFilter() === pos && pos !== 'ALL' ? 'ALL' : pos);
  }

  protected toggleRosterFilter(rosterId: number): void {
    this.rosterFilter.update((cur) => (cur === rosterId ? 'all' : rosterId));
  }

  protected clearFilters(): void {
    this.posFilter.set('ALL');
    this.rosterFilter.set('all');
    this.searchQuery.set('');
  }

  protected isPickHighlighted(pick: DraftPickView): boolean {
    const pos = this.posFilter();
    const rid = this.rosterFilter();
    const q = this.searchQuery().trim().toLowerCase();
    if (pos !== 'ALL' && pick.position !== pos) return false;
    if (rid !== 'all' && pick.rosterId !== rid) return false;
    if (
      q &&
      !pick.playerName.toLowerCase().includes(q) &&
      !pick.nflTeam.toLowerCase().includes(q) &&
      !pick.teamName.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  }

  protected selectPick(pick: DraftPickView): void {
    this.selectedPick.update((cur) => (cur?.pickNo === pick.pickNo ? null : pick));
  }
}
