/**
 * 2-Player (Heads-Up) Big Blind Option Test
 *
 * Tests that the big blind gets their option to check or raise during PRE_FLOP
 * when the small blind just calls. In heads-up, the dealer is the small blind
 * and acts first pre-flop.
 *
 * Heads-up pre-flop action order:
 * 1. Dealer/SB acts first
 * 2. BB gets option (even if SB just called)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/database';
import {
  createTestTable,
  createTestPlayers,
  createFabricatedDeck,
  cleanupTestData,
} from '../setup/fixtures';
import {
  callAction,
  checkAction,
  raiseAction,
} from '../../src/services/playerAction';
import { startHand } from '../../src/services/startHand';
import { Card } from '../../src/types/cards';

describe('2-Player (Heads-Up) Big Blind Option Tests', () => {
  // Test wallet addresses for 2 players
  const PLAYER_0_WALLET = '0x1111111111111111111111111111111111111111';
  const PLAYER_1_WALLET = '0x2222222222222222222222222222222222222222';

  // Standard test amounts (in gwei)
  const SMALL_BLIND = 1000000n; // 0.001 ETH
  const BIG_BLIND = 2000000n; // 0.002 ETH
  const INITIAL_BALANCE = 100000000n; // 0.1 ETH per player

  /**
   * Maps seat number to wallet address
   *
   * @param seatNumber - The seat number (0 or 1)
   * @returns The wallet address for that seat
   */
  function getWalletBySeat(seatNumber: number): string {
    switch (seatNumber) {
      case 0:
        return PLAYER_0_WALLET;
      case 1:
        return PLAYER_1_WALLET;
      default:
        throw new Error(`Invalid seat number: ${seatNumber}`);
    }
  }

  beforeEach(async () => {
    const prisma = getTestPrisma();
    await cleanupTestData(prisma);
  });

  /**
   * Creates a standard deck for 2-player testing
   */
  function createStandardDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards (seat 0 - Dealer/SB)
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'spades' },
      // Player 1 hole cards (seat 1 - BB)
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      // Flop
      { rank: '10', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
      { rank: '8', suit: 'clubs' },
      // Turn
      { rank: '7', suit: 'spades' },
      // River
      { rank: '6', suit: 'hearts' },
      // Rest of deck
      ...Array(43).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Sets up a 2-player (heads-up) table and starts a hand
   *
   * In heads-up poker:
   * - Seat 0: Dealer AND Small Blind (acts first pre-flop)
   * - Seat 1: Big Blind (acts second pre-flop, gets option)
   *
   * @returns Object containing prisma, table, and hand
   */
  async function setup2PlayerHand() {
    const prisma = getTestPrisma();

    // Create table
    const table = await createTestTable(prisma, {
      name: '2-Player BB Test Table',
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      perHandRake: 0,
    });

    // Create 2 players at seats 0, 1
    await createTestPlayers(prisma, table.id, [
      {
        seatNumber: 0,
        walletAddress: PLAYER_0_WALLET,
        tableBalanceGwei: INITIAL_BALANCE,
      },
      {
        seatNumber: 1,
        walletAddress: PLAYER_1_WALLET,
        tableBalanceGwei: INITIAL_BALANCE,
      },
    ]);

    // Start hand using service layer
    const hand = await startHand(table.id, prisma);

    return { prisma, table, hand };
  }

  describe('PF-2P-001: Big Blind Gets Option When SB Calls (Heads-Up)', () => {
    /**
     * In heads-up, when the dealer/SB calls, BB should still get their option.
     * 
     * Heads-up pre-flop order:
     * 1. Dealer/SB (seat 0) acts first
     * 2. BB (seat 1) acts second - gets OPTION even if SB just called
     */
    it('should give BB option to act after SB calls in heads-up', async () => {
      const { prisma, table, hand } = await setup2PlayerHand();

      // Verify initial setup for heads-up
      // In heads-up: dealer=0, SB=0 (dealer is SB), BB=1, first action=0 (SB)
      expect(hand.dealerPosition).toBe(0);
      expect(hand.smallBlindSeat).toBe(0); // Dealer is SB in heads-up
      expect(hand.bigBlindSeat).toBe(1);
      expect(hand.currentActionSeat).toBe(0); // SB acts first in heads-up pre-flop

      // SB (seat 0 - dealer) calls the big blind
      const sb = getWalletBySeat(0);
      await callAction(prisma, table.id, sb);

      // Check hand state after SB calls
      // BB should be next, round should still be PRE_FLOP
      let currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });

      // This is the key assertion - BB should get their option
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(1); // BB should be next

      // BB (seat 1) checks (exercises their option)
      const bb = getWalletBySeat(1);
      await checkAction(prisma, table.id, bb);

      // Now round should advance to FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('FLOP');
    });
  });

  describe('PF-2P-002: Big Blind Can Raise When SB Calls (Heads-Up)', () => {
    /**
     * In heads-up, BB can raise after SB calls.
     */
    it('should allow BB to raise after SB calls in heads-up', async () => {
      const { prisma, table, hand } = await setup2PlayerHand();

      // SB (seat 0) calls
      const sb = getWalletBySeat(0);
      await callAction(prisma, table.id, sb);

      // Verify BB is next and round is still PRE_FLOP
      let currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(1); // BB should be next

      // BB (seat 1) raises to 5M (increment of 3M over the 2M BB)
      const bb = getWalletBySeat(1);
      await raiseAction(prisma, table.id, bb, 3000000n); // 3M increment = 5M total

      // Verify action continues - SB should respond, still PRE_FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(0); // SB should respond
      expect(currentHand?.currentBet).toBe(5000000n);

      // SB calls the raise
      await callAction(prisma, table.id, sb);

      // Now round should advance to FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('FLOP');
    });
  });
});

