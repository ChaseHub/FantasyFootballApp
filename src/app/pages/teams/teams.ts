import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { SleeperService, type TeamSummary, ToastService } from '../../core';
import { PageHeaderComponent, PickerComponent, type PickerOption } from '../../shared/ui';
import { TeamPointsChart } from './components/team-points-chart/team-points-chart';
import { TeamRosterTable } from './components/team-roster-table/team-roster-table';

type DirectorySort = 'standings' | 'power' | 'points' | 'allplay';

@Component({
  selector: 'app-teams',
  imports: [RouterLink, PageHeaderComponent, PickerComponent, TeamPointsChart, TeamRosterTable],
  templateUrl: './teams.html',
  styleUrl: './teams.scss',
})
export class Teams {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly inspectedWeek = signal<number | null>(null);
  protected readonly directorySort = signal<DirectorySort>('standings');

  constructor() {
    effect(() => {
      if (this.isDetailView()) {
        this.sleeper.ensurePlayersLoaded();
        this.sleeper.ensureSeasonStatsLoaded();
      }
    });
  }

  protected readonly routeRosterId = toSignal(
    this.route.paramMap.pipe(
      map((params) => {
        const raw = params.get('rosterId');
        const id = raw ? Number(raw) : NaN;
        return Number.isFinite(id) ? id : null;
      })
    ),
    { initialValue: null }
  );

  protected readonly isDetailView = computed(() => this.routeRosterId() !== null);

  protected readonly selectedTeam = computed<TeamSummary | null>(() => {
    const id = this.routeRosterId();
    if (id === null) return null;
    const teams = this.sleeper.teams();
    return teams.find((t) => t.rosterId === id) ?? teams[0] ?? null;
  });

  protected readonly orderedDirectory = computed(() =>
    [...this.sleeper.teams()].sort((a, b) => a.standingsRank - b.standingsRank)
  );

  protected readonly teamSwitchOptions = computed<PickerOption<number>[]>(() =>
    this.orderedDirectory().map((entry) => ({
      value: entry.rosterId,
      label: entry.teamName,
      sub: `${entry.managerName} · ${entry.recordLabel}`,
      badge: `#${entry.standingsRank}`,
      avatarUrl: entry.avatarUrl,
      initials: entry.initials,
    }))
  );

  protected readonly sortedDirectory = computed(() => {
    const teams = [...this.sleeper.teams()];
    switch (this.directorySort()) {
      case 'power':
        return teams.sort((a, b) => a.powerRank - b.powerRank);
      case 'points':
        return teams.sort((a, b) => a.pointsRank - b.pointsRank);
      case 'allplay':
        return teams.sort((a, b) => {
          const aPct = a.allPlayWins / Math.max(1, a.allPlayWins + a.allPlayLosses);
          const bPct = b.allPlayWins / Math.max(1, b.allPlayWins + b.allPlayLosses);
          return bPct - aPct || b.pointsFor - a.pointsFor;
        });
      case 'standings':
      default:
        return teams.sort((a, b) => a.standingsRank - b.standingsRank);
    }
  });

  protected readonly playoffTeams = computed(() => {
    const raw = this.sleeper.dashboard()?.league.settings?.['playoff_teams'];
    return typeof raw === 'number' && raw > 0 ? raw : 6;
  });

  protected readonly maxPointsFor = computed(() => {
    const teams = this.sleeper.teams();
    return Math.max(1, ...teams.map((t) => t.pointsFor));
  });

  protected readonly directorySnapshot = computed(() => {
    const teams = this.orderedDirectory();
    if (teams.length === 0) return null;

    const pointsLeader = [...teams].sort((a, b) => a.pointsRank - b.pointsRank)[0];
    const powerLeader = [...teams].sort((a, b) => a.powerRank - b.powerRank)[0];
    const cutoffIdx = Math.min(teams.length - 1, Math.max(0, this.playoffTeams() - 1));
    const cutoffTeam = teams[cutoffIdx];
    const myTeam = this.sleeper.myTeam();

    return {
      standingsLeader: teams[0],
      pointsLeader,
      powerLeader,
      cutoffTeam,
      cutoffSeed: cutoffIdx + 1,
      myTeam,
      currentWeek: this.sleeper.dashboard()?.currentWeek ?? 1,
    };
  });

