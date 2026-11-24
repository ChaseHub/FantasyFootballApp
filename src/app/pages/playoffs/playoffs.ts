import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type BracketRoundView,
  type PlayoffSimulationResult,
  SleeperService,
  type TeamSummary,
  runPlayoffMonteCarlo,
} from '../../core';
import { PageHeaderComponent } from '../../shared/ui';

type BracketKind = 'winners' | 'losers';

@Component({
  selector: 'app-playoffs',
  imports: [RouterLink, PageHeaderComponent],
  templateUrl: './playoffs.html',
  styleUrl: './playoffs.scss',
})
export class Playoffs {
  protected readonly sleeper = inject(SleeperService);

  protected readonly bracketKind = signal<BracketKind>('winners');
  protected readonly simSeed = signal(1);
  protected readonly futureSchedule = signal<Record<number, Array<[number, number]>>>({});
  protected readonly scheduleSynced = signal(false);
  protected readonly scheduleLoading = signal(false);
  protected readonly sandboxMode = signal(false);
  protected readonly sandboxPicks = signal<Record<string, number>>({});
  protected readonly mobileRoundIndex = signal(0);
  protected readonly myRosterId = computed(() => this.sleeper.myTeam()?.rosterId ?? null);

  protected readonly teamLookup = computed(() => {
    return new Map<number, TeamSummary>(this.sleeper.teams().map((t) => [t.rosterId, t]));
  });

  protected readonly hasOfficialBracket = computed(() => {
    const data = this.sleeper.dashboard();
    return Boolean(data && data.winnersBracket.length > 0);
  });

  protected readonly activeRounds = computed<BracketRoundView[]>(() => {
    if (!this.hasOfficialBracket()) {
      return this.sleeper.projectedBracketRounds();
    }
    return this.bracketKind() === 'winners'
      ? this.sleeper.winnersBracketRounds()
      : this.sleeper.losersBracketRounds();
  });

  protected readonly championInfo = computed(() => {
    if (!this.hasOfficialBracket()) return null;
    const rounds = this.sleeper.winnersBracketRounds();
    for (const r of rounds) {
      const titleGame = r.matchups.find((m) => m.placeGame === 1);
      if (titleGame && (titleGame.top.isWinner || titleGame.bottom.isWinner)) {
        const champ = titleGame.top.isWinner ? titleGame.top : titleGame.bottom;
        const runnerUp = titleGame.top.isWinner ? titleGame.bottom : titleGame.top;
        return { champ, runnerUp, week: titleGame.week };
      }
    }
    return null;
  });

