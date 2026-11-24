import {
  SleeperBracketMatchup,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
} from '../models/sleeper.models';

export interface HistoricalSeasonSnapshot {
  league: SleeperLeague;
  users: SleeperLeagueUser[];
  rosters: SleeperRoster[];
  winnersBracket: SleeperBracketMatchup[];
  matchupsByWeek: Record<number, SleeperMatchup[]>;
}

export interface SeasonHallEntry {
  season: string;
  leagueId: string;
  leagueName: string;
  champManagerKey: string | null;
  champTeamName: string;
  champManagerName: string;
  champRecord: string;
  runnerUpName: string | null;
  titleScore: string | null;
  topScorerTeam: string;
  topScorerPf: number;
  bestRecordTeam: string;
  bestRecord: string;
}

export interface AllTimeManagerRow {
  managerKey: string;
  displayName: string;
  latestTeamName: string;
  avatarUrl: string | null;
  initials: string;
  seasonsPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  totalPf: number;
  totalPa: number;
  titles: number;
  runnerUps: number;
  playoffApps: number;
  bestFinish: number | null;
  latestRosterId: number | null;
}

export interface H2hPairRecord {
  wins: number;
  losses: number;
  ties: number;
  games: number;
  pfFor: number;
  pfAgainst: number;
  largestWinMargin: number;
  largestLossMargin: number;
  streak: string;
  lastMeeting: string;
}

export interface LeagueAllTimeRecord {
  id: string;
  label: string;
  stat: string;
  holder: string;
  context: string;
  season: string;
}

export interface AllTimeLeagueHistory {
  seasonsCount: number;
  hallOfChampions: SeasonHallEntry[];
  managers: AllTimeManagerRow[];
  h2hMatrix: Record<string, Record<string, H2hPairRecord>>;
  records: LeagueAllTimeRecord[];
}

function resolvePoints(whole?: number, dec?: number): number {
  return Math.round(((whole ?? 0) + (dec ?? 0) / 100) * 100) / 100;
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'TM';
}

/**
 * Aggregates multi-season Sleeper snapshots into Hall of Champions, manager career stats,
 * all-time records, and a head-to-head rivalry matrix keyed by stable manager ID.
 */
