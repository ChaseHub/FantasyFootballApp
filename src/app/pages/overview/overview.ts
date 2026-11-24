import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SleeperService } from '../../core';
import { PageHeaderComponent } from '../../shared/ui';
import { FeaturedMatchupCard } from './components/featured-matchup-card/featured-matchup-card';
import { LeaguePulseCard } from './components/league-pulse-card/league-pulse-card';
import { ScoringTrendCard } from './components/scoring-trend-card/scoring-trend-card';
import { StandingsSnapshotCard } from './components/standings-snapshot-card/standings-snapshot-card';

@Component({
  selector: 'app-overview',
  imports: [
    RouterLink,
    PageHeaderComponent,
    FeaturedMatchupCard,
    LeaguePulseCard,
    StandingsSnapshotCard,
    ScoringTrendCard,
  ],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview {
  protected readonly sleeper = inject(SleeperService);

  protected readonly scoringLabel = computed(() => {
    const rec = this.sleeper.league()?.scoring_settings?.['rec'] ?? 0;
    if (rec >= 1) return 'Full PPR';
    if (rec >= 0.5) return 'Half PPR';
    return 'Standard';
  });

  protected readonly isUserFeatured = computed(() => {
    const mine = this.sleeper.myTeam();
    const feat = this.sleeper.featuredMatchup();
    if (!mine || !feat) return false;
    return feat.home.rosterId === mine.rosterId || feat.away?.rosterId === mine.rosterId;
  });

  protected readonly hasLiveWeek = computed(() =>
    this.sleeper.currentWeekMatchups().some((m) => m.status === 'Live')
  );

  protected readonly preDraftOrder = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data) return [];
    const slotMap = data.draft?.slot_to_roster_id ?? {};
    const teamById = new Map(data.teams.map((t) => [t.rosterId, t]));
    const slots = Object.entries(slotMap)
      .map(([slot, rosterId]) => ({
        slot: Number(slot),
        team: teamById.get(Number(rosterId)) ?? null,
      }))
      .filter((entry) => Number.isFinite(entry.slot) && entry.team !== null)
      .sort((a, b) => a.slot - b.slot);
    if (slots.length > 0) return slots.slice(0, 8);
    return data.teams.slice(0, 8).map((team, idx) => ({ slot: idx + 1, team }));
  });

  protected readonly seasonChampion = computed(() => {
    if (this.sleeper.seasonPhase() !== 'complete') return null;
    const teams = this.sleeper.teams();
    if (teams.length === 0) return null;
    return [...teams].sort((a, b) => a.standingsRank - b.standingsRank)[0] ?? null;
  });

  protected readonly quickStrip = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data) return null;

    const ordered = [...data.teams].sort((a, b) => a.standingsRank - b.standingsRank);
    const focusTeam = this.sleeper.myTeam() ?? ordered[0] ?? null;
    const focusGames = focusTeam ? Math.max(1, focusTeam.wins + focusTeam.losses + focusTeam.ties) : 1;

    const playoffCut = Number(data.league.settings?.['playoff_teams'] ?? 4);
    const cutIdx = Math.min(ordered.length - 1, Math.max(0, playoffCut - 1));
    const cutoffTeam = ordered[cutIdx] ?? null;

    const completedWeeks = data.weeklyLeagueAverages;
    const leagueAvgPpg =
      completedWeeks.length > 0
        ? completedWeeks.reduce((s, w) => s + w.average, 0) / completedWeeks.length
        : 0;
    const seasonHigh =
      completedWeeks.length > 0 ? Math.max(...completedWeeks.map((w) => w.high)) : 0;

    const tradesCount = data.transactions.filter(
      (tx) => tx.type === 'trade' && tx.status === 'complete'
    ).length;
    const movesCount = data.transactions.filter(
      (tx) => (tx.type === 'waiver' || tx.type === 'free_agent') && tx.status === 'complete'
    ).length;

    return {
      isMyTeam: Boolean(this.sleeper.myTeam()),
      focusTeam,
      focusAvg: focusTeam ? focusTeam.pointsFor / focusGames : 0,
      playoffCut,
      cutoffTeam,
      leagueAvgPpg,
      seasonHigh,
      tradesCount,
      movesCount,
    };
  });

  protected readonly weekMatchupsPreview = computed(() =>
    this.sleeper.currentWeekMatchups().slice(0, 4)
  );

  protected onWeekSelected(week: number): void {
    this.sleeper.setSelectedWeek(week);
  }

  protected refresh(): void {
    void this.sleeper.refreshCurrentLeague();
  }
}
