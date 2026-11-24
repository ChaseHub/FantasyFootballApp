import {
  BracketMatchupView,
  BracketRoundView,
  BracketSideView,
  DraftPickView,
  LeagueAward,
  LeaguePlayerRow,
  SleeperBracketMatchup,
  SleeperDraftPick,
  TeamScheduleSwapRow,
  TeamSummary,
  WeirdWeeklyMoment,
  WeeklyMatchupCard,
} from '../models/sleeper.models';

export function computeScheduleSwapMatrix(
  teams: TeamSummary[],
  playoffStartWeek = 15,
): TeamScheduleSwapRow[] {
  if (teams.length < 2) return [];

  // Map: rosterId -> week -> TeamWeeklyScore (regular season only so games match actual W-L)
  const scoreLookup = new Map<number, Map<number, { pts: number; oppId: number | null; oppPts: number | null }>>();
  const allWeeksSet = new Set<number>();

  for (const team of teams) {
    const wkMap = new Map<number, { pts: number; oppId: number | null; oppPts: number | null }>();
    for (const w of team.weeklyScores) {
      if (w.week >= playoffStartWeek) continue;
      wkMap.set(w.week, {
        pts: w.points,
        oppId: w.opponentRosterId,
        oppPts: w.opponentPoints,
      });
      allWeeksSet.add(w.week);
    }
    scoreLookup.set(team.rosterId, wkMap);
  }

  const weeks = Array.from(allWeeksSet).sort((a, b) => a - b);

  return teams.map((teamA) => {
    const mapA = scoreLookup.get(teamA.rosterId)!;
    const cells = teams.map((teamB) => {
      if (teamA.rosterId === teamB.rosterId) {
        return {
          scheduleOwnerId: teamB.rosterId,
          scheduleOwnerName: teamB.teamName,
          wins: teamA.wins,
          losses: teamA.losses,
          ties: teamA.ties,
          winDelta: 0,
          isActual: true,
        };
      }

      const mapB = scoreLookup.get(teamB.rosterId)!;
      let wins = 0;
      let losses = 0;
      let ties = 0;

      for (const wk of weeks) {
        const entryA = mapA.get(wk);
        const entryB = mapB.get(wk);
        if (!entryA || !entryB || entryB.oppId === null || entryB.oppPts === null) {
          continue;
        }

        // If Team B actually played Team A in week wk, swapping schedules means A plays B
        const targetOppPts =
          entryB.oppId === teamA.rosterId ? entryB.pts : entryB.oppPts;

        if (entryA.pts > targetOppPts) wins += 1;
        else if (entryA.pts < targetOppPts) losses += 1;
        else ties += 1;
      }

      return {
        scheduleOwnerId: teamB.rosterId,
        scheduleOwnerName: teamB.teamName,
        wins,
        losses,
        ties,
        winDelta: wins - teamA.wins,
        isActual: false,
      };
    });

    const sortedByWins = [...cells].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return {
      teamRosterId: teamA.rosterId,
      teamName: teamA.teamName,
      actualWins: teamA.wins,
      actualLosses: teamA.losses,
      bestScenario: sortedByWins[0],
      worstScenario: sortedByWins[sortedByWins.length - 1],
      cells,
    };
  });
}

