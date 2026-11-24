import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  computeMedianStandings,
  computeOptimalLineupRankings,
  computeTeamWeeklyAllPlay,
} from '../../core/analytics/clubhouse-analytics';
import { SleeperService } from '../../core/services/sleeper.service';
import { PageHeaderComponent, PickerComponent, PickerOption } from '../../shared/ui';

type LabMode = 'simulator' | 'allplay' | 'matrix' | 'median' | 'bestball';
type MomentKindFilter = 'all' | 'robbery' | 'heist' | 'shootout';

@Component({
  selector: 'app-insights',
  imports: [RouterLink, PageHeaderComponent, PickerComponent],
  templateUrl: './insights.html',
  styleUrl: './insights.scss',
})
export class Insights implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);

  protected readonly labMode = signal<LabMode>('simulator');
  protected readonly focusedRosterId = signal<number | null>(null);
  protected readonly momentFilter = signal<MomentKindFilter>('all');

  protected readonly awards = this.sleeper.leagueAwards;
  protected readonly matrix = this.sleeper.scheduleSwapMatrix;
  protected readonly weirdMoments = this.sleeper.weirdMoments;

  protected readonly teamOptions = computed<PickerOption<number>[]>(() =>
    this.matrix().map((row) => ({
      value: row.teamRosterId,
      label: row.teamName,
      sub: `Actual ${row.actualWins}-${row.actualLosses} · Best ${row.bestScenario.wins}-${row.bestScenario.losses}`,
    })),
  );

  protected readonly playoffTeams = computed(() => {
    const raw = this.sleeper.dashboard()?.league.settings?.['playoff_teams'];
    return typeof raw === 'number' && raw > 0 ? raw : 6;
  });

  protected readonly headlineAwards = computed(() => {
    const ids = new Set(['blessed', 'cursed', 'buzzsaw', 'cakewalk']);
    return this.awards().filter((a) => ids.has(a.id));
  });

  protected readonly secondaryAwards = computed(() => {
    const ids = new Set(['blessed', 'cursed', 'buzzsaw', 'cakewalk']);
    return this.awards().filter((a) => !ids.has(a.id));
  });

  protected readonly activeSwapRow = computed(() => {
    const rows = this.matrix();
    if (rows.length === 0) return null;
    const chosen = this.focusedRosterId();
    if (chosen !== null) {
      return rows.find((r) => r.teamRosterId === chosen) ?? rows[0];
    }
    const mine = this.sleeper.myTeam();
    if (mine) {
      return rows.find((r) => r.teamRosterId === mine.rosterId) ?? rows[0];
    }
    return rows[0];
  });

  protected readonly medianStandings = computed(() =>
    computeMedianStandings(this.sleeper.teams(), this.playoffTeams()),
  );

  protected readonly optimalRankings = computed(() =>
    computeOptimalLineupRankings(this.sleeper.teams()),
  );

  protected readonly weeklyAllPlay = computed(() => {
    const teams = this.sleeper.teams();
    if (teams.length < 2) return null;
    const focusId =
      this.focusedRosterId() ?? this.sleeper.myTeam()?.rosterId ?? teams[0]?.rosterId;
    if (!focusId) return null;
    const playoffStart = Number(
      this.sleeper.dashboard()?.league.settings?.['playoff_week_start'] ?? 15,
    );
    return computeTeamWeeklyAllPlay(teams, focusId, playoffStart);
  });

  protected readonly filteredMoments = computed(() => {
    const kind = this.momentFilter();
    const list = this.weirdMoments();
    if (kind === 'all') return list;
    if (kind === 'shootout') {
      return list.filter((m) => m.kind === 'shootout' || m.kind === 'snoozer');
    }
    return list.filter((m) => m.kind === kind);
  });

  protected readonly allPlayComparison = computed(() => {
    const teams = [...this.sleeper.teams()];
    const byAllPlay = [...teams].sort((a, b) => {
      const pctA = a.allPlayWins / Math.max(a.allPlayWins + a.allPlayLosses, 1);
      const pctB = b.allPlayWins / Math.max(b.allPlayWins + b.allPlayLosses, 1);
      return pctB - pctA || b.pointsFor - a.pointsFor;
    });

    return byAllPlay.map((team, idx) => {
      const allPlayRank = idx + 1;
      const rankDiff = team.standingsRank - allPlayRank;
      const total = Math.max(team.allPlayWins + team.allPlayLosses, 1);
      return {
        rosterId: team.rosterId,
        teamName: team.teamName,
        actualRank: team.standingsRank,
        allPlayRank,
        rankDiff,
        allPlayRecord: `${team.allPlayWins}-${team.allPlayLosses}`,
        allPlayPct: (team.allPlayWins / total) * 100,
        actualRecord: team.recordLabel,
      };
    });
  });

  protected readonly labPulse = computed(() => {
    const matrix = this.matrix();
    const teams = this.sleeper.teams();
    let biggestGain = { teamName: '—', rosterId: 0, delta: 0, ownerName: '—' };
    for (const row of matrix) {
      if (row.bestScenario.winDelta > biggestGain.delta) {
        biggestGain = {
          teamName: row.teamName,
          rosterId: row.teamRosterId,
          delta: row.bestScenario.winDelta,
          ownerName: row.bestScenario.scheduleOwnerName,
        };
      }
    }

    const totalBenchLeft = teams.reduce(
      (sum, t) => sum + Math.max(0, t.maxPointsFor - t.pointsFor),
      0,
    );
    const flippedTeams = this.medianStandings().filter((r) => r.playoffFlip !== null).length;

    return {
      biggestGain,
      totalBenchLeft,
      flippedTeams,
    };
  });

  protected setLabMode(mode: LabMode): void {
    this.labMode.set(mode);
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const mode = params.get('mode');
      if (
        mode === 'simulator' ||
        mode === 'allplay' ||
        mode === 'matrix' ||
        mode === 'median' ||
        mode === 'bestball'
      ) {
        this.labMode.set(mode);
      }
      const team = params.get('team');
      if (team !== null) {
        const rid = Number(team);
        if (Number.isFinite(rid)) this.focusedRosterId.set(rid);
      }
    });
  }

  protected setMomentFilter(kind: MomentKindFilter): void {
    this.momentFilter.set(kind);
  }

  protected focusTeam(rosterId: number): void {
    this.focusedRosterId.set(rosterId);
  }
}
