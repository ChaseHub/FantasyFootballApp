import {
  GameState,
  NflDriveSummary,
  NflGameCard,
  NflGameDetail,
  NflGameLeader,
  NflPlayItem,
  NflScoringPlay,
  NflSituation,
  NflTeamSide,
  NflTeamStatRow,
  NflTimeSlate,
  RawEspnCompetitor,
  RawEspnDrive,
  RawEspnEvent,
  RawEspnPlay,
  RawEspnSummary,
} from '../models/espn.models';

const NFL_ABBR_ALIASES: Record<string, string> = {
  WSH: 'WAS',
  WAS: 'WAS',
  JAC: 'JAX',
  JAX: 'JAX',
  LA: 'LAR',
  LAR: 'LAR',
  STL: 'LAR',
  SD: 'LAC',
  LAC: 'LAC',
  OAK: 'LV',
  LV: 'LV',
};

const TEAM_STAT_LABELS: Array<{ keys: string[]; label: string }> = [
  { keys: ['totalYards'], label: 'Total Yards' },
  { keys: ['netPassingYards'], label: 'Passing Yards' },
  { keys: ['rushingYards'], label: 'Rushing Yards' },
  { keys: ['firstDowns'], label: 'First Downs' },
  { keys: ['thirdDownEff'], label: '3rd Down' },
  { keys: ['turnovers'], label: 'Turnovers' },
  { keys: ['possessionTime'], label: 'Possession' },
];

export function normalizeNflAbbr(abbr: string | null | undefined): string {
  const code = (abbr ?? '').trim().toUpperCase();
  return NFL_ABBR_ALIASES[code] ?? code;
}