  protected readonly teamMatchupByRoster = computed(() => {
    const data = this.sleeper.dashboard();
    const out = new Map<
      number,
      { week: number; status: string; oppName: string | null; myPoints: number; oppPoints: number | null }
    >();
    if (!data) return out;

    const cards = data.weeklyMatchups[data.currentWeek] ?? [];
    for (const card of cards) {
      out.set(card.home.rosterId, {
        week: card.week,
        status: card.status,
        oppName: card.away?.teamName ?? null,
        myPoints: card.home.points,
        oppPoints: card.away?.points ?? null,
      });
      if (card.away) {
        out.set(card.away.rosterId, {
          week: card.week,
          status: card.status,
          oppName: card.home.teamName,
          myPoints: card.away.points,
          oppPoints: card.home.points,
        });
      }
    }
    return out;
  });

  protected readonly adjacentTeams = computed(() => {
    const team = this.selectedTeam();
    const list = this.orderedDirectory();
    if (!team || list.length <= 1) return { prev: null, next: null };
    const idx = list.findIndex((t) => t.rosterId === team.rosterId);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: list[(idx - 1 + list.length) % list.length],
      next: list[(idx + 1) % list.length],
    };
  });

  protected readonly isMyTeam = computed(() => {
    const team = this.selectedTeam();
    const myTeam = this.sleeper.myTeam();
    return team !== null && myTeam !== null && myTeam.rosterId === team.rosterId;
  });

  protected readonly currentWeekMatchupRow = computed(() => {
    const team = this.selectedTeam();
    const data = this.sleeper.dashboard();
    if (!team || !data) return null;
    const cards = data.weeklyMatchups[data.currentWeek] ?? [];
    const card = cards.find(
      (c) => !c.isCompleted && (c.home.rosterId === team.rosterId || c.away?.rosterId === team.rosterId)
    );
    if (!card) return null;

    const isHome = card.home.rosterId === team.rosterId;
    const me = isHome ? card.home : card.away!;
    const opp = isHome ? card.away : card.home;
    const total = Math.max(0.01, me.points + (opp?.points ?? 0));
    const sharePct = opp ? Math.round((me.points / total) * 100) : 100;

    return {
      week: card.week,
      status: card.status,
      myPoints: me.points,
      oppPoints: opp?.points ?? null,
      oppName: opp?.teamName ?? null,
      oppRosterId: opp?.rosterId ?? null,
      oppRecord: opp?.recordLabel ?? null,
      oppAvatarUrl: opp?.avatarUrl ?? null,
      oppInitials: opp?.initials ?? '??',
      sharePct: Math.min(92, Math.max(8, sharePct)),
    };
  });

  protected setDirectorySort(sort: DirectorySort): void {
    this.directorySort.set(sort);
  }

  protected avgPoints(team: TeamSummary): string {
    const games = team.wins + team.losses + team.ties;
    if (games === 0) return '0.0';
    return (team.pointsFor / games).toFixed(1);
  }

  protected pfMeterPct(team: TeamSummary): number {
    return Math.round((team.pointsFor / this.maxPointsFor()) * 100);
  }

  protected allPlayPct(team: TeamSummary): number {
    const total = team.allPlayWins + team.allPlayLosses;
    return total > 0 ? Math.round((team.allPlayWins / total) * 100) : 0;
  }

  protected switchTeamTo(rosterId: number): void {
    if (Number.isFinite(rosterId)) {
      this.inspectedWeek.set(null);
      void this.router.navigate(['/teams', rosterId]);
    }
  }

  protected avgBenchPoints(team: TeamSummary): string {
    const weeks = Math.max(1, team.weeklyScores.length);
    return (team.benchPointsTotal / weeks).toFixed(1);
  }

  protected inspectWeek(week: number | null): void {
    this.inspectedWeek.update((current) => (current === week ? null : week));
  }

  protected toggleMyTeam(): void {
    const team = this.selectedTeam();
    if (!team) return;
    if (this.isMyTeam()) {
      this.sleeper.setMyUserId(null);
      this.toast.show('Unpinned My Team');
    } else if (team.ownerId) {
      this.sleeper.setMyUserId(team.ownerId);
      this.toast.show(`Pinned ${team.teamName} as My Team`);
    }
  }
}
