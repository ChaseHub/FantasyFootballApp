import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RawSleeperStatRow,
  SleeperBracketMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from '../models/sleeper.models';

export const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

/**
 * Pure HTTP transport client for Sleeper's public REST APIs.
 * Keeps network endpoints and retry/fallback behavior isolated from signal state and analytics.
 */
@Injectable({ providedIn: 'root' })
export class SleeperApiClient {
  private readonly http = inject(HttpClient);

  fetchUser(username: string): Promise<SleeperUser | null> {
    return firstValueFrom(
      this.http.get<SleeperUser | null>(`${SLEEPER_API_BASE}/user/${encodeURIComponent(username)}`),
    );
  }

  fetchUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return firstValueFrom(
      this.http.get<SleeperLeague[]>(
        `${SLEEPER_API_BASE}/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
      ),
    );
  }

  fetchLeague(leagueId: string): Promise<SleeperLeague> {
    return firstValueFrom(
      this.http.get<SleeperLeague>(`${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}`),
    );
  }

  fetchLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    return firstValueFrom(
      this.http.get<SleeperLeagueUser[]>(
        `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/users`,
      ),
    );
  }

  fetchLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return firstValueFrom(
      this.http.get<SleeperRoster[]>(
        `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/rosters`,
      ),
    );
  }

  async fetchNflState(): Promise<SleeperNflState> {
    try {
      return await firstValueFrom(
        this.http.get<SleeperNflState>(`${SLEEPER_API_BASE}/state/nfl`),
      );
    } catch {
      return {
        season: String(new Date().getFullYear()),
        season_type: 'regular',
        week: 1,
        display_week: 1,
        leg: 1,
      };
    }
  }

  async fetchTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    try {
      const picks = await firstValueFrom(
        this.http.get<SleeperTradedPick[]>(
          `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/traded_picks`,
        ),
      );
      return picks ?? [];
    } catch {
      return [];
    }
  }

  async fetchBracket(
    leagueId: string,
    kind: 'winners_bracket' | 'losers_bracket',
  ): Promise<SleeperBracketMatchup[]> {
    try {
      const rows = await firstValueFrom(
        this.http.get<SleeperBracketMatchup[]>(
          `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/${kind}`,
        ),
      );
      return rows ?? [];
    } catch {
      return [];
    }
  }

  async fetchDrafts(leagueId: string): Promise<SleeperDraft[]> {
    try {
      const drafts = await firstValueFrom(
        this.http.get<SleeperDraft[]>(
          `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/drafts`,
        ),
      );
      return drafts ?? [];
    } catch {
      return [];
    }
  }

  async fetchDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    try {
      const picks = await firstValueFrom(
        this.http.get<SleeperDraftPick[]>(
          `${SLEEPER_API_BASE}/draft/${encodeURIComponent(draftId)}/picks`,
        ),
      );
      return picks ?? [];
    } catch {
      return [];
    }
  }

  fetchWeekMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return firstValueFrom(
      this.http.get<SleeperMatchup[]>(
        `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
      ),
    );
  }

  async fetchMatchupsRange(
    leagueId: string,
    maxWeek: number,
  ): Promise<Record<number, SleeperMatchup[]>> {
    const weeks = Array.from({ length: maxWeek }, (_, idx) => idx + 1);
    const results = await Promise.all(
      weeks.map(async (week) => {
        try {
          const data = await this.fetchWeekMatchups(leagueId, week);
          return [week, data ?? []] as const;
        } catch {
          return [week, [] as SleeperMatchup[]] as const;
        }
      }),
    );

    const matchupsByWeek: Record<number, SleeperMatchup[]> = {};
    for (const [week, rows] of results) {
      if (rows.length > 0 && rows.some((row) => row.matchup_id != null || (row.points ?? 0) > 0)) {
        matchupsByWeek[week] = rows;
      }
    }
    return matchupsByWeek;
  }

  async fetchTransactionsRange(leagueId: string, maxWeek: number): Promise<SleeperTransaction[]> {
    const rounds = Array.from({ length: maxWeek }, (_, idx) => idx + 1);
    const chunks = await Promise.all(
      rounds.map(async (round) => {
        try {
          const rows = await firstValueFrom(
            this.http.get<SleeperTransaction[]>(
              `${SLEEPER_API_BASE}/league/${encodeURIComponent(leagueId)}/transactions/${round}`,
            ),
          );
          return rows ?? [];
        } catch {
          return [] as SleeperTransaction[];
        }
      }),
    );

    const seen = new Set<string>();
    const merged: SleeperTransaction[] = [];
    for (const list of chunks) {
      for (const tx of list) {
        if (!seen.has(tx.transaction_id)) {
          seen.add(tx.transaction_id);
          merged.push(tx);
        }
      }
    }
    return merged;
  }

  async fetchFutureScheduleMatchups(
    leagueId: string,
    fromWeek: number,
    toWeek: number,
  ): Promise<Record<number, Array<[number, number]>>> {
    if (fromWeek > toWeek) return {};
    const weeks = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);
    const results = await Promise.all(
      weeks.map(async (wk) => {
        try {
          const rows = await this.fetchWeekMatchups(leagueId, wk);
          const byMatchup = new Map<number, number[]>();
          for (const row of rows ?? []) {
            if (row.matchup_id == null) continue;
            const list = byMatchup.get(row.matchup_id) ?? [];
            list.push(row.roster_id);
            byMatchup.set(row.matchup_id, list);
          }
          const pairs: Array<[number, number]> = [];
          for (const pair of byMatchup.values()) {
            if (pair.length >= 2) pairs.push([pair[0], pair[1]]);
          }
          return [wk, pairs] as const;
        } catch {
          return [wk, [] as Array<[number, number]>] as const;
        }
      }),
    );

    const schedule: Record<number, Array<[number, number]>> = {};
    for (const [wk, pairs] of results) {
      if (pairs.length > 0) schedule[wk] = pairs;
    }
    return schedule;
  }

  async fetchTrendingPlayers(): Promise<{ adds: Record<string, number>; drops: Record<string, number> }> {
    const [adds, drops] = await Promise.all([
      firstValueFrom(
        this.http.get<Array<{ player_id: string; count: number }>>(
          `${SLEEPER_API_BASE}/players/nfl/trending/add?lookback_hours=24&limit=40`,
        ),
      ),
      firstValueFrom(
        this.http.get<Array<{ player_id: string; count: number }>>(
          `${SLEEPER_API_BASE}/players/nfl/trending/drop?lookback_hours=24&limit=25`,
        ),
      ),
    ]);

    const addMap: Record<string, number> = {};
    for (const item of adds ?? []) {
      if (item.player_id) addMap[item.player_id] = item.count ?? 0;
    }
    const dropMap: Record<string, number> = {};
    for (const item of drops ?? []) {
      if (item.player_id) dropMap[item.player_id] = item.count ?? 0;
    }
    return { adds: addMap, drops: dropMap };
  }

  async fetchWeekProjections(
    season: string,
    week: number,
  ): Promise<RawSleeperStatRow[] | Record<string, RawSleeperStatRow> | null> {
    const query =
      `/${encodeURIComponent(season)}/${week}?season_type=regular` +
      '&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF';
    const directUrl = `https://api.sleeper.app/projections/nfl${query}`;
    const proxyUrl = `/sleeper-projections${query}`;

    const isLocalDev =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalDev) {
      try {
        return await firstValueFrom(
          this.http.get<RawSleeperStatRow[] | Record<string, RawSleeperStatRow>>(proxyUrl),
        );
      } catch {
        return await firstValueFrom(
          this.http.get<RawSleeperStatRow[] | Record<string, RawSleeperStatRow>>(directUrl),
        );
      }
    }

    return await firstValueFrom(
      this.http.get<RawSleeperStatRow[] | Record<string, RawSleeperStatRow>>(directUrl),
    );
  }

  async fetchSeasonNflStats(
    season: string,
  ): Promise<RawSleeperStatRow[] | Record<string, RawSleeperStatRow | Record<string, number>> | null> {
    const primaryUrl = `${SLEEPER_API_BASE}/stats/nfl/regular/${encodeURIComponent(season)}`;
    const fallbackUrl = `https://api.sleeper.app/stats/nfl/${encodeURIComponent(season)}?season_type=regular`;

    try {
      return await firstValueFrom(
        this.http.get<Record<string, RawSleeperStatRow | Record<string, number>>>(primaryUrl),
      );
    } catch {
      return await firstValueFrom(
        this.http.get<
          RawSleeperStatRow[] | Record<string, RawSleeperStatRow | Record<string, number>>
        >(fallbackUrl),
      );
    }
  }
}