export function computeLeagueAwards(teams: TeamSummary[]): LeagueAward[] {
  if (teams.length === 0) return [];
  const awards: LeagueAward[] = [];

  const luckiest = [...teams].sort((a, b) => b.luckScore - a.luckScore)[0];
  awards.push({
    id: 'blessed',
    badge: 'Blessed',
    title: 'Luckiest Manager',
    teamName: luckiest.teamName,
    rosterId: luckiest.rosterId,
    stat: `${luckiest.luckScore >= 0 ? '+' : ''}${luckiest.luckScore.toFixed(2)} wins`,
    explanation: `${luckiest.recordLabel} actual record vs ${luckiest.allPlayWins}-${luckiest.allPlayLosses} all-play.`,
  });

  const unluckiest = [...teams].sort((a, b) => a.luckScore - b.luckScore)[0];
  if (unluckiest.rosterId !== luckiest.rosterId) {
    awards.push({
      id: 'cursed',
      badge: 'Cursed',
      title: 'Most Unlucky',
      teamName: unluckiest.teamName,
      rosterId: unluckiest.rosterId,
      stat: `${unluckiest.luckScore.toFixed(2)} wins`,
      explanation: `${unluckiest.recordLabel} actual vs ${unluckiest.allPlayWins}-${unluckiest.allPlayLosses} all-play expectation.`,
    });
  }

  const withGames = teams.filter((t) => t.weeklyScores.length > 0);
  if (withGames.length > 0) {
    const regGames = (t: TeamSummary) =>
      Math.max(t.wins + t.losses + t.ties, Math.min(t.weeklyScores.length, 14), 1);

    const toughest = [...withGames].sort(
      (a, b) => b.pointsAgainst / regGames(b) - a.pointsAgainst / regGames(a),
    )[0];
    awards.push({
      id: 'buzzsaw',
      badge: 'Hardest Path',
      title: 'Toughest Schedule',
      teamName: toughest.teamName,
      rosterId: toughest.rosterId,
      stat: `${(toughest.pointsAgainst / regGames(toughest)).toFixed(1)} PA/wk`,
      explanation: `Opponents scored ${toughest.pointsAgainst.toFixed(1)} regular-season pts against them.`,
    });

    const easiest = [...withGames].sort(
      (a, b) => a.pointsAgainst / regGames(a) - b.pointsAgainst / regGames(b),
    )[0];
    if (easiest.rosterId !== toughest.rosterId) {
      awards.push({
        id: 'cakewalk',
        badge: 'Easiest Path',
        title: 'Softest Schedule',
        teamName: easiest.teamName,
        rosterId: easiest.rosterId,
        stat: `${(easiest.pointsAgainst / regGames(easiest)).toFixed(1)} PA/wk`,
        explanation: `Opponents averaged only ${(easiest.pointsAgainst / regGames(easiest)).toFixed(1)} pts/wk.`,
      });
    }

    const boomBust = [...withGames].sort((a, b) => b.stdDevScore - a.stdDevScore)[0];
    awards.push({
      id: 'volatile',
      badge: 'Rollercoaster',
      title: 'Most Boom-or-Bust',
      teamName: boomBust.teamName,
      rosterId: boomBust.rosterId,
      stat: `±${boomBust.stdDevScore.toFixed(1)} σ`,
      explanation: `Swings between ${boomBust.worstWeek?.points.toFixed(1) ?? '0'} and ${boomBust.bestWeek?.points.toFixed(1) ?? '0'} pts.`,
    });

    const steady = [...withGames].sort((a, b) => a.stdDevScore - b.stdDevScore)[0];
    if (steady.rosterId !== boomBust.rosterId) {
      awards.push({
        id: 'steady',
        badge: 'Metronome',
        title: 'Most Consistent',
        teamName: steady.teamName,
        rosterId: steady.rosterId,
        stat: `±${steady.stdDevScore.toFixed(1)} σ`,
        explanation: `Steady ${steady.medianScore.toFixed(1)} median score across ${steady.weeklyScores.length} weeks.`,
      });
    }
  }

  const findTightest = (team: TeamSummary, result: 'W' | 'L') => {
    const games = team.weeklyScores.filter((w) => w.result === result);
    if (games.length === 0) return null;
    return games.reduce((best, cur) =>
      Math.abs(cur.margin) < Math.abs(best.margin) ? cur : best,
    );
  };

  const cardiac = [...teams].sort((a, b) => {
    const diff = b.closeWins - a.closeWins;
    if (diff !== 0) return diff;
    const ta = Math.abs(findTightest(a, 'W')?.margin ?? Infinity);
    const tb = Math.abs(findTightest(b, 'W')?.margin ?? Infinity);
    return ta - tb;
  })[0];

  if (cardiac.closeWins > 0) {
    const tightest = findTightest(cardiac, 'W');
    const detail = tightest
      ? `Closest: +${Math.abs(tightest.margin).toFixed(2)} pts in Week ${tightest.week} vs ${tightest.opponentName ?? 'Opponent'}.`
      : `Won ${cardiac.closeWins} matchup${cardiac.closeWins > 1 ? 's' : ''} under 5 pts.`;
    awards.push({
      id: 'cardiac',
      badge: 'Clutch',
      title: 'Cardiac Kid',
      teamName: cardiac.teamName,
      rosterId: cardiac.rosterId,
      stat: `${cardiac.closeWins} close win${cardiac.closeWins > 1 ? 's' : ''}`,
      explanation: detail,
    });
  }

  const heartbreak = [...teams].sort((a, b) => {
    const diff = b.closeLosses - a.closeLosses;
    if (diff !== 0) return diff;
    const ta = Math.abs(findTightest(a, 'L')?.margin ?? Infinity);
    const tb = Math.abs(findTightest(b, 'L')?.margin ?? Infinity);
    return ta - tb;
  })[0];

  if (heartbreak.closeLosses > 0) {
    const tightest = findTightest(heartbreak, 'L');
    const detail = tightest
      ? `Closest: -${Math.abs(tightest.margin).toFixed(2)} pts in Week ${tightest.week} vs ${tightest.opponentName ?? 'Opponent'}.`
      : `Dropped ${heartbreak.closeLosses} game${heartbreak.closeLosses > 1 ? 's' : ''} under 5 pts.`;
    awards.push({
      id: 'heartbreak',
      badge: 'Pain',
      title: 'Heartbreak Award',
      teamName: heartbreak.teamName,
      rosterId: heartbreak.rosterId,
      stat: `${heartbreak.closeLosses} close loss${heartbreak.closeLosses > 1 ? 'es' : ''}`,
      explanation: detail,
    });
  }

  const tightestLossOverall = teams
    .map((team) => ({ team, wk: findTightest(team, 'L') }))
    .filter((item): item is { team: TeamSummary; wk: NonNullable<ReturnType<typeof findTightest>> } =>
      Boolean(item.wk),
    )
    .sort((a, b) => Math.abs(a.wk.margin) - Math.abs(b.wk.margin))[0];

  if (
    tightestLossOverall &&
    (heartbreak.closeLosses === 0 || tightestLossOverall.team.rosterId !== heartbreak.rosterId)
  ) {
    const { team, wk } = tightestLossOverall;
    awards.push({
      id: 'tightest-loss',
      badge: 'Heartbreaker',
      title: 'Tightest Loss',
      teamName: team.teamName,
      rosterId: team.rosterId,
      stat: `-${Math.abs(wk.margin).toFixed(2)} pts`,
      explanation: `Lost Week ${wk.week} vs ${wk.opponentName ?? 'Opponent'} (${wk.points.toFixed(2)}–${(wk.opponentPoints ?? 0).toFixed(2)}).`,
    });
  }

  const benchBoss = [...teams].sort((a, b) => b.benchPointsTotal - a.benchPointsTotal)[0];
  if (benchBoss.benchPointsTotal > 0) {
    awards.push({
      id: 'bench-boss',
      badge: 'Wasted Firepower',
      title: 'Most Bench Points',
      teamName: benchBoss.teamName,
      rosterId: benchBoss.rosterId,
      stat: `${benchBoss.benchPointsTotal.toFixed(1)} pts`,
      explanation: `Left ${benchBoss.benchPointsTotal.toFixed(1)} points sitting on the bench this season.`,
    });
  }

  return awards;
}

