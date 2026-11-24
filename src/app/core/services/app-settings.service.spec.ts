import { TestBed } from '@angular/core/testing';
import { AppSettingsService, CLUBHOUSE_THEMES } from './app-settings.service';

describe('AppSettingsService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-motion');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-motion');
  });

  it('provides 6 color-theory themes with default Classic light mode', () => {
    const service = TestBed.inject(AppSettingsService);
    expect(service.themes.length).toBe(6);
    expect(CLUBHOUSE_THEMES.map((t) => t.id)).toContain('midnight-graphite');
    expect(service.resolveActiveTheme()).toBe('porcelain-jade');
  });

  it('persists theme selection and syncs data attributes to documentElement', () => {
    const service = TestBed.inject(AppSettingsService);
    service.setTheme('midnight-graphite');
    TestBed.flushEffects();

    expect(service.themeId()).toBe('midnight-graphite');
    expect(service.followSystemTheme()).toBe(false);
    expect(localStorage.getItem('ch_theme_id')).toBe('midnight-graphite');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight-graphite');

    service.setCompactDensity(true);
    service.setReduceMotion(true);
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');

    service.resetAllPreferences();
    TestBed.flushEffects();
    expect(service.themeId()).toBe('porcelain-jade');
    expect(document.documentElement.getAttribute('data-theme')).toBe('porcelain-jade');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  it('updates Watch Party preferences and default landing route', () => {
    const service = TestBed.inject(AppSettingsService);
    service.setDefaultRoute('/matchups');
    service.setWatchPartyAlerts(false);
    service.setWatchPartySound(true);
    service.setWatchPartyIntervalSec(10);

    expect(service.defaultRoute()).toBe('/matchups');
    expect(service.watchPartyAlerts()).toBe(false);
    expect(service.watchPartySound()).toBe(true);
    expect(service.watchPartyIntervalSec()).toBe(10);
  });
});
