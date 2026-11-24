import { WatchPartyPlayEvent } from './watch-party-engine';

export interface WatchPartyAlertBanner {
  id: string;
  kind: 'TD' | 'TO' | 'BIG' | 'RZ';
  title: string;
  detail: string;
  fantasyTeam: string;
  pointsDelta: number | null;
  logo: string | null;
  createdAtMs: number;
}

export interface WatchPartyDriveSnapshot {
  gameId: string;
  logo: string | null;
  shortName: string;
  downDistance: string;
  isRedZone: boolean;
  startersText: string;
}

/**
 * Compares incoming live plays and Red Zone drives against previously acknowledged IDs
 * so only genuinely new high-impact events trigger alert banners.
 */
export function detectNewWatchPartyAlerts(
  seenPlayIds: Set<string>,
  seenRzGameIds: Set<string>,
  homeEvents: WatchPartyPlayEvent[],
  awayEvents: WatchPartyPlayEvent[],
  homeTeamName: string,
  awayTeamName: string | null,
  activeDrives: WatchPartyDriveSnapshot[],
): WatchPartyAlertBanner[] {
  const alerts: WatchPartyAlertBanner[] = [];
  const now = Date.now();

  const inspectPlays = (events: WatchPartyPlayEvent[], teamLabel: string) => {
    for (const ev of events) {
      if (seenPlayIds.has(ev.id)) continue;
      seenPlayIds.add(ev.id);

      if (ev.importance === 'touchdown' || ev.importance === 'turnover' || ev.importance === 'big') {
        const kind: WatchPartyAlertBanner['kind'] =
          ev.importance === 'touchdown' ? 'TD' : ev.importance === 'turnover' ? 'TO' : 'BIG';
        alerts.push({
          id: `play-${ev.id}`,
          kind,
          title: `${ev.playerName} · ${ev.tagLabel ?? kind}`,
          detail: ev.text,
          fantasyTeam: teamLabel,
          pointsDelta: ev.pointsDelta,
          logo: ev.teamLogo,
          createdAtMs: now,
        });
      }
    }
  };

  inspectPlays(homeEvents, homeTeamName);
  if (awayTeamName) {
    inspectPlays(awayEvents, awayTeamName);
  }

  for (const drv of activeDrives) {
    if (!drv.isRedZone) {
      seenRzGameIds.delete(drv.gameId);
      continue;
    }
    if (seenRzGameIds.has(drv.gameId)) continue;
    seenRzGameIds.add(drv.gameId);

    alerts.push({
      id: `rz-${drv.gameId}`,
      kind: 'RZ',
      title: `Red Zone Threat · ${drv.startersText}`,
      detail: `${drv.shortName} · ${drv.downDistance}`,
      fantasyTeam: 'Live Drive Alert',
      pointsDelta: null,
      logo: drv.logo,
      createdAtMs: now,
    });
  }

  return alerts;
}

/**
 * Plays a gentle two-tone chime via Web Audio API when sound alerts are enabled.
 */
export function playAlertChime(kind: WatchPartyAlertBanner['kind']): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const notes = kind === 'TD' ? [587.33, 880] : kind === 'TO' ? [349.23, 277.18] : [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  } catch {
    // Audio playback may be blocked until user gesture
  }
}
