import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaguePulseInsight } from '../../../../core/models/sleeper.models';

@Component({
  selector: 'app-league-pulse-card',
  imports: [RouterLink],
  templateUrl: './league-pulse-card.html',
  styleUrl: './league-pulse-card.scss',
})
export class LeaguePulseCard {
  readonly insights = input.required<LeaguePulseInsight[]>();
}