export function computeWeirdWeeklyMoments(
  teams: TeamSummary[],
  weeklyMatchups: Record<number, WeeklyMatchupCard[]>,
): WeirdWeeklyMoment[] {
  const moments: WeirdWeeklyMoment[] = [];

  // Biggest weekly robberies: top-half score that still lost
  const robberies: Array<{ score: number; rank: number; size: number; week: number; opp: string; team: TeamSummary }> = [];
  const heists: Array<{ score: number; rank: number; size: number; week: number; opp: string; team: TeamSummary }> = [];

  for (const team of teams) {
    for (const wk of team.weeklyScores) {
      if (wk.result === 'L' && wk.leagueSizeThatWeek >= 4 && wk.leagueRankThatWeek <= Math.floor(wk.leagueSizeThatWeek / 2)) {
        robberies.push({
          score: wk.points,
          rank: wk.leagueRankThatWeek,
          size: wk.leagueSizeThatWeek,
          week: wk.week,
          opp: wk.opponentName ?? 'Opponent',
          team,
        });
      }
      if (wk.result === 'W' && wk.leagueSizeThatWeek >= 4 && wk.leagueRankThatWeek > Math.ceil(wk.leagueSizeThatWeek / 2)) {
        heists.push({
          score: wk.points,
          rank: wk.leagueRankThatWeek,
          size: wk.leagueSizeThatWeek,
          week: wk.week,
          opp: wk.opponentName ?? 'Opponent',
          team,
        });
      }
    }
  }

  robberies.sort((a, b) => a.rank - b.rank || b.score - a.score);
  robberies.slice(0, 3).forEach((item, idx) => {
    moments.push({
      id: `robbery-${idx}`,
      kind: 'robbery',
      title: 'Top-Half Loss',
      week: item.week,
      headline: `${item.team.teamName} scored ${item.score.toFixed(2)} (#${item.rank} of ${item.size}) & lost`,
      detail: `Ran into ${item.opp} in Week ${item.week}.`,
      rosterId: item.team.rosterId,
    });
  });

  heists.sort((a, b) => b.rank - a.rank || a.score - b.score);
  heists.slice(0, 3).forEach((item, idx) => {
    moments.push({
      id: `heist-${idx}`,
      kind: 'heist',
      title: 'Bottom-Half Win',
      week: item.week,
      headline: `${item.team.teamName} won with ${item.score.toFixed(2)} (#${item.rank} of ${item.size})`,
      detail: `Escaped ${item.opp} in Week ${item.week}.`,
      rosterId: item.team.rosterId,
    });
  });

  // Highest combined shootout & lowest combined slugfest
  let topShootout: { card: WeeklyMatchupCard; total: number } | null = null;
  let lowSnoozer: { card: WeeklyMatchupCard; total: number } | null = null;

  for (const cards of Object.values(weeklyMatchups)) {
    for (const card of cards) {
      if (!card.away || card.status !== 'Final') continue;
      const total = card.home.points + card.away.points;
      if (total <= 0) continue;
      if (!topShootout || total > topShootout.total) topShootout = { card, total };
      if (!lowSnoozer || total < lowSnoozer.total) lowSnoozer = { card, total };
    }
  }

  if (topShootout) {
    const { card, total } = topShootout;
    moments.push({
      id: 'shootout',
      kind: 'shootout',
      title: 'Highest Shootout',
      week: card.week,
      headline: `${total.toFixed(2)} combined pts in Week ${card.week}`,
      detail: `${card.home.teamName} (${card.home.points.toFixed(1)}) vs ${card.away!.teamName} (${card.away!.points.toFixed(1)}).`,
      rosterId: card.home.isWinner ? card.home.rosterId : card.away!.rosterId,
    });
  }

  if (lowSnoozer) {
    const { card, total } = lowSnoozer;
    moments.push({
      id: 'snoozer',
      kind: 'snoozer',
      title: 'Lowest Slugfest',
      week: card.week,
      headline: `${total.toFixed(2)} combined pts in Week ${card.week}`,
      detail: `${card.home.teamName} (${card.home.points.toFixed(1)}) vs ${card.away!.teamName} (${card.away!.points.toFixed(1)}).`,
      rosterId: card.home.isWinner ? card.home.rosterId : card.away!.rosterId,
    });
  }

  return moments;
}

