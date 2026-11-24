import { LeagueDashboardData, LeagueMoveItem, LeagueTradeCard, WeeklyMatchupCard } from '../models/sleeper.models';

export interface RecapAward {
  id: string;
  kicker: string;
  headline: string;
  detail: string;
  stat: string;
  rosterId: number | null;
}

export interface RecapBoomPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  fantasyTeamName: string;
  rosterId: number;
  points: number;
  wasStarted: boolean;
}

export interface WeeklyRecapDigest {
  week: number;
  leagueName: string;
  season: string;
  isCompleted: boolean;
  leagueAverage: number;
  totalPointsScored: number;
  highScore: { rosterId: number; teamName: string; points: number } | null;
  lowScore: { rosterId: number; teamName: string; points: number } | null;
  biggestBlowout: { winner: string; loser: string; margin: number; scoreLine: string; rosterId: number } | null;
  closestGame: { winner: string; loser: string; margin: number; scoreLine: string; rosterId: number } | null;
  heartbreaker: { teamName: string; points: number; lostTo: string; rosterId: number } | null;
  luckySneak: { teamName: string; points: number; beat: string; rosterId: number } | null;
  benchCurse: { teamName: string; benchPoints: number; starterPoints: number; rosterId: number } | null;
  boomPlayers: RecapBoomPlayer[];
  awards: RecapAward[];
  games: WeeklyMatchupCard[];
  trades: LeagueTradeCard[];
  topWaivers: LeagueMoveItem[];
  chatMarkdown: string;
}

