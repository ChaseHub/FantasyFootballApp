import { RosterPlayerStat, TeamSummary } from '../models/sleeper.models';

export interface OptimizerCandidate {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  projectedPoints: number | null;
  avgPoints: number;
  lastWeekPoints: number | null;
  effectivePoints: number;
  isOnBye: boolean;
  injuryStatus: string | null;
  isOutLike: boolean;
  isStarterNow: boolean;
  currentSlotIndex: number | null;
  usesFallbackAvg: boolean;
}

export interface OptimizedSlotAssignment {
  slotIndex: number;
  slotLabel: string;
  currentPlayer: OptimizerCandidate | null;
  optimalPlayer: OptimizerCandidate | null;
  pointsDelta: number;
  changed: boolean;
}

export interface StartSitSwap {
  slotLabel: string;
  startPlayer: OptimizerCandidate;
  sitPlayer: OptimizerCandidate | null;
  pointsGain: number;
  reason: string;
}

export interface LineupOptimizationReport {
  week: number;
  usingProjectionFeed: boolean;
  currentProjectedTotal: number;
  optimalProjectedTotal: number;
  potentialGain: number;
  isOptimal: boolean;
  criticalAlerts: OptimizerCandidate[];
  swaps: StartSitSwap[];
  slots: OptimizedSlotAssignment[];
  benchTopOptions: OptimizerCandidate[];
}

const OUT_STATUSES = new Set(['OUT', 'IR', 'PUP', 'SUS', 'COV', 'NA']);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeOptimizerSlot(raw: string): string {
  const up = raw.trim().toUpperCase();
  if (up === 'FLEX' || up === 'WRT' || up === 'WRT_FLEX' || up === 'WRRB_FLEX') return 'FLEX';
  if (up === 'SUPER_FLEX') return 'SFLX';
  if (up === 'REC_FLEX') return 'RFLX';
  if (up === 'IDP_FLEX') return 'IDP';
  return up;
}

export function isEligibleForSlot(position: string, slotLabel: string): boolean {
  const pos = position.trim().toUpperCase();
  const slot = normalizeOptimizerSlot(slotLabel);
  if (slot === pos) return true;
  if (slot === 'FLEX') return pos === 'RB' || pos === 'WR' || pos === 'TE';
  if (slot === 'SFLX') return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
  if (slot === 'RFLX') return pos === 'WR' || pos === 'TE';
  if (slot === 'IDP') return pos === 'DL' || pos === 'LB' || pos === 'DB';
  return false;
}

function slotRestrictiveness(slot: string): number {
  const norm = normalizeOptimizerSlot(slot);
  if (norm === 'QB' || norm === 'RB' || norm === 'WR' || norm === 'TE' || norm === 'K' || norm === 'DEF') {
    return 1;
  }
  if (norm === 'RFLX') return 2;
  if (norm === 'FLEX' || norm === 'IDP') return 3;
  if (norm === 'SFLX') return 4;
  return 2;
}