export function buildBracketRounds(
  bracket: SleeperBracketMatchup[],
  teams: TeamSummary[],
  weeklyMatchups: Record<number, WeeklyMatchupCard[]>,
  playoffStartWeek: number,
  isLosersBracket = false,
): BracketRoundView[] {
  if (bracket.length === 0) return [];

  const teamMap = new Map(teams.map((t) => [t.rosterId, t]));
  const maxRound = Math.max(...bracket.map((b) => b.r));

  const formatFrom = (from?: { w?: number; l?: number } | null): string => {
    if (!from) return 'TBD';
    if (typeof from.w === 'number') return `Winner of M${from.w}`;
    if (typeof from.l === 'number') return `Loser of M${from.l}`;
    return 'TBD';
  };

  const resolveScore = (
    week: number | null,
    r1: number | null,
    r2: number | null,
  ): { s1: number | null; s2: number | null } => {
    if (week === null || r1 === null || r2 === null) return { s1: null, s2: null };
    const cards = weeklyMatchups[week] ?? [];
    const match = cards.find(
      (c) =>
        (c.home.rosterId === r1 && c.away?.rosterId === r2) ||
        (c.home.rosterId === r2 && c.away?.rosterId === r1),
    );
    if (!match || !match.away) return { s1: null, s2: null };
    const s1 = match.home.rosterId === r1 ? match.home.points : match.away.points;
    const s2 = match.home.rosterId === r2 ? match.home.points : match.away.points;
    return s1 > 0 || s2 > 0 ? { s1, s2 } : { s1: null, s2: null };
  };

  const makeSide = (
    rosterId: number | null,
    from: { w?: number; l?: number } | null | undefined,
    winnerId: number | null | undefined,
    score: number | null,
  ): BracketSideView => {
    const team = rosterId !== null ? teamMap.get(rosterId) : undefined;
    return {
      rosterId,
      teamName: team?.teamName ?? formatFrom(from),
      seed: team?.standingsRank ?? null,
      score,
      isWinner: rosterId !== null && winnerId === rosterId,
      placeholder: formatFrom(from),
    };
  };

  const rounds: BracketRoundView[] = [];
  for (let r = 1; r <= maxRound; r++) {
    const week = playoffStartWeek + r - 1;
    const rows = bracket.filter((b) => b.r === r).sort((a, b) => a.m - b.m);
    const title =
      r === maxRound
        ? isLosersBracket
          ? 'Consolation Finals'
          : 'Championship'
        : r === maxRound - 1 && maxRound >= 2
          ? 'Semifinals'
          : `Round ${r}`;

    const matchups: BracketMatchupView[] = rows.map((row) => {
      const { s1, s2 } = resolveScore(week, row.t1, row.t2);
      const label =
        row.p === 1
          ? 'Championship'
          : row.p
            ? `${row.p}${row.p === 3 ? 'rd' : 'th'} Place`
            : `Match ${row.m}`;
      return {
        matchId: row.m,
        round: r,
        week,
        placeGame: row.p ?? null,
        label,
        top: makeSide(row.t1, row.t1_from, row.w, s1),
        bottom: makeSide(row.t2, row.t2_from, row.w, s2),
      };
    });

    rounds.push({ round: r, title, week, matchups });
  }

  return rounds;
}

