/**
 * Card type definitions
 *
 * Shared types for representing playing cards in the poker game.
 */

/**
 * Card suit
 */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/**
 * Card rank
 */
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

/**
 * Card representation
 */
export type Card = {
  suit: Suit;
  rank: Rank;
};

/**
 * All valid card suits
 */
export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

/**
 * All valid card ranks
 */
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

