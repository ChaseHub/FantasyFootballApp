import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlayerMeta } from '../models/sleeper.models';

interface RawSleeperPlayer {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  injury_status?: string | null;
  injury_body_part?: string | null;
  age?: number | null;
  years_exp?: number | null;
  number?: number | null;
  college?: string | null;
  depth_chart_order?: number | null;
}

interface CachedPlayersRecord {
  savedAt: number;
  players: Record<string, PlayerMeta>;
}

const PLAYERS_ENDPOINT = 'https://api.sleeper.app/v1/players/nfl';
const IDB_NAME = 'clubhouse_sleeper_db';
const IDB_STORE = 'cache';
const IDB_KEY = 'nfl_players_v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

@Injectable({ providedIn: 'root' })
export class SleeperPlayersService {
  private readonly http = inject(HttpClient);

  private readonly _players = signal<Record<string, PlayerMeta>>({});
  private readonly _loading = signal<boolean>(false);
  private readonly _ready = signal<boolean>(false);

  readonly players = this._players.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly ready = this._ready.asReadonly();

  private inFlight: Promise<void> | null = null;
  private liveLoaded = false;

  resolvePlayer(playerId: string): PlayerMeta {
    const known = this._players()[playerId];
    if (known) return known;

    if (/^[A-Z]{2,3}$/.test(playerId)) {
      return {
        id: playerId,
        name: `${playerId} Defense`,
        position: 'DEF',
        nflTeam: playerId,
        injuryStatus: null,
      };
    }

    return {
      id: playerId,
      name: `Player #${playerId}`,
      position: '—',
      nflTeam: 'FA',
      injuryStatus: null,
    };
  }

  async ensureLoaded(): Promise<void> {
    if (this.liveLoaded) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.loadInternal().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async clearCache(): Promise<void> {
    this.liveLoaded = false;
    this._players.set({});
    this._ready.set(false);
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete(IDB_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        // ignore storage errors
      }
    }
  }

  private async loadInternal(): Promise<void> {
    this._loading.set(true);
    try {
      const cached = await this.readFromIndexedDb();
      if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        this._players.set(cached.players);
        this.liveLoaded = true;
        this._ready.set(true);
        return;
      }

      const raw = await firstValueFrom(
        this.http.get<Record<string, RawSleeperPlayer>>(PLAYERS_ENDPOINT),
      );

      if (raw && typeof raw === 'object') {
        const slim: Record<string, PlayerMeta> = {};
        for (const [id, entry] of Object.entries(raw)) {
          const pos = entry.position ?? '';
          if (!FANTASY_POSITIONS.has(pos)) continue;

          const name =
            entry.full_name?.trim() ||
            `${entry.first_name ?? ''} ${entry.last_name ?? ''}`.trim() ||
            (pos === 'DEF' ? `${id} Defense` : id);

          slim[id] = {
            id,
            name,
            position: pos,
            nflTeam: entry.team || (pos === 'DEF' ? id : 'FA'),
            injuryStatus: entry.injury_status ?? null,
            injuryBodyPart: entry.injury_body_part ?? null,
            age: typeof entry.age === 'number' ? entry.age : null,
            yearsExp: typeof entry.years_exp === 'number' ? entry.years_exp : null,
            jersey: typeof entry.number === 'number' ? entry.number : null,
            college: entry.college?.trim() || null,
            depthOrder: typeof entry.depth_chart_order === 'number' ? entry.depth_chart_order : null,
          };
        }

        this._players.set(slim);
        this.liveLoaded = true;
        this._ready.set(true);
        await this.writeToIndexedDb({ savedAt: Date.now(), players: slim });
      }
    } catch {
      // Fail gracefully — roster/player tables retain ID fallback
    } finally {
      this._loading.set(false);
    }
  }

  private async readFromIndexedDb(): Promise<CachedPlayersRecord | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
      const db = await this.openDb();
      return await new Promise<CachedPlayersRecord | null>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve((req.result as CachedPlayersRecord | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async writeToIndexedDb(record: CachedPlayersRecord): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(record, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore storage quota or private mode failures
    }
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
