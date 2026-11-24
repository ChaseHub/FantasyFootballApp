import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TeamSummary } from '../../../../core/models/sleeper.models';

@Component({
  selector: 'app-standings-snapshot-card',
  imports: [RouterLink],
  templateUrl: './standings-snapshot-card.html',
  styleUrl: './standings-snapshot-card.scss',
})
export class StandingsSnapshotCard {
  readonly teams = input.required<TeamSummary[]>();
  readonly playoffTeams = input<number>(4);
  readonly myRosterId = input<number | null>(null);

  protected readonly orderedTeams = computed(() => {
    return [...this.teams()].sort((a, b) => a.standingsRank - b.standingsRank);
  });

  protected isWinStreak(streak: string): boolean {
    return streak.toUpperCase().endsWith('W');
  }
}
