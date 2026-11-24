import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type WeeklyMatchupCard } from '../../../../core';
import { WeekPickerComponent } from '../../../../shared/ui';

@Component({
  selector: 'app-featured-matchup-card',
  imports: [RouterLink, WeekPickerComponent],
  templateUrl: './featured-matchup-card.html',
  styleUrl: './featured-matchup-card.scss',
})
export class FeaturedMatchupCard {
  readonly matchup = input<WeeklyMatchupCard | null>(null);
  readonly isUserMatchup = input<boolean>(false);
  readonly week = input<number>(1);
  readonly availableWeeks = input<number[]>([]);

  readonly weekSelected = output<number>();

  protected readonly leaderText = computed(() => {
    const m = this.matchup();
    if (!m || !m.away) return 'Bye week';
    if (m.home.points === 0 && m.away.points === 0) return 'Matchup scheduled';
    if (m.home.points === m.away.points) return 'Tied score';
    const leader = m.home.points > m.away.points ? m.home.teamName : m.away.teamName;
    const verb = m.status === 'Final' ? 'won by' : 'leads by';
    return `${leader} ${verb} ${m.margin.toFixed(2)} pts`;
  });

  protected readonly scoreSharePct = computed(() => {
    const m = this.matchup();
    if (!m || !m.away) return 100;
    const total = m.home.points + m.away.points;
    if (total <= 0) return 50;
    return Math.min(90, Math.max(10, Math.round((m.home.points / total) * 100)));
  });
}