export function buildProjectedPlayoffRounds(
  teams: TeamSummary[],
  playoffTeamsCount: number,
  playoffStartWeek: number,
): BracketRoundView[] {
  const seeded = [...teams]
    .sort((a, b) => a.standingsRank - b.standingsRank)
    .slice(0, Math.min(playoffTeamsCount, teams.length));

  if (seeded.length < 2) return [];

  const toSide = (team: TeamSummary): BracketSideView => ({
    rosterId: team.rosterId,
    teamName: team.teamName,
    seed: team.standingsRank,
    score: null,
    isWinner: false,
    placeholder: `#${team.standingsRank} Seed`,
  });

  const placeholderSide = (label: string): BracketSideView => ({
    rosterId: null,
    teamName: label,
    seed: null,
    score: null,
    isWinner: false,
    placeholder: label,
  });

  if (seeded.length >= 8) {
    return [
      {
        round: 1,
        title: 'Quarterfinals (Projected)',
        week: playoffStartWeek,
        matchups: [
          {
            matchId: 1,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#1 vs #8',
            top: toSide(seeded[0]),
            bottom: toSide(seeded[7]),
          },
          {
            matchId: 2,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#4 vs #5',
            top: toSide(seeded[3]),
            bottom: toSide(seeded[4]),
          },
          {
            matchId: 3,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#3 vs #6',
            top: toSide(seeded[2]),
            bottom: toSide(seeded[5]),
          },
          {
            matchId: 4,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#2 vs #7',
            top: toSide(seeded[1]),
            bottom: toSide(seeded[6]),
          },
        ],
      },
      {
        round: 2,
        title: 'Semifinals (Projected)',
        week: playoffStartWeek + 1,
        matchups: [
          {
            matchId: 5,
            round: 2,
            week: playoffStartWeek + 1,
            placeGame: null,
            label: 'Winner 1/8 vs 4/5',
            top: placeholderSide('Winner #1 vs #8'),
            bottom: placeholderSide('Winner #4 vs #5'),
          },
          {
            matchId: 6,
            round: 2,
            week: playoffStartWeek + 1,
            placeGame: null,
            label: 'Winner 3/6 vs 2/7',
            top: placeholderSide('Winner #3 vs #6'),
            bottom: placeholderSide('Winner #2 vs #7'),
          },
        ],
      },
      {
        round: 3,
        title: 'Championship (Projected)',
        week: playoffStartWeek + 2,
        matchups: [
          {
            matchId: 7,
            round: 3,
            week: playoffStartWeek + 2,
            placeGame: 1,
            label: 'Title Game',
            top: placeholderSide('Semifinal 1 Winner'),
            bottom: placeholderSide('Semifinal 2 Winner'),
          },
        ],
      },
    ];
  }

  if (seeded.length >= 6) {
    return [
      {
        round: 1,
        title: 'Quarterfinals (Projected)',
        week: playoffStartWeek,
        matchups: [
          {
            matchId: 1,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#3 vs #6',
            top: toSide(seeded[2]),
            bottom: toSide(seeded[5]),
          },
          {
            matchId: 2,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#4 vs #5',
            top: toSide(seeded[3]),
            bottom: toSide(seeded[4]),
          },
        ],
      },
      {
        round: 2,
        title: 'Semifinals (Projected)',
        week: playoffStartWeek + 1,
        matchups: [
          {
            matchId: 3,
            round: 2,
            week: playoffStartWeek + 1,
            placeGame: null,
            label: '#1 Bye vs #4/#5',
            top: toSide(seeded[0]),
            bottom: placeholderSide('Winner #4 vs #5'),
          },
          {
            matchId: 4,
            round: 2,
            week: playoffStartWeek + 1,
            placeGame: null,
            label: '#2 Bye vs #3/#6',
            top: toSide(seeded[1]),
            bottom: placeholderSide('Winner #3 vs #6'),
          },
        ],
      },
      {
        round: 3,
        title: 'Championship (Projected)',
        week: playoffStartWeek + 2,
        matchups: [
          {
            matchId: 5,
            round: 3,
            week: playoffStartWeek + 2,
            placeGame: 1,
            label: 'Title Game',
            top: placeholderSide('Semifinal 1 Winner'),
            bottom: placeholderSide('Semifinal 2 Winner'),
          },
        ],
      },
    ];
  }

  if (seeded.length >= 4) {
    return [
      {
        round: 1,
        title: 'Semifinals (Projected)',
        week: playoffStartWeek,
        matchups: [
          {
            matchId: 1,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#1 vs #4',
            top: toSide(seeded[0]),
            bottom: toSide(seeded[3]),
          },
          {
            matchId: 2,
            round: 1,
            week: playoffStartWeek,
            placeGame: null,
            label: '#2 vs #3',
            top: toSide(seeded[1]),
            bottom: toSide(seeded[2]),
          },
        ],
      },
      {
        round: 2,
        title: 'Championship (Projected)',
        week: playoffStartWeek + 1,
        matchups: [
          {
            matchId: 3,
            round: 2,
            week: playoffStartWeek + 1,
            placeGame: 1,
            label: 'Title Game',
            top: placeholderSide('Semifinal 1 Winner'),
            bottom: placeholderSide('Semifinal 2 Winner'),
          },
        ],
      },
    ];
  }

  return [
    {
      round: 1,
      title: 'Championship (Projected)',
      week: playoffStartWeek,
      matchups: [
        {
          matchId: 1,
          round: 1,
          week: playoffStartWeek,
          placeGame: 1,
          label: '#1 vs #2',
          top: toSide(seeded[0]),
          bottom: toSide(seeded[1]),
        },
      ],
    },
  ];
}

