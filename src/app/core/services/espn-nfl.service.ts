import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  mapEspnEventToGameCard,
  mapEspnPlay,
  mapEspnSummaryToDetail,
  mergeEspnPlayLists,
  normalizeNflAbbr,
} from '../analytics/espn-mappers';
import {
  GameState,
  NflGameCard,
  NflGameDetail,
  NflPlayItem,
  RawEspnScoreboard,
  RawEspnSummary,
} from '../models/espn.models';

export { groupGamesBySlate, normalizeNflAbbr } from '../analytics/espn-mappers';
export type {
  GameState,
  NflDriveSummary,
  NflGameCard,
  NflGameDetail,
  NflGameLeader,
  NflPlayItem,
  NflPlayParticipant,
  NflScoringPlay,
  NflSituation,
  NflTeamSide,
  NflTeamStatRow,
  NflTimeSlate,
} from '../models/espn.models';

const ESPN_DIRECT_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_PROXY_BASE = '/espn-nfl';
const ESPN_CORE_DIRECT_BASE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const ESPN_CORE_PROXY_BASE = '/espn-core';
const WP_STORAGE_KEY = 'clubhouse_wp_game_cache_v1';
const WP_STORAGE_MAX_GAMES = 18;

@Injectable({ providedIn: 'root' })
export class EspnNflService {
  private readonly http = inject(HttpClient);

