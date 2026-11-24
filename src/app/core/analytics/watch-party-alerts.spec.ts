import { describe, expect, it } from 'vitest';
import { detectNewWatchPartyAlerts } from './watch-party-alerts';
import { WatchPartyPlayEvent } from './watch-party-engine';

describe('detectNewWatchPartyAlerts', () => {
  it('triggers alerts only for unseen TDs/turnovers/big plays and newly entered red-zone drives', () => {
    const seenPlays = new Set<string>(['old-td']);
    const seenRz = new Set<string>();

    const events: WatchPartyPlayEvent[] = [
      {
        id: 'old-td',
        side: 'home',
        playerId: 'p1',
        playerName: 'Old TD',
        position: 'WR',
        nflTeam: 'BUF',
        teamLogo: null,
        matchupShort: 'BUF @ KC',
        quarter: 1,
        clock: '10:00',
        downDistance: '',
        category: 'TD',
        yardsLabel: '25 YDS',
        tagLabel: 'TD',
        importance: 'touchdown',
        text: 'Touchdown pass',
        pointsDelta: 8.5,
        sortOrder: 10,
      },
      {
        id: 'new-td',
        side: 'home',
        playerId: 'p2',
        playerName: 'JaMarr Chase',
        position: 'WR',
        nflTeam: 'CIN',
        teamLogo: null,
        matchupShort: 'CIN vs BAL',
        quarter: 2,
        clock: '04:12',
        downDistance: '',
        category: 'TD',
        yardsLabel: '42 YDS',
        tagLabel: 'TD',
        importance: 'touchdown',
        text: '42-yard TD catch',
        pointsDelta: 10.2,
        sortOrder: 20,
      },
    ];

    const first = detectNewWatchPartyAlerts(
      seenPlays,
      seenRz,
      events,
      [],
      'Home Squad',
      'Away Squad',
      [
        {
          gameId: 'g1',
          logo: null,
          shortName: 'CIN vs BAL · Q2',
          downDistance: '1st & Goal at BAL 4',
          isRedZone: true,
          startersText: 'JaMarr Chase',
        },
      ],
    );

    expect(first.length).toBe(2);
    expect(first[0].kind).toBe('TD');
    expect(first[0].title).toContain('JaMarr Chase');
    expect(first[1].kind).toBe('RZ');

    const second = detectNewWatchPartyAlerts(seenPlays, seenRz, events, [], 'Home Squad', 'Away Squad', [
      {
        gameId: 'g1',
        logo: null,
        shortName: 'CIN vs BAL · Q2',
        downDistance: '2nd & Goal at BAL 2',
        isRedZone: true,
        startersText: 'JaMarr Chase',
      },
    ]);
    expect(second.length).toBe(0);
  });
});
