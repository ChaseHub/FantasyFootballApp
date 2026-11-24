import { TeamSummary } from '../models/sleeper.models';

export interface PlayoffProbabilityRow {
  rosterId: number;
  teamName: string;
  currentRecord: string;
  currentRank: number;
  ppg: number;
  stdDev: number;
  playoffPct: number;
  byePct: number;
  titlePct: number;
  projWins: number;
  projLosses: number;
  avgSeed: number;
  statusTag: 'Clinched' | 'Strong Lock' | 'Contender' | 'Bubble' | 'Long Shot' | 'Eliminated';
}

export interface PlayoffSimulationResult {
  trials: number;
  remainingWeeks: number;
  hasByeSlots: boolean;
  rows: PlayoffProbabilityRow[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rand: () => number, mean: number, std: number): number {
  const u1 = Math.max(1e-7, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(25, mean + z * std);
}

function buildFallbackRoundRobin(rosterIds: number[], weekSeed: number): Array<[number, number]> {
  const n = rosterIds.length;
  if (n < 2) return [];
  const arr = [...rosterIds];
  if (arr.length % 2 === 1) arr.push(-1);
  const len = arr.length;
  const rot = ((weekSeed % (len - 1)) + (len - 1)) % (len - 1);

  for (let r = 0; r < rot; r++) {
    const fixed = arr[0];
    const last = arr.pop()!;
    arr.splice(1, 0, last);
    arr[0] = fixed;
  }

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < len / 2; i++) {
    const a = arr[i];
    const b = arr[len - 1 - i];
    if (a !== -1 && b !== -1) pairs.push([a, b]);
  }
  return pairs;
}

/**
 * Runs a fast deterministic Monte Carlo simulation across remaining regular-season
 * matchups and single-elimination playoffs to estimate Playoff %, Bye %, and Title %.
 */
export function runPlayoffMonteCarlo(
  teams: TeamSummary[],
  futureSchedule: Record<number, Array<[number, number]>>,
  playoffTeamsCount: number,
  playoffStartWeek: number,
  completedWeek: number,
  trials = 2500,
  seedOffset = 1,
): PlayoffSimulationResult | null {
  if (teams.length < 2) return null;

  const cut = Math.min(teams.length, Math.max(2, playoffTeamsCount));
  const remWeeksCount = Math.max(0, playoffStartWeek - completedWeek - 1);
  const totalPf = teams.reduce((s, t) => s + t.pointsFor, 0);
  const totalGames = teams.reduce((s, t) => s + t.wins + t.losses + t.ties, 0);
  const leagueAvgPpg = totalGames > 0 ? totalPf / totalGames : 115;

  const profiles = teams.map((t) => {
    const g = t.wins + t.losses + t.ties;
    const mean = g > 0 ? t.pointsFor / g : leagueAvgPpg;
    const stdDev = Math.max(16, t.stdDevScore >= 8 ? t.stdDevScore : 21);
    return {
      team: t,
      rosterId: t.rosterId,
      baseWins: t.wins + t.ties * 0.5,
      basePf: t.pointsFor,
      mean,
      stdDev,
    };
  });

  const idxByRoster = new Map<number, number>(profiles.map((p, i) => [p.rosterId, i]));
  const rosterIds = profiles.map((p) => p.rosterId);

  const remainingSchedules: Array<Array<[number, number]>> = [];
  for (let wk = completedWeek + 1; wk < playoffStartWeek; wk++) {
    const realPairs = futureSchedule[wk];
    if (realPairs && realPairs.length > 0) {
      remainingSchedules.push(realPairs);
    } else {
      remainingSchedules.push(buildFallbackRoundRobin(rosterIds, wk));
    }
  }

  // Compute bye count (e.g. 6 teams in an 8-slot bracket = 2 byes; 4 or 8 = 0 byes)
  const bracketSlots = Math.pow(2, Math.ceil(Math.log2(cut)));
  const byeCount = cut < bracketSlots ? bracketSlots - cut : 0;

  const n = profiles.length;
  const playoffHits = new Float64Array(n);
  const byeHits = new Float64Array(n);
  const titleHits = new Float64Array(n);
  const sumWins = new Float64Array(n);
  const sumSeeds = new Float64Array(n);

  const rand = mulberry32(424242 + teams.length * 97 + completedWeek * 13 + seedOffset);
  const simWins = new Float64Array(n);
  const simPf = new Float64Array(n);
  const order = Array.from({ length: n }, (_, i) => i);

  for (let tr = 0; tr < trials; tr++) {
    for (let i = 0; i < n; i++) {
      simWins[i] = profiles[i].baseWins;
      simPf[i] = profiles[i].basePf;
    }

    for (const pairs of remainingSchedules) {
      for (const [ra, rb] of pairs) {
        const ia = idxByRoster.get(ra);
        const ib = idxByRoster.get(rb);
        if (ia === undefined || ib === undefined) continue;
        const sa = sampleNormal(rand, profiles[ia].mean, profiles[ia].stdDev);
        const sb = sampleNormal(rand, profiles[ib].mean, profiles[ib].stdDev);
        simPf[ia] += sa;
        simPf[ib] += sb;
        if (sa > sb) simWins[ia] += 1;
        else if (sb > sa) simWins[ib] += 1;
        else {
          simWins[ia] += 0.5;
          simWins[ib] += 0.5;
        }
      }
    }

    order.sort((a, b) => simWins[b] - simWins[a] || simPf[b] - simPf[a]);

    for (let s = 0; s < n; s++) {
      const idx = order[s];
      sumWins[idx] += simWins[idx];
      sumSeeds[idx] += s + 1;
      if (s < cut) playoffHits[idx] += 1;
      if (byeCount > 0 && s < byeCount) byeHits[idx] += 1;
    }

    // Single-elimination playoff bracket simulation from Top `cut` seeds
    let roundSeeds: Array<number | null> = order.slice(0, cut);
    if (byeCount > 0) {
      // Standard NFL-style seeded bracket ordering for 6 teams -> Round 1: (3v6, 4v5) while (1,2) wait
      const round1: number[] = [];
      for (let i = byeCount; i < cut; i++) {
        round1.push(roundSeeds[i]!);
      }
      const nextRound: number[] = [];
      for (let i = 0; i < byeCount; i++) {
        nextRound.push(roundSeeds[i]!);
      }
      for (let m = 0; m < round1.length / 2; m++) {
        const high = round1[m];
        const low = round1[round1.length - 1 - m];
        const sH = sampleNormal(rand, profiles[high].mean, profiles[high].stdDev);
        const sL = sampleNormal(rand, profiles[low].mean, profiles[low].stdDev);
        nextRound.push(sH >= sL ? high : low);
      }
      roundSeeds = nextRound;
    }

    while (roundSeeds.length > 1) {
      const winners: number[] = [];
      for (let m = 0; m < roundSeeds.length / 2; m++) {
        const a = roundSeeds[m]!;
        const b = roundSeeds[roundSeeds.length - 1 - m]!;
        const sa = sampleNormal(rand, profiles[a].mean, profiles[a].stdDev);
        const sb = sampleNormal(rand, profiles[b].mean, profiles[b].stdDev);
        winners.push(sa >= sb ? a : b);
      }
      roundSeeds = winners;
    }

    if (roundSeeds[0] !== null && roundSeeds[0] !== undefined) {
      titleHits[roundSeeds[0]] += 1;
    }
  }

  const totalRegGames = completedWeek + remWeeksCount;
  const rows: PlayoffProbabilityRow[] = profiles.map((p, i) => {
    const playoffPct = Math.round((playoffHits[i] / trials) * 1000) / 10;
    const byePct = Math.round((byeHits[i] / trials) * 1000) / 10;
    const titlePct = Math.round((titleHits[i] / trials) * 1000) / 10;
    const projWins = Math.round((sumWins[i] / trials) * 10) / 10;
    const refTotalGames = Math.max(totalRegGames, p.team.wins + p.team.losses + remWeeksCount);
    const projLosses = Math.max(0, Math.round((refTotalGames - projWins) * 10) / 10);
    const avgSeed = Math.round((sumSeeds[i] / trials) * 10) / 10;

    let statusTag: PlayoffProbabilityRow['statusTag'];
    if (playoffPct >= 99.9) statusTag = 'Clinched';
    else if (playoffPct >= 85) statusTag = 'Strong Lock';
    else if (playoffPct >= 55) statusTag = 'Contender';
    else if (playoffPct >= 20) statusTag = 'Bubble';
    else if (playoffPct > 0) statusTag = 'Long Shot';
    else statusTag = 'Eliminated';

    return {
      rosterId: p.rosterId,
      teamName: p.team.teamName,
      currentRecord: p.team.recordLabel,
      currentRank: p.team.standingsRank,
      ppg: Math.round(p.mean * 10) / 10,
      stdDev: Math.round(p.stdDev * 10) / 10,
      playoffPct,
      byePct,
      titlePct,
      projWins,
      projLosses,
      avgSeed,
      statusTag,
    };
  });

  rows.sort(
    (a, b) =>
      b.playoffPct - a.playoffPct ||
      b.titlePct - a.titlePct ||
      b.projWins - a.projWins ||
      a.avgSeed - b.avgSeed,
  );

  return {
    trials,
    remainingWeeks: remWeeksCount,
    hasByeSlots: byeCount > 0,
    rows,
  };
}
