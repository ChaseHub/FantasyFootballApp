import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  show(text: string, durationMs = 2400): void {
    this.message.set(text);
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(() => {
      this.message.set(null);
      this.timeoutId = null;
    }, durationMs);
  }

  async copyText(text: string, label = 'Link copied to clipboard'): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      this.show(label);
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.show(label);
      return true;
    } catch {
      this.show('Unable to copy automatically');
      return false;
    }
  }
}
