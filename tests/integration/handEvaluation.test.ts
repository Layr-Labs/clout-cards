/**
 * Integration tests for hand evaluation
 *
 * Tests hand ranking, comparison, and winner determination:
 * - Identical hands (split pot)
 * - Same pair, different kickers
 * - High card vs high card (tie)
 * - Various hand rankings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/database';
import {
  createTestTable,
  createTestPlayers,
  createTestHand,
  createHandPlayers,
  createFabricatedDeck,
  cleanupTestData,
} from '../setup/fixtures';
import { assertPotWinners } from '../helpers/assertions';
import { settleHandShowdown } from '../../src/services/playerAction';

describe('Hand Evaluation', () => {
  const PLAYER_0_WALLET = '0x1111111111111111111111111111111111111111';
  const PLAYER_1_WALLET = '0x2222222222222222222222222222222222222222';
  
  beforeEach(async () => {
    const prisma = getTestPrisma();
    await cleanupTestData(prisma);
  });

  it('should split pot when both players have identical hands', async () => {
    const prisma = getTestPrisma();
    const table = await createTestTable(prisma, {
      bigBlind: 2000000n,
    });

    await createTestPlayers(prisma, table.id, [
      {
        seatNumber: 0,
        walletAddress: PLAYER_0_WALLET,
        tableBalanceGwei: 1000000000n,
      },
      {
        seatNumber: 1,
        walletAddress: PLAYER_1_WALLET,
        tableBalanceGwei: 1000000000n,
      },
    ]);

    // Both players have pair of 10s with same kickers
    // Community: 10♠, 10♥, A♦, K♣, Q♠
    // Player 0: J♠, 9♠ (pair of 10s, A, K, Q kickers)
    // Player 1: J♥, 9♥ (pair of 10s, A, K, Q kickers)
    const deck = createFabricatedDeck([
      // Player 0 hole cards
      { rank: 'J', suit: 'spades' },
      { rank: '9', suit: 'spades' },
      // Player 1 hole cards
      { rank: 'J', suit: 'hearts' },
      { rank: '9', suit: 'hearts' },
      // Community cards
      { rank: '10', suit: 'spades' },
      { rank: '10', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' },
      { rank: 'K', suit: 'clubs' },
      { rank: 'Q', suit: 'spades' },
      // Rest of deck
      ...Array(43).fill({ rank: '2', suit: 'hearts' }),
    ]);

    const hand = await createTestHand(prisma, table.id, {
      deck,
      dealerPosition: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
      currentActionSeat: 0,
      round: 'RIVER',
      status: 'RIVER',
      currentBet: 0n,
      deckPosition: 9, // After river
      communityCards: [
        { rank: '10', suit: 'spades' },
        { rank: '10', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'Q', suit: 'spades' },
      ],
    });

    await createHandPlayers(prisma, hand.id, [
      {
        seatNumber: 0,
        walletAddress: PLAYER_0_WALLET,
        holeCards: [
          { rank: 'J', suit: 'spades' },
          { rank: '9', suit: 'spades' },
        ],
        status: 'ACTIVE',
        chipsCommitted: 10000000n, // Both committed same amount
      },
      {
        seatNumber: 1,
        walletAddress: PLAYER_1_WALLET,
        holeCards: [
          { rank: 'J', suit: 'hearts' },
          { rank: '9', suit: 'hearts' },
        ],
        status: 'ACTIVE',
        chipsCommitted: 10000000n,
      },
    ]);

    // Create pot with both players eligible
    await (prisma as any).pot.create({
      data: {
        handId: hand.id,
        potNumber: 0,
        amount: 20000000n, // 0.02 ETH total
        eligibleSeatNumbers: [0, 1] as any,
        winnerSeatNumbers: null,
      },
    });

    // Settle hand
    await settleHandShowdown(hand.id, prisma);

    // Verify both players are winners (pot should be split)
    await assertPotWinners(prisma, hand.id, new Map([
      [0, [0, 1]], // Both players win pot 0
    ]));
  });

  it('should determine winner when same pair but different kickers', async () => {
    const prisma = getTestPrisma();
    const table = await createTestTable(prisma, {
      bigBlind: 2000000n,
    });

    await createTestPlayers(prisma, table.id, [
      {
        seatNumber: 0,
        walletAddress: PLAYER_0_WALLET,
        tableBalanceGwei: 1000000000n,
      },
      {
        seatNumber: 1,
        walletAddress: PLAYER_1_WALLET,
        tableBalanceGwei: 1000000000n,
      },
    ]);

    // Both have pair of 10s, but different kickers
    // Community: 10♠, 10♥, 9♦, 5♣, 6♠ (changed 8 to 5 and 7 to 6 to prevent Q-J-10-9-8 straight)
    // Player 0: A♠, K♠ (pair of 10s, A, K, 9 kickers) - WINS
    // Player 1: Q♠, J♠ (pair of 10s, Q, J, 9 kickers)
    const deck = createFabricatedDeck([
      // Player 0 hole cards
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'spades' },
      // Player 1 hole cards
      { rank: 'Q', suit: 'spades' },
      { rank: 'J', suit: 'spades' },
      // Community cards
      { rank: '10', suit: 'spades' },
      { rank: '10', suit: 'hearts' },
      { rank: '9', suit: 'diamonds' },
      { rank: '5', suit: 'clubs' },
      { rank: '6', suit: 'spades' },
      // Rest of deck
      ...Array(43).fill({ rank: '2', suit: 'hearts' }),
    ]);

    const hand = await createTestHand(prisma, table.id, {
      deck,
      dealerPosition: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
      currentActionSeat: 0,
      round: 'RIVER',
      status: 'RIVER',
      currentBet: 0n,
      deckPosition: 9,
      communityCards: [
        { rank: '10', suit: 'spades' },
        { rank: '10', suit: 'hearts' },
        { rank: '9', suit: 'diamonds' },
        { rank: '5', suit: 'clubs' },
        { rank: '6', suit: 'spades' },
      ],
    });

    await createHandPlayers(prisma, hand.id, [
      {
        seatNumber: 0,
        walletAddress: PLAYER_0_WALLET,
        holeCards: [
          { rank: 'A', suit: 'spades' },
          { rank: 'K', suit: 'spades' },
        ],
        status: 'ACTIVE',
        chipsCommitted: 10000000n,
      },
      {
        seatNumber: 1,
        walletAddress: PLAYER_1_WALLET,
        holeCards: [
          { rank: 'Q', suit: 'spades' },
          { rank: 'J', suit: 'spades' },
        ],
        status: 'ACTIVE',
        chipsCommitted: 10000000n,
      },
    ]);

    await (prisma as any).pot.create({
      data: {
        handId: hand.id,
        potNumber: 0,
        amount: 20000000n,
        eligibleSeatNumbers: [0, 1] as any,
        winnerSeatNumbers: null,
      },
    });

    await settleHandShowdown(hand.id, prisma);

    // Player 0 should win (better kickers)
    await assertPotWinners(prisma, hand.id, new Map([
      [0, [0]], // Only player 0 wins
    ]));
  });
});

