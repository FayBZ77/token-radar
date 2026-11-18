// Farm plans: one concrete plan per protocol, derived from the protocol's own snapshot record —
// its category, its chains, its TVL and its age — never from a hand-written list of names.
//
// Every step is one string that carries the action, what it costs and how long it takes, inside
// the gate's 20..600 characters. Pre-token plans farm the position a launch would reward; live
// plans farm a token that already trades (stake it, lend it, vote with it, pair it).

import type { SnapshotProtocol } from './model.ts';

/** What one step says, before it is flattened to the board's string form. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** A step as the board carries it: action, then cost, then time. */
export function stepText(step: FarmStep): string {
  let s = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own app weekly.`;
  return s;
}

/** The chain the plan works on: the first the snapshot names, else a neutral phrase. */
export function mainChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A realistic all-in gas figure for setting up on a chain, in words a farmer can budget by. */
export function gasFor(chain: string): string {
  switch (chain) {
    case 'Ethereum':
      return '$15 to $40 of ETH in gas across the setup transactions';
    case 'Solana':
      return 'under $1 of SOL in fees across the setup transactions';
    case 'Base':
    case 'Arbitrum One':
    case 'Optimism':
    case 'zkSync Era':
    case 'Linea':
    case 'Scroll':
      return '$1 to $5 of ETH in gas across the setup transactions';
    case 'BSC':
      return '$1 to $3 of BNB in gas across the setup transactions';
    case 'Avalanche':
      return '$2 to $6 of AVAX in gas across the setup transactions';
    case 'Polygon':
      return 'under $1 of POL in gas across the setup transactions';
    default:
      return '$3 to $10 of the chain gas token across the setup transactions';
  }
}

/** The weekly upkeep gas on the same chain, smaller than the setup. */
function weeklyGasFor(chain: string): string {
  switch (chain) {
    case 'Ethereum':
      return 'about $6 of gas a week';
    case 'Solana':
    case 'Polygon':
      return 'a few cents of gas a week';
    case 'BSC':
      return 'about $1 of gas a week';
    default:
      return 'about $2 of gas a week';
  }
}

/** How much capital one qualifying position needs, scaled to the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long a position must be held to count in more than one weekly snapshot, from the protocol's age. */
export function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null) return 45;
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  if (ageDays < 730) return 30;
  return 21;
}

/** The category's core qualifying action for a pre-token protocol, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) {
    return `Supply $${capital} of USDC or ETH as collateral in ${n} on ${chain}, then borrow about a third of it and repay within the week, so the wallet shows both sides of the market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) {
    return `Deposit $${capital} of USDC into a flagship curated vault in ${n} on ${chain} and keep the vault shares in the wallet untouched.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Add $${capital} of liquidity to ${n}'s main stablecoin or ETH pool on ${chain} and make two small swaps through the same wallet.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position, half long and half short, so the week books real trading volume without directional risk.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} of USDC into ${n}'s basis vault on ${chain}; the vault runs the hedged trade, your job is to hold the shares.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of ETH or its liquid staking token through ${n} on ${chain} and keep the receipt token in the wallet.`;
  }
  if (c.includes('rwa')) {
    return `Subscribe $${capital} to ${n}'s flagship real-world-asset product on ${chain} and hold the yield token it issues you.`;
  }
  if (c.includes('launchpad')) {
    return `Complete ${n}'s account verification early, then take part in one sale with $${capital} so the wallet is on the participant list before any snapshot of it.`;
  }
  if (c.includes('prediction')) {
    return `Fund the wallet with $${capital} on ${n} and trade three markets through to resolution, keeping each position small.`;
  }
  if (c.includes('privacy')) {
    return `Deposit $${capital} into ${n}'s shielded pool on ${chain}, make one private transfer to your own second address, and leave the balance shielded.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of ETH or USDC onto ${n} and use two of its native apps, a swap and a lend, so the wallet has real history on the chain itself.`;
  }
  if (c.includes('synthetic') || c.includes('stable')) {
    return `Mint $${capital} of ${n}'s synthetic or stable asset against ETH collateral on ${chain} and hold part of it in the wallet.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover on a major protocol from ${n} on ${chain}, or supply the same amount to its cover pool, and keep the policy to expiry.`;
  }
  if (c.includes('index')) {
    return `Mint $${capital} of ${n}'s headline index token on ${chain} and hold it rather than trading in and out.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Open a ${n} account, order the card if your region is served, and route about $${capital} of ordinary monthly spending through it.`;
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('aggregator')) {
    return `Deposit $${capital} of USDC or ETH into ${n}'s flagship vault on ${chain} and leave auto-compounding switched on.`;
  }
  if (c.includes('nft')) {
    return `List and buy one low-value item on ${n} with about $${capital} of volume, so the wallet carries genuine marketplace history.`;
  }
  if (c.includes('ai')) {
    return `Deposit $${capital} into ${n} on ${chain} and run its agent or compute tasks as they open, keeping the balance staked between them.`;
  }
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open.`;
}

/** The second, deepening action: what to do after the core position exists. */
function deepenAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) {
    return `Once the first borrow is repaid, repeat the supply-and-borrow cycle at a conservative loan-to-value under 50 percent, and never let the position near liquidation.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Rebalance the liquidity position once a month so it stays in range, and route your ordinary swaps on ${chain} through ${n} instead of a competitor.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) {
    return `Trade in at least four separate weeks rather than one burst: weekly, hedged volume is the pattern points programs reward and wash-trading filters keep.`;
  }
  if (c.includes('chain')) {
    return `Add one new native app a month, a bridge in, a name service, a lending market, so the wallet's history on ${n} broadens instead of repeating one contract.`;
  }
  return `If ${n} runs a points, seasons or quests page inside its own app, complete the tasks it lists there; they are the cheapest qualifying actions the protocol itself publishes.`;
}

