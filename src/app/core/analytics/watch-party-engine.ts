import { NflGameCard, NflGameDetail, NflPlayItem } from '../models/espn.models';
import { normalizeNflAbbr } from './espn-mappers';

export interface WatchPartyStarter {
  playerId: string;
  name: string;
  position: string;
  slotLabel: string;
  nflTeam: string;
  currentPoints: number;
  projectedPoints: number | null;
  game: NflGameCard | null;
}

export type PlayImportance = 'touchdown' | 'big' | 'turnover' | 'normal';
export type PlayCategory = 'PASS' | 'RUSH' | 'REC' | 'TD' | 'FG' | 'INT' | 'FUM' | 'DEF' | 'XP';

export interface WatchPartyPlayEvent {
  id: string;
  side: 'home' | 'away';
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  teamLogo: string | null;
  matchupShort: string;
  quarter: number;
  clock: string;
  downDistance: string;
  category: PlayCategory;
  yardsLabel: string | null;
  text: string;
  pointsDelta: number;
  importance: PlayImportance;
  tagLabel: string | null;
  sortOrder: number;
}

function cleanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesStarterName(starterName: string, candidateText: string): boolean {
  const cleanStarter = cleanName(starterName);
  if (!cleanStarter) return false;
  const parts = cleanStarter.split(' ');
  const first = parts[0] ?? '';
  const lastParts = parts.slice(1);
  if (lastParts.length === 0) return false;
  const fullLast = lastParts.join(' ');
  const finalLast = lastParts[lastParts.length - 1];

  const cleanCandidate = cleanName(candidateText);
  if (cleanCandidate.includes(cleanStarter)) return true;

  // Match ESPN abbreviated forms with OR without a space after the period: "P.Mahomes", "P. Mahomes", "A.St. Brown"
  if (first && fullLast) {
    const dottedLastPattern = lastParts.map(escapeRegExp).join('[\\s.\\-\']*');
    const abbrevRegex = new RegExp(`\\b${first[0]}\\.?\\s*${dottedLastPattern}\\b`, 'i');
    if (abbrevRegex.test(candidateText)) return true;
  }

  if (first && finalLast && lastParts.length > 1) {
    const shortLastRegex = new RegExp(`\\b${first[0]}\\.?\\s*${escapeRegExp(finalLast)}\\b`, 'i');
    if (shortLastRegex.test(candidateText)) return true;
  }

  return false;
}