export function buildDraftPickViews(
  picks: SleeperDraftPick[],
  teams: TeamSummary[],
  players: LeaguePlayerRow[],
  teamsCount: number,
): DraftPickView[] {
  if (picks.length === 0) return [];
  const teamMap = new Map(teams.map((t) => [t.rosterId, t]));
  const ptsMap = new Map(players.map((p) => [p.playerId, p.seasonPoints]));
  const totalTeams = Math.max(teamsCount, teams.length, 1);

  return [...picks]
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((pick) => {
      const team = teamMap.get(pick.roster_id);
      const pickInRound = ((pick.pick_no - 1) % totalTeams) + 1;
      const pickLabel = `${pick.round}.${String(pickInRound).padStart(2, '0')}`;
      const meta = pick.metadata;
      const fullName =
        `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim() ||
        `Player #${pick.player_id}`;
      const parsedAmount = meta?.amount ? Number(meta.amount) : null;

      return {
        pickNo: pick.pick_no,
        round: pick.round,
        draftSlot: pick.draft_slot,
        pickLabel,
        rosterId: pick.roster_id,
        teamName: team?.teamName ?? `Team ${pick.roster_id}`,
        managerName: team?.managerName ?? 'Manager',
        playerId: pick.player_id,
        playerName: fullName,
        position: meta?.position || '—',
        nflTeam: meta?.team || 'FA',
        isKeeper: Boolean(pick.is_keeper),
        auctionAmount:
          parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
        seasonPoints: ptsMap.get(pick.player_id) ?? 0,
      };
    });
}

export interface MedianStandingRow {
  rosterId: number;
  teamName: string;
  actualWins: number;
  actualLosses: number;
  actualRank: number;
  medianWins: number;
  medianLosses: number;
  combinedWins: number;
  combinedLosses: number;
  medianRank: number;
  seedDelta: number;
  playoffFlip: 'in' | 'out' | null;
}

/**
 * Simulates Sleeper's two-win-per-week format where top-half scores each week earn an extra win.
 */
export function computeMedianStandings(
  teams: TeamSummary[],
  playoffTeams = 6,
  playoffStartWeek = 15,
): MedianStandingRow[] {
  if (teams.length === 0) return [];

  const preliminary = teams.map((team) => {
    let medianWins = 0;
    let medianLosses = 0;
    for (const wk of team.weeklyScores) {
      if (wk.week >= playoffStartWeek || wk.leagueSizeThatWeek < 2) continue;
      if (wk.leagueRankThatWeek <= Math.floor(wk.leagueSizeThatWeek / 2)) {
        medianWins += 1;
      } else {
        medianLosses += 1;
      }
    }

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      actualWins: team.wins,
      actualLosses: team.losses,
      actualRank: team.standingsRank,
      pointsFor: team.pointsFor,
      medianWins,
      medianLosses,
      combinedWins: team.wins + medianWins,
      combinedLosses: team.losses + medianLosses,
    };
  });

  preliminary.sort(
    (a, b) =>
      b.combinedWins - a.combinedWins ||
      a.combinedLosses - b.combinedLosses ||
      b.pointsFor - a.pointsFor,
  );

  return preliminary.map((row, idx) => {
    const medianRank = idx + 1;
    const wasIn = row.actualRank <= playoffTeams;
    const nowIn = medianRank <= playoffTeams;
    const playoffFlip: 'in' | 'out' | null =
      !wasIn && nowIn ? 'in' : wasIn && !nowIn ? 'out' : null;

    return {
      rosterId: row.rosterId,
      teamName: row.teamName,
      actualWins: row.actualWins,
      actualLosses: row.actualLosses,
      actualRank: row.actualRank,
      medianWins: row.medianWins,
      medianLosses: row.medianLosses,
      combinedWins: row.combinedWins,
      combinedLosses: row.combinedLosses,
      medianRank,
      seedDelta: row.actualRank - medianRank,
      playoffFlip,
    };
  });
}