/** A pre-token protocol's plan: set up, act, deepen, repeat weekly, hold, and claim safely. */
export function preTokenPlan(p: SnapshotProtocol, ageDays: number | null): FarmStep[] {
  const chain = mainChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(ageDays);
  return [
    {
      action: `Open a fresh wallet for ${p.name} alone and keep its seed phrase offline; fund it on ${chain} with the position money plus gas.`,
      cost: gasFor(chain),
      time: '10 minutes',
    },
    {
      action: coreAction(p, capital, chain),
      cost: `$${capital} of capital, inside the gas already budgeted`,
      time: '15 minutes to set up',
    },
    {
      action: deepenAction(p, chain),
      cost: weeklyGasFor(chain),
      time: '10 minutes a week',
    },
    {
      action: `Hold the position for at least ${hold} days without withdrawing, so the activity appears in more than one weekly snapshot of the protocol.`,
      cost: `the $${capital} stays in the position for the whole hold`,
      time: `${hold} days`,
    },
    {
      action: `Once a month, open ${p.name}'s own app and check for a points or rewards page; claim only from links inside the app itself, never from direct messages, search ads or lookalike sites.`,
      cost: 'nothing to check, and never pay a fee to claim',
      time: '10 minutes a month',
    },
    {
      action: `Keep a farm log with the wallet address, every date, amount and transaction hash, so the position can be proven, repeated on a second protocol, or unwound in minutes.`,
      cost: 'nothing but the log itself',
      time: '5 minutes a week',
    },
  ];
}

/** A live protocol's plan: the token trades, so farm what holding and using it still earns. */
export function livePlan(p: SnapshotProtocol): FarmStep[] {
  const chain = mainChain(p);
  const capital = capitalFor(p);
  const sym = p.symbol ?? 'its token';
  return [
    {
      action: `Open a fresh wallet for ${p.name} alone and keep its seed phrase offline; fund it on ${chain} with the position money plus gas.`,
      cost: gasFor(chain),
      time: '10 minutes',
    },
    {
      action: `Buy about $${capital} of ${sym} through ${p.name}'s own app or a major exchange and stake it in the staking or governance contract the app links to.`,
      cost: `$${capital} of capital, inside the gas already budgeted`,
      time: '15 minutes to set up',
    },
    {
      action: `Provide ${sym} liquidity in its main pool on ${chain} with the other half of the position, so the wallet earns fees while it holds.`,
      cost: weeklyGasFor(chain),
      time: '10 minutes a week to rebalance',
    },
    {
      action: `Vote on ${p.name}'s governance proposals as they appear and delegate to an active delegate when you cannot vote yourself; voters are the wallets retroactive programs look for.`,
      cost: 'a few cents of gas a vote on most chains',
      time: '10 minutes a proposal',
    },
    {
      action: `Claim staking and liquidity rewards monthly from inside ${p.name}'s own app only, and restake them into the same positions.`,
      cost: 'nothing to check, and never pay a fee to claim',
      time: '10 minutes a month',
    },
    {
      action: `Keep a farm log with the wallet address, every date, amount and transaction hash, and review the position each quarter against the token's market value.`,
      cost: 'nothing but the log itself',
      time: '5 minutes a week',
    },
  ];
}
