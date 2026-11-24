import { computeWinProbability, getGameRemainingFraction } from './matchup-projection';
import { NflGameCard } from '../models/espn.models';

describe('matchup-projection', () => {
  it('computes 50/50 win probability when projected scores match before kickoff', () => {
    const res = computeWinProbability(122.5, 122.5, 1, false, 0, 0);
    expect(res).toEqual({ homeWinPct: 50, awayWinPct: 50 });
  });

  it('increases confidence as remaining game time shrinks for the same lead', () => {
    const early = computeWinProbability(130, 118, 1.0, false, 0, 0);
    const late = computeWinProbability(130, 118, 0.12, false, 118, 102);

    expect(early.homeWinPct).toBeGreaterThan(50);
    expect(early.homeWinPct! + early.awayWinPct!).toBe(100);
    expect(late.homeWinPct!).toBeGreaterThan(early.homeWinPct!);
  });

  it('locks final matchups to 100% / 0% based on final points', () => {
    const res = computeWinProbability(110, 125, 0, true, 134.2, 129.8);
    expect(res).toEqual({ homeWinPct: 100, awayWinPct: 0 });
  });

  it('estimates remaining fraction accurately from NFL quarter and clock', () => {
    const halftimeGame: NflGameCard = {
      id: 'g1',
      name: 'KC at BUF',
      shortName: 'KC @ BUF',
      dateIso: '',
      kickoffLabel: '',
      venue: null,
      broadcast: null,
      state: 'in',
      statusDetail: '3rd 15:00',
      period: 3,
      clock: '15:00',
      away: { id: '12', abbr: 'KC', normalizedAbbr: 'KC', name: 'Chiefs', displayName: 'KC', logo: null, record: '0-0', score: 14, winner: false, linescores: [] },
      home: { id: '2', abbr: 'BUF', normalizedAbbr: 'BUF', name: 'Bills', displayName: 'BUF', logo: null, record: '0-0', score: 10, winner: false, linescores: [] },
      situation: null,
      oddsLine: null,
      overUnder: null,
    };

    expect(getGameRemainingFraction(halftimeGame, false)).toBeCloseTo(0.5, 2);
    expect(getGameRemainingFraction(halftimeGame, true)).toBe(0);
  });
});
