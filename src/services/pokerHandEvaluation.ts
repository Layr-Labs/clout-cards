/**
 * Poker hand evaluation service
 *
 * Evaluates poker hands and determines winners, including kicker support for tie-breaking.
 * Handles Texas Hold'em poker hand rankings and comparisons.
 */

import { Card, Rank, Suit } from '../types/cards';

/**
 * Poker hand rank (from lowest to highest)
 */
export enum HandRank {
  HIGH_CARD = 1,
  PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

/**
 * Rank value mapping (Ace high for straights, but can be low for A-2-3-4-5)
 */
const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14, // Ace high (for straights, A-K-Q-J-10)
};

/**
 * Rank value for Ace-low straight (A-2-3-4-5)
 */
const ACE_LOW_VALUE = 1;

/**
 * Evaluated hand result
 */
export interface EvaluatedHand {
  rank: HandRank;
  /**
   * Primary value (e.g., pair rank, straight high card, etc.)
   */
  primaryValue: number;
  /**
   * Secondary value (e.g., kicker for pair, second pair for two pair, etc.)
   */
  secondaryValue: number;
  /**
   * Kickers array (remaining cards sorted descending)
   */
  kickers: number[];
  /**
   * The 5 cards that make up this hand (best 5-card combination)
   */
  bestCards: Card[];
}

/**
 * Converts rank to numeric value
 *
 * @param rank - Card rank
 * @param aceLow - Whether Ace should be treated as low (for A-2-3-4-5 straight)
 * @returns Numeric value
 */
function rankToValue(rank: Rank, aceLow: boolean = false): number {
  if (rank === 'A' && aceLow) {
    return ACE_LOW_VALUE;
  }
  return RANK_VALUES[rank];
}

/**
 * Gets all 5-card combinations from 7 cards (2 hole + 5 community)
 *
 * @param cards - Array of 7 cards
 * @returns Array of all 5-card combinations
 */
function getFiveCardCombinations(cards: Card[]): Card[][] {
  if (cards.length !== 7) {
    throw new Error(`Expected 7 cards, got ${cards.length}`);
  }

  const combinations: Card[][] = [];

  // Generate all combinations of 5 cards from 7
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const combination = cards.filter((_, index) => index !== i && index !== j);
      combinations.push(combination);
    }
  }

  return combinations;
}

/**
 * Checks if cards form a straight
 *
 * @param cards - 5 cards (must be sorted by rank)
 * @returns High card value if straight, null otherwise
 */
function isStraight(cards: Card[]): number | null {
  if (cards.length !== 5) {
    return null;
  }

  const values = cards.map(c => rankToValue(c.rank)).sort((a, b) => a - b);

  // Check regular straight (no Ace-low)
  let isRegularStraight = true;
  for (let i = 1; i < 5; i++) {
    if (values[i] !== values[i - 1] + 1) {
      isRegularStraight = false;
      break;
    }
  }

  if (isRegularStraight) {
    return values[4]; // Return high card
  }

  // Check Ace-low straight (A-2-3-4-5)
  const aceLowValues = cards.map(c => rankToValue(c.rank, c.rank === 'A')).sort((a, b) => a - b);
  let isAceLowStraight = true;
  for (let i = 1; i < 5; i++) {
    if (aceLowValues[i] !== aceLowValues[i - 1] + 1) {
      isAceLowStraight = false;
      break;
    }
  }

  if (isAceLowStraight && aceLowValues[0] === ACE_LOW_VALUE && aceLowValues[4] === 5) {
    return 5; // Ace-low straight high card is 5
  }

  return null;
}

/**
 * Checks if cards form a flush
 *
 * @param cards - 5 cards
 * @returns True if all cards are same suit
 */
function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) {
    return false;
  }
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

/**
 * Evaluates a 5-card hand
 *
 * @param cards - 5 cards (must be sorted by rank value descending)
 * @returns Evaluated hand result
 */