  protected readonly seedingRows = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data) return [];
    const cut = data.league.settings?.playoff_teams ?? 4;
    const teams = [...data.teams].sort((a, b) => a.standingsRank - b.standingsRank);
    const bubbleTeam = teams[Math.min(cut - 1, teams.length - 1)];
    const bubbleWins = bubbleTeam?.wins ?? 0;
    const bubblePf = bubbleTeam?.pointsFor ?? 0;

    return teams.map((team) => {
      const hasBye = cut === 6 && team.standingsRank <= 2;
      const games = Math.max(1, team.wins + team.losses + team.ties);
      const status =
        team.standingsRank <= cut
          ? hasBye
            ? 'First-Round Bye'
            : 'In Playoffs'
          : team.wins >= bubbleWins - 1
            ? 'In the Hunt'
            : 'Chasing';
      return {
        team,
        hasBye,
        ppg: team.pointsFor / games,
        inPlayoffs: team.standingsRank <= cut,
        gamesBack: Math.max(0, bubbleWins - team.wins),
        pfDeltaFromCut: team.pointsFor - bubblePf,
        status,
      };
    });
  });

  protected readonly playoffSummary = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data || data.teams.length === 0) return null;

    const ordered = [...data.teams].sort((a, b) => a.standingsRank - b.standingsRank);
    const cut = Math.min(ordered.length, data.league.settings?.playoff_teams ?? 4);
    const topSeed = ordered[0];
    const bubbleSeed = ordered[Math.max(0, cut - 1)];
    const firstOut = ordered[cut] ?? null;

    return {
      cut,
      topSeed,
      bubbleSeed,
      firstOut,
      weeksRemaining: this.weeksUntilPlayoffs(),
      playoffStartWeek: data.league.settings?.playoff_week_start ?? 15,
    };
  });

  protected readonly tiebreakContenders = computed(() => {
    const rows = this.seedingRows();
    const sum = this.playoffSummary();
    if (!sum || rows.length === 0) return [];
    const startIdx = Math.max(0, sum.cut - 3);
    return rows.slice(startIdx, Math.min(rows.length, sum.cut + 3));
  });

  protected readonly weeksUntilPlayoffs = computed(() => {
    const data = this.sleeper.dashboard();
    if (!data) return 0;
    const start = data.league.settings?.playoff_week_start ?? 15;
    return Math.max(0, start - data.completedWeek - 1);
  });

  protected readonly playoffOdds = computed<PlayoffSimulationResult | null>(() => {
    const data = this.sleeper.dashboard();
    if (!data || data.teams.length < 2) return null;
    const cut = data.league.settings?.playoff_teams ?? 4;
    const startWk = data.league.settings?.playoff_week_start ?? 15;
    return runPlayoffMonteCarlo(
      data.teams,
      this.futureSchedule(),
      cut,
      startWk,
      data.completedWeek,
      2500,
      this.simSeed()
    );
  });

  protected readonly sandboxBracket = computed(() => {
    const rounds = this.activeRounds();
    const picks = this.sandboxPicks();
    const propagated = rounds.map((r) => ({
      ...r,
      matchups: r.matchups.map((m) => ({
        ...m,
        top: { ...m.top },
        bottom: { ...m.bottom },
      })),
    }));

    const pickByRound = (roundIdx: number, matchIdx: number) => {
      const m = propagated[roundIdx]?.matchups[matchIdx];
      if (!m) return null;
      const chosen = picks[`${propagated[roundIdx].round}-${m.matchId}`];
      if (chosen && (m.top.rosterId === chosen || m.bottom.rosterId === chosen)) {
        const picked = m.top.rosterId === chosen ? m.top : m.bottom;
        return { rosterId: picked.rosterId, teamName: picked.teamName, seed: picked.seed };
      }
      if (m.top.isWinner && m.top.rosterId) return m.top;
      if (m.bottom.isWinner && m.bottom.rosterId) return m.bottom;
      return null;
    };

    for (let r = 0; r < propagated.length; r++) {
      const cur = propagated[r];
      for (let mIdx = 0; mIdx < cur.matchups.length; mIdx++) {
        const match = cur.matchups[mIdx];
        const chosen = picks[`${cur.round}-${match.matchId}`];
        if (chosen && (match.top.rosterId === chosen || match.bottom.rosterId === chosen)) {
          match.top.isWinner = match.top.rosterId === chosen;
          match.bottom.isWinner = match.bottom.rosterId === chosen;
        }
        if (r + 1 < propagated.length) {
          const nextMatches = propagated[r + 1].matchups;
          const winner = pickByRound(r, mIdx);
          const targetIdx = Math.min(nextMatches.length - 1, Math.floor(mIdx / 2));
          const targetSlot = nextMatches[targetIdx];
          if (winner && targetSlot) {
            if (mIdx % 2 === 0 && !targetSlot.top.rosterId) {
              targetSlot.top.rosterId = winner.rosterId;
              targetSlot.top.teamName = winner.teamName;
              targetSlot.top.seed = winner.seed;
            } else if (!targetSlot.bottom.rosterId) {
              targetSlot.bottom.rosterId = winner.rosterId;
              targetSlot.bottom.teamName = winner.teamName;
              targetSlot.bottom.seed = winner.seed;
            }
          }
        }
      }
    }

    const lastRound = propagated[propagated.length - 1];
    const finalMatch = lastRound?.matchups.find((m) => m.placeGame === 1) ?? lastRound?.matchups[0];
    const sandboxChamp = finalMatch
      ? finalMatch.top.isWinner
        ? finalMatch.top
        : finalMatch.bottom.isWinner
          ? finalMatch.bottom
          : null
      : null;

    return { rounds: propagated, sandboxChamp };
  });

  protected readonly clampedMobileRoundIdx = computed(() => {
    const len = this.sandboxBracket().rounds.length;
    if (len === 0) return 0;
    return Math.min(this.mobileRoundIndex(), len - 1);
  });

  protected teamMeta(rosterId: number | null): TeamSummary | null {
    return rosterId !== null ? this.teamLookup().get(rosterId) ?? null : null;
  }

  protected teamPpg(rosterId: number | null): string | null {
    const t = this.teamMeta(rosterId);
    if (!t) return null;
    const games = Math.max(1, t.wins + t.losses + t.ties);
    return (t.pointsFor / games).toFixed(1);
  }

  protected setBracketKind(kind: BracketKind): void {
    this.bracketKind.set(kind);
    this.sandboxPicks.set({});
    this.mobileRoundIndex.set(0);
  }

  protected rerunMonteCarlo(): void {
    this.simSeed.update((n) => n + 1);
  }

  protected async syncFutureSchedule(): Promise<void> {
    const data = this.sleeper.dashboard();
    if (!data || this.scheduleLoading()) return;
    const startWk = data.league.settings?.playoff_week_start ?? 15;
    if (data.completedWeek + 1 >= startWk) return;
    this.scheduleLoading.set(true);
    try {
      const sched = await this.sleeper.fetchFutureScheduleMatchups(
        data.league.league_id,
        data.completedWeek + 1,
        startWk - 1
      );
      this.futureSchedule.set(sched);
      this.scheduleSynced.set(true);
    } finally {
      this.scheduleLoading.set(false);
    }
  }

  protected toggleSandboxMode(): void {
    const next = !this.sandboxMode();
    this.sandboxMode.set(next);
    if (!next) {
      this.sandboxPicks.set({});
    }
  }

  protected pickBracketWinner(round: number, matchId: number, rosterId: number | null): void {
    if (!this.sandboxMode() || !rosterId) return;
    const key = `${round}-${matchId}`;
    this.sandboxPicks.update((prev) => {
      const next = { ...prev };
      if (next[key] === rosterId) delete next[key];
      else next[key] = rosterId;
      return next;
    });
  }

  protected resetSandbox(): void {
    this.sandboxPicks.set({});
  }
}
