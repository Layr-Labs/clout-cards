/**
 * 4-Player Big Blind Option Test
 *
 * Tests that the big blind gets their option to check or raise during PRE_FLOP
 * when all players call. This verifies that the wrap-around optimization in
 * handleNextPlayerOrRoundComplete does not incorrectly skip the BB in pre-flop.
 *
 * 4-player pre-flop action order:
 * 1. UTG (seat 3) acts first
 * 2. Dealer (seat 0) acts second
 * 3. SB (seat 1) acts third
 * 4. BB (seat 2) acts last - gets OPTION even if everyone called
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

describe('4-Player Big Blind Option Tests', () => {
  // Test wallet addresses for 4 players
  const PLAYER_0_WALLET = '0x1111111111111111111111111111111111111111';
  const PLAYER_1_WALLET = '0x2222222222222222222222222222222222222222';
  const PLAYER_2_WALLET = '0x3333333333333333333333333333333333333333';
  const PLAYER_3_WALLET = '0x4444444444444444444444444444444444444444';

  // Standard test amounts (in gwei)
  const SMALL_BLIND = 1000000n; // 0.001 ETH
  const BIG_BLIND = 2000000n; // 0.002 ETH
  const INITIAL_BALANCE = 100000000n; // 0.1 ETH per player

  /**
   * Maps seat number to wallet address
   *
   * @param seatNumber - The seat number (0, 1, 2, or 3)
   * @returns The wallet address for that seat
   */
  function getWalletBySeat(seatNumber: number): string {
    switch (seatNumber) {
      case 0:
        return PLAYER_0_WALLET;
      case 1:
        return PLAYER_1_WALLET;
      case 2:
        return PLAYER_2_WALLET;
      case 3:
        return PLAYER_3_WALLET;
      default:
        throw new Error(`Invalid seat number: ${seatNumber}`);
    }
  }

  beforeEach(async () => {
    const prisma = getTestPrisma();
    await cleanupTestData(prisma);
  });

  /**
   * Creates a standard deck for 4-player testing
   */
  function createStandardDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards (seat 0 - Dealer)
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'spades' },
      // Player 1 hole cards (seat 1 - SB)
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      // Player 2 hole cards (seat 2 - BB)
      { rank: '10', suit: 'diamonds' },
      { rank: '9', suit: 'diamonds' },
      // Player 3 hole cards (seat 3 - UTG)
      { rank: '8', suit: 'clubs' },
      { rank: '7', suit: 'clubs' },
      // Flop
      { rank: '6', suit: 'spades' },
      { rank: '5', suit: 'hearts' },
      { rank: '4', suit: 'diamonds' },
      // Turn
      { rank: '3', suit: 'clubs' },
      // River
      { rank: '2', suit: 'spades' },
      // Rest of deck
      ...Array(39).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Sets up a 4-player table and starts a hand
   *
   * In 4-player poker:
   * - Seat 0: Dealer
   * - Seat 1: Small Blind
   * - Seat 2: Big Blind
   * - Seat 3: UTG (first to act pre-flop)
   *
   * @returns Object containing prisma, table, and hand
   */
  async function setup4PlayerHand() {
    const prisma = getTestPrisma();

    // Create table
    const table = await createTestTable(prisma, {
      name: '4-Player BB Test Table',
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      perHandRake: 0,
    });

    // Create 4 players at seats 0, 1, 2, 3
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
      {
        seatNumber: 2,
        walletAddress: PLAYER_2_WALLET,
        tableBalanceGwei: INITIAL_BALANCE,
      },
      {
        seatNumber: 3,
        walletAddress: PLAYER_3_WALLET,
        tableBalanceGwei: INITIAL_BALANCE,
      },
    ]);

    // Start hand using service layer
    const hand = await startHand(table.id, prisma);

    return { prisma, table, hand };
  }

  describe('PF-4P-001: Big Blind Gets Option When All Call', () => {
    /**
     * This test verifies that when UTG, Dealer, and SB all call, the big blind
     * still gets their option to act (check or raise) before the round
     * advances to FLOP.
     *
     * Pre-flop action order for 4 players:
     * 1. UTG (seat 3) acts first
     * 2. Dealer (seat 0) acts second
     * 3. SB (seat 1) acts third
     * 4. BB (seat 2) acts last - gets OPTION even if everyone called
     */
    it('should give BB option to act after UTG, Dealer, and SB call', async () => {
      const { prisma, table, hand } = await setup4PlayerHand();

      // Verify initial setup
      // In 4-player: dealer=0, SB=1, BB=2, UTG=3 (first action)
      expect(hand.dealerPosition).toBe(0);
      expect(hand.smallBlindSeat).toBe(1);
      expect(hand.bigBlindSeat).toBe(2);
      expect(hand.currentActionSeat).toBe(3); // UTG acts first

      // UTG (seat 3) calls the big blind
      const utg = getWalletBySeat(3);
      await callAction(prisma, table.id, utg);

      // Check hand state after UTG calls
      let currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(0); // Dealer's turn

      // Dealer (seat 0) calls
      const dealer = getWalletBySeat(0);
      await callAction(prisma, table.id, dealer);

      // Check hand state after Dealer calls
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(1); // SB's turn

      // SB (seat 1) calls (adds 1M to match 2M)
      const sb = getWalletBySeat(1);
      await callAction(prisma, table.id, sb);

      // Check hand state after SB calls
      // THIS IS THE KEY ASSERTION - BB should be next, round should still be PRE_FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });

      // Bug manifestation: round would be 'FLOP' instead of 'PRE_FLOP'
      expect(currentHand?.round).toBe('PRE_FLOP');
      // Bug manifestation: BB (seat 2) would be skipped
      expect(currentHand?.currentActionSeat).toBe(2); // BB should be next

      // BB (seat 2) checks (exercises their option)
      const bb = getWalletBySeat(2);
      await checkAction(prisma, table.id, bb);

      // Now round should advance to FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('FLOP');
    });
  });

  describe('PF-4P-002: Big Blind Can Raise When All Call', () => {
    /**
     * This test verifies that BB can raise when everyone else just called.
     * Action should then continue with UTG getting a chance to respond.
     */
    it('should allow BB to raise after UTG, Dealer, and SB call', async () => {
      const { prisma, table, hand } = await setup4PlayerHand();

      // UTG (seat 3) calls
      const utg = getWalletBySeat(3);
      await callAction(prisma, table.id, utg);

      // Dealer (seat 0) calls
      const dealer = getWalletBySeat(0);
      await callAction(prisma, table.id, dealer);

      // SB (seat 1) calls
      const sb = getWalletBySeat(1);
      await callAction(prisma, table.id, sb);

      // Verify BB is next and round is still PRE_FLOP
      let currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(2); // BB should be next

      // BB (seat 2) raises to 5M (increment of 3M over the 2M BB)
      const bb = getWalletBySeat(2);
      await raiseAction(prisma, table.id, bb, 3000000n); // 3M increment = 5M total

      // Verify action continues - UTG should be next, still PRE_FLOP
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('PRE_FLOP');
      expect(currentHand?.currentActionSeat).toBe(3); // UTG should respond
      expect(currentHand?.currentBet).toBe(5000000n); // Bet is now 5M

      // UTG calls the raise
      await callAction(prisma, table.id, utg);

      // Dealer calls the raise
      await callAction(prisma, table.id, dealer);

      // SB calls the raise
      await callAction(prisma, table.id, sb);

      // Now round should advance to FLOP (all have acted and matched)
      currentHand = await prisma.hand.findUnique({
        where: { id: hand.id },
      });
      expect(currentHand?.round).toBe('FLOP');
    });
  });
});