function playInvolvesStarter(
  starter: WatchPartyStarter,
  play: NflPlayItem,
  roleFilter?: 'passing' | 'receiving' | 'rushing',
): boolean {
  if (starter.position === 'DEF') return false;

  const hasHelpfulRoles =
    !roleFilter ||
    play.participants.some((pt) => pt.role && pt.role.includes(roleFilter));

  if (play.participants.length > 0 && hasHelpfulRoles) {
    const matched = play.participants.some((pt) => {
      if (roleFilter && pt.role && !pt.role.includes(roleFilter)) return false;
      return matchesStarterName(starter.name, pt.name);
    });
    if (matched) return true;
  }

  return matchesStarterName(starter.name, play.text);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyImportance(pointsDelta: number, isTouchdown: boolean): {
  importance: PlayImportance;
  tagLabel: string | null;
} {
  if (isTouchdown) {
    return { importance: 'touchdown', tagLabel: 'TOUCHDOWN' };
  }
  if (pointsDelta < 0) {
    return { importance: 'turnover', tagLabel: pointsDelta <= -1.5 ? 'TURNOVER' : 'NEGATIVE' };
  }
  if (pointsDelta >= 2.5) {
    return { importance: 'big', tagLabel: 'BIG PLAY' };
  }
  return { importance: 'normal', tagLabel: null };
}

function parseYardage(play: NflPlayItem): number {
  if (typeof play.yards === 'number') return play.yards;
  const match = play.text.match(/for (-?\d+)\s*(?:yard|yd)/i);
  if (match) return Number(match[1]) || 0;
  if (/for no gain/i.test(play.text)) return 0;
  return 0;
}

function clockToSecondsRemaining(clock: string): number {
  const parts = clock.split(':');
  if (parts.length !== 2) return 0;
  const mins = Number(parts[0]) || 0;
  const secs = Number(parts[1]) || 0;
  return mins * 60 + secs;
}

function isTwoPointPlay(textLower: string): boolean {
  return textLower.includes('two-point') || textLower.includes('2-point') || textLower.includes('two point');
}

function scoreFieldGoal(yards: number, scoring: Record<string, number>): number {
  if (yards >= 50) return scoring['fgm_50p'] ?? scoring['fgm'] ?? 5;
  if (yards >= 40) return scoring['fgm_40_49'] ?? scoring['fgm'] ?? 4;
  if (yards >= 30) return scoring['fgm_30_39'] ?? scoring['fgm'] ?? 3;
  if (yards >= 20) return scoring['fgm_20_29'] ?? scoring['fgm'] ?? 3;
  return scoring['fgm_0_19'] ?? scoring['fgm'] ?? 3;
}

/**
 * Evaluates a single NFL play against one fantasy team's active starters using Sleeper league scoring settings.
 */
export function evaluatePlayForSide(
  side: 'home' | 'away',
  play: NflPlayItem,
  game: NflGameCard,
  starters: WatchPartyStarter[],
  scoring: Record<string, number>,
  orderIndex: number,
): WatchPartyPlayEvent[] {
  const lower = play.text.toLowerCase();
  if (
    !lower ||
    lower.includes('no play') ||
    lower.includes('timeout') ||
    lower.startsWith('end of ') ||
    lower.includes('two-minute warning')
  ) {
    return [];
  }

  const offAbbr = normalizeNflAbbr(play.teamAbbr);
  const gameStarters = starters.filter(
    (s) =>
      s.nflTeam === game.away.normalizedAbbr ||
      s.nflTeam === game.home.normalizedAbbr,
  );
  if (gameStarters.length === 0) return [];

  const passYd = scoring['pass_yd'] ?? 0.04;
  const passTd = scoring['pass_td'] ?? 4;
  const passInt = scoring['pass_int'] ?? -2;
  const pass2Pt = scoring['pass_2pt'] ?? 2;
  const rushYd = scoring['rush_yd'] ?? 0.1;
  const rushTd = scoring['rush_td'] ?? 6;
  const rush2Pt = scoring['rush_2pt'] ?? 2;
  const recPts = scoring['rec'] ?? 0;
  const recYd = scoring['rec_yd'] ?? 0.1;
  const recTd = scoring['rec_td'] ?? 6;
  const rec2Pt = scoring['rec_2pt'] ?? 2;
  const fumLost = scoring['fum_lost'] ?? -2;
  const xpMade = scoring['xpm'] ?? 1;
  const xpMiss = scoring['xpmiss'] ?? -1;
  const fgMiss = scoring['fgmiss'] ?? -1;
  const defSack = scoring['sack'] ?? 1;
  const defInt = scoring['int'] ?? 2;
  const defFumRec = scoring['fum_rec'] ?? 2;
  const defTd = scoring['def_td'] ?? 6;
  const defSafe = scoring['safe'] ?? 2;

  const events: WatchPartyPlayEvent[] = [];
  const yards = parseYardage(play);
  const isTouchdown = lower.includes('touchdown');
  const isIntercepted = lower.includes('intercepted');
  const isSack = lower.includes('sacked');
  const isFumbleLost =
    lower.includes('fumble') &&
    (lower.includes('recovered by') || lower.includes('touchdown')) &&
    !lower.includes(`recovered by ${offAbbr.toLowerCase()}`);
  const isPass =
    play.playType.toLowerCase().includes('pass') || /\bpass(es|ed)?\b/i.test(play.text);
  const isIncomplete = lower.includes('incomplete');
  const isTwoPt = isTwoPointPlay(lower);
  const isGood = /\bis good\b/i.test(play.text) || lower.includes('succeeds');

  const getTeamLogo = (nflTeam: string) => {
    const norm = normalizeNflAbbr(nflTeam);
    if (game.away.normalizedAbbr === norm) return game.away.logo;
    if (game.home.normalizedAbbr === norm) return game.home.logo;
    return null;
  };

  const emitEvent = (
    starter: WatchPartyStarter,
    delta: number,
    tdFlag: boolean,
    category: PlayCategory,
    yardsLabel: string | null,
    customTag?: string,
  ) => {
    const rounded = round2(delta);
    if (rounded === 0) return;
    const { importance, tagLabel } = classifyImportance(rounded, tdFlag);
    events.push({
      id: `${side}-${play.id}-${starter.playerId}`,
      side,
      playerId: starter.playerId,
      playerName: starter.name,
      position: starter.position,
      nflTeam: starter.nflTeam,
      teamLogo: getTeamLogo(starter.nflTeam),
      matchupShort: game.shortName,
      quarter: play.quarter,
      clock: play.clock,
      downDistance: play.downDistance,
      category: tdFlag ? 'TD' : category,
      yardsLabel,
      text: play.text,
      pointsDelta: rounded,
      importance,
      tagLabel: customTag ?? tagLabel,
      sortOrder: orderIndex,
    });
  };

  for (const starter of gameStarters) {
    // Defense / Special Teams scoring (plays when opponent has offense)
    if (starter.position === 'DEF') {
      if (offAbbr && starter.nflTeam === offAbbr) continue;
      let defDelta = 0;
      let tdFlag = false;
      let defCat: PlayCategory = 'DEF';
      if (isSack) defDelta += defSack;
      if (isIntercepted) {
        defDelta += defInt;
        defCat = 'INT';
        if (isTouchdown) {
          defDelta += defTd;
          tdFlag = true;
        }
      }
      if (isFumbleLost) {
        defDelta += defFumRec;
        defCat = 'FUM';
        if (isTouchdown) {
          defDelta += defTd;
          tdFlag = true;
        }
      }
      if (lower.includes('safety')) defDelta += defSafe;
      if (defDelta !== 0) emitEvent(starter, defDelta, tdFlag, defCat, null);
      continue;
    }

    // Offensive / Kicking players match plays belonging to their NFL team
    if (offAbbr && starter.nflTeam !== offAbbr) continue;

    // Kickers
    if (starter.position === 'K') {
      if (lower.includes('field goal')) {
        const fgMatch = play.text.match(/(\d+)\s+yard\s+field goal/i);
        const fgYards = fgMatch ? Number(fgMatch[1]) || 35 : 35;
        if (lower.includes('is good')) {
          emitEvent(starter, scoreFieldGoal(fgYards, scoring), false, 'FG', `${fgYards} YD`, 'FIELD GOAL');
        } else if (lower.includes('no good') || lower.includes('missed') || lower.includes('blocked')) {
          emitEvent(starter, fgMiss, false, 'FG', `${fgYards} YD`, 'MISSED FG');
        }
      } else if (lower.includes('extra point')) {
        if (lower.includes('is good')) emitEvent(starter, xpMade, false, 'XP', null);
        else if (lower.includes('no good') || lower.includes('missed') || lower.includes('blocked')) {
          emitEvent(starter, xpMiss, false, 'XP', null, 'MISSED XP');
        }
      }
      continue;
    }

    // Two-point conversion
    if (isTwoPt) {
      if (!isGood) continue;
      if (isPass) {
        if (playInvolvesStarter(starter, play, 'passing')) emitEvent(starter, pass2Pt, false, 'PASS', null, '2PT');
        else if (playInvolvesStarter(starter, play, 'receiving')) emitEvent(starter, rec2Pt, false, 'REC', null, '2PT');
      } else if (playInvolvesStarter(starter, play, 'rushing')) {
        emitEvent(starter, rush2Pt, false, 'RUSH', null, '2PT');
      }
      continue;
    }

    if (isSack) {
      if (isFumbleLost && playInvolvesStarter(starter, play)) {
        emitEvent(starter, fumLost, false, 'FUM', null);
      }
      continue;
    }

    const ydBadge = yards !== 0 ? `${yards > 0 ? '+' : ''}${yards} YDS` : null;

    if (isPass) {
      const hasTypedPasser = play.participants.some((p) => p.role.includes('pass'));
      const hasTypedReceiver = play.participants.some((p) => p.role.includes('receiv'));

      const passIdx = lower.search(/\bpass(es|ed)?\b/);
      const splitIdx = lower.indexOf(' to ');
      const passerSegment = passIdx !== -1 ? play.text.slice(0, passIdx) : '';
      const rawRecTail = splitIdx !== -1 ? play.text.slice(splitIdx + 4) : '';
      const stopIdx = rawRecTail.search(/\b(for|at|pushed|ran|intercepted|fumbles)\b|\(/i);
      const receiverSegment = stopIdx !== -1 ? rawRecTail.slice(0, stopIdx) : rawRecTail;

      const isPasser = hasTypedPasser
        ? play.participants.some((p) => p.role.includes('pass') && matchesStarterName(starter.name, p.name))
        : matchesStarterName(starter.name, passerSegment);

      const isReceiver =
        !isPasser &&
        (hasTypedReceiver
          ? play.participants.some((p) => p.role.includes('receiv') && matchesStarterName(starter.name, p.name))
          : splitIdx !== -1 && matchesStarterName(starter.name, receiverSegment));

      const fumbledByStarter =
        isFumbleLost &&
        (lower.includes('fumble')
          ? play.text
              .split(/fumble[sd]?/i)
              .slice(0, -1)
              .some((chunk) => matchesStarterName(starter.name, chunk))
          : false);

      if (isPasser) {
        if (isIntercepted) {
          emitEvent(starter, passInt, false, 'INT', null);
        } else if (!isIncomplete) {
          let pts = yards * passYd + (isTouchdown ? passTd : 0);
          if (fumbledByStarter) pts += fumLost;
          emitEvent(starter, pts, isTouchdown, fumbledByStarter ? 'FUM' : 'PASS', ydBadge);
        }
      } else if (isReceiver && !isIntercepted && !isIncomplete) {
        let pts = recPts + yards * recYd + (isTouchdown ? recTd : 0);
        if (isFumbleLost && (!isPasser || fumbledByStarter)) pts += fumLost;
        emitEvent(starter, pts, isTouchdown, fumbledByStarter ? 'FUM' : 'REC', ydBadge);
      }
      continue;
    }

    // Rushing play
    const rushLeadText = play.text.split(/\b(fumble[sd]?|for\s+-?\d+|up the middle|left |right |scrambles)\b/i)[0] ?? play.text;
    const isRusher =
      play.participants.some((p) => p.role.includes('rush') && matchesStarterName(starter.name, p.name)) ||
      matchesStarterName(starter.name, rushLeadText);

    if (
      !lower.includes('punt') &&
      !lower.includes('kicks') &&
      !lower.includes('kickoff') &&
      isRusher
    ) {
      let pts = yards * rushYd + (isTouchdown ? rushTd : 0);
      if (isFumbleLost) pts += fumLost;
      emitEvent(starter, pts, isTouchdown, isFumbleLost ? 'FUM' : 'RUSH', ydBadge);
    }
  }

  return events;
}

export function buildMatchupWatchPartyFeed(
  homeStarters: WatchPartyStarter[],
  awayStarters: WatchPartyStarter[],
  gamesByEventId: Record<string, NflGameDetail | undefined>,
  scoringSettings: Record<string, number>,
): { homeEvents: WatchPartyPlayEvent[]; awayEvents: WatchPartyPlayEvent[] } {
  const uniqueGames = new Map<string, NflGameCard>();
  for (const s of [...homeStarters, ...awayStarters]) {
    if (s.game && s.game.state === 'in') {
      uniqueGames.set(s.game.id, s.game);
    }
  }

  const homeEvents: WatchPartyPlayEvent[] = [];
  const awayEvents: WatchPartyPlayEvent[] = [];

  for (const game of uniqueGames.values()) {
    const detail = gamesByEventId[game.id];
    if (!detail) continue;

    detail.allPlays.forEach((play, idx) => {
      const elapsedInQuarter = Math.max(0, 900 - clockToSecondsRemaining(play.clock));
      const orderWeight = play.quarter * 100_000 + elapsedInQuarter * 100 + (detail.allPlays.length - idx);
      homeEvents.push(
        ...evaluatePlayForSide('home', play, game, homeStarters, scoringSettings, orderWeight),
      );
      awayEvents.push(
        ...evaluatePlayForSide('away', play, game, awayStarters, scoringSettings, orderWeight),
      );
    });
  }

  const byRecency = (a: WatchPartyPlayEvent, b: WatchPartyPlayEvent) =>
    b.sortOrder - a.sortOrder || Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta);

  homeEvents.sort(byRecency);
  awayEvents.sort(byRecency);

  return { homeEvents, awayEvents };
}

export interface LeaguePlayRosterEntry extends WatchPartyStarter {
  fantasyTeamName: string;
  rosterId: number;
  avatarUrl: string | null;
  initials: string;
  isStarter: boolean;
  isMyTeam: boolean;
}

export interface PlayFantasyHit {
  playerName: string;
  position: string;
  pointsDelta: number;
  fantasyTeamName: string;
  rosterId: number;
  avatarUrl: string | null;
  initials: string;
  isStarter: boolean;
  isMyTeam: boolean;
}

export interface DecoratedGamePlay {
  id: string;
  quarter: number;
  clock: string;
  downDistance: string;
  teamAbbr: string;
  nflLogo: string | null;
  category: PlayCategory | 'PLAY';
  yardsLabel: string | null;
  text: string;
  isScoring: boolean;
  importance: PlayImportance;
  fantasyHits: PlayFantasyHit[];
}

export function decorateGamePlays(
  plays: NflPlayItem[],
  game: NflGameCard,
  rosteredPlayers: LeaguePlayRosterEntry[],
  scoringSettings: Record<string, number>,
): DecoratedGamePlay[] {
  const rosterByPlayerId = new Map(rosteredPlayers.map((p) => [p.playerId, p]));

  return plays.map((play, idx) => {
    const events = evaluatePlayForSide('home', play, game, rosteredPlayers, scoringSettings, idx);
    const hits: PlayFantasyHit[] = [];
    for (const ev of events) {
      const owner = rosterByPlayerId.get(ev.playerId);
      if (!owner) continue;
      hits.push({
        playerName: ev.playerName,
        position: ev.position,
        pointsDelta: ev.pointsDelta,
        fantasyTeamName: owner.fantasyTeamName,
        rosterId: owner.rosterId,
        avatarUrl: owner.avatarUrl,
        initials: owner.initials,
        isStarter: owner.isStarter,
        isMyTeam: owner.isMyTeam,
      });
    }

    hits.sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta));

    const normAbbr = normalizeNflAbbr(play.teamAbbr);
    const nflLogo =
      normAbbr === game.away.normalizedAbbr
        ? game.away.logo
        : normAbbr === game.home.normalizedAbbr
          ? game.home.logo
          : null;

    const lower = play.text.toLowerCase();
    const yards = parseYardage(play);
    const yardsLabel = yards !== 0 ? `${yards > 0 ? '+' : ''}${yards} YDS` : null;

    let category: PlayCategory | 'PLAY' =
      (events[0]?.category as PlayCategory | 'PLAY' | undefined) ?? 'PLAY';
    if (category === 'PLAY') {
      if (lower.includes('touchdown')) category = 'TD';
      else if (lower.includes('intercepted')) category = 'INT';
      else if (lower.includes('fumble')) category = 'FUM';
      else if (lower.includes('field goal')) category = 'FG';
      else if (lower.includes('pass')) category = 'PASS';
      else if (lower.includes('rush') || lower.includes('up the middle') || lower.includes('scrambles')) category = 'RUSH';
    }

    const topImportance: PlayImportance = events.some((e) => e.importance === 'touchdown') || lower.includes('touchdown')
      ? 'touchdown'
      : events.some((e) => e.importance === 'turnover')
        ? 'turnover'
        : events.some((e) => e.importance === 'big')
          ? 'big'
          : 'normal';

    return {
      id: play.id,
      quarter: play.quarter,
      clock: play.clock,
      downDistance: play.downDistance,
      teamAbbr: normAbbr,
      nflLogo,
      category,
      yardsLabel,
      text: play.text,
      isScoring: play.isScoring || lower.includes('touchdown') || lower.includes('field goal is good'),
      importance: topImportance,
      fantasyHits: hits,
    };
  });
}
