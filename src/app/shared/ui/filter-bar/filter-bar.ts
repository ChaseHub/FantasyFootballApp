import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
  host: {
    '(document:keydown.escape)': 'closeSheet()',
  },
})
export class FilterBarComponent {
  readonly searchQuery = input<string>('');
  readonly searchPlaceholder = input<string>('Search...');
  readonly showSearch = input<boolean>(true);
  readonly activeFilterCount = input<number>(0);
  readonly sheetTitle = input<string>('Filter Results');
  readonly resultLabel = input<string>('');

  readonly searchQueryChange = output<string>();
  readonly clearAll = output<void>();

  protected readonly sheetOpen = signal(false);

  protected openSheet(): void {
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }
}
