import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bottom-sheet.html',
  styleUrl: './bottom-sheet.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class BottomSheetComponent {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly maxWidth = input<string>('540px');
  readonly showClose = input<boolean>(true);

  readonly closed = output<void>();

  protected readonly sheetStyle = computed(() => ({
    '--sheet-max-w': this.maxWidth(),
  }));

  protected onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }
}
