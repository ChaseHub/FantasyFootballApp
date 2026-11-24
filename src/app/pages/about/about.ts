import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FilterBarComponent, PageHeaderComponent } from '../../shared/ui';

type GuideCategory = 'all' | 'allplay' | 'power' | 'live' | 'whatif' | 'scouting';

interface GuideTopic {
  id: string;
  category: Exclude<GuideCategory, 'all'>;
  categoryLabel: string;
  title: string;
  badge: string;
  summary: string;
  formula: string;
  example: string;
  whereLabel: string;
  route: string[];
  queryParams?: Record<string, string>;
}

const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'all-play',
    category: 'allplay',
    categoryLabel: 'Luck & All-Play',
    title: 'All-Play Record & All-Play %',
    badge: 'Schedule-Free',
    summary:
      'Measures how your team would perform if you played every single team in the league every week instead of just one opponent.',
    formula:
      'Each week compares your score against all active teams (Win = score higher, Loss = score lower). Cumulative W-L across all weeks produces All-Play %.',
    example:
      'In a 12-team league, finishing 2nd highest in a week gives a 10-1 weekly All-Play mark — even if you happened to lose your H2H matchup against #1.',
    whereLabel: 'Weekly All-Play Lab',
    route: ['/insights'],
    queryParams: { mode: 'allplay' },
  },
  {
    id: 'expected-wins',
    category: 'allplay',
    categoryLabel: 'Luck & All-Play',
    title: 'Expected Wins (xW) & Weekly Verdicts',
    badge: 'True Deserved Wins',
    summary:
      'Translates how well you scored against the entire league each week into how many wins you deserved to earn.',
    formula:
      'Weekly Win Share = (All-Play Wins + 0.5 × Ties) ÷ Opponents. Summing weekly shares equals total Expected Wins (xW). Verdicts tag Crown (#1), Robbed (Lost despite top-half score), or Stolen W (Won despite bottom-half score).',
    example:
      'Scoring better than 9 of 11 opponents earns 0.82 xW for that week. Across 11 weeks, strong top-half scoring adds up cleanly into Expected Wins.',
    whereLabel: 'What-Ifs · Weekly All-Play',
    route: ['/insights'],
    queryParams: { mode: 'allplay' },
  },
  {
    id: 'schedule-luck',
    category: 'allplay',
    categoryLabel: 'Luck & All-Play',
    title: 'Schedule Luck (+/-)',
    badge: 'Fortunate vs Unlucky',
    summary:
      'Shows how many extra wins you gained (or lost) solely because of when you faced opponents on the schedule.',
    formula:
      'Luck = Actual Wins − Expected Wins (from All-Play win % × games). >= +0.4 is Fortunate, <= -0.4 is Unlucky, and between them is Balanced.',
    example:
      'If your scoring warrants 6.0 Expected Wins across 10 games, sitting at 8-2 gives +2.0 Luck (+2 wins aided by softer matchups); sitting at 4-6 gives -2.0 Luck.',
    whereLabel: 'Teams & Standings',
    route: ['/teams'],
  },
  {
    id: 'power-score',
    category: 'power',
    categoryLabel: 'Power & Efficiency',
    title: 'Power Score (0–100) & Power Rank',
    badge: 'Composite Strength',
    summary:
      'Ranks teams by overall contender strength rather than W-L record alone, rewarding sustained scoring alongside results.',
    formula:
      'Power Score = (0.35 × Win % + 0.35 × All-Play % + 0.30 × (Team PF ÷ League-Leading PF)) × 100.',
    example:
      'A high-scoring 6-5 roster facing brutal matchups outranks a low-scoring 7-4 team on Power Rank because 65% of the score reflects All-Play strength and total Points For.',
    whereLabel: 'Standings Matrix',
    route: ['/standings'],
  },
  {
    id: 'efficiency-maxpf',
    category: 'power',
    categoryLabel: 'Power & Efficiency',
    title: 'Lineup Efficiency % & Best-Ball Max PF',
    badge: 'Start / Sit Skill',
    summary:
      'Tracks how close your actual starting lineups came to your mathematically optimal roster every week.',
    formula:
      'Lineup Efficiency % = (Points For ÷ Max PF) × 100. Points Left on Bench = Max PF − Points For.',
    example:
      'Scoring 1,350 PF with 1,500 Max PF equals 90.0% efficiency — meaning 150 potential points remained on your bench across the season.',
    whereLabel: 'Best-Ball Max PF Lab',
    route: ['/insights'],
    queryParams: { mode: 'bestball' },
  },
  {
    id: 'team-volatility',
    category: 'power',
    categoryLabel: 'Power & Efficiency',
    title: 'Median, Boom Weeks, Std Dev & Close W/L',
    badge: 'Scoring Profile',
    summary:
      'Reveals whether a contender relies on steady high floors or explosive spike weeks — and how they handle nail-biters.',
    formula:
      'Median Score = 50th percentile of completed regular-season weeks. Std Dev (σ) = population standard deviation of weekly points. Boom Weeks = weeks >= 1.15× league average. Close Games = margin <= 10 pts.',
    example:
      'A team averaging 118 pts with 29.0 σ is volatile (capable of 160 or 80), while 118 pts with 11.5 σ is consistent every Sunday.',
    whereLabel: 'Team Detail Page',
    route: ['/teams'],
  },
  {
    id: 'win-probability',
    category: 'live',
    categoryLabel: 'Matchups & Live Odds',
    title: 'Live Win Probability & Remaining Slot Clock',
    badge: 'Sunday Gameday',
    summary:
      'Real-time matchup win percentage that combines current fantasy points scored with pregame expectations and live game clocks.',
    formula:
      'Remaining Expected Value weights each starter by Live Game Fraction Left + Remaining Schedule Share, plus positional variance scale. A normal-CDF model computes P(Final A > Final B).',
    example:
      'Trail by 9 points with an RB at halftime vs opponent with zero active starters remaining? The clock and remaining share project a turnaround win %.',
    whereLabel: 'Matchups & Watch Party',
    route: ['/watch-party'],
  },
  {
    id: 'schedule-swap',
    category: 'whatif',
    categoryLabel: 'What-If Formats',
    title: 'Schedule Swap Simulator & Matrix',
    badge: 'Every Schedule',
    summary:
      'Tests what your exact weekly scores would have produced if you played every other manager’s exact weekly schedule.',
    formula:
      'Replaces Team A’s opponent each week with Opponent B’s actual opponent (excluding self weeks cleanly), tallying hypothetical W-L-T and delta vs actual wins.',
    example:
      'If your 7-7 team went 11-3 with the 1st seed’s schedule, schedule draw explains the 4-win gap.',
    whereLabel: 'Schedule Swaps Lab',
    route: ['/insights'],
    queryParams: { mode: 'simulator' },
  },
  {
    id: 'league-median',
    category: 'whatif',
    categoryLabel: 'What-If Formats',
    title: 'League Median 2-Game Rule',
    badge: 'Alternate Ruleset',
    summary:
      'Shows how the playoff bracket changes if top-half weekly scores earn an automatic second win alongside H2H matchups.',
    formula:
      'Each week awards +1 Win to every team scoring above the league weekly median (and +1 Loss below). Combined Standings merge H2H + Median records.',
    example:
      'Finished #2 high scorer in Week 4 but lost to #1? You go 1-1 for the week instead of 0-1, buffering bad H2H luck.',
    whereLabel: 'Median Format Lab',
    route: ['/insights'],
    queryParams: { mode: 'median' },
  },
  {
    id: 'playoff-odds',
    category: 'whatif',
    categoryLabel: 'What-If Formats',
    title: 'Playoff, Bye & Title Odds Simulator',
    badge: 'Monte Carlo',
    summary:
      'Simulates thousands of remaining season finishes using team scoring distributions to project seed and title odds.',
    formula:
      'Runs Monte Carlo trials sampling remaining regular-season + bracket games using each team’s recent scoring mean & standard deviation, outputting Playoff %, 1st-Rd Bye %, and Championship %.',
    example:
      'Two 6-5 teams may hold 72% vs 48% playoff odds when one holds a strong Points For tiebreaker and easier remaining opponents.',
    whereLabel: 'Playoffs & Odds',
    route: ['/playoffs'],
  },
  {
    id: 'sos-matrix',
    category: 'whatif',
    categoryLabel: 'What-If Formats',
    title: 'Strength of Schedule (SoS) & Playoff Runway',
    badge: 'Schedule Difficulty',
    summary:
      'Grades Past SoS endured and Upcoming Opponent Difficulty (especially Weeks 15–17 playoff runways).',
    formula:
      'Compares opponent average Points Against / Power Score to league mean, ranking Tough vs Soft runways from Week 1 through Fantasy Championship.',
    example:
      'Facing three bottom-4 scoring defenses in Weeks 14–16 flags a green Soft Playoff Runway.',
    whereLabel: 'Standings SoS Matrix',
    route: ['/standings'],
  },
  {
    id: 'player-war-grade',
    category: 'scouting',
    categoryLabel: 'Players & History',
    title: 'Positional Grade (0–100) & Positional Value Index',
    badge: 'Player Scouting',
    summary:
      'Measures how valuable a player is compared to typical starters at their specific NFL position (QB, RB, WR, TE, K, DEF).',
    formula:
      'Computes Replacement Baseline (starter threshold per position) and Weekly PPG Share above replacement, scaling to a 0–100 Grade.',
    example:
      'An elite TE scoring 15 PPG creates far higher positional advantage above replacement than a WR scoring 15 PPG.',
    whereLabel: 'Players & Trade Sandbox',
    route: ['/players'],
  },
  {
    id: 'draft-value',
    category: 'scouting',
    categoryLabel: 'Players & History',
    title: 'Draft Steal / Reach Score',
    badge: 'Draft Audit',
    summary:
      'Compares where each rookie or veteran was picked in your draft to where they actually finished in seasonal fantasy scoring.',
    formula:
      'Pick Value Delta compares Actual Overall Positional/Scoring Finish Rank against Draft Pick Slot, tagging Steals (+value) and Busts/Reaches.',
    example:
      'Drafting a top-8 RB in Round 7 yields huge positive surplus value in Draft Audit.',
    whereLabel: 'Draft Ledger',
    route: ['/draft'],
  },
  {
    id: 'lineage-history',
    category: 'scouting',
    categoryLabel: 'Players & History',
    title: 'All-Time League Lineage & H2H Matrix',
    badge: 'Multi-Season',
    summary:
      'Merges historical Sleeper seasons automatically so career records and rivalries stay intact even when teams rename.',
    formula:
      'Follows connected `previous_league_id` links backward and groups seasons by immutable manager `owner_id`, computing career W-L, titles from bracket finales, all-time record highs, and H2H matrix splits.',
    example:
      'See who holds the all-time single-week high score and inspect your lifetime regular-season head-to-head record against any rival.',
    whereLabel: 'League History',
    route: ['/history'],
  },
];

