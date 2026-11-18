// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board's question is not whether or when a protocol issues a token. It is what a token would
// be worth if the protocol's record stayed as it is. That value is implied from the market's own
// pricing of protocols that already have one:
//
//   peers      = the snapshot's protocols whose token already trades (a market cap is recorded)
//   multiple   = the mcap / TVL multiple of the protocol's category peers: their median, shrunk
//                toward the all-market median by peer count, clamped to [0.02, 2.00]
//   implied    = TVL x multiple x momentum x track record x breadth
//     momentum     1 + clamp(change_7d, -50, +100) / 100 x 0.30     (a hot week is worth some, not all)
//     track record 0.78 + 0.22 x min(age_days, 1460) / 1460        (four years tokenless and standing
//                                                                    counts for more than four weeks)
//     breadth      1 + 0.04 x min(chains - 1, 5)                    (a protocol on six chains distributes
//                                                                    wider than one on a single chain)
//
// No protocol name is ever special-cased: the same function scores every row, and every figure in
// it comes from the snapshot itself. A protocol whose token already trades is scored by the same
// formula and shown against its real market cap: the gap between the two is itself a signal, and
// the board keeps the two kinds apart with a status on every row.

import { livePlan, preTokenPlan, stepText } from './farm.ts';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The model's constants, named once here and stated in the dashboard's method panel. */
export const MODEL = {
  version: 'peer-multiple-1',
  shrink_peers: 5,
  multiple_min: 0.02,
  multiple_max: 2.0,
  momentum_weight: 0.3,
  momentum_floor: -50,
  momentum_cap: 100,
  record_floor: 0.78,
  record_range: 0.22,
  record_days: 1460,
  record_unknown: 0.86,
  breadth_per_chain: 0.04,
  breadth_max_extra: 5,
} as const;

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty sorted array. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whole days from `listedAt` to the snapshot's `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole words that mark a wrapped or staked product of an asset that already trades. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchanges whose name at the front of a protocol's name marks the exchange's own product. */
const EXCHANGE_PREFIX = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Categories that are products of another protocol's asset rather than a protocol awaiting a
 * first token of its own: bridges of a chain or an asset, staking wrappers, wrapped BTC. The
 * house's watchlist rule leaves them out for the same reason; the radar follows it for the rows
 * it adds below the floor, and says so in the method panel.
 */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Decentralized BTC',
  'Stablecoin Wrapper',
  'CEX',
]);

/**
 * Whether a pre-token protocol below the watchlist floor may join the board: a protocol in its
 * own right, not an exchange, not a versioned pool, not a wrapped or staked product. Watchlist
 * rows never pass through here: the floor is covered unconditionally.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** One category's peer evidence: how many tokenized peers, their raw median, the multiple used. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  raw_median: number;
  multiple: number;
}

/** The peer multiples of the whole snapshot: the all-market median and every category's. */
export interface PeerMultiples {
  peer_count: number;
  global_median: number;
  by_category: Map<string, CategoryMultiple>;
}

/**
 * The market's own pricing, read off the snapshot: for every category, the median mcap / TVL of
 * its protocols whose token already trades, shrunk geometrically toward the all-market median by
 * peer count (a category with one wild peer borrows the market's judgement; one with thirty
 * peers keeps its own), then clamped to a band no sane launch multiple leaves.
 */
export function peerMultiples(snapshot: Snapshot): PeerMultiples {
  const peers = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const all = peers.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = all.length > 0 ? median(all) : 0.2;
  const byCat = new Map<string, number[]>();
  for (const p of peers) {
    const key = p.category ?? 'Uncategorized';
    const arr = byCat.get(key);
    if (arr === undefined) byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
    else arr.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const raw = median(ratios);
    const n = ratios.length;
    const shrunk = Math.exp((n * Math.log(raw) + MODEL.shrink_peers * Math.log(globalMedian)) / (n + MODEL.shrink_peers));
    byCategory.set(category, {
      category,
      peers: n,
      raw_median: round4(raw),
      multiple: round4(Math.min(MODEL.multiple_max, Math.max(MODEL.multiple_min, shrunk))),
    });
  }
  return { peer_count: peers.length, global_median: round4(globalMedian), by_category: byCategory };
}

/** The multiple one protocol is priced with: its category's, or the all-market median when its category has no peers. */
export function multipleFor(p: SnapshotProtocol, multiples: PeerMultiples): CategoryMultiple {
  const found = multiples.by_category.get(p.category ?? 'Uncategorized');
  if (found !== undefined) return found;
  return { category: p.category ?? 'Uncategorized', peers: 0, raw_median: multiples.global_median, multiple: multiples.global_median };
}

/** The four factors of one protocol's score, and the implied value they multiply to. */
export interface Score {
  age_days: number | null;
  multiple: number;
  peer_count: number;
  momentum: number;
  record: number;
  breadth: number;
  implied: number;
}