export function computeAllTimeLeagueHistory(
  snapshots: HistoricalSeasonSnapshot[],
): AllTimeLeagueHistory {
  if (snapshots.length === 0) {
    return { seasonsCount: 0, hallOfChampions: [], managers: [], h2hMatrix: {}, records: [] };
  }

  // Chronological oldest -> newest so latest team name/avatar and H2H streaks stay accurate
  const sorted = [...snapshots].sort((a, b) => Number(a.league.season) - Number(b.league.season));

  const managerAccum = new Map<
    string,
    {
      managerKey: string;
      displayName: string;
      latestTeamName: string;
      avatarUrl: string | null;
      initials: string;
      seasonsSet: Set<string>;
      wins: number;
      losses: number;
      ties: number;
      totalPf: number;
      totalPa: number;
      titles: number;
      runnerUps: number;
      playoffApps: number;
      bestFinish: number | null;
      latestRosterId: number | null;
    }
  >();

  const h2hEvents = new Map<
    string,
    Map<
      string,
      Array<{
        season: string;
        week: number;
        myPts: number;
        oppPts: number;
        outcome: 'W' | 'L' | 'T';
      }>
    >
  >();

  let highWeek: { score: number; holder: string; season: string; week: number; vs: string } | null =
    null;
  let bigBlowout: {
    margin: number;
    holder: string;
    opp: string;
    scoreLine: string;
    season: string;
    week: number;
  } | null = null;
  let closeFinish: {
    margin: number;
    holder: string;
    opp: string;
    scoreLine: string;
    season: string;
    week: number;
  } | null = null;
  let topSeasonPf: { pf: number; holder: string; season: string; record: string } | null = null;

  const hallOfChampions: SeasonHallEntry[] = [];

  for (const snap of sorted) {
    const userById = new Map(snap.users.map((u) => [u.user_id, u]));
    const rosterMeta = new Map<
      number,
      { key: string; teamName: string; displayName: string; avatarUrl: string | null; roster: SleeperRoster }
    >();

    for (const r of snap.rosters) {
      const user = r.owner_id ? userById.get(r.owner_id) : undefined;
      const displayName = user?.display_name?.trim() || `Owner ${r.roster_id}`;
      const teamName = user?.metadata?.team_name?.trim() || displayName;
      const key = r.owner_id ? `u:${r.owner_id}` : `name:${displayName.toLowerCase()}`;
      const avatarId = user?.avatar ?? null;
      const avatarUrl = avatarId ? `https://sleepercdn.com/avatars/thumbs/${avatarId}` : null;

      rosterMeta.set(r.roster_id, { key, teamName, displayName, avatarUrl, roster: r });

      const cur = managerAccum.get(key) ?? {
        managerKey: key,
        displayName,
        latestTeamName: teamName,
        avatarUrl,
        initials: computeInitials(teamName),
        seasonsSet: new Set<string>(),
        wins: 0,
        losses: 0,
        ties: 0,
        totalPf: 0,
        totalPa: 0,
        titles: 0,
        runnerUps: 0,
        playoffApps: 0,
        bestFinish: null,
        latestRosterId: snap.league.league_id === sorted[sorted.length - 1].league.league_id ? r.roster_id : null,
      };
      cur.displayName = displayName;
      cur.latestTeamName = teamName;
      if (avatarUrl) cur.avatarUrl = avatarUrl;
      cur.initials = computeInitials(teamName);
      cur.seasonsSet.add(snap.league.season);
      cur.wins += r.settings?.wins ?? 0;
      cur.losses += r.settings?.losses ?? 0;
      cur.ties += r.settings?.ties ?? 0;
      const pf = resolvePoints(r.settings?.fpts, r.settings?.fpts_decimal);
      const pa = resolvePoints(r.settings?.fpts_against, r.settings?.fpts_against_decimal);
      cur.totalPf += pf;
      cur.totalPa += pa;
      if (snap.league.league_id === sorted[sorted.length - 1].league.league_id) {
        cur.latestRosterId = r.roster_id;
      }
      managerAccum.set(key, cur);

      if (pf > 0 && (!topSeasonPf || pf > topSeasonPf.pf)) {
        topSeasonPf = {
          pf,
          holder: `${teamName} (${displayName})`,
          season: snap.league.season,
          record: `${r.settings?.wins ?? 0}-${r.settings?.losses ?? 0}`,
        };
      }
    }

    // Playoff appearances & champion detection from winnersBracket + standings fallback
    const bracketRosters = new Set<number>();
    let titleMatch: SleeperBracketMatchup | null = null;
    for (const bm of snap.winnersBracket) {
      if (bm.t1) bracketRosters.add(bm.t1);
      if (bm.t2) bracketRosters.add(bm.t2);
      if (bm.p === 1 && bm.w) {
        titleMatch = bm;
      }
    }
    for (const rid of bracketRosters) {
      const m = rosterMeta.get(rid);
      if (m) {
        const acc = managerAccum.get(m.key);
        if (acc) acc.playoffApps += 1;
      }
    }

    const orderedRosters = [...snap.rosters].sort((a, b) => {
      const wDiff = (b.settings?.wins ?? 0) - (a.settings?.wins ?? 0);
      if (wDiff !== 0) return wDiff;
      return (
        resolvePoints(b.settings?.fpts, b.settings?.fpts_decimal) -
        resolvePoints(a.settings?.fpts, a.settings?.fpts_decimal)
      );
    });
    const topScorerRoster = [...snap.rosters].sort(
      (a, b) =>
        resolvePoints(b.settings?.fpts, b.settings?.fpts_decimal) -
        resolvePoints(a.settings?.fpts, a.settings?.fpts_decimal),
    )[0];

    // Record H2H matchups across all weeks
    const weekNums = Object.keys(snap.matchupsByWeek)
      .map(Number)
      .sort((a, b) => a - b);

    for (const wk of weekNums) {
      const entries = snap.matchupsByWeek[wk] ?? [];
      const byMid = new Map<number, SleeperMatchup[]>();
      for (const entry of entries) {
        if (entry.matchup_id === null) continue;
        const grp = byMid.get(entry.matchup_id) ?? [];
        grp.push(entry);
        byMid.set(entry.matchup_id, grp);
      }

      for (const pair of byMid.values()) {
        if (pair.length < 2) continue;
        const [a, b] = pair;
        const metaA = rosterMeta.get(a.roster_id);
        const metaB = rosterMeta.get(b.roster_id);
        if (!metaA || !metaB || (a.points === 0 && b.points === 0)) continue;

        const outA: 'W' | 'L' | 'T' = a.points > b.points ? 'W' : a.points < b.points ? 'L' : 'T';
        const outB: 'W' | 'L' | 'T' = outA === 'W' ? 'L' : outA === 'L' ? 'W' : 'T';

        const pushH2h = (
          meKey: string,
          oppKey: string,
          myPts: number,
          oppPts: number,
          outcome: 'W' | 'L' | 'T',
        ) => {
          const inner = h2hEvents.get(meKey) ?? new Map();
          const list = inner.get(oppKey) ?? [];
          list.push({ season: snap.league.season, week: wk, myPts, oppPts, outcome });
          inner.set(oppKey, list);
          h2hEvents.set(meKey, inner);
        };

        pushH2h(metaA.key, metaB.key, a.points, b.points, outA);
        pushH2h(metaB.key, metaA.key, b.points, a.points, outB);

        const margin = Math.round(Math.abs(a.points - b.points) * 100) / 100;
        const winnerMeta = a.points >= b.points ? metaA : metaB;
        const loserMeta = a.points >= b.points ? metaB : metaA;
        const winPts = Math.max(a.points, b.points);
        const losePts = Math.min(a.points, b.points);

        if (!highWeek || winPts > highWeek.score) {
          highWeek = {
            score: winPts,
            holder: winnerMeta.teamName,
            season: snap.league.season,
            week: wk,
            vs: loserMeta.teamName,
          };
        }
        if (margin > 0 && (!bigBlowout || margin > bigBlowout.margin)) {
          bigBlowout = {
            margin,
            holder: winnerMeta.teamName,
            opp: loserMeta.teamName,
            scoreLine: `${winPts.toFixed(1)}–${losePts.toFixed(1)}`,
            season: snap.league.season,
            week: wk,
          };
        }
        if (margin > 0 && (!closeFinish || margin < closeFinish.margin)) {
          closeFinish = {
            margin,
            holder: winnerMeta.teamName,
            opp: loserMeta.teamName,
            scoreLine: `${winPts.toFixed(1)}–${losePts.toFixed(1)}`,
            season: snap.league.season,
            week: wk,
          };
        }
      }
    }

    // Hall of Champions row
    if (titleMatch?.w) {
      const champMeta = rosterMeta.get(titleMatch.w);
      const ruMeta = titleMatch.l ? rosterMeta.get(titleMatch.l) : null;
      if (champMeta) {
        const acc = managerAccum.get(champMeta.key);
        if (acc) {
          acc.titles += 1;
          acc.bestFinish = 1;
        }
      }
      if (ruMeta) {
        const acc = managerAccum.get(ruMeta.key);
        if (acc) {
          acc.runnerUps += 1;
          if (acc.bestFinish === null || acc.bestFinish > 2) acc.bestFinish = 2;
        }
      }

      const playoffStart = snap.league.settings?.playoff_week_start ?? 15;
      const champWeek = playoffStart + titleMatch.r - 1;
      const finalWeekEntries = snap.matchupsByWeek[champWeek] ?? [];
      const cScore = finalWeekEntries.find((e) => e.roster_id === titleMatch!.w)?.points;
      const lScore = finalWeekEntries.find((e) => e.roster_id === titleMatch!.l)?.points;
      const titleScore =
        typeof cScore === 'number' && typeof lScore === 'number' && (cScore > 0 || lScore > 0)
          ? `${cScore.toFixed(1)}–${lScore.toFixed(1)}`
          : null;

      const cRec = champMeta
        ? `${champMeta.roster.settings?.wins ?? 0}-${champMeta.roster.settings?.losses ?? 0}`
        : '—';
      const topMeta = topScorerRoster ? rosterMeta.get(topScorerRoster.roster_id) : null;
      const bestMeta = orderedRosters[0] ? rosterMeta.get(orderedRosters[0].roster_id) : null;

      hallOfChampions.push({
        season: snap.league.season,
        leagueId: snap.league.league_id,
        leagueName: snap.league.name,
        champManagerKey: champMeta?.key ?? null,
        champTeamName: champMeta?.teamName ?? 'Champion',
        champManagerName: champMeta?.displayName ?? 'Manager',
        champRecord: cRec,
        runnerUpName: ruMeta?.teamName ?? null,
        titleScore,
        topScorerTeam: topMeta?.teamName ?? '—',
        topScorerPf: topScorerRoster
          ? resolvePoints(topScorerRoster.settings?.fpts, topScorerRoster.settings?.fpts_decimal)
          : 0,
        bestRecordTeam: bestMeta?.teamName ?? '—',
        bestRecord: orderedRosters[0]
          ? `${orderedRosters[0].settings?.wins ?? 0}-${orderedRosters[0].settings?.losses ?? 0}`
          : '—',
      });
    } else if (snap.league.status === 'complete' && orderedRosters.length > 0) {
      const champMeta = rosterMeta.get(orderedRosters[0].roster_id);
      const topMeta = topScorerRoster ? rosterMeta.get(topScorerRoster.roster_id) : null;
      if (champMeta) {
        const acc = managerAccum.get(champMeta.key);
        if (acc) {
          acc.titles += 1;
          acc.bestFinish = 1;
        }
      }
      hallOfChampions.push({
        season: snap.league.season,
        leagueId: snap.league.league_id,
        leagueName: snap.league.name,
        champManagerKey: champMeta?.key ?? null,
        champTeamName: champMeta?.teamName ?? 'Champion',
        champManagerName: champMeta?.displayName ?? 'Manager',
        champRecord: `${orderedRosters[0].settings?.wins ?? 0}-${orderedRosters[0].settings?.losses ?? 0}`,
        runnerUpName: orderedRosters[1] ? rosterMeta.get(orderedRosters[1].roster_id)?.teamName ?? null : null,
        titleScore: null,
        topScorerTeam: topMeta?.teamName ?? '—',
        topScorerPf: topScorerRoster
          ? resolvePoints(topScorerRoster.settings?.fpts, topScorerRoster.settings?.fpts_decimal)
          : 0,
        bestRecordTeam: champMeta?.teamName ?? '—',
        bestRecord: `${orderedRosters[0].settings?.wins ?? 0}-${orderedRosters[0].settings?.losses ?? 0}`,
      });
    }
  }

  const h2hMatrix: Record<string, Record<string, H2hPairRecord>> = {};
  for (const [meKey, oppMap] of h2hEvents.entries()) {
    h2hMatrix[meKey] = {};
    for (const [oppKey, events] of oppMap.entries()) {
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let pfFor = 0;
      let pfAgainst = 0;
      let largestWinMargin = 0;
      let largestLossMargin = 0;

      for (const ev of events) {
        pfFor += ev.myPts;
        pfAgainst += ev.oppPts;
        const diff = Math.round((ev.myPts - ev.oppPts) * 100) / 100;
        if (ev.outcome === 'W') {
          wins += 1;
          if (diff > largestWinMargin) largestWinMargin = diff;
        } else if (ev.outcome === 'L') {
          losses += 1;
          if (-diff > largestLossMargin) largestLossMargin = -diff;
        } else {
          ties += 1;
        }
      }

      const last = events[events.length - 1];
      let streakCount = 0;
      const lastOut = last.outcome;
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].outcome === lastOut) streakCount += 1;
        else break;
      }

      h2hMatrix[meKey][oppKey] = {
        wins,
        losses,
        ties,
        games: events.length,
        pfFor: Math.round(pfFor * 100) / 100,
        pfAgainst: Math.round(pfAgainst * 100) / 100,
        largestWinMargin,
        largestLossMargin,
        streak: `${lastOut}${streakCount}`,
        lastMeeting: `${last.season} W${last.week} (${last.myPts.toFixed(1)}–${last.oppPts.toFixed(1)})`,
      };
    }
  }

  const managers: AllTimeManagerRow[] = Array.from(managerAccum.values())
    .map((m) => {
      const total = Math.max(1, m.wins + m.losses + m.ties);
      return {
        managerKey: m.managerKey,
        displayName: m.displayName,
        latestTeamName: m.latestTeamName,
        avatarUrl: m.avatarUrl,
        initials: m.initials,
        seasonsPlayed: m.seasonsSet.size,
        wins: m.wins,
        losses: m.losses,
        ties: m.ties,
        winPct: Math.round((m.wins / total) * 1000) / 10,
        totalPf: Math.round(m.totalPf * 100) / 100,
        totalPa: Math.round(m.totalPa * 100) / 100,
        titles: m.titles,
        runnerUps: m.runnerUps,
        playoffApps: m.playoffApps,
        bestFinish: m.bestFinish,
        latestRosterId: m.latestRosterId,
      };
    })
    .sort((a, b) => b.titles - a.titles || b.winPct - a.winPct || b.wins - a.wins || b.totalPf - a.totalPf);

  const records: LeagueAllTimeRecord[] = [];
  if (highWeek) {
    records.push({
      id: 'high-week',
      label: 'All-Time Single Week',
      stat: `${highWeek.score.toFixed(2)} pts`,
      holder: highWeek.holder,
      context: `Week ${highWeek.week} vs ${highWeek.vs}`,
      season: highWeek.season,
    });
  }
  if (topSeasonPf) {
    records.push({
      id: 'top-season',
      label: 'Best Season Output',
      stat: `${topSeasonPf.pf.toFixed(1)} PF`,
      holder: topSeasonPf.holder,
      context: `${topSeasonPf.record} finish`,
      season: topSeasonPf.season,
    });
  }
  if (bigBlowout) {
    records.push({
      id: 'blowout',
      label: 'Largest Blowout',
      stat: `+${bigBlowout.margin.toFixed(2)}`,
      holder: bigBlowout.holder,
      context: `Defeated ${bigBlowout.opp} (${bigBlowout.scoreLine}) in W${bigBlowout.week}`,
      season: bigBlowout.season,
    });
  }
  if (closeFinish) {
    records.push({
      id: 'nailbiter',
      label: 'Closest Finish',
      stat: `+${closeFinish.margin.toFixed(2)}`,
      holder: closeFinish.holder,
      context: `Edged ${closeFinish.opp} (${closeFinish.scoreLine}) in W${closeFinish.week}`,
      season: closeFinish.season,
    });
  }

  return {
    seasonsCount: sorted.length,
    hallOfChampions: [...hallOfChampions].reverse(),
    managers,
    h2hMatrix,
    records,
  };
}
