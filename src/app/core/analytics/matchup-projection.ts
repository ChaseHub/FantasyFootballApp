import { NflGameCard } from '../models/espn.models';
import { WeeklyMatchupCard, WeeklyMatchupSide } from '../models/sleeper.models';
import { EspnNflService } from '../services/espn-nfl.service';
import { SleeperService } from '../services/sleeper.service';

export interface MatchupOddsSummary {
  homeProj: number | null;
  awayProj: number | null;
  homeWinPct: number | null;
  awayWinPct: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function getGameRemainingFraction(game: NflGameCard | null, isOnBye: boolean): number {
  if (isOnBye) return 0;
  if (!game || game.state === 'pre') return 1;
  if (game.state === 'post') return 0;

  if (game.period > 4) return 0.04;
  const parts = game.clock.split(':');
  const mins = parts.length === 2 ? Number(parts[0]) || 0 : 0;
  const secs = parts.length === 2 ? Number(parts[1]) || 0 : 0;
  const qtrRemaining = Math.min(900, Math.max(0, mins * 60 + secs));
  const elapsed = Math.min(3600, Math.max(0, (Math.max(1, game.period) - 1) * 900 + (900 - qtrRemaining)));
  return Math.max(0.02, 1 - elapsed / 3600);
}

export function computeWinProbability(
  homeProj: number | null,
  awayProj: number | null,
  remainingFraction: number,
  isFinal: boolean,
  homePoints: number,
  awayPoints: number,
): { homeWinPct: number | null; awayWinPct: number | null } {
  if (isFinal) {
    const h = homePoints > awayPoints ? 100 : homePoints < awayPoints ? 0 : 50;
    return { homeWinPct: h, awayWinPct: 100 - h };
  }

  if (homeProj === null || awayProj === null) {
    return { homeWinPct: null, awayWinPct: null };
  }

  if (remainingFraction <= 0.005) {
    const h = homeProj > awayProj ? 100 : homeProj < awayProj ? 0 : 50;
    return { homeWinPct: h, awayWinPct: 100 - h };
  }

  const sigma = Math.max(4, 30 * Math.sqrt(Math.max(0.03, remainingFraction)));
  const prob = normalCdf((homeProj - awayProj) / sigma);
  const homeWinPct = Math.min(99, Math.max(1, Math.round(prob * 100)));
  return { homeWinPct, awayWinPct: 100 - homeWinPct };
}

function computeSideLiveProjection(
  side: WeeklyMatchupSide,
  sleeper: SleeperService,
  espn: EspnNflService,
  season: string,
  week: number,
): { totalProj: number | null; remainingFraction: number } {
  if (side.starterIds.length === 0) {
    return { totalProj: side.points > 0 ? side.points : null, remainingFraction: 1 };
  }

  let total = 0;
  let hasProjData = false;
  let sumRem = 0;
  let activeCount = 0;

  for (const id of side.starterIds) {
    const meta = sleeper.resolvePlayer(id);
    const onBye = sleeper.isPlayerOnBye(meta.nflTeam, season, week);
    const game = espn.getTeamGame(meta.nflTeam, season, week);
    const actual = side.playerPoints[id] ?? 0;
    const pregame = onBye ? 0 : sleeper.getPlayerProjection(id, season, week);
    const rem = getGameRemainingFraction(game, onBye);

    if (!onBye) {
      sumRem += rem;
      activeCount += 1;
    }

    if (pregame !== null) {
      hasProjData = true;
      if (game?.state === 'post') {
        total += actual;
      } else if (game?.state === 'in') {
        total += Math.max(actual, actual + pregame * rem);
      } else {
        total += Math.max(actual, pregame);
      }
    } else if (actual !== 0) {
      total += actual;
    }
  }

  const fallbackTotal = sleeper.getSideProjectedTotal(side.starterIds, season, week);
  const resolvedProj = hasProjData
    ? round2(Math.max(side.points, total))
    : fallbackTotal !== null
      ? round2(Math.max(side.points, fallbackTotal))
      : null;

  return {
    totalProj: resolvedProj,
    remainingFraction: activeCount > 0 ? sumRem / activeCount : 0,
  };
}

export function computeMatchupOdds(
  card: WeeklyMatchupCard,
  sleeper: SleeperService,
  espn: EspnNflService,
  season: string,
): MatchupOddsSummary {
  const h = computeSideLiveProjection(card.home, sleeper, espn, season, card.week);
  if (!card.away) {
    return {
      homeProj: h.totalProj,
      awayProj: null,
      homeWinPct: h.totalProj !== null ? 100 : null,
      awayWinPct: null,
    };
  }

  const a = computeSideLiveProjection(card.away, sleeper, espn, season, card.week);
  const combinedRem = (h.remainingFraction + a.remainingFraction) / 2;
  const isFinal = card.isCompleted || card.status === 'Final';
  const { homeWinPct, awayWinPct } = computeWinProbability(
    h.totalProj,
    a.totalProj,
    combinedRem,
    isFinal,
    card.home.points,
    card.away.points,
  );

  return {
    homeProj: h.totalProj,
    awayProj: a.totalProj,
    homeWinPct,
    awayWinPct,
  };
}