/** Score one protocol from its own record and the snapshot's peer multiples. The only scoring function there is. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, multiples: PeerMultiples): Score {
  const age = ageDays(asOf, p.listed_at);
  const mult = multipleFor(p, multiples);
  const growth = Math.min(MODEL.momentum_cap, Math.max(MODEL.momentum_floor, finite(p.change_7d, 0)));
  // The factors are rounded before they multiply, so the dashboard can recompute a row's implied
  // value from the factors it prints and land on the board's number to the dollar.
  const momentum = round4(1 + (growth / 100) * MODEL.momentum_weight);
  const record = round4(
    age === null
      ? MODEL.record_unknown
      : MODEL.record_floor + (Math.min(age, MODEL.record_days) / MODEL.record_days) * MODEL.record_range,
  );
  const breadth = round4(1 + MODEL.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_max_extra));
  const implied = Math.max(1, Math.round(p.tvl_usd * mult.multiple * momentum * record * breadth));
  return {
    age_days: age,
    multiple: mult.multiple,
    peer_count: mult.peers,
    momentum,
    record,
    breadth,
    implied,
  };
}

/** One row of board.json, and of the dashboard's data: the protocol, its score, and its plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'live';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  gap_pct: number | null;
  model: {
    peer_multiple: number;
    peer_count: number;
    momentum_multiplier: number;
    record_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** A live protocol on the dashboard's comparison board: scored like any row, ranked among its own kind. */
export interface LiveRow extends Omit<BoardRow, 'rank' | 'watchlist'> {
  live_rank: number;
}

/** Everything the dashboard renders: the board, the model's evidence, and the snapshot's counts. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  counts: {
    protocols: number;
    watchlist: number;
    pre_token_rows: number;
    live_rows: number;
    unpriced_token: number;
    set_aside: number;
    total_implied_usd: number;
  };
  global_multiple: number;
  peer_count: number;
  categories: CategoryMultiple[];
  rows: BoardRow[];
  live: LiveRow[];
}

/** One scored protocol as a row: the record, the score's four factors, and the plan. */
function toRow(p: SnapshotProtocol, score: Score, watch: Set<string>): BoardRow {
  const live = !isPreToken(p);
  return {
    rank: 0,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: live ? 'live' : 'pre-token',
    watchlist: watch.has(p.slug),
    age_days: score.age_days,
    implied_value_usd: score.implied,
    gap_pct: live && p.mcap_usd !== null && p.mcap_usd > 0 ? round4(score.implied / p.mcap_usd - 1) : null,
    model: {
      peer_multiple: score.multiple,
      peer_count: score.peer_count,
      momentum_multiplier: score.momentum,
      record_multiplier: score.record,
      breadth_multiplier: score.breadth,
    },
    farm_steps: (live ? livePlan(p) : preTokenPlan(p, score.age_days)).map(stepText),
  };
}

const byImpliedThenSlug = (a: { score: Score; p: SnapshotProtocol }, b: { score: Score; p: SnapshotProtocol }): number =>
  b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);

/**
 * The board and the dashboard's data. The ranked board (board.json) is the radar itself: the
 * pre-token protocols — every watchlist slug, plus every other rankable one the snapshot holds —
 * scored by the one function and ranked by implied value, ranks 1..N. The protocols whose token
 * already trades are scored by the same function into a comparison set of their own, ranked among
 * themselves and shown against their real market caps: the two kinds never share a ranking, so a
 * reader always knows which rows are still to come.
 */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; data: RadarData } {
  const multiples = peerMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const preChosen: SnapshotProtocol[] = [];
  const liveChosen: SnapshotProtocol[] = [];
  let unpriced = 0;
  let setAside = 0;
  for (const p of snapshot.protocols) {
    if (watch.has(p.slug) || (isPreToken(p) && isRankable(p))) {
      preChosen.push(p);
    } else if (isPreToken(p)) {
      setAside += 1;
    } else if (p.mcap_usd !== null) {
      liveChosen.push(p);
    } else {
      unpriced += 1;
    }
  }
  const board: BoardRow[] = preChosen
    .map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, multiples) }))
    .sort(byImpliedThenSlug)
    .map((s, i) => ({ ...toRow(s.p, s.score, watch), rank: i + 1 }));
  const live: LiveRow[] = liveChosen
    .map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, multiples) }))
    .sort(byImpliedThenSlug)
    .map((s, i) => {
      const { rank: _rank, watchlist: _watchlist, ...rest } = toRow(s.p, s.score, watch);
      return { ...rest, live_rank: i + 1 };
    });
  const categories = [...multiples.by_category.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const data: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL.version,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      pre_token_rows: board.length,
      live_rows: live.length,
      unpriced_token: unpriced,
      set_aside: setAside,
      total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    },
    global_multiple: multiples.global_median,
    peer_count: multiples.peer_count,
    categories,
    rows: board,
    live,
  };
  return { board, data };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(data: RadarData): string {
  return `window.RADAR=${JSON.stringify(data)};\n`;
}
