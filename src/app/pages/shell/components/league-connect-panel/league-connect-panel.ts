import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SleeperService } from '../../../../core';
import { PickerComponent, type PickerOption } from '../../../../shared/ui';

@Component({
  selector: 'app-league-connect-panel',
  imports: [FormsModule, PickerComponent],
  templateUrl: './league-connect-panel.html',
  styleUrl: './league-connect-panel.scss',
})
export class LeagueConnectPanel {
  protected readonly sleeper = inject(SleeperService);

  readonly isModal = input<boolean>(false);
  readonly closed = output<void>();

  protected readonly leagueIdInput = signal('');
  protected readonly usernameInput = signal('');
  protected readonly seasonInput = signal(String(new Date().getFullYear()));

  protected readonly seasonPickerOptions = computed<PickerOption<string>[]>(() => {
    const yr = new Date().getFullYear();
    return [yr, yr - 1, yr - 2].map((y) => ({
      value: String(y),
      label: String(y),
      badge: 'NFL',
    }));
  });

  protected async submitLeagueId(): Promise<void> {
    const id = this.leagueIdInput().trim();
    if (!id) return;
    await this.sleeper.loadLeague(id);
    if (!this.sleeper.error()) {
      this.closed.emit();
    }
  }

  protected async findLeagues(): Promise<void> {
    const username = this.usernameInput().trim();
    if (!username) return;
    await this.sleeper.lookupUserLeagues(username, this.seasonInput());
  }

  protected async selectLeague(leagueId: string): Promise<void> {
    const userId = this.sleeper.discoveredUser()?.user_id;
    await this.sleeper.loadLeague(leagueId, userId);
    if (!this.sleeper.error()) {
      this.closed.emit();
    }
  }
}
