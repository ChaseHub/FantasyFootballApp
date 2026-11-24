import { TeamSummary, WeeklyMatchupCard } from '../models/sleeper.models';

export type SosTier = 'Easy' | 'Balanced' | 'Tough';

export interface ScheduleCellItem {
  week: number;
  opponentRosterId: number | null;
  opponentName: string;
  opponentRank: number | null;
  opponentPower: number | null;
  tier: SosTier;
  isPlayoffWeek: boolean;
  isCompleted: boolean;
  result: 'W' | 'L' | 'T' | 'UPCOMING' | 'BYE';
}

export interface TeamSosSummary {
  rosterId: number;
  teamName: string;
  managerName: string;
  standingsRank: number;
  powerRank: number;
  playedAvgPower: number | null;
  playedTier: SosTier;
  playedGames: number;
  remainingAvgPower: number | null;
  remainingTier: SosTier;
  remainingGames: number;
  playoffAvgPower: number | null;
  playoffTier: SosTier;
  rosRank: number;
  weekCells: ScheduleCellItem[];
}

export interface LeagueScheduleMatrix {
  weeks: number[];
  playoffStartWeek: number;
  leagueAvgPower: number;
  rows: TeamSosSummary[];
  toughestRos: TeamSosSummary | null;
  easiestRos: TeamSosSummary | null;
  easiestPlayoffs: TeamSosSummary | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function classifyTier(avgOppPower: number | null, leagueAvg: number): SosTier {
  if (avgOppPower === null) return 'Balanced';
  if (avgOppPower >= leagueAvg + 4.5) return 'Tough';
  if (avgOppPower <= leagueAvg - 4.5) return 'Easy';
  return 'Balanced';
}

export function buildLeagueScheduleMatrix(params: {
  teams: TeamSummary[];
  weeklyMatchups: Record<number, WeeklyMatchupCard[]>;
  futureMatchups: Record<number, Array<[number, number]>>;
  currentWeek: number;
  playoffStartWeek: number;
}): LeagueScheduleMatrix {
  const { teams, weeklyMatchups, futureMatchups, currentWeek, playoffStartWeek } = params;
  if (teams.length === 0) {
    return {
      weeks: [],
      playoffStartWeek,
      leagueAvgPower: 50,
      rows: [],
      toughestRos: null,
      easiestRos: null,
      easiestPlayoffs: null,
    };
  }

  const teamById = new Map(teams.map((t) => [t.rosterId, t]));
  const leagueAvgPower =
    teams.reduce((sum, t) => sum + t.powerScore, 0) / Math.max(1, teams.length);

  // Build week -> rosterId -> matchup info lookup
  const pairLookup = new Map<
    number,
    Map<number, { oppId: number; isCompleted: boolean; result: 'W' | 'L' | 'T' | 'UPCOMING' }>
  >();

  for (const [wkStr, cards] of Object.entries(weeklyMatchups)) {
    const wk = Number(wkStr);
    if (!Number.isFinite(wk)) continue;
    const wkMap = pairLookup.get(wk) ?? new Map();
    for (const card of cards) {
      if (!card.away) continue;
      const done = card.isCompleted;
      const hRes: 'W' | 'L' | 'T' | 'UPCOMING' = !done
        ? 'UPCOMING'
        : card.home.points > card.away.points
          ? 'W'
          : card.home.points < card.away.points
            ? 'L'
            : 'T';
      const aRes: 'W' | 'L' | 'T' | 'UPCOMING' = !done
        ? 'UPCOMING'
        : card.away.points > card.home.points
          ? 'W'
          : card.away.points < card.home.points
            ? 'L'
            : 'T';
      wkMap.set(card.home.rosterId, {
        oppId: card.away.rosterId,
        isCompleted: done,
        result: hRes,
      });
      wkMap.set(card.away.rosterId, {
        oppId: card.home.rosterId,
        isCompleted: done,
        result: aRes,
      });
    }
    pairLookup.set(wk, wkMap);
  }

  for (const [wkStr, pairs] of Object.entries(futureMatchups)) {
    const wk = Number(wkStr);
    if (!Number.isFinite(wk)) continue;
    const wkMap = pairLookup.get(wk) ?? new Map();
    for (const [a, b] of pairs) {
      if (!wkMap.has(a)) {
        wkMap.set(a, { oppId: b, isCompleted: false, result: 'UPCOMING' });
      }
      if (!wkMap.has(b)) {
        wkMap.set(b, { oppId: a, isCompleted: false, result: 'UPCOMING' });
      }
    }
    pairLookup.set(wk, wkMap);
  }

  const allWeeks = Array.from(pairLookup.keys()).sort((a, b) => a - b);

  const rawRows: TeamSosSummary[] = teams.map((team) => {
    const playedPowers: number[] = [];
    const remainingPowers: number[] = [];
    const playoffPowers: number[] = [];

    const weekCells: ScheduleCellItem[] = allWeeks.map((wk) => {
      const entry = pairLookup.get(wk)?.get(team.rosterId);
      const isPlayoffWeek = wk >= playoffStartWeek;
      if (!entry) {
        return {
          week: wk,
          opponentRosterId: null,
          opponentName: 'BYE',
          opponentRank: null,
          opponentPower: null,
          tier: 'Balanced',
          isPlayoffWeek,
          isCompleted: wk < currentWeek,
          result: 'BYE',
        };
      }

      const opp = teamById.get(entry.oppId) ?? null;
      const oppPower = opp ? opp.powerScore : null;
      if (oppPower !== null) {
        if (entry.isCompleted) {
          playedPowers.push(oppPower);
        } else if (isPlayoffWeek) {
          playoffPowers.push(oppPower);
        } else {
          remainingPowers.push(oppPower);
        }
      }

      return {
        week: wk,
        opponentRosterId: opp?.rosterId ?? entry.oppId,
        opponentName: opp?.teamName ?? `Team ${entry.oppId}`,
        opponentRank: opp?.standingsRank ?? null,
        opponentPower: oppPower !== null ? round1(oppPower) : null,
        tier: classifyTier(oppPower, leagueAvgPower),
        isPlayoffWeek,
        isCompleted: entry.isCompleted,
        result: entry.result,
      };
    });

    const avg = (arr: number[]): number | null =>
      arr.length > 0 ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const playedAvgPower = avg(playedPowers);
    const remainingAvgPower = avg(remainingPowers);
    const playoffAvgPower = avg(playoffPowers);

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      managerName: team.managerName,
      standingsRank: team.standingsRank,
      powerRank: team.powerRank,
      playedAvgPower,
      playedTier: classifyTier(playedAvgPower, leagueAvgPower),
      playedGames: playedPowers.length,
      remainingAvgPower,
      remainingTier: classifyTier(remainingAvgPower, leagueAvgPower),
      remainingGames: remainingPowers.length,
      playoffAvgPower,
      playoffTier: classifyTier(playoffAvgPower, leagueAvgPower),
      rosRank: 0,
      weekCells,
    };
  });