export function optimizeTeamLineup(params: {
  team: TeamSummary;
  week: number;
  rosterPositions: string[];
  rosterStats: RosterPlayerStat[];
  getProjection: (playerId: string) => number | null;
  isOnBye: (nflTeam: string) => boolean;
}): LineupOptimizationReport {
  const { team, week, rosterPositions, rosterStats, getProjection, isOnBye } = params;

  const starterSlotsRaw = rosterPositions.filter(
    (s) => s !== 'BN' && s !== 'IR' && s !== 'TAXI',
  );
  const starterSlots =
    starterSlotsRaw.length > 0
      ? starterSlotsRaw.map((s) => normalizeOptimizerSlot(s))
      : team.rawStarterIds.map((_, idx) => {
          const matched = rosterStats.find((r) => r.playerId === team.rawStarterIds[idx]);
          return matched?.position ?? 'FLEX';
        });

  const starterIndexById = new Map<string, number>();
  team.rawStarterIds.forEach((id, idx) => {
    if (!starterIndexById.has(id)) starterIndexById.set(id, idx);
  });

  const reserveSet = new Set(team.rawReserveIds);
  let hasAnyProj = false;

  const candidates: OptimizerCandidate[] = rosterStats.map((stat) => {
    const bye = isOnBye(stat.nflTeam);
    const proj = bye ? 0 : getProjection(stat.playerId);
    if (proj !== null && !bye) hasAnyProj = true;

    const injUpper = (stat.injuryStatus ?? '').trim().toUpperCase();
    const isOutLike = OUT_STATUSES.has(injUpper) || reserveSet.has(stat.playerId);
    const baseScore = proj !== null ? proj : stat.avgPoints;
    const effectivePoints = bye || isOutLike ? 0 : round2(Math.max(0, baseScore));
    const currentSlotIndex = starterIndexById.get(stat.playerId) ?? null;

    return {
      playerId: stat.playerId,
      name: stat.name,
      position: stat.position,
      nflTeam: stat.nflTeam,
      projectedPoints: proj,
      avgPoints: stat.avgPoints,
      lastWeekPoints: stat.lastWeekPoints,
      effectivePoints,
      isOnBye: bye,
      injuryStatus: stat.injuryStatus,
      isOutLike,
      isStarterNow: currentSlotIndex !== null,
      currentSlotIndex,
      usesFallbackAvg: proj === null && !bye,
    };
  });

  const byId = new Map(candidates.map((c) => [c.playerId, c]));
  const currentStarters: Array<OptimizerCandidate | null> = starterSlots.map((_, idx) => {
    const pid = team.rawStarterIds[idx];
    return pid ? byId.get(pid) ?? null : null;
  });

  const currentProjectedTotal = round2(
    currentStarters.reduce((sum, c) => sum + (c?.effectivePoints ?? 0), 0),
  );

  // Order slots most restrictive first for clean branch-and-bound search
  const indexedSlots = starterSlots
    .map((slot, origIdx) => ({ slot, origIdx, rank: slotRestrictiveness(slot) }))
    .sort((a, b) => a.rank - b.rank || a.origIdx - b.origIdx);

  const playablePool = candidates.filter((c) => !reserveSet.has(c.playerId));
  const eligiblePerOrderedSlot = indexedSlots.map((item) =>
    playablePool
      .filter((c) => isEligibleForSlot(c.position, item.slot))
      .sort((a, b) => b.effectivePoints - a.effectivePoints || b.avgPoints - a.avgPoints)
      .slice(0, starterSlots.length + 2),
  );

  // Suffix upper bound assuming each remaining slot takes its top eligible player
  const suffixMax = new Array<number>(indexedSlots.length + 1).fill(0);
  for (let i = indexedSlots.length - 1; i >= 0; i--) {
    suffixMax[i] = suffixMax[i + 1] + (eligiblePerOrderedSlot[i][0]?.effectivePoints ?? 0);
  }

  let bestScore = -1;
  let bestAssignment: Array<OptimizerCandidate | null> = new Array(indexedSlots.length).fill(null);
  const currentWork: Array<OptimizerCandidate | null> = new Array(indexedSlots.length).fill(null);
  const used = new Set<string>();
  let steps = 0;
  const MAX_STEPS = 8000;

  const search = (depth: number, acc: number): void => {
    if (steps++ > MAX_STEPS) return;
    if (acc + suffixMax[depth] <= bestScore + 1e-6) return;
    if (depth === indexedSlots.length) {
      bestScore = acc;
      bestAssignment = [...currentWork];
      return;
    }

    let triedAny = false;
    for (const cand of eligiblePerOrderedSlot[depth]) {
      if (used.has(cand.playerId)) continue;
      triedAny = true;
      used.add(cand.playerId);
      currentWork[depth] = cand;
      search(depth + 1, acc + cand.effectivePoints);
      used.delete(cand.playerId);
    }

    if (!triedAny) {
      currentWork[depth] = null;
      search(depth + 1, acc);
    }
  };

  search(0, 0);

  // Restore original slot order
  const optimalByOrigSlot: Array<OptimizerCandidate | null> = new Array(starterSlots.length).fill(null);
  indexedSlots.forEach((item, orderedIdx) => {
    optimalByOrigSlot[item.origIdx] = bestAssignment[orderedIdx] ?? null;
  });

  const optimalProjectedTotal = round2(
    optimalByOrigSlot.reduce((sum, c) => sum + (c?.effectivePoints ?? 0), 0),
  );
  const potentialGain = round2(Math.max(0, optimalProjectedTotal - currentProjectedTotal));

  const optimalSet = new Set(
    optimalByOrigSlot.filter((c): c is OptimizerCandidate => c !== null).map((c) => c.playerId),
  );
  const currentSet = new Set(team.rawStarterIds);

  const slots: OptimizedSlotAssignment[] = starterSlots.map((slotLabel, idx) => {
    const cur = currentStarters[idx] ?? null;
    const opt = optimalByOrigSlot[idx] ?? null;
    const delta = round2((opt?.effectivePoints ?? 0) - (cur?.effectivePoints ?? 0));
    const changed = Boolean(opt && cur?.playerId !== opt.playerId && !currentSet.has(opt.playerId));
    return {
      slotIndex: idx,
      slotLabel,
      currentPlayer: cur,
      optimalPlayer: opt,
      pointsDelta: delta,
      changed,
    };
  });

  // Pair benched-to-start recommendations with dropped current starters
  const incoming = candidates
    .filter((c) => optimalSet.has(c.playerId) && !c.isStarterNow)
    .sort((a, b) => b.effectivePoints - a.effectivePoints);
  const outgoing = currentStarters
    .filter((c): c is OptimizerCandidate => c !== null && !optimalSet.has(c.playerId))
    .sort((a, b) => a.effectivePoints - b.effectivePoints);

  const swaps: StartSitSwap[] = incoming.map((startP) => {
    let sitMatchIdx = outgoing.findIndex((outP) => outP.position === startP.position);
    if (sitMatchIdx === -1) sitMatchIdx = outgoing.length > 0 ? 0 : -1;
    const sitP = sitMatchIdx >= 0 ? outgoing.splice(sitMatchIdx, 1)[0] : null;
    const gain = round2(startP.effectivePoints - (sitP?.effectivePoints ?? 0));
    const optSlot =
      slots.find((s) => s.optimalPlayer?.playerId === startP.playerId)?.slotLabel ?? startP.position;
    let reason = `Projected +${gain.toFixed(1)} pts upgrade at ${optSlot}`;
    if (sitP?.isOnBye) {
      reason = `${sitP.name} is on BYE (${sitP.nflTeam})`;
    } else if (sitP?.isOutLike) {
      reason = `${sitP.name} is ruled ${sitP.injuryStatus || 'Out'}`;
    }
    return {
      slotLabel: optSlot,
      startPlayer: startP,
      sitPlayer: sitP,
      pointsGain: gain,
      reason,
    };
  });

  const criticalAlerts = currentStarters.filter(
    (c): c is OptimizerCandidate => c !== null && (c.isOnBye || c.isOutLike),
  );

  const benchTopOptions = candidates
    .filter((c) => !c.isStarterNow && !reserveSet.has(c.playerId) && !c.isOnBye && !c.isOutLike)
    .sort((a, b) => b.effectivePoints - a.effectivePoints)
    .slice(0, 6);

  return {
    week,
    usingProjectionFeed: hasAnyProj,
    currentProjectedTotal,
    optimalProjectedTotal,
    potentialGain,
    isOptimal: swaps.length === 0 && criticalAlerts.length === 0,
    criticalAlerts,
    swaps,
    slots,
    benchTopOptions,
  };
}