export interface OptimalLineupRow {
  rosterId: number;
  teamName: string;
  pointsFor: number;
  maxPointsFor: number;
  pointsLeftOnBench: number;
  efficiencyPct: number;
  pointsRank: number;
  optimalRank: number;
  rankDelta: number;
}

/**
 * Compares actual points scored against optimal best-ball Max PF per franchise.
 */
export function computeOptimalLineupRankings(teams: TeamSummary[]): OptimalLineupRow[] {
  if (teams.length === 0) return [];

  const sorted = [...teams].sort(
    (a, b) => b.maxPointsFor - a.maxPointsFor || b.pointsFor - a.pointsFor,
  );

  return sorted.map((t, idx) => {
    const optimalRank = idx + 1;
    return {
      rosterId: t.rosterId,
      teamName: t.teamName,
      pointsFor: t.pointsFor,
      maxPointsFor: t.maxPointsFor,
      pointsLeftOnBench: Math.max(0, t.maxPointsFor - t.pointsFor),
      efficiencyPct: t.lineupEfficiencyPct,
      pointsRank: t.pointsRank,
      optimalRank,
      rankDelta: t.pointsRank - optimalRank,
    };
  });
}

export type WeeklyAllPlayVerdict = 'crown' | 'robbed' | 'heist' | 'solid' | 'tough' | 'bye';

export interface TeamWeeklyAllPlayRow {
  week: number;
  points: number;
  leagueAverage: number;
  deltaFromAvg: number;
  placementRank: number;
  fieldSize: number;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  allPlayPct: number;
  expectedWinShare: number;
  actualResult: 'W' | 'L' | 'T' | 'BYE';
  opponentRosterId: number | null;
  opponentName: string | null;
  opponentPoints: number | null;
  topScoreThatWeek: number;
  topScorerName: string;
  verdict: WeeklyAllPlayVerdict;
  verdictLabel: string;
}

export interface TeamWeeklyAllPlayReport {
  rosterId: number;
  teamName: string;
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  totalAllPlayWins: number;
  totalAllPlayLosses: number;
  totalAllPlayTies: number;
  allPlayPct: number;
  expectedWins: number;
  luckDeltaWins: number;
  avgRank: number;
  avgFieldSize: number;
  topHalfWeeks: number;
  podiumWeeks: number;
  crownWeeks: number;
  robbedWeeks: number;
  heistWeeks: number;
  bestWeek: TeamWeeklyAllPlayRow | null;
  worstWeek: TeamWeeklyAllPlayRow | null;
  weeks: TeamWeeklyAllPlayRow[];
}

/**
 * Simulates every scored week as an all-play battle royale against the entire league,
 * calculating weekly placement (#1..N), all-play W-L, expected wins (xW), and luck verdicts.
 */