export interface SeasonWeekChampionItem {
  week: number;
  teamName: string;
  rosterId: number;
  points: number;
  margin: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildWeeklyRecap(params: {
  week: number;
  dashboard: LeagueDashboardData;
  trades: LeagueTradeCard[];
  moves: LeagueMoveItem[];
  resolvePlayer: (id: string) => { name: string; position: string; nflTeam: string };
}): WeeklyRecapDigest | null {
  const { week, dashboard, trades, moves, resolvePlayer } = params;
  const games = dashboard.weeklyMatchups[week] ?? [];
  if (games.length === 0) return null;

  const isCompleted = games.some((g) => g.isCompleted);
  const sides: Array<{
    rosterId: number;
    teamName: string;
    points: number;
    won: boolean;
    lost: boolean;
    oppName: string;
  }> = [];

  for (const g of games) {
    sides.push({
      rosterId: g.home.rosterId,
      teamName: g.home.teamName,
      points: g.home.points,
      won: g.home.isWinner,
      lost: Boolean(g.away && !g.home.isWinner && g.home.points !== g.away.points),
      oppName: g.away?.teamName ?? 'Bye',
    });
    if (g.away) {
      sides.push({
        rosterId: g.away.rosterId,
        teamName: g.away.teamName,
        points: g.away.points,
        won: g.away.isWinner,
        lost: !g.away.isWinner && g.away.points !== g.home.points,
        oppName: g.home.teamName,
      });
    }
  }

  const totalPointsScored = round2(sides.reduce((s, x) => s + x.points, 0));
  const leagueAverage = sides.length > 0 ? round2(totalPointsScored / sides.length) : 0;

  const sortedByPts = [...sides].sort((a, b) => b.points - a.points);
  const high = sortedByPts[0] ?? null;
  const low = sortedByPts.length > 1 ? sortedByPts[sortedByPts.length - 1] : null;

  const headToHead = games.filter((g) => g.away !== null);
  const byMarginDesc = [...headToHead].sort((a, b) => b.margin - a.margin);
  const byMarginAsc = [...headToHead].sort((a, b) => a.margin - b.margin);

  const blow = byMarginDesc[0] ?? null;
  const close = byMarginAsc[0] ?? null;

  const formatH2H = (g: WeeklyMatchupCard) => {
    const away = g.away!;
    const homeWon = g.home.points >= away.points;
    const winSide = homeWon ? g.home : away;
    const loseSide = homeWon ? away : g.home;
    return {
      winner: winSide.teamName,
      loser: loseSide.teamName,
      rosterId: winSide.rosterId,
      margin: round2(g.margin),
      scoreLine: `${winSide.points.toFixed(1)}–${loseSide.points.toFixed(1)}`,
    };
  };

  const biggestBlowout = blow && blow.away ? formatH2H(blow) : null;
  const closestGame = close && close.away ? formatH2H(close) : null;

  const losers = sides.filter((s) => s.lost).sort((a, b) => b.points - a.points);
  const winners = sides.filter((s) => s.won).sort((a, b) => a.points - b.points);

  const heartbreaker =
    losers[0] && losers[0].points > 0
      ? {
          teamName: losers[0].teamName,
          points: losers[0].points,
          lostTo: losers[0].oppName,
          rosterId: losers[0].rosterId,
        }
      : null;

  const luckySneak =
    winners[0] && winners[0].points > 0
      ? {
          teamName: winners[0].teamName,
          points: winners[0].points,
          beat: winners[0].oppName,
          rosterId: winners[0].rosterId,
        }
      : null;

  const benchEntries = dashboard.teams
    .map((t) => {
      const wk = t.weeklyScores.find((w) => w.week === week);
      return wk && wk.benchPoints > 0
        ? {
            rosterId: t.rosterId,
            teamName: t.teamName,
            benchPoints: wk.benchPoints,
            starterPoints: wk.points,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.benchPoints - a.benchPoints);
  const benchCurse = benchEntries[0] ?? null;

  const boomPlayers: RecapBoomPlayer[] = [];
  for (const team of dashboard.teams) {
    const wk = team.weeklyScores.find((w) => w.week === week);
    if (!wk) continue;
    const starterSet = new Set(wk.starterIds);
    for (const [playerId, pts] of Object.entries(wk.playerPoints)) {
      if (typeof pts !== 'number' || pts <= 0) continue;
      const meta = resolvePlayer(playerId);
      boomPlayers.push({
        playerId,
        name: meta.name,
        position: meta.position,
        nflTeam: meta.nflTeam,
        fantasyTeamName: team.teamName,
        rosterId: team.rosterId,
        points: round2(pts),
        wasStarted: starterSet.has(playerId),
      });
    }
  }
  boomPlayers.sort((a, b) => b.points - a.points);

  const awards: RecapAward[] = [];
  if (high) {
    awards.push({
      id: 'crown',
      kicker: 'Week Crown',
      headline: high.teamName,
      detail: `Topped the league average (${leagueAverage.toFixed(1)}) by +${(high.points - leagueAverage).toFixed(1)} pts`,
      stat: `${high.points.toFixed(1)} pts`,
      rosterId: high.rosterId,
    });
  }
  if (closestGame) {
    awards.push({
      id: 'thriller',
      kicker: 'Nail-Biter of the Week',
      headline: `${closestGame.winner} edged ${closestGame.loser}`,
      detail: `Final margin ${closestGame.scoreLine}`,
      stat: `${closestGame.margin.toFixed(2)} margin`,
      rosterId: closestGame.rosterId,
    });
  }
  if (heartbreaker) {
    awards.push({
      id: 'heartbreaker',
      kicker: 'Bad Beat',
      headline: heartbreaker.teamName,
      detail: `Scored ${heartbreaker.points.toFixed(1)} and still fell to ${heartbreaker.lostTo}`,
      stat: `${heartbreaker.points.toFixed(1)} in L`,
      rosterId: heartbreaker.rosterId,
    });
  }
  if (benchCurse) {
    awards.push({
      id: 'bench',
      kicker: 'Bench Watch',
      headline: benchCurse.teamName,
      detail: `Left ${benchCurse.benchPoints.toFixed(1)} pts on the bench while starters scored ${benchCurse.starterPoints.toFixed(1)}`,
      stat: `${benchCurse.benchPoints.toFixed(1)} BN`,
      rosterId: benchCurse.rosterId,
    });
  }

  const weekTrades = trades.filter((t) => t.week === week);
  const topWaivers = moves.filter((m) => m.week === week).slice(0, 6);

  const lines: string[] = [
    `**${dashboard.league.name} — Week ${week} Gazette (${dashboard.league.season})**`,
    `League Avg: ${leagueAverage.toFixed(1)} pts | Games: ${games.length}`,
  ];
  if (high) lines.push(`Week Crown: ${high.teamName} (${high.points.toFixed(1)} pts)`);
  if (low) lines.push(`Weekly Low: ${low.teamName} (${low.points.toFixed(1)} pts)`);
  if (biggestBlowout) {
    lines.push(
      `Blowout: ${biggestBlowout.winner} over ${biggestBlowout.loser} (${biggestBlowout.scoreLine}, +${biggestBlowout.margin.toFixed(1)})`,
    );
  }
  if (closestGame) {
    lines.push(
      `Thriller: ${closestGame.winner} def. ${closestGame.loser} (${closestGame.scoreLine}, by ${closestGame.margin.toFixed(2)})`,
    );
  }
  if (heartbreaker) {
    lines.push(`Bad Beat: ${heartbreaker.teamName} (${heartbreaker.points.toFixed(1)} pts in loss)`);
  }
  if (boomPlayers[0]) {
    const mv = boomPlayers[0];
    lines.push(`Week MVP: ${mv.name} (${mv.position}, ${mv.points.toFixed(1)} pts · ${mv.fantasyTeamName})`);
  }

  return {
    week,
    leagueName: dashboard.league.name,
    season: dashboard.league.season,
    isCompleted,
    leagueAverage,
    totalPointsScored,
    highScore: high ? { rosterId: high.rosterId, teamName: high.teamName, points: high.points } : null,
    lowScore: low ? { rosterId: low.rosterId, teamName: low.teamName, points: low.points } : null,
    biggestBlowout,
    closestGame,
    heartbreaker,
    luckySneak,
    benchCurse,
    boomPlayers: boomPlayers.slice(0, 8),
    awards,
    games: [...games].sort((a, b) => a.margin - b.margin),
    trades: weekTrades,
    topWaivers,
    chatMarkdown: lines.join('\n'),
  };
}

export function buildSeasonWeekChampions(dashboard: LeagueDashboardData): SeasonWeekChampionItem[] {
  const weeks = Object.keys(dashboard.weeklyMatchups)
    .map(Number)
    .filter((w) => Number.isFinite(w) && (dashboard.weeklyMatchups[w]?.length ?? 0) > 0)
    .sort((a, b) => b - a);

  const items: SeasonWeekChampionItem[] = [];
  for (const wk of weeks) {
    const cards = dashboard.weeklyMatchups[wk] ?? [];
    if (!cards.some((c) => c.isCompleted || c.home.points > 0)) continue;
    let best: { teamName: string; rosterId: number; points: number; margin: number | null } | null = null;
    for (const c of cards) {
      if (!best || c.home.points > best.points) {
        best = {
          teamName: c.home.teamName,
          rosterId: c.home.rosterId,
          points: c.home.points,
          margin: c.away ? round2(c.margin) : null,
        };
      }
      if (c.away && (!best || c.away.points > best.points)) {
        best = {
          teamName: c.away.teamName,
          rosterId: c.away.rosterId,
          points: c.away.points,
          margin: round2(c.margin),
        };
      }
    }
    if (best && best.points > 0) {
      items.push({ week: wk, ...best });
    }
  }
  return items;
}