  private readonly _games = signal<NflGameCard[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _detail = signal<NflGameDetail | null>(null);
  private readonly _detailLoading = signal<boolean>(false);
  private readonly _lastUpdatedTime = signal<string>('');
  private readonly _loadedKey = signal<string>('');
  private readonly _scoreboardsByKey = signal<Record<string, NflGameCard[]>>({});
  private readonly _detailsByEventId = signal<Record<string, NflGameDetail>>({});

  private readonly scoreboardCache = new Map<string, NflGameCard[]>();
  private readonly detailCache = new Map<string, NflGameDetail>();

  constructor() {
    this.hydrateStoredDetails();
  }

  readonly games = this._games.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly detail = this._detail.asReadonly();
  readonly detailLoading = this._detailLoading.asReadonly();
  readonly lastUpdatedTime = this._lastUpdatedTime.asReadonly();
  readonly loadedKey = this._loadedKey.asReadonly();
  readonly detailsByEventId = this._detailsByEventId.asReadonly();

  async loadScoreboard(season: string, week: number, force = false): Promise<void> {
    const safeWeek = Math.max(1, Math.min(23, week));
    const isPost = safeWeek > 18;
    const seasonType = isPost ? 3 : 2;
    const espnWeek = isPost ? safeWeek - 18 : safeWeek;
    const key = `${season}-${seasonType}-${espnWeek}`;

    if (!force && this.scoreboardCache.has(key)) {
      this._games.set(this.scoreboardCache.get(key) ?? []);
      this._loadedKey.set(key);
      this._error.set(null);
      return;
    }

    this._loading.set(true);
    this._error.set(null);

    try {
      const path = `/scoreboard?seasontype=${seasonType}&week=${espnWeek}&dates=${encodeURIComponent(season)}`;
      const raw = await this.fetchEspn<RawEspnScoreboard>(path);
      const parsed = (raw?.events ?? [])
        .map((ev) => mapEspnEventToGameCard(ev))
        .filter((g): g is NflGameCard => g !== null);

      const orderRank: Record<GameState, number> = { in: 0, pre: 1, post: 2 };
      parsed.sort(
        (a, b) => orderRank[a.state] - orderRank[b.state] || a.dateIso.localeCompare(b.dateIso),
      );

      this.scoreboardCache.set(key, parsed);
      this._scoreboardsByKey.update((cur) => ({ ...cur, [key]: parsed }));
      this._games.set(parsed);
      this._loadedKey.set(key);
      this._lastUpdatedTime.set(this.formatTime(new Date()));
    } catch {
      this._error.set('Unable to load live NFL games from ESPN right now.');
    } finally {
      this._loading.set(false);
    }
  }

  getTeamGame(nflTeam: string, season: string, week: number): NflGameCard | null {
    if (!nflTeam || !season || week <= 0) return null;
    const norm = normalizeNflAbbr(nflTeam);
    if (!norm || norm === 'FA') return null;

    const safeWeek = Math.max(1, Math.min(23, week));
    const isPost = safeWeek > 18;
    const key = `${season}-${isPost ? 3 : 2}-${isPost ? safeWeek - 18 : safeWeek}`;
    const games = this._scoreboardsByKey()[key];
    if (!games) return null;

    return games.find((g) => g.away.normalizedAbbr === norm || g.home.normalizedAbbr === norm) ?? null;
  }

  getMatchupGameStatus(
    nflTeam: string,
    season: string,
    week: number,
  ): { state: GameState; label: string; isRedZone: boolean; hasPossession: boolean } | null {
    const game = this.getTeamGame(nflTeam, season, week);
    if (!game || game.state === 'pre') return null;

    const scoreText = `${game.away.abbr} ${game.away.score}-${game.home.score} ${game.home.abbr}`;
    if (game.state === 'post') {
      return {
        state: 'post',
        label: `Final · ${scoreText}`,
        isRedZone: false,
        hasPossession: false,
      };
    }

    const norm = normalizeNflAbbr(nflTeam);
    const qtrText = game.statusDetail || (game.period > 0 ? `Q${game.period} ${game.clock}` : 'Live');
    const teamSide = game.away.normalizedAbbr === norm ? game.away : game.home;
    const hasPossession = game.situation?.possessionTeamId === teamSide.id;
    const isRedZone = Boolean(hasPossession && game.situation?.isRedZone);

    return {
      state: 'in',
      label: `${scoreText} · ${qtrText}`,
      isRedZone,
      hasPossession,
    };
  }

  getLiveTeamGame(
    nflTeam: string,
    season: string,
    week: number,
  ): { label: string; isRedZone: boolean; hasPossession: boolean } | null {
    const status = this.getMatchupGameStatus(nflTeam, season, week);
    if (!status || status.state !== 'in') return null;
    return {
      label: status.label,
      isRedZone: status.isRedZone,
      hasPossession: status.hasPossession,
    };
  }

  async loadGameDetail(
    eventId: string,
    teamMapById?: Record<string, string>,
    force = false,
  ): Promise<void> {
    if (!eventId) {
      this._detail.set(null);
      return;
    }

    if (!force && this.detailCache.has(eventId)) {
      const cached = this.detailCache.get(eventId) ?? null;
      this._detail.set(cached);
      if (cached) {
        this._detailsByEventId.update((cur) => ({ ...cur, [eventId]: cached }));
      }
      return;
    }

    this._detailLoading.set(true);

    try {
      const raw = await this.fetchEspn<RawEspnSummary>(
        `/summary?event=${encodeURIComponent(eventId)}`,
      );
      const mapped = mapEspnSummaryToDetail(eventId, raw ?? {}, teamMapById ?? {});
      this.detailCache.set(eventId, mapped);
      this._detailsByEventId.update((cur) => ({ ...cur, [eventId]: mapped }));
      this._detail.set(mapped);
      this._lastUpdatedTime.set(this.formatTime(new Date()));
    } catch {
      this._detail.set(null);
    } finally {
      this._detailLoading.set(false);
    }
  }

  async fetchEventDetailCached(
    eventId: string,
    teamMapById?: Record<string, string>,
    force = false,
    isGameFinal = false,
  ): Promise<NflGameDetail | null> {
    if (!eventId) return null;

    const existing = this.detailCache.get(eventId) ?? null;

    if (existing && (existing.finalized || (isGameFinal && existing.hasFullTimeline))) {
      if (isGameFinal && !existing.finalized) {
        const finalizedDetail: NflGameDetail = { ...existing, finalized: true };
        this.saveDetailCache(eventId, finalizedDetail);
        return finalizedDetail;
      }
      this._detailsByEventId.update((cur) =>
        cur[eventId] === existing ? cur : { ...cur, [eventId]: existing },
      );
      return existing;
    }

    if (!force && existing?.hasFullTimeline) {
      this._detailsByEventId.update((cur) =>
        cur[eventId] === existing ? cur : { ...cur, [eventId]: existing },
      );
      return existing;
    }

    const needsBackfill = !existing?.hasFullTimeline;

    try {
      const [rawSummary, corePlays] = await Promise.all([
        this.fetchEspn<RawEspnSummary>(`/summary?event=${encodeURIComponent(eventId)}`),
        needsBackfill
          ? this.fetchCoreFullPlays(eventId, teamMapById ?? {})
          : Promise.resolve([] as NflPlayItem[]),
      ]);

      const mapped = mapEspnSummaryToDetail(eventId, rawSummary ?? {}, teamMapById ?? {});
      const combinedIncoming =
        corePlays.length > 0 ? mergeEspnPlayLists(mapped.allPlays, corePlays) : mapped.allPlays;
      const mergedPlays = existing ? mergeEspnPlayLists(combinedIncoming, existing.allPlays) : combinedIncoming;

      const merged: NflGameDetail = {
        ...mapped,
        finalized: isGameFinal,
        hasFullTimeline: true,
        allPlays: mergedPlays,
        recentPlays: mergedPlays.slice(0, 16),
      };
      this.saveDetailCache(eventId, merged);
      return merged;
    } catch {
      return existing;
    }
  }

  private async fetchCoreFullPlays(
    eventId: string,
    teamMapById: Record<string, string>,
  ): Promise<NflPlayItem[]> {
    const query = `/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(eventId)}/plays?limit=400`;
    try {
      const res = await this.fetchUrlWithFallback<{
        items?: Array<{
          id?: string;
          sequenceNumber?: string | number;
          type?: { text?: string };
          period?: { number?: number };
          clock?: { displayValue?: string };
          team?: { id?: string; abbreviation?: string; $ref?: string };
          start?: { downDistanceText?: string; shortDownDistanceText?: string };
          text?: string;
          statYardage?: number;
          scoringPlay?: boolean;
        }>;
      }>(`${ESPN_CORE_PROXY_BASE}${query}`, `${ESPN_CORE_DIRECT_BASE}${query}`);

      return (res?.items ?? []).map((item, idx) => {
        const refMatch = item.team?.$ref?.match(/\/teams\/(\d+)/);
        const extractedId = item.team?.id ?? (refMatch ? refMatch[1] : undefined);
        return mapEspnPlay(
          {
            id: item.id,
            sequenceNumber: item.sequenceNumber,
            type: item.type,
            period: item.period,
            clock: item.clock,
            team: extractedId
              ? { id: extractedId, abbreviation: item.team?.abbreviation }
              : item.team,
            start: item.start,
            text: item.text,
            statYardage: item.statYardage,
            scoringPlay: item.scoringPlay,
          },
          idx,
          teamMapById,
        );
      });
    } catch {
      return [];
    }
  }

  private saveDetailCache(eventId: string, detail: NflGameDetail): void {
    this.detailCache.set(eventId, detail);
    this._detailsByEventId.update((cur) => ({ ...cur, [eventId]: detail }));
    this.persistDetailsToStorage();
  }

  private hydrateStoredDetails(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(WP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, NflGameDetail>;
      if (!parsed || typeof parsed !== 'object') return;
      const initial: Record<string, NflGameDetail> = {};
      for (const [id, detail] of Object.entries(parsed)) {
        if (detail && Array.isArray(detail.allPlays)) {
          this.detailCache.set(id, detail);
          initial[id] = detail;
        }
      }
      if (Object.keys(initial).length > 0) {
        this._detailsByEventId.set(initial);
      }
    } catch {
      // Ignore corrupt storage entries
    }
  }

  private persistDetailsToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const entries = Array.from(this.detailCache.entries()).slice(-WP_STORAGE_MAX_GAMES);
      const record: Record<string, NflGameDetail> = {};
      for (const [id, detail] of entries) {
        record[id] = detail;
      }
      window.localStorage.setItem(WP_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Ignore storage quota issues
    }
  }

  private async fetchEspn<T>(pathAndQuery: string): Promise<T> {
    return this.fetchUrlWithFallback<T>(
      `${ESPN_PROXY_BASE}${pathAndQuery}`,
      `${ESPN_DIRECT_BASE}${pathAndQuery}`,
    );
  }

  private async fetchUrlWithFallback<T>(proxyUrl: string, directUrl: string): Promise<T> {
    const isLocalDev =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalDev) {
      try {
        return await firstValueFrom(this.http.get<T>(proxyUrl));
      } catch {
        return await firstValueFrom(this.http.get<T>(directUrl));
      }
    }

    return await firstValueFrom(this.http.get<T>(directUrl));
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