export function computeTeamWeeklyAllPlay(
  teams: TeamSummary[],
  targetRosterId: number,
  playoffStartWeek = 15,
): TeamWeeklyAllPlayReport | null {
  if (teams.length < 2) return null;
  const targetTeam = teams.find((t) => t.rosterId === targetRosterId) ?? teams[0];
  if (!targetTeam) return null;

  const hasRegularSeason = targetTeam.weeklyScores.some((w) => w.week < playoffStartWeek);
  const candidateWeeks = hasRegularSeason
    ? targetTeam.weeklyScores.filter((w) => w.week < playoffStartWeek)
    : targetTeam.weeklyScores;

  if (candidateWeeks.length === 0) return null;

  // Index all teams' weekly points by week number for exact head-to-field comparisons
  const weekBuckets = new Map<
    number,
    Array<{ rosterId: number; teamName: string; points: number }>
  >();

  for (const t of teams) {
    for (const entry of t.weeklyScores) {
      if (hasRegularSeason && entry.week >= playoffStartWeek) continue;
      const list = weekBuckets.get(entry.week) ?? [];
      list.push({ rosterId: t.rosterId, teamName: t.teamName, points: entry.points });
      weekBuckets.set(entry.week, list);
    }
  }

  const weeks: TeamWeeklyAllPlayRow[] = [];
  let totalAllPlayWins = 0;
  let totalAllPlayLosses = 0;
  let totalAllPlayTies = 0;
  let expectedWinsRaw = 0;
  let rankSum = 0;
  let fieldSum = 0;
  let topHalfWeeks = 0;
  let podiumWeeks = 0;
  let crownWeeks = 0;
  let robbedWeeks = 0;
  let heistWeeks = 0;

  for (const myWeek of [...candidateWeeks].sort((a, b) => a.week - b.week)) {
    const field = weekBuckets.get(myWeek.week) ?? [
      { rosterId: targetTeam.rosterId, teamName: targetTeam.teamName, points: myWeek.points },
    ];
    const sortedField = [...field].sort((a, b) => b.points - a.points);
    const fieldSize = Math.max(1, sortedField.length);
    const opponentsCount = Math.max(1, fieldSize - 1);

    let apWins = 0;
    let apLosses = 0;
    let apTies = 0;
    let higherCount = 0;

    for (const other of field) {
      if (other.rosterId === targetTeam.rosterId) continue;
      if (myWeek.points > other.points) apWins += 1;
      else if (myWeek.points < other.points) {
        apLosses += 1;
        higherCount += 1;
      } else {
        apTies += 1;
      }
    }

    const placementRank = higherCount + 1;
    const expectedWinShare =
      field.length > 1 ? (apWins + apTies * 0.5) / opponentsCount : myWeek.result === 'W' ? 1 : 0;
    const allPlayPct = expectedWinShare * 100;
    const isTopHalf = expectedWinShare >= 0.5;

    let verdict: WeeklyAllPlayVerdict;
    let verdictLabel: string;
    if (myWeek.result === 'BYE') {
      verdict = 'bye';
      verdictLabel = 'Bye Week';
    } else if (placementRank === 1 && myWeek.result === 'W') {
      verdict = 'crown';
      verdictLabel = 'Week Crown #1';
    } else if (myWeek.result === 'L' && isTopHalf) {
      verdict = 'robbed';
      verdictLabel = 'Robbed';
    } else if (myWeek.result === 'W' && !isTopHalf) {
      verdict = 'heist';
      verdictLabel = 'Stolen W';
    } else if (placementRank === 1) {
      verdict = 'crown';
      verdictLabel = 'Week Crown #1';
    } else if (myWeek.result === 'W') {
      verdict = 'solid';
      verdictLabel = 'Earned W';
    } else {
      verdict = 'tough';
      verdictLabel = 'Tough L';
    }

    totalAllPlayWins += apWins;
    totalAllPlayLosses += apLosses;
    totalAllPlayTies += apTies;
    expectedWinsRaw += expectedWinShare;
    rankSum += placementRank;
    fieldSum += fieldSize;
    if (isTopHalf) topHalfWeeks += 1;
    if (placementRank <= 3) podiumWeeks += 1;
    if (placementRank === 1) crownWeeks += 1;
    if (verdict === 'robbed') robbedWeeks += 1;
    if (verdict === 'heist') heistWeeks += 1;

    const leader = sortedField[0];
    const deltaFromAvg = Math.round((myWeek.points - myWeek.leagueAverage) * 100) / 100;

    weeks.push({
      week: myWeek.week,
      points: myWeek.points,
      leagueAverage: myWeek.leagueAverage,
      deltaFromAvg,
      placementRank,
      fieldSize,
      allPlayWins: apWins,
      allPlayLosses: apLosses,
      allPlayTies: apTies,
      allPlayPct,
      expectedWinShare,
      actualResult: myWeek.result,
      opponentRosterId: myWeek.opponentRosterId,
      opponentName: myWeek.opponentName,
      opponentPoints: myWeek.opponentPoints,
      topScoreThatWeek: leader?.points ?? myWeek.points,
      topScorerName: leader?.teamName ?? targetTeam.teamName,
      verdict,
      verdictLabel,
    });
  }

  const totalGamesCompared = Math.max(
    1,
    totalAllPlayWins + totalAllPlayLosses + totalAllPlayTies,
  );
  const expectedWins = Math.round(expectedWinsRaw * 10) / 10;
  const actualWinUnits = targetTeam.wins + targetTeam.ties * 0.5;
  const luckDeltaWins = Math.round((actualWinUnits - expectedWinsRaw) * 10) / 10;

  const sortedByStrength = [...weeks].sort(
    (a, b) => b.expectedWinShare - a.expectedWinShare || b.points - a.points,
  );

  return {
    rosterId: targetTeam.rosterId,
    teamName: targetTeam.teamName,
    actualWins: targetTeam.wins,
    actualLosses: targetTeam.losses,
    actualTies: targetTeam.ties,
    totalAllPlayWins,
    totalAllPlayLosses,
    totalAllPlayTies,
    allPlayPct: ((totalAllPlayWins + totalAllPlayTies * 0.5) / totalGamesCompared) * 100,
    expectedWins,
    luckDeltaWins,
    avgRank: Math.round((rankSum / weeks.length) * 10) / 10,
    avgFieldSize: Math.round((fieldSum / weeks.length) * 10) / 10,
    topHalfWeeks,
    podiumWeeks,
    crownWeeks,
    robbedWeeks,
    heistWeeks,
    bestWeek: sortedByStrength[0] ?? null,
    worstWeek: sortedByStrength[sortedByStrength.length - 1] ?? null,
    weeks,
  };
}
