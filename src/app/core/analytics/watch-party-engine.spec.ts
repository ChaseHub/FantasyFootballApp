import { NflGameCard } from '../models/espn.models';
import {
  LeaguePlayRosterEntry,
  WatchPartyStarter,
  buildMatchupWatchPartyFeed,
  decorateGamePlays,
  evaluatePlayForSide,
} from './watch-party-engine';

describe('watch-party-engine', () => {
  const sampleGame: NflGameCard = {
    id: 'g1',
    name: 'Kansas City Chiefs at Buffalo Bills',
    shortName: 'KC @ BUF',
    dateIso: '2026-11-22T18:00Z',
    kickoffLabel: 'Sun, 12:00 PM CST',
    venue: null,
    broadcast: 'CBS',
    state: 'in',
    statusDetail: '3rd 04:12',
    period: 3,
    clock: '04:12',
    away: {
      id: '12',
      abbr: 'KC',
      normalizedAbbr: 'KC',
      name: 'Chiefs',
      displayName: 'Kansas City Chiefs',
      logo: 'https://a.espncdn.com/kc.png',
      record: '9-2',
      score: 21,
      winner: true,
      linescores: [7, 7, 7],
    },
    home: {
      id: '2',
      abbr: 'BUF',
      normalizedAbbr: 'BUF',
      name: 'Bills',
      displayName: 'Buffalo Bills',
      logo: null,
      record: '9-2',
      score: 20,
      winner: false,
      linescores: [7, 6, 7],
    },
    situation: null,
    oddsLine: null,
    overUnder: null,
  };

  const scoring = {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    fum_lost: -2,
    sack: 1,
    int: 2,
    def_td: 6,
  };

  const mahomes: WatchPartyStarter = {
    playerId: '4046',
    name: 'Patrick Mahomes',
    position: 'QB',
    slotLabel: 'QB',
    nflTeam: 'KC',
    currentPoints: 18,
    projectedPoints: 22,
    game: sampleGame,
  };

  const kelce: WatchPartyStarter = {
    playerId: '1466',
    name: 'Travis Kelce',
    position: 'TE',
    slotLabel: 'TE',
    nflTeam: 'KC',
    currentPoints: 14,
    projectedPoints: 15,
    game: sampleGame,
  };

  const billsDef: WatchPartyStarter = {
    playerId: 'BUF',
    name: 'Buffalo Bills',
    position: 'DEF',
    slotLabel: 'DEF',
    nflTeam: 'BUF',
    currentPoints: 5,
    projectedPoints: 7,
    game: sampleGame,
  };

  it('calculates touchdown + yardage + PPR points for passer and receiver accurately', () => {
    const events = evaluatePlayForSide(
      'home',
      {
        id: 'pl-td',
        sequenceNumber: 1,
        quarter: 2,
        clock: '01:15',
        teamId: '12',
        teamAbbr: 'KC',
        playType: 'Passing Touchdown',
        downDistance: '2nd & 5',
        text: 'P. Mahomes pass deep right to T. Kelce for 25 yards, TOUCHDOWN.',
        yards: 25,
        isScoring: true,
        participants: [
          { name: 'Patrick Mahomes', role: 'passing' },
          { name: 'Travis Kelce', role: 'receiving' },
        ],
      },
      sampleGame,
      [mahomes, kelce],
      scoring,
      100,
    );

    const qb = events.find((e) => e.playerId === '4046');
    const te = events.find((e) => e.playerId === '1466');

    expect(qb?.pointsDelta).toBe(5); // 25 * 0.04 + 4
    expect(qb?.importance).toBe('touchdown');
    expect(qb?.tagLabel).toBe('TOUCHDOWN');
    expect(qb?.category).toBe('TD');
    expect(qb?.yardsLabel).toBe('+25 YDS');
    expect(qb?.teamLogo).toBe('https://a.espncdn.com/kc.png');
    expect(qb?.text).toContain('TOUCHDOWN');

    expect(te?.pointsDelta).toBe(9.5); // 1 PPR + 2.5 yds + 6 TD
    expect(te?.importance).toBe('touchdown');
  });

  it('matches ESPN spaceless player names like P.Mahomes and T.Kelce even when participants lack role types', () => {
    const events = evaluatePlayForSide(
      'home',
      {
        id: 'pl-nospace',
        sequenceNumber: 5,
        quarter: 1,
        clock: '09:10',
        teamId: '12',
        teamAbbr: 'KC',
        playType: 'Pass Reception',
        downDistance: '1st & 10',
        text: '(Shotgun) P.Mahomes pass short middle to T.Kelce to BUF 40 for 15 yards (M.Milano).',
        yards: 15,
        isScoring: false,
        participants: [{ name: 'Patrick Mahomes', role: '' }],
      },
      sampleGame,
      [mahomes, kelce],
      scoring,
      50,
    );

    expect(events).toHaveLength(2);
    expect(events.find((e) => e.playerId === '4046')?.pointsDelta).toBe(0.6);
    expect(events.find((e) => e.playerId === '1466')?.pointsDelta).toBe(2.5);
  });

  it('parses abbreviated yardage ("12 yds") cleanly for rushes', () => {
    const rb: WatchPartyStarter = {
      playerId: '7523',
      name: 'Isiah Pacheco',
      position: 'RB',
      slotLabel: 'RB',
      nflTeam: 'KC',
      currentPoints: 10,
      projectedPoints: 14,
      game: sampleGame,
    };

    const events = evaluatePlayForSide(
      'home',
      {
        id: 'pl-rush',
        sequenceNumber: 6,
        quarter: 2,
        clock: '08:15',
        teamId: '12',
        teamAbbr: 'KC',
        playType: 'Rush',
        downDistance: '1st & 10',
        text: 'I.Pacheco up the middle to BUF 28 for 12 yds (E.Oliver).',
        yards: null,
        isScoring: false,
        participants: [],
      },
      sampleGame,
      [rb],
      scoring,
      60,
    );

    expect(events).toHaveLength(1);
    expect(events[0].pointsDelta).toBe(1.2);
  });

  it('awards negative turnover points to QB and positive interception points to opposing DEF', () => {
    const play = {
      id: 'pl-int',
      sequenceNumber: 2,
      quarter: 3,
      clock: '05:00',
      teamId: '12',
      teamAbbr: 'KC',
      playType: 'Pass Interception Return',
      downDistance: '3rd & 8',
      text: 'P. Mahomes pass deep middle intended for T. Kelce INTERCEPTED at BUF 30.',
      yards: 0,
      isScoring: false,
      participants: [{ name: 'Patrick Mahomes', role: 'passing' }],
    };

    const homeEv = evaluatePlayForSide('home', play, sampleGame, [mahomes, kelce], scoring, 200);
    const awayEv = evaluatePlayForSide('away', play, sampleGame, [billsDef], scoring, 200);

    expect(homeEv).toHaveLength(1);
    expect(homeEv[0].pointsDelta).toBe(-2);
    expect(homeEv[0].importance).toBe('turnover');

    expect(awayEv).toHaveLength(1);
    expect(awayEv[0].pointsDelta).toBe(2);
    expect(awayEv[0].playerId).toBe('BUF');
  });

  it('excludes finished (post) Thursday games from live watch party feeds', () => {
    const thursdayFinalGame: NflGameCard = { ...sampleGame, id: 'thu_post', state: 'post', statusDetail: 'Final' };
    const starterInFinalGame: WatchPartyStarter = { ...mahomes, game: thursdayFinalGame };
    const { homeEvents } = buildMatchupWatchPartyFeed(
      [starterInFinalGame],
      [],
      {
        thu_post: {
          eventId: 'thu_post',
          finalized: true,
          hasFullTimeline: true,
          currentDrive: null,
          scoringPlays: [],
          recentPlays: [],
          allPlays: [
            {
              id: 'p1',
              sequenceNumber: 1,
              quarter: 1,
              clock: '10:00',
              teamId: '12',
              teamAbbr: 'KC',
              playType: 'Passing Touchdown',
              downDistance: '1st & 10',
              text: 'P.Mahomes pass to T.Kelce for 20 yards, TOUCHDOWN.',
              yards: 20,
              isScoring: true,
              participants: [],
            },
          ],
          teamStats: [],
          leaders: [],
        },
      },
      scoring,
    );

    expect(homeEvents).toHaveLength(0);
  });

  it('decorates game plays with NFL logo, category, and fantasy team owner attribution', () => {
    const rostered: LeaguePlayRosterEntry[] = [
      {
        ...kelce,
        fantasyTeamName: 'Clubhouse One',
        rosterId: 1,
        avatarUrl: null,
        initials: 'CO',
        isStarter: true,
        isMyTeam: true,
      },
    ];

    const decorated = decorateGamePlays(
      [
        {
          id: 'p-rec',
          sequenceNumber: 1,
          quarter: 3,
          clock: '05:10',
          teamId: '12',
          teamAbbr: 'KC',
          playType: 'Pass Reception',
          downDistance: '2nd & 6',
          text: 'P.Mahomes pass to T.Kelce for 18 yards, TOUCHDOWN.',
          yards: 18,
          isScoring: true,
          participants: [],
        },
      ],
      sampleGame,
      rostered,
      scoring,
    );

    expect(decorated).toHaveLength(1);
    expect(decorated[0].nflLogo).toBe('https://a.espncdn.com/kc.png');
    expect(decorated[0].category).toBe('TD');
    expect(decorated[0].yardsLabel).toBe('+18 YDS');
    expect(decorated[0].fantasyHits[0].fantasyTeamName).toBe('Clubhouse One');
    expect(decorated[0].fantasyHits[0].pointsDelta).toBe(8.8);
  });
});