@Component({
  selector: 'app-about',
  imports: [RouterLink, PageHeaderComponent, FilterBarComponent],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  protected readonly searchQuery = signal('');
  protected readonly activeCategory = signal<GuideCategory>('all');
  protected readonly expandedTopicIds = signal<Set<string>>(new Set());

  protected readonly categories: Array<{ id: GuideCategory; label: string }> = [
    { id: 'all', label: 'All Concepts' },
    { id: 'allplay', label: 'Luck & All-Play' },
    { id: 'power', label: 'Power & Efficiency' },
    { id: 'live', label: 'Matchups & Live Odds' },
    { id: 'whatif', label: 'What-If Formats' },
    { id: 'scouting', label: 'Players & History' },
  ];

  protected readonly activeFilterCount = computed(() =>
    this.activeCategory() !== 'all' ? 1 : 0,
  );

  protected readonly filteredTopics = computed(() => {
    const cat = this.activeCategory();
    const q = this.searchQuery().trim().toLowerCase();

    return GUIDE_TOPICS.filter((topic) => {
      if (cat !== 'all' && topic.category !== cat) return false;
      if (!q) return true;
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.formula.toLowerCase().includes(q) ||
        topic.categoryLabel.toLowerCase().includes(q) ||
        topic.badge.toLowerCase().includes(q)
      );
    });
  });

  protected readonly filteredTopicsCountLabel = computed(
    () => `${this.filteredTopics().length} of ${GUIDE_TOPICS.length} concepts`,
  );

  protected setCategory(cat: GuideCategory): void {
    this.activeCategory.set(cat);
  }

  protected isTopicExpanded(id: string): boolean {
    return this.expandedTopicIds().has(id);
  }

  protected toggleTopicDetails(id: string): void {
    const next = new Set(this.expandedTopicIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedTopicIds.set(next);
  }

  protected focusTopic(id: string, cat: Exclude<GuideCategory, 'all'>): void {
    this.activeCategory.set(cat);
    this.searchQuery.set('');
    const next = new Set(this.expandedTopicIds());
    next.add(id);
    this.expandedTopicIds.set(next);
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 40);
    }
  }

  protected clearFilters(): void {
    this.searchQuery.set('');
    this.activeCategory.set('all');
  }
}