export function groupGamesBySlate(games: NflGameCard[]): NflTimeSlate[] {
  const map = new Map<string, NflTimeSlate>();

  for (const g of games) {
    const d = g.dateIso ? new Date(g.dateIso) : null;
    const isValid = d !== null && !Number.isNaN(d.getTime());
    let id = 'other';
    let label = 'Other Games';
    const sortTimeMs = isValid ? d.getTime() : Number.MAX_SAFE_INTEGER;

    if (isValid) {
      const day = d.getDay();
      const hour = d.getHours();
      const formatHour = (h: number) => {
        const dt = new Date(d);
        dt.setHours(h, 0, 0, 0);
        return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      };

      if (day === 4) {
        if (hour < 18) {
          id = 'thu-day';
          label = 'Thursday Slate';
        } else {
          id = 'thu-night';
          label = 'Thursday Night Football';
        }
      } else if (day === 5) {
        id = 'fri';
        label = 'Friday Game';
      } else if (day === 6) {
        id = 'sat';
        label = hour >= 18 ? 'Saturday Night' : 'Saturday Slate';
      } else if (day === 0) {
        if (hour < 11) {
          id = 'sun-intl';
          label = 'Sunday Morning / International';
        } else if (hour < 14) {
          id = 'sun-early';
          label = `Sunday · ${formatHour(hour)} Slate`;
        } else if (hour < 18) {
          id = 'sun-late';
          label = `Sunday · ${formatHour(hour)} Late Slate`;
        } else {
          id = 'sun-night';
          label = 'Sunday Night Football';
        }
      } else if (day === 1) {
        id = 'mon-night';
        label = 'Monday Night Football';
      }
    }

    const existing = map.get(id);
    if (existing) {
      existing.games.push(g);
      existing.sortTimeMs = Math.min(existing.sortTimeMs, sortTimeMs);
    } else {
      map.set(id, { id, label, sortTimeMs, games: [g] });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sortTimeMs - b.sortTimeMs);
}

export function formatEspnKickoff(dateIso: string): string {
  if (!dateIso) return 'TBD';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function mapEspnCompetitor(c: RawEspnCompetitor): NflTeamSide {
  const abbr = (c.team?.abbreviation ?? 'NFL').toUpperCase();
  return {
    id: c.team?.id ?? c.id ?? abbr,
    abbr,
    normalizedAbbr: normalizeNflAbbr(abbr),
    name: c.team?.shortDisplayName ?? abbr,
    displayName: c.team?.displayName ?? abbr,
    logo: c.team?.logo ?? null,
    record: c.records?.[0]?.summary ?? '0-0',
    score: Number(c.score ?? 0) || 0,
    winner: Boolean(c.winner),
    linescores: (c.linescores ?? []).map((ls) => Number(ls.value ?? 0) || 0),
  };
}

export function mapEspnEventToGameCard(ev: RawEspnEvent): NflGameCard | null {
  const comp = ev.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const rawHome = competitors.find((c) => c.homeAway === 'home');
  const rawAway = competitors.find((c) => c.homeAway === 'away');
  if (!ev.id || !comp || !rawHome || !rawAway) return null;

  const state: GameState = comp.status?.type?.state ?? 'pre';
  const home = mapEspnCompetitor(rawHome);
  const away = mapEspnCompetitor(rawAway);
  const dateIso = ev.date ?? '';
  const kickoffLabel = formatEspnKickoff(dateIso);
  const broadcast = comp.broadcasts?.[0]?.names?.[0] ?? null;
  const odd = comp.odds?.[0];

  const sit = comp.situation;
  const situation: NflSituation | null = sit
    ? {
        downDistanceText: sit.shortDownDistanceText ?? sit.downDistanceText ?? null,
        possessionText: sit.possessionText ?? null,
        possessionTeamId: sit.possession ?? null,
        yardLine: typeof sit.yardLine === 'number' ? sit.yardLine : null,
        isRedZone: Boolean(sit.isRedZone),
        lastPlayText: sit.lastPlay?.text ?? null,
      }
    : null;

  return {
    id: ev.id,
    name: ev.name ?? `${away.abbr} at ${home.abbr}`,
    shortName: ev.shortName ?? `${away.abbr} @ ${home.abbr}`,
    dateIso,
    kickoffLabel,
    venue: comp.venue?.fullName ?? null,
    broadcast,
    state,
    statusDetail:
      state === 'pre'
        ? kickoffLabel
        : comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? kickoffLabel,
    period: comp.status?.period ?? 0,
    clock: comp.status?.displayClock ?? '0:00',
    away,
    home,
    situation,
    oddsLine: odd?.details ?? null,
    overUnder: typeof odd?.overUnder === 'number' ? odd.overUnder : null,
  };
}

export function mapEspnPlay(
  p: RawEspnPlay,
  fallbackIndex: number,
  teamMapById: Record<string, string>,
  fallbackAbbr = '',
): NflPlayItem {
  const teamId = p.team?.id ?? null;
  const teamAbbr = (
    p.team?.abbreviation ??
    (teamId ? teamMapById[teamId] : undefined) ??
    fallbackAbbr
  ).toUpperCase();

  return {
    id: p.id ?? `play-${fallbackIndex}`,
    sequenceNumber: Number(p.sequenceNumber ?? 0) || fallbackIndex,
    quarter: p.period?.number ?? 1,
    clock: p.clock?.displayValue ?? '',
    teamId,
    teamAbbr,
    playType: p.type?.text ?? '',
    downDistance: p.start?.shortDownDistanceText ?? p.start?.downDistanceText ?? '',
    text: p.text ?? '',
    yards: typeof p.statYardage === 'number' ? p.statYardage : null,
    isScoring: Boolean(p.scoringPlay),
    participants: (p.participants ?? [])
      .map((pt) => ({
        name: pt.athlete?.displayName ?? pt.athlete?.shortName ?? '',
        role: (pt.type ?? '').toLowerCase(),
      }))
      .filter((pt) => pt.name.length > 0),
  };
}

export function mergeEspnPlayLists(
  incoming: NflPlayItem[],
  existing: NflPlayItem[],
): NflPlayItem[] {
  const byId = new Map<string, NflPlayItem>();
  for (const p of existing) byId.set(p.id, p);
  for (const p of incoming) byId.set(p.id, p);
  return Array.from(byId.values()).sort(
    (a, b) => b.quarter - a.quarter || b.sequenceNumber - a.sequenceNumber,
  );
}

export function mapEspnSummaryToDetail(
  eventId: string,
  raw: RawEspnSummary,
  teamMapById: Record<string, string>,
): NflGameDetail {
  const scoringPlays: NflScoringPlay[] = (raw.scoringPlays ?? []).map((sp, idx) => ({
    id: sp.id ?? `sp-${idx}`,
    quarter: sp.period?.number ?? 1,
    clock: sp.clock?.displayValue ?? '',
    teamAbbr: (sp.team?.abbreviation ?? teamMapById[sp.team?.id ?? ''] ?? '').toUpperCase(),
    teamLogo: sp.team?.logo ?? null,
    typeText: sp.type?.text ?? 'Score',
    text: sp.text ?? '',
    awayScore: sp.awayScore ?? 0,
    homeScore: sp.homeScore ?? 0,
  }));

  const currentDriveRaw = raw.drives?.current;
  const currentDrive: NflDriveSummary | null = currentDriveRaw
    ? {
        teamAbbr: (
          currentDriveRaw.team?.abbreviation ??
          teamMapById[currentDriveRaw.team?.id ?? ''] ??
          ''
        ).toUpperCase(),
        description: currentDriveRaw.description ?? 'Active drive',
        yards: currentDriveRaw.yards ?? 0,
        playCount: currentDriveRaw.offensivePlays ?? currentDriveRaw.plays?.length ?? 0,
        plays: (currentDriveRaw.plays ?? []).map((p, idx) => mapEspnPlay(p, idx, teamMapById)),
      }
    : null;

  const collectedPlays: NflPlayItem[] = [];
  const seenPlayIds = new Set<string>();

  const driveSources: RawEspnDrive[] = [
    ...(currentDriveRaw ? [currentDriveRaw] : []),
    ...[...(raw.drives?.previous ?? [])].reverse(),
  ];

  for (const drv of driveSources) {
    const drvTeamAbbr = (
      drv.team?.abbreviation ??
      teamMapById[drv.team?.id ?? ''] ??
      ''
    ).toUpperCase();
    const plays = [...(drv.plays ?? [])].reverse();
    for (let i = 0; i < plays.length; i++) {
      const mapped = mapEspnPlay(plays[i], collectedPlays.length + i, teamMapById, drvTeamAbbr);
      if (!seenPlayIds.has(mapped.id)) {
        seenPlayIds.add(mapped.id);
        collectedPlays.push(mapped);
      }
    }
  }

  if (raw.plays?.length) {
    const recentRaw = [...raw.plays].reverse();
    recentRaw.forEach((p, idx) => {
      const mapped = mapEspnPlay(p, collectedPlays.length + idx, teamMapById);
      if (!seenPlayIds.has(mapped.id)) {
        seenPlayIds.add(mapped.id);
        collectedPlays.push(mapped);
      }
    });
  }

  collectedPlays.sort((a, b) => b.quarter - a.quarter || b.sequenceNumber - a.sequenceNumber);

  const boxTeams = raw.boxscore?.teams ?? [];
  const teamStats: NflTeamStatRow[] = [];
  if (boxTeams.length === 2) {
    const awayStats = boxTeams[0]?.statistics ?? [];
    const homeStats = boxTeams[1]?.statistics ?? [];

    for (const spec of TEAM_STAT_LABELS) {
      const a = awayStats.find((s) => spec.keys.includes(s.name ?? ''));
      const h = homeStats.find((s) => spec.keys.includes(s.name ?? ''));
      if (a?.displayValue !== undefined || h?.displayValue !== undefined) {
        teamStats.push({
          label: spec.label,
          awayValue: a?.displayValue ?? '0',
          homeValue: h?.displayValue ?? '0',
        });
      }
    }
  }

  const leaders: NflGameLeader[] = [];
  for (const grp of raw.leaders ?? []) {
    const abbr = (grp.team?.abbreviation ?? '').toUpperCase();
    for (const cat of grp.leaders ?? []) {
      const top = cat.leaders?.[0];
      const name = top?.athlete?.displayName ?? top?.athlete?.shortName;
      if (name && top?.displayValue) {
        leaders.push({
          category: cat.displayName ?? cat.name ?? 'Stat',
          playerName: name,
          teamAbbr: abbr,
          summary: top.displayValue,
        });
      }
    }
  }

  return {
    eventId,
    currentDrive,
    scoringPlays,
    recentPlays: collectedPlays.slice(0, 16),
    allPlays: collectedPlays,
    teamStats,
    leaders: leaders.slice(0, 6),
  };
}
