import { Injectable, effect, signal } from '@angular/core';

export type AppThemeId =
  | 'porcelain-jade'
  | 'midnight-graphite'
  | 'nordic-slate'
  | 'gridiron-amber'
  | 'crimson-playbook'
  | 'emerald-turf';

export interface ThemeDefinition {
  id: AppThemeId;
  name: string;
  tagline: string;
  mode: 'light' | 'dark';
  theory: string;
  swatches: {
    canvas: string;
    surface: string;
    primary: string;
    accent: string;
  };
}

export type DefaultHomeRoute = '/' | '/watch-party' | '/matchups' | '/standings' | '/recaps';
export type RefreshIntervalSec = 10 | 20 | 30;

export const CLUBHOUSE_THEMES: ThemeDefinition[] = [
  {
    id: 'porcelain-jade',
    name: 'Clubhouse Classic',
    tagline: 'Warm limestone, porcelain cards & pine jade',
    mode: 'light',
    theory: 'Split-complementary botanical contrast for effortless daytime reading.',
    swatches: { canvas: '#f4f2ed', surface: '#fffefb', primary: '#205d50', accent: '#d8ea94' },
  },
  {
    id: 'midnight-graphite',
    name: 'Midnight Stadium',
    tagline: 'Obsidian slate, emerald mint & lime signal',
    mode: 'dark',
    theory: 'Low-glare cool obsidian surfaces paired with crisp mint-lime hierarchy for night games.',
    swatches: { canvas: '#0e1514', surface: '#16211f', primary: '#48c9a0', accent: '#dcf288' },
  },
  {
    id: 'nordic-slate',
    name: 'Nordic Editorial',
    tagline: 'Crisp ice grey, cobalt navy & warm amber',
    mode: 'light',
    theory: 'Triadic cool-slate and cobalt clarity balanced by high-visibility amber accents.',
    swatches: { canvas: '#eef2f6', surface: '#ffffff', primary: '#1d4ed8', accent: '#fbbf24' },
  },
  {
    id: 'gridiron-amber',
    name: 'Floodlight Bronze',
    tagline: 'Espresso onyx, burnished gold & stadium teal',
    mode: 'dark',
    theory: 'Warm analogous bronze base paired with complementary cool teal data highlights.',
    swatches: { canvas: '#12100e', surface: '#1b1714', primary: '#e5a93c', accent: '#3fb8af' },
  },
  {
    id: 'crimson-playbook',
    name: 'Classic Playbook',
    tagline: 'Chalk parchment, deep garnet & varsity navy',
    mode: 'light',
    theory: 'Editorial garnet and coach navy anchoring high-contrast championship typography.',
    swatches: { canvas: '#f6f1ea', surface: '#fffdfb', primary: '#8c2732', accent: '#e7c370' },
  },
  {
    id: 'emerald-turf',
    name: 'Night Turf',
    tagline: 'Deep stadium turf, spring emerald & yard-line gold',
    mode: 'dark',
    theory: 'Monochromatic field-turf depth illuminated by crisp spring emerald and gold peaks.',
    swatches: { canvas: '#0b1612', surface: '#12231c', primary: '#34d399', accent: '#fde047' },
  },
];