  // Rank remaining SoS (1 = hardest upcoming slate)
  const byRos = [...rawRows].sort(
    (a, b) =>
      (b.remainingAvgPower ?? b.playedAvgPower ?? 0) -
        (a.remainingAvgPower ?? a.playedAvgPower ?? 0) || a.standingsRank - b.standingsRank,
  );
  byRos.forEach((r, idx) => {
    r.rosRank = idx + 1;
  });

  const ordered = [...rawRows].sort((a, b) => a.standingsRank - b.standingsRank);
  const withRos = ordered.filter((r) => r.remainingAvgPower !== null);
  const toughestRos =
    withRos.length > 0
      ? [...withRos].sort((a, b) => (b.remainingAvgPower ?? 0) - (a.remainingAvgPower ?? 0))[0]
      : null;
  const easiestRos =
    withRos.length > 0
      ? [...withRos].sort((a, b) => (a.remainingAvgPower ?? 0) - (b.remainingAvgPower ?? 0))[0]
      : null;

  const withPlayoff = ordered.filter((r) => r.playoffAvgPower !== null);
  const easiestPlayoffs =
    withPlayoff.length > 0
      ? [...withPlayoff].sort((a, b) => (a.playoffAvgPower ?? 0) - (b.playoffAvgPower ?? 0))[0]
      : null;

  return {
    weeks: allWeeks,
    playoffStartWeek,
    leagueAvgPower: round1(leagueAvgPower),
    rows: ordered,
    toughestRos,
    easiestRos,
    easiestPlayoffs,
  };
}
