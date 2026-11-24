import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet';

export interface PickerOption<T = string> {
  value: T;
  label: string;
  sub?: string;
  badge?: string;
  avatarUrl?: string | null;
  initials?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-picker',
  standalone: true,
  imports: [FormsModule, BottomSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './picker.html',
  styleUrl: './picker.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(window:resize)': 'onWindowResize()',
    '[class.is-dark]': "tone() === 'dark'",
    '[class.is-compact]': 'compact()',
  },
})
export class PickerComponent<T = string> {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly options = input.required<PickerOption<T>[]>();
  readonly value = input<T | null>(null);
  readonly ariaLabel = input<string>('Choose option');
  readonly sheetTitle = input<string>('Choose option');
  readonly placeholder = input<string>('Select...');
  readonly searchable = input<boolean>(false);
  readonly compact = input<boolean>(false);
  readonly tone = input<'light' | 'dark'>('light');
  readonly disabled = input<boolean>(false);

  readonly valueChange = output<T>();

  protected readonly open = signal(false);
  protected readonly search = signal('');
  protected readonly popoverPos = signal<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  }>({ top: 0, left: 0, width: 240, maxHeight: 300, openUp: false });

  protected readonly selectedOption = computed(() => {
    const val = this.value();
    return this.options().find((o) => o.value === val) ?? null;
  });

  protected readonly filteredOptions = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.options();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub?.toLowerCase().includes(q) ?? false) ||
        (o.badge?.toLowerCase().includes(q) ?? false)
    );
  });

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    this.computePopoverPosition();
    this.search.set('');
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
    this.search.set('');
  }

  protected select(opt: PickerOption<T>): void {
    if (opt.disabled) return;
    this.valueChange.emit(opt.value);
    this.close();
  }

  protected isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  protected onWindowResize(): void {
    if (this.open() && !this.isMobileViewport()) {
      this.computePopoverPosition();
    }
  }

  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.open() || this.isMobileViewport()) return;
    const target = ev.target as Node | null;
    if (target && !this.hostEl.nativeElement.contains(target)) {
      this.close();
    }
  }

  private computePopoverPosition(): void {
    if (typeof window === 'undefined') return;
    const btn = this.triggerRef()?.nativeElement;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const maxW = Math.min(340, window.innerWidth - 24);
    const width = Math.max(rect.width, 220);
    const finalW = Math.min(width, maxW);
    const spaceBelow = Math.max(120, window.innerHeight - rect.bottom - 16);
    const spaceAbove = Math.max(120, rect.top - 16);
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - finalW - 12));
    const top = openUp ? Math.max(12, rect.top - 8) : rect.bottom + 6;
    const maxHeight = Math.min(340, openUp ? spaceAbove - 12 : spaceBelow - 12);
    this.popoverPos.set({ top, left, width: finalW, maxHeight, openUp });
  }
}