const STORAGE_KEYS = {
  theme: 'ch_theme_id',
  followSystem: 'ch_follow_system_theme',
  defaultRoute: 'ch_default_route',
  compactDensity: 'ch_compact_density',
  reduceMotion: 'ch_reduce_motion',
  wpAlerts: 'ch_wp_alerts',
  wpSound: 'ch_wp_sound',
  wpInterval: 'ch_wp_interval_sec',
} as const;

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  readonly themes = CLUBHOUSE_THEMES;

  readonly themeId = signal<AppThemeId>(this.readTheme());
  readonly followSystemTheme = signal<boolean>(this.readBool(STORAGE_KEYS.followSystem, false));
  readonly systemPrefersDark = signal<boolean>(this.detectSystemDark());
  readonly defaultRoute = signal<DefaultHomeRoute>(this.readDefaultRoute());
  readonly compactDensity = signal<boolean>(this.readBool(STORAGE_KEYS.compactDensity, false));
  readonly reduceMotion = signal<boolean>(this.readBool(STORAGE_KEYS.reduceMotion, false));
  readonly watchPartyAlerts = signal<boolean>(this.readBool(STORAGE_KEYS.wpAlerts, true));
  readonly watchPartySound = signal<boolean>(this.readBool(STORAGE_KEYS.wpSound, false));
  readonly watchPartyIntervalSec = signal<RefreshIntervalSec>(this.readInterval());

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e: MediaQueryListEvent) => this.systemPrefersDark.set(e.matches);
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onChange);
      }
    }

    effect(() => {
      const effectiveTheme = this.resolveActiveTheme();
      const compact = this.compactDensity();
      const reduced = this.reduceMotion();

      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.setAttribute('data-theme', effectiveTheme);
        root.setAttribute('data-density', compact ? 'compact' : 'comfortable');
        if (reduced) {
          root.setAttribute('data-motion', 'reduced');
        } else {
          root.removeAttribute('data-motion');
        }
      }
    });
  }

  resolveActiveTheme(): AppThemeId {
    const selected = this.themeId();
    if (!this.followSystemTheme()) return selected;
    const wantDark = this.systemPrefersDark();
    const def = CLUBHOUSE_THEMES.find((t) => t.id === selected);
    if (def && (def.mode === 'dark') === wantDark) {
      return selected;
    }
    return wantDark ? 'midnight-graphite' : 'porcelain-jade';
  }

  setTheme(id: AppThemeId): void {
    this.themeId.set(id);
    this.writeString(STORAGE_KEYS.theme, id);
  }

  setFollowSystemTheme(enabled: boolean): void {
    this.followSystemTheme.set(enabled);
    this.writeBool(STORAGE_KEYS.followSystem, enabled);
  }

  setDefaultRoute(route: DefaultHomeRoute): void {
    this.defaultRoute.set(route);
    this.writeString(STORAGE_KEYS.defaultRoute, route);
  }

  setCompactDensity(enabled: boolean): void {
    this.compactDensity.set(enabled);
    this.writeBool(STORAGE_KEYS.compactDensity, enabled);
  }

  setReduceMotion(enabled: boolean): void {
    this.reduceMotion.set(enabled);
    this.writeBool(STORAGE_KEYS.reduceMotion, enabled);
  }

  setWatchPartyAlerts(enabled: boolean): void {
    this.watchPartyAlerts.set(enabled);
    this.writeBool(STORAGE_KEYS.wpAlerts, enabled);
  }

  setWatchPartySound(enabled: boolean): void {
    this.watchPartySound.set(enabled);
    this.writeBool(STORAGE_KEYS.wpSound, enabled);
  }

  setWatchPartyIntervalSec(sec: RefreshIntervalSec): void {
    this.watchPartyIntervalSec.set(sec);
    this.writeString(STORAGE_KEYS.wpInterval, String(sec));
  }

  resetAllPreferences(): void {
    this.setTheme('porcelain-jade');
    this.setFollowSystemTheme(false);
    this.setDefaultRoute('/');
    this.setCompactDensity(false);
    this.setReduceMotion(false);
    this.setWatchPartyAlerts(true);
    this.setWatchPartySound(false);
    this.setWatchPartyIntervalSec(10);
  }

  private detectSystemDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private readTheme(): AppThemeId {
    const raw = this.readString(STORAGE_KEYS.theme);
    const match = CLUBHOUSE_THEMES.find((t) => t.id === raw);
    return match ? match.id : 'porcelain-jade';
  }

  private readDefaultRoute(): DefaultHomeRoute {
    const raw = this.readString(STORAGE_KEYS.defaultRoute);
    if (
      raw === '/' ||
      raw === '/watch-party' ||
      raw === '/matchups' ||
      raw === '/standings' ||
      raw === '/recaps'
    ) {
      return raw;
    }
    return '/';
  }

  private readInterval(): RefreshIntervalSec {
    const raw = Number(this.readString(STORAGE_KEYS.wpInterval));
    if (raw === 10 || raw === 20 || raw === 30) return raw;
    return 10;
  }

  private readBool(key: string, fallback: boolean): boolean {
    const raw = this.readString(key);
    return raw === null ? fallback : raw === 'true';
  }

  private writeBool(key: string, value: boolean): void {
    this.writeString(key, value ? 'true' : 'false');
  }

  private readString(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeString(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  }
}
