#!/usr/bin/env node
// Monte Carlo simulation for Gravity Poker hand frequency analysis.
// Enumerates all connected subsets of size 1-5 on random 5x5 grids
// and evaluates poker hand types to measure achievability and frequency.

const ROWS = 5, COLS = 5, MAX_SIZE = 5;
const NUM_GRIDS = parseInt(process.argv[2]) || 10000;

const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_ORDER = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
  'J':11,'Q':12,'K':13,'A':14
};

const DIRS = [
  [-1,-1],[-1,0],[-1,1],
  [0,-1],        [0,1],
  [1,-1], [1,0], [1,1]
];

const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

// ---- Deck & shuffle -------------------------------------------------

function createDeck () {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

function shuffle (arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Evaluator (identical logic to the game) ------------------------

function evaluateHand (cards) {
  const n = cards.length;
  if (n === 0) return 'High Card';

  const rankCounts = {};
  for (const c of cards) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  if (n === 1) return 'High Card';
  if (n === 2) return counts[0] === 2 ? 'Pair' : 'High Card';
  if (n === 3) {
    if (counts[0] === 3) return 'Three of a Kind';
    return counts[0] === 2 ? 'Pair' : 'High Card';
  }
  if (n === 4) {
    if (counts[0] === 4) return 'Four of a Kind';
    if (counts[0] === 3) return 'Three of a Kind';
    if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';
    return counts[0] === 2 ? 'Pair' : 'High Card';
  }

  const isFlush = new Set(cards.map(c => c.suit)).size === 1;
  const orders = cards.map(c => RANK_ORDER[c.rank]).sort((a, b) => a - b);
  let isStraight = false;
  if (new Set(orders).size === 5) {
    isStraight = (orders[4] - orders[0] === 4);
    if (!isStraight && orders[0] === 2 && orders[1] === 3 && orders[2] === 4 && orders[3] === 5 && orders[4] === 14)
      isStraight = true;
  }

  if (isFlush && isStraight) return 'Straight Flush';
  if (counts[0] === 4) return 'Four of a Kind';
  if (counts[0] === 3 && counts[1] === 2) return 'Full House';
  if (isFlush) return 'Flush';
  if (isStraight) return 'Straight';
  if (counts[0] === 3) return 'Three of a Kind';
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';
  if (counts[0] === 2) return 'Pair';
  return 'High Card';
}

// ---- Connected subset enumeration -----------------------------------
// We enumerate all connected subsets of size 1..MAX_SIZE using a
// canonical expansion approach: start from every cell, grow by adding
// neighbors, using a bitmask to avoid duplicates.

function cellIdx (r, c) { return r * COLS + c; }

function neighbors (r, c) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
  }
  return out;
}

// Precompute neighbor lists
const NEIGHBORS = new Array(ROWS * COLS);
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++)
    NEIGHBORS[cellIdx(r, c)] = neighbors(r, c).map(([nr, nc]) => cellIdx(nr, nc));

// Enumerate all connected subsets using bitmask-based DFS.
// To avoid counting the same subset multiple times, we use a canonical
// form: the subset bitmask itself. We store seen bitmasks in a Set.
function enumerateConnected (grid, callback) {
  const seen = new Set();

  function expand (mask, frontier) {
    const size = popcount(mask);
    if (size > MAX_SIZE) return;

    if (seen.has(mask)) return;
    seen.add(mask);

    // Collect cards for this subset
    const cards = [];
    let tmp = mask;
    while (tmp) {
      const bit = tmp & (-tmp);
      const idx = Math.log2(bit) | 0;
      cards.push(grid[idx]);
      tmp ^= bit;
    }
    callback(cards, size);

    if (size >= MAX_SIZE) return;

    // Expand to each neighbor of any cell in the subset
    for (let i = 0; i < 25; i++) {
      if (!(mask & (1 << i))) continue;
      for (const ni of NEIGHBORS[i]) {
        const nbit = 1 << ni;
        if (mask & nbit) continue;
        expand(mask | nbit, null);
      }
    }
  }

  for (let i = 0; i < 25; i++) {
    expand(1 << i, null);
  }
}

function popcount (n) {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

// ---- Main simulation ------------------------------------------------

function run () {
  const totalSubsets = {};
  const gridsWithHand = {};
  const bestHandCount = {};

  for (const name of HAND_NAMES) {
    totalSubsets[name] = 0;
    gridsWithHand[name] = 0;
    bestHandCount[name] = 0;
  }

  let totalSubsetCount = 0;
  const handRank = {};
  HAND_NAMES.forEach((n, i) => handRank[n] = i);

  const t0 = Date.now();

  for (let g = 0; g < NUM_GRIDS; g++) {
    if (g % 5000 === 0 && g > 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const pct = ((g / NUM_GRIDS) * 100).toFixed(0);
      process.stderr.write(`\r  ${pct}% (${g}/${NUM_GRIDS}) ${elapsed}s`);
    }

    const deck = shuffle(createDeck());
    const grid = deck.slice(0, 25);

    const foundInGrid = new Set();
    let bestRank = 0;

    enumerateConnected(grid, (cards, size) => {
      totalSubsetCount++;
      const hand = evaluateHand(cards);
      totalSubsets[hand]++;
      foundInGrid.add(hand);
      const r = handRank[hand];
      if (r > bestRank) bestRank = r;
    });

    for (const h of foundInGrid) gridsWithHand[h]++;
    bestHandCount[HAND_NAMES[bestRank]]++;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(`\r  100% done in ${elapsed}s\n`);

  console.log(`\nGravity Poker Monte Carlo Simulation`);
  console.log(`Grids simulated: ${NUM_GRIDS.toLocaleString()}`);
  console.log(`Total connected subsets evaluated: ${totalSubsetCount.toLocaleString()}`);
  console.log(`Avg subsets per grid: ${(totalSubsetCount / NUM_GRIDS).toFixed(0)}\n`);

  const colW = [18, 14, 14, 14];
  const hdr = [
    'Hand Type'.padEnd(colW[0]),
    'Availability'.padStart(colW[1]),
    'Subset Freq'.padStart(colW[2]),
    'Best Hand'.padStart(colW[3])
  ].join(' | ');
  console.log(hdr);
  console.log(hdr.replace(/[^|]/g, '-'));

  for (const name of HAND_NAMES) {
    const avail = ((gridsWithHand[name] / NUM_GRIDS) * 100).toFixed(2) + '%';
    const freq = ((totalSubsets[name] / totalSubsetCount) * 100).toFixed(4) + '%';
    const best = ((bestHandCount[name] / NUM_GRIDS) * 100).toFixed(2) + '%';
    const row = [
      name.padEnd(colW[0]),
      avail.padStart(colW[1]),
      freq.padStart(colW[2]),
      best.padStart(colW[3])
    ].join(' | ');
    console.log(row);
  }
  console.log();
}

run();