function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error(`Expected 5 cards, got ${cards.length}`);
  }

  // Sort cards by rank value (descending)
  const sortedCards = [...cards].sort((a, b) => rankToValue(b.rank) - rankToValue(a.rank));
  const values = sortedCards.map(c => rankToValue(c.rank));

  // Count rank frequencies
  const rankCounts: Record<number, number> = {};
  for (const value of values) {
    rankCounts[value] = (rankCounts[value] || 0) + 1;
  }

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const rankKeys = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

  const isStraightResult = isStraight(sortedCards);
  const isFlushResult = isFlush(sortedCards);

  // Royal Flush (A-K-Q-J-10 same suit)
  if (isStraightResult === 14 && isFlushResult) {
    return {
      rank: HandRank.ROYAL_FLUSH,
      primaryValue: 14,
      secondaryValue: 0,
      kickers: [],
      bestCards: sortedCards,
    };
  }

  // Straight Flush
  if (isStraightResult !== null && isFlushResult) {
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      primaryValue: isStraightResult,
      secondaryValue: 0,
      kickers: [],
      bestCards: sortedCards,
    };
  }

  // Four of a Kind
  if (counts[0] === 4) {
    const fourKindValue = rankKeys.find(k => rankCounts[k] === 4)!;
    const kicker = rankKeys.find(k => rankCounts[k] === 1)!;
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      primaryValue: fourKindValue,
      secondaryValue: kicker,
      kickers: [kicker],
      bestCards: sortedCards,
    };
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    const threeKindValue = rankKeys.find(k => rankCounts[k] === 3)!;
    const pairValue = rankKeys.find(k => rankCounts[k] === 2)!;
    return {
      rank: HandRank.FULL_HOUSE,
      primaryValue: threeKindValue,
      secondaryValue: pairValue,
      kickers: [],
      bestCards: sortedCards,
    };
  }

  // Flush
  if (isFlushResult) {
    return {
      rank: HandRank.FLUSH,
      primaryValue: values[0],
      secondaryValue: values[1],
      kickers: values.slice(2),
      bestCards: sortedCards,
    };
  }

  // Straight
  if (isStraightResult !== null) {
    return {
      rank: HandRank.STRAIGHT,
      primaryValue: isStraightResult,
      secondaryValue: 0,
      kickers: [],
      bestCards: sortedCards,
    };
  }

  // Three of a Kind
  if (counts[0] === 3) {
    const threeKindValue = rankKeys.find(k => rankCounts[k] === 3)!;
    const kickers = rankKeys.filter(k => rankCounts[k] === 1).sort((a, b) => b - a);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      primaryValue: threeKindValue,
      secondaryValue: kickers[0],
      kickers: kickers.slice(1),
      bestCards: sortedCards,
    };
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = rankKeys.filter(k => rankCounts[k] === 2).sort((a, b) => b - a);
    const kicker = rankKeys.find(k => rankCounts[k] === 1)!;
    return {
      rank: HandRank.TWO_PAIR,
      primaryValue: pairs[0],
      secondaryValue: pairs[1],
      kickers: [kicker],
      bestCards: sortedCards,
    };
  }

  // Pair
  if (counts[0] === 2) {
    const pairValue = rankKeys.find(k => rankCounts[k] === 2)!;
    const kickers = rankKeys.filter(k => rankCounts[k] === 1).sort((a, b) => b - a);
    return {
      rank: HandRank.PAIR,
      primaryValue: pairValue,
      secondaryValue: kickers[0],
      kickers: kickers.slice(1),
      bestCards: sortedCards,
    };
  }

  // High Card
  return {
    rank: HandRank.HIGH_CARD,
    primaryValue: values[0],
    secondaryValue: values[1],
    kickers: values.slice(2),
    bestCards: sortedCards,
  };
}

/**
 * Evaluates a Texas Hold'em hand (2 hole cards + 5 community cards)
 *
 * @param holeCards - Player's 2 hole cards
 * @param communityCards - 5 community cards
 * @returns Best evaluated hand from all 5-card combinations
 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  if (holeCards.length !== 2) {
    throw new Error(`Expected 2 hole cards, got ${holeCards.length}`);
  }
  if (communityCards.length !== 5) {
    throw new Error(`Expected 5 community cards, got ${communityCards.length}`);
  }

  const allCards = [...holeCards, ...communityCards];
  const combinations = getFiveCardCombinations(allCards);

  // Evaluate all combinations and return the best
  let bestHand = evaluateFiveCards(combinations[0]);

  for (let i = 1; i < combinations.length; i++) {
    const hand = evaluateFiveCards(combinations[i]);
    if (compareHands(hand, bestHand) > 0) {
      bestHand = hand;
    }
  }

  return bestHand;
}

/**
 * Compares two evaluated hands
 *
 * @param hand1 - First hand
 * @param hand2 - Second hand
 * @returns Positive if hand1 > hand2, negative if hand1 < hand2, 0 if equal
 */
export function compareHands(hand1: EvaluatedHand, hand2: EvaluatedHand): number {
  // Compare rank first
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }

  // Compare primary value
  if (hand1.primaryValue !== hand2.primaryValue) {
    return hand1.primaryValue - hand2.primaryValue;
  }

  // Compare secondary value
  if (hand1.secondaryValue !== hand2.secondaryValue) {
    return hand1.secondaryValue - hand2.secondaryValue;
  }

  // Compare kickers
  const maxKickers = Math.max(hand1.kickers.length, hand2.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const kicker1 = hand1.kickers[i] || 0;
    const kicker2 = hand2.kickers[i] || 0;
    if (kicker1 !== kicker2) {
      return kicker1 - kicker2;
    }
  }

  // Hands are equal
  return 0;
}

/**
 * Gets hand rank name as string
 *
 * @param rank - Hand rank enum value
 * @returns Human-readable rank name
 */
export function getHandRankName(rank: HandRank): string {
  const names: Record<HandRank, string> = {
    [HandRank.HIGH_CARD]: 'High Card',
    [HandRank.PAIR]: 'Pair',
    [HandRank.TWO_PAIR]: 'Two Pair',
    [HandRank.THREE_OF_A_KIND]: 'Three of a Kind',
    [HandRank.STRAIGHT]: 'Straight',
    [HandRank.FLUSH]: 'Flush',
    [HandRank.FULL_HOUSE]: 'Full House',
    [HandRank.FOUR_OF_A_KIND]: 'Four of a Kind',
    [HandRank.STRAIGHT_FLUSH]: 'Straight Flush',
    [HandRank.ROYAL_FLUSH]: 'Royal Flush',
  };
  return names[rank];
}

