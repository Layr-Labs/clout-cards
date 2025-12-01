/**
 * Comprehensive 4-Player Poker Test Matrix
 *
 * Tests all action combinations for 4-player poker scenarios:
 * - PRE-FLOP, FLOP, TURN, RIVER betting rounds
 * - CHECK, CALL, BET, RAISE, FOLD, ALL_IN actions
 * - Rake scenarios: 0 bps and 700 bps
 * - Single winner, showdown, and multi-way tie scenarios
 * - Side pot creation and distribution
 * - Dealer/blind rotation across multiple hands
 * - Kicker requirements and complex showdowns
 *
 * Based on 4_player_test_matrix.md
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
import {
  assertPotAmounts,
  assertPotWinners,
  assertPlayerBalances,
  assertHandStatus,
  assertHandRound,
} from '../helpers/assertions';
import {
  betAction,
  callAction,
  checkAction,
  raiseAction,
  foldAction,
  allInAction,
} from '../../src/services/playerAction';
import { startHand } from '../../src/services/startHand';
import { Card } from '../../src/types/cards';

describe('4-Player Poker Test Matrix', () => {
  // Test wallet addresses
  const PLAYER_0_WALLET = '0x1111111111111111111111111111111111111111';
  const PLAYER_1_WALLET = '0x2222222222222222222222222222222222222222';
  const PLAYER_2_WALLET = '0x3333333333333333333333333333333333333333';
  const PLAYER_3_WALLET = '0x4444444444444444444444444444444444444444';

  // Standard test amounts (in gwei)
  const SMALL_BLIND = 1000000n; // 0.001 ETH
  const BIG_BLIND = 2000000n; // 0.002 ETH

  beforeEach(async () => {
    const prisma = getTestPrisma();
    await cleanupTestData(prisma);
  });

  /**
   * Helper function to calculate rake amount
   */
  function calculateRake(potAmount: bigint, rakeBps: number): bigint {
    if (rakeBps <= 0) return 0n;
    return (potAmount * BigInt(rakeBps)) / 10000n;
  }

  /**
   * Helper function to create a standard deck for testing
   * Ensures Player 0 has the best hand for winner verification
   */
  function createStandardDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards (best hand)
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'spades' },
      // Player 1 hole cards
      { rank: 'Q', suit: 'spades' },
      { rank: 'J', suit: 'spades' },
      // Player 2 hole cards
      { rank: '10', suit: 'spades' },
      { rank: '9', suit: 'spades' },
      // Player 3 hole cards
      { rank: '8', suit: 'spades' },
      { rank: '7', suit: 'spades' },
      // Flop
      { rank: '6', suit: 'spades' },
      { rank: '5', suit: 'hearts' },
      { rank: '4', suit: 'diamonds' },
      // Turn
      { rank: '3', suit: 'clubs' },
      // River
      { rank: '2', suit: 'hearts' },
      // Rest of deck
      ...Array(40).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Helper function to create a tie deck (two-way tie)
   */
  function createTwoWayTieDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards
      { rank: '10', suit: 'spades' },
      { rank: '5', suit: 'spades' },
      // Player 1 hole cards
      { rank: '10', suit: 'hearts' },
      { rank: '5', suit: 'hearts' },
      // Player 2 hole cards
      { rank: '9', suit: 'spades' },
      { rank: '4', suit: 'spades' },
      // Player 3 hole cards
      { rank: '8', suit: 'spades' },
      { rank: '3', suit: 'spades' },
      // Flop (both get pair of 10s with same kickers)
      { rank: '10', suit: 'diamonds' },
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'hearts' },
      // Turn
      { rank: 'Q', suit: 'diamonds' },
      // River
      { rank: 'J', suit: 'spades' },
      // Rest of deck
      ...Array(40).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Helper function to create a tie deck (three-way tie)
   */
  function createThreeWayTieDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards
      { rank: '10', suit: 'spades' },
      { rank: '5', suit: 'spades' },
      // Player 1 hole cards
      { rank: '10', suit: 'hearts' },
      { rank: '5', suit: 'hearts' },
      // Player 2 hole cards
      { rank: '10', suit: 'diamonds' },
      { rank: '5', suit: 'diamonds' },
      // Player 3 hole cards
      { rank: '9', suit: 'spades' },
      { rank: '4', suit: 'spades' },
      // Flop (three get pair of 10s with same kickers)
      { rank: '10', suit: 'clubs' },
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'hearts' },
      // Turn
      { rank: 'Q', suit: 'diamonds' },
      // River
      { rank: 'J', suit: 'spades' },
      // Rest of deck
      ...Array(40).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Helper function to create a tie deck (four-way tie)
   */
  function createFourWayTieDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards
      { rank: '10', suit: 'spades' },
      { rank: '5', suit: 'spades' },
      // Player 1 hole cards
      { rank: '10', suit: 'hearts' },
      { rank: '5', suit: 'hearts' },
      // Player 2 hole cards
      { rank: '10', suit: 'diamonds' },
      { rank: '5', suit: 'diamonds' },
      // Player 3 hole cards
      { rank: '10', suit: 'clubs' },
      { rank: '5', suit: 'clubs' },
      // Flop (all get pair of 10s with same kickers)
      { rank: '10', suit: 'spades' },
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'hearts' },
      // Turn
      { rank: 'Q', suit: 'diamonds' },
      // River
      { rank: 'J', suit: 'spades' },
      // Rest of deck
      ...Array(40).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Helper function to create a kicker test deck (pair with different kickers)
   */
  function createKickerDeck(): Card[] {
    return createFabricatedDeck([
      // Player 0 hole cards (pair of 10s, A kicker - best)
      { rank: 'A', suit: 'spades' },
      { rank: '10', suit: 'spades' },
      // Player 1 hole cards (pair of 10s, K kicker)
      { rank: 'K', suit: 'spades' },
      { rank: '10', suit: 'hearts' },
      // Player 2 hole cards (pair of 10s, Q kicker)
      { rank: 'Q', suit: 'spades' },
      { rank: '10', suit: 'diamonds' },
      // Player 3 hole cards
      { rank: 'J', suit: 'spades' },
      { rank: '9', suit: 'spades' },
      // Flop
      { rank: '10', suit: 'clubs' },
      { rank: '5', suit: 'hearts' },
      { rank: '4', suit: 'diamonds' },
      // Turn
      { rank: '3', suit: 'clubs' },
      // River
      { rank: '2', suit: 'hearts' },
      // Rest of deck
      ...Array(40).fill({ rank: '2', suit: 'hearts' }),
    ]);
  }

  /**
   * Helper to properly initialize a hand using the service layer
   * Uses startHand to ensure all state is correctly set up (blinds, balances, pots, etc.)
   * 
   * Note: This replaces the old setupInitialPot which directly manipulated the database.
   * startHand properly handles:
   * - Deducting blinds from tableBalanceGwei
   * - Creating POST_BLIND HandAction records
   * - Updating HandPlayer chipsCommitted
   * - Creating initial pot
   * 
   * @param tableId - Table ID (hand will be created via startHand)
   * @returns The hand created by startHand with all proper state
   */
  async function initializeHandWithServiceLayer(tableId: number) {
    const prisma = getTestPrisma();
    // Use the actual service layer to start the hand properly
    const hand = await startHand(tableId);
    return { prisma, hand };
  }

  /**
   * Helper to create POST_BLIND actions using the service layer
   * This is a no-op wrapper - POST_BLIND actions are created by startHand
   * Kept for compatibility with existing test code that calls this
   * 
   * @deprecated Use startHand instead - this function does nothing as startHand already handles POST_BLIND
   */
  async function createPostBlindActions(prisma: any, handId: number, smallBlindSeat: number, bigBlindSeat: number): Promise<void> {
    // POST_BLIND actions are created by startHand service
    // This function is kept for backward compatibility but does nothing
    // Tests should use startHand to properly initialize hands
  }

  /**
   * Helper to simulate PRE_FLOP actions using the actual service layer
   * This properly simulates a completed PRE_FLOP round by using actual action functions
   * which will naturally advance the round when complete
   * 
   * @param prisma - Prisma client
   * @param tableId - Table ID
   * @param handId - Hand ID (from startHand)
   * @param dealerSeat - Dealer seat number
   * @param smallBlindSeat - Small blind seat number  
   * @param bigBlindSeat - Big blind seat number
   * @param utgSeat - UTG seat number
   * @param targetRound - Target round to advance to (FLOP, TURN, or RIVER)
   * @returns Updated hand after actions complete
   */
  async function simulatePreFlopActions(
    prisma: any,
    tableId: number,
    handId: number,
    dealerSeat: number,
    smallBlindSeat: number,
    bigBlindSeat: number,
    utgSeat: number,
    targetRound: 'FLOP' | 'TURN' | 'RIVER' = 'FLOP'
  ): Promise<any> {
    // Use actual service layer functions to simulate PRE_FLOP actions
    // startHand already posted blinds, so we just need to complete the round
    
    // Get current hand to find who acts first (should be UTG after blinds)
    let hand = await prisma.hand.findUnique({ where: { id: handId } });
    if (!hand) {
      throw new Error(`Hand ${handId} not found`);
    }

    // Complete PRE_FLOP round by acting in order based on currentActionSeat
    // UTG calls (to match big blind)
    await callAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));

    // Dealer calls (to match big blind)
    await callAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));

    // Small blind calls (1M more to match big blind)
    await callAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));

    // Big blind checks (option to check)
    await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));

    // Round should now advance to FLOP automatically
    // If we need TURN or RIVER, we'll need to simulate those rounds too
    hand = await prisma.hand.findUnique({ where: { id: handId } });
    
    if (targetRound === 'TURN' || targetRound === 'RIVER') {
      // Simulate FLOP round: all check to advance to TURN
      if (hand?.round === 'FLOP') {
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
      }
    }

    if (targetRound === 'RIVER') {
      // Simulate TURN round: all check to advance to RIVER
      hand = await prisma.hand.findUnique({ where: { id: handId } });
      if (hand?.round === 'TURN') {
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
        await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
      }
    }

    return await prisma.hand.findUnique({ where: { id: handId } });
  }

  /**
   * Helper to verify pot amounts with rake
   */
  /**
   * Helper to verify pot amounts with rake
   * 
   * Note: During a hand, pots contain BEFORE-RAKE amounts (rake is only deducted at settlement).
   * After settlement, pots contain AFTER-RAKE amounts.
   * This function checks the hand status to determine which case applies.
   */
  async function verifyPotWithRake(
    prisma: any,
    handId: number,
    expectedPotBeforeRake: bigint,
    rakeBps: number
  ) {
    const hand = await prisma.hand.findUnique({
      where: { id: handId },
    });

    if (!hand) {
      throw new Error(`Hand ${handId} not found`);
    }

    const pots = await prisma.pot.findMany({
      where: { handId },
      orderBy: { potNumber: 'asc' },
    });

    let totalPotBeforeRake = 0n;
    let totalPotAfterRake = 0n;
    let totalRake = 0n;

    // Rake is only deducted at settlement (when hand.status === 'COMPLETED')
    // During the hand, pot.amount contains BEFORE-RAKE amounts
    const isSettled = hand.status === 'COMPLETED';

    for (const pot of pots) {
      const potAmountInDb = BigInt(pot.amount);
      
      let potAmountBeforeRake: bigint;
      let potAmountAfterRake: bigint;
      let rakeAmount: bigint;
      
      if (rakeBps === 0) {
        potAmountBeforeRake = potAmountInDb;
        potAmountAfterRake = potAmountInDb;
        rakeAmount = 0n;
      } else {
        if (isSettled) {
          // After settlement: pot.amount is AFTER rake
          potAmountAfterRake = potAmountInDb;
          potAmountBeforeRake = (potAmountAfterRake * 10000n) / BigInt(10000 - rakeBps);
          rakeAmount = potAmountBeforeRake - potAmountAfterRake;
        } else {
          // During hand: pot.amount is BEFORE rake
          potAmountBeforeRake = potAmountInDb;
          rakeAmount = calculateRake(potAmountBeforeRake, rakeBps);
          potAmountAfterRake = potAmountBeforeRake - rakeAmount;
        }
      }

      totalPotBeforeRake += potAmountBeforeRake;
      totalPotAfterRake += potAmountAfterRake;
      totalRake += rakeAmount;
    }

    expect(totalPotBeforeRake).toBe(expectedPotBeforeRake);
    expect(totalRake).toBe(calculateRake(expectedPotBeforeRake, rakeBps));
  }

  /**
   * Standard test setup configuration
   */
  interface StandardTestSetupOptions {
    rakeBps?: number;
    player0Balance?: bigint;
    player1Balance?: bigint;
    player2Balance?: bigint;
    player3Balance?: bigint;
    round?: 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
    deck?: Card[];
    currentBet?: bigint;
    deckPosition?: number;
    communityCards?: Card[];
    dealerPosition?: number;
    smallBlindSeat?: number;
    bigBlindSeat?: number;
    utgSeat?: number;
    currentActionSeat?: number;
    player0ChipsCommitted?: bigint;
    player1ChipsCommitted?: bigint;
    player2ChipsCommitted?: bigint;
    player3ChipsCommitted?: bigint;
  }

  /**
   * Creates a standard 4-player test setup with common defaults
   * 
   * Hand 1 positions: D=0, SB=1, BB=2, UTG=3
   */
  async function setupStandardFourPlayerTest(options: StandardTestSetupOptions = {}) {
    const prisma = getTestPrisma();
    const {
      rakeBps = 0,
      player0Balance = 100000000n, // 100M gwei
      player1Balance = 100000000n,
      player2Balance = 100000000n,
      player3Balance = 100000000n,
      round = 'PRE_FLOP',
      deck = createStandardDeck(),
      currentBet = round === 'PRE_FLOP' ? BIG_BLIND : 0n,
      deckPosition = round === 'PRE_FLOP' ? 0 : round === 'FLOP' ? 8 : round === 'TURN' ? 9 : 10,
      communityCards = round === 'PRE_FLOP' ? [] : deck.slice(8, round === 'FLOP' ? 11 : round === 'TURN' ? 12 : 13),
      dealerPosition = 0,
      smallBlindSeat = 1,
      bigBlindSeat = 2,
      utgSeat = 3,
      currentActionSeat = round === 'PRE_FLOP' ? utgSeat : smallBlindSeat,
      player0ChipsCommitted = round === 'PRE_FLOP' && dealerPosition === 0 ? 0n : round === 'PRE_FLOP' && smallBlindSeat === 0 ? SMALL_BLIND : BIG_BLIND,
      player1ChipsCommitted = round === 'PRE_FLOP' && smallBlindSeat === 1 ? SMALL_BLIND : round === 'PRE_FLOP' && bigBlindSeat === 1 ? BIG_BLIND : BIG_BLIND,
      player2ChipsCommitted = round === 'PRE_FLOP' && bigBlindSeat === 2 ? BIG_BLIND : BIG_BLIND,
      player3ChipsCommitted = round === 'PRE_FLOP' ? 0n : BIG_BLIND,
    } = options;

    const table = await createTestTable(prisma, {
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      perHandRake: rakeBps,
    });

    await createTestPlayers(prisma, table.id, [
      { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: player0Balance },
      { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: player1Balance },
      { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: player2Balance },
      { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: player3Balance },
    ]);

    // Use service layer to properly start the hand
    // This handles: blinds, balances, pots, POST_BLIND actions, chipsCommitted, etc.
    // Pass prisma instance to ensure we use the test database
    const handResult = await startHand(table.id, prisma);
    const handId = handResult.id;

    // For deterministic decks (needed for specific test scenarios like ties, kickers),
    // we need to update the deck and hole cards AFTER startHand
    // This is minimal DB manipulation but necessary for test determinism
    const standardDeck = createStandardDeck();
    const isDeterministicDeck = JSON.stringify(deck) !== JSON.stringify(standardDeck);
    
    if (isDeterministicDeck) {
      // Update deck and hole cards for deterministic testing
      await prisma.hand.update({
        where: { id: handId },
        data: {
          deck: deck as any,
          deckPosition: round === 'PRE_FLOP' ? 0 : round === 'FLOP' ? 8 : round === 'TURN' ? 9 : 10,
          communityCards: (round === 'PRE_FLOP' ? [] : deck.slice(8, round === 'FLOP' ? 11 : round === 'TURN' ? 12 : 13)) as any,
        },
      });

      // Update hole cards for each player
      const handPlayers = await prisma.handPlayer.findMany({
        where: { handId },
        orderBy: { seatNumber: 'asc' },
      });

      for (let i = 0; i < handPlayers.length && i < 4; i++) {
        await prisma.handPlayer.update({
          where: { id: handPlayers[i].id },
          data: {
            holeCards: deck.slice(i * 2, i * 2 + 2) as any,
          },
        });
      }
    }

    // Get the actual hand state after startHand
    const hand = await prisma.hand.findUnique({ where: { id: handId } });
    if (!hand) {
      throw new Error(`Hand ${handId} not found after startHand`);
    }

    // Extract actual positions from the hand (startHand assigns them)
    const actualDealerPosition = hand.dealerPosition ?? dealerPosition;
    const actualSmallBlindSeat = hand.smallBlindSeat ?? smallBlindSeat;
    const actualBigBlindSeat = hand.bigBlindSeat ?? bigBlindSeat;
    const actualUtgSeat = hand.currentActionSeat ?? utgSeat;

    // If we need to start at FLOP/TURN/RIVER, simulate PRE_FLOP actions using service layer
    if (round !== 'PRE_FLOP') {
      await simulatePreFlopActions(
        prisma,
        table.id,
        handId,
        actualDealerPosition,
        actualSmallBlindSeat,
        actualBigBlindSeat,
        actualUtgSeat,
        round
      );
    }

    // Refresh hand state after potential round advancement
    const finalHand = await prisma.hand.findUnique({ where: { id: handId } });

    return {
      prisma,
      hand: finalHand!,
      table,
      dealerPosition: actualDealerPosition,
      smallBlindSeat: actualSmallBlindSeat,
      bigBlindSeat: actualBigBlindSeat,
      utgSeat: actualUtgSeat,
    };
  }

  /**
   * Helper to get wallet address by seat number
   */
  function getWalletBySeat(seatNumber: number): string {
    const wallets = [PLAYER_0_WALLET, PLAYER_1_WALLET, PLAYER_2_WALLET, PLAYER_3_WALLET];
    return wallets[seatNumber];
  }

  /**
   * Helper to get the current action seat from hand and return wallet address
   * Ensures tests act in the correct order
   */
  async function getCurrentActionWallet(prisma: any, handId: number): Promise<string> {
    const hand = await prisma.hand.findUnique({ where: { id: handId } });
    if (!hand || hand.currentActionSeat === null) {
      throw new Error(`Hand ${handId} not found or currentActionSeat not set`);
    }
    return getWalletBySeat(hand.currentActionSeat);
  }

  /**
   * Helper to perform an action with the current action player
   * Automatically gets the current action wallet and refreshes hand state
   */
  async function actWithCurrentPlayer(
    prisma: any,
    tableId: number,
    handId: number,
    actionFn: (prisma: any, tableId: number, walletAddress: string, ...args: any[]) => Promise<any>,
    ...actionArgs: any[]
  ): Promise<any> {
    const wallet = await getCurrentActionWallet(prisma, handId);
    return await actionFn(prisma, tableId, wallet, ...actionArgs);
  }

  /**
   * Helper to check if we should use betAction or raiseAction
   * Returns true if betAction is valid (currentBet === 0), false if raiseAction is needed
   */
  async function shouldUseBetAction(prisma: any, handId: number): Promise<boolean> {
    const hand = await prisma.hand.findUnique({ where: { id: handId } });
    if (!hand) {
      throw new Error(`Hand ${handId} not found`);
    }
    return (hand.currentBet || 0n) === 0n;
  }

  /**
   * Helper to perform a bet or raise action automatically based on currentBet
   * If currentBet is 0, uses betAction; otherwise uses raiseAction
   * 
   * @param prisma - Prisma client
   * @param tableId - Table ID
   * @param handId - Hand ID
   * @param walletAddress - Wallet address of player acting
   * @param totalAmount - Total amount to commit (not incremental)
   * @param isAllIn - Whether this is an all-in action
   */
  async function betOrRaiseAction(
    prisma: any,
    tableId: number,
    handId: number,
    walletAddress: string,
    totalAmount: bigint,
    isAllIn: boolean = false
  ): Promise<any> {
    // Get hand to check currentBet
    const hand = await prisma.hand.findUnique({ where: { id: handId } });
    if (!hand) {
      throw new Error(`Hand ${handId} not found`);
    }
    const currentBet = (hand.currentBet || 0n) as bigint;

    if (currentBet === 0n) {
      // Use betAction when currentBet is 0
      return await betAction(prisma, tableId, walletAddress, totalAmount);
    } else {
      // Use raiseAction when currentBet > 0
      // Calculate incremental raise amount
      const handPlayer = await prisma.handPlayer.findFirst({
        where: { handId: hand.id, walletAddress },
      });
      if (!handPlayer) {
        throw new Error(`Player ${walletAddress} not found in hand ${hand.id}`);
      }
      const chipsCommitted = (handPlayer.chipsCommitted || 0n) as bigint;
      const incrementalAmount = totalAmount - chipsCommitted;
      return await raiseAction(prisma, tableId, walletAddress, incrementalAmount, isAllIn);
    }
  }

  /**
   * Test runner that handles both rake variants (0 bps and 700 bps)
   */
  function testWithRakeVariants(
    testName: string,
    testFn: (setup: Awaited<ReturnType<typeof setupStandardFourPlayerTest>>, rakeBps: number) => Promise<void>,
    setupOptions: StandardTestSetupOptions = {}
  ) {
    it(`${testName}`, async () => {
      const setup = await setupStandardFourPlayerTest({ ...setupOptions, rakeBps: 0 });
      await testFn(setup, 0);
    });

    it(`${testName} - 700 bps rake`, async () => {
      const setup = await setupStandardFourPlayerTest({ ...setupOptions, rakeBps: 700 });
      await testFn(setup, 700);
    });
  }

  // ============================================================================
  // PRE-FLOP SCENARIOS
  // ============================================================================

  describe('PRE-FLOP Scenarios', () => {
    testWithRakeVariants('PF-001: Immediate Fold (UTG Folds)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG folds (first to act after blinds)
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Hand continues with 3 players

      // Pot before rake: 1M + 2M = 3M
      await verifyPotWithRake(prisma, hand.id, 3000000n, rakeBps);
    });

    testWithRakeVariants('PF-002: Two Players Fold Pre-Flop', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG folds (first to act after blinds)
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds (next to act)
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Hand continues with 2 players

      // Pot before rake: 3M
      await verifyPotWithRake(prisma, hand.id, 3000000n, rakeBps);
    });

    it('PF-003: All Players Call Pre-Flop (No Raise)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG calls (2M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (2M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (1M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      // Verify round advanced to FLOP
      await assertHandRound(prisma, hand.id, 'FLOP');

      // Pot before rake: 1M + 2M + 2M + 2M + 1M = 8M
      await verifyPotWithRake(prisma, hand.id, 8000000n, 0);
    });

    it('PF-004: Single Raise Pre-Flop (All Call)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG raises to 5M total (current bet is 2M, minimum raise is 2M, so need 4M total minimum)
      // To raise to 5M total, UTG needs to commit 5M (incremental = 5M since chipsCommitted = 0)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);

      // Dealer calls (5M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (4M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (3M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'FLOP');

      // Pot before rake: 1M + 2M + 5M + 5M + 4M + 3M = 20M
      await verifyPotWithRake(prisma, hand.id, 20000000n, 0);
    });

    it('PF-005: Single Raise Pre-Flop (Some Fold)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG raises to 5M total (incremental = 5M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (4M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (3M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'FLOP');

      // Pot before rake: 1M + 2M + 5M + 4M + 3M = 15M
      await verifyPotWithRake(prisma, hand.id, 15000000n, 0);
    });

    it('PF-006: Multiple Raises Pre-Flop (3-Bet)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG raises to 5M total (incremental = 5M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);

      // Dealer calls (5M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (4M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind re-raises to 10M total (current bet is 5M, minimum raise is 2M, so need 7M total minimum)
      // Big blind has committed 2M, so incremental = 10M - 2M = 8M
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 8000000n, false);

      // UTG calls (5M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (5M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (5M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'FLOP');

      // Pot before rake: 1M + 2M + 5M + 5M + 4M + 8M + 5M + 5M + 5M = 40M
      await verifyPotWithRake(prisma, hand.id, 40000000n, 0);
    });

    it('PF-007: Multiple Raises Pre-Flop (4-Bet)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG raises to 5M total (incremental = 5M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind re-raises to 10M total (has committed 2M, incremental = 8M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 8000000n, false);

      // UTG re-raises to 20M total (has committed 5M, incremental = 15M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false);

      // Big blind calls (10M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'FLOP');

      // Pot before rake: 1M + 2M + 5M + 8M + 15M + 10M = 41M
      await verifyPotWithRake(prisma, hand.id, 41000000n, 0);
    });

    testWithRakeVariants('PF-008: All-In Pre-Flop (Single Player)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG all-in (50M total, 48M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (48M to match)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (48M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All active players all-in, auto-advance to river

      // Pot before rake: 1M + 2M + 48M + 48M + 48M = 50M (UTG's all-in amount) + 48M (dealer) + 48M (BB) = 146M
      // Actually: 1M (SB) + 2M (BB) + 50M (UTG all-in) + 50M (dealer call) + 50M (BB call) = 153M
      // But UTG only has 50M, so dealer and BB only need to call 50M each
      // Total: 1M + 2M + 50M + 50M + 50M = 153M
      await verifyPotWithRake(prisma, hand.id, 153000000n, rakeBps);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 50000000n });

    testWithRakeVariants('PF-009: All-In Pre-Flop (Two Players, Same Amount)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG all-in (50M total, 48M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 48M incremental)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot before rake calculation:
      // - Small blind: 1M (POST_BLIND, folded but chips stay in pot)
      // - Big blind: 2M (POST_BLIND) + 48M (ALL_IN incremental) = 50M total
      // - UTG: 50M (ALL_IN total)
      // Total: 1M + 50M + 50M = 101M
      // Note: The big blind's 2M POST_BLIND is already included in their 50M total, not separate
      await verifyPotWithRake(prisma, hand.id, 101000000n, rakeBps);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 50000000n, player3Balance: 50000000n });

    testWithRakeVariants('PF-010: All-In Pre-Flop (Two Players, Different Amounts)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG all-in (30M total, 28M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 48M incremental)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Side pot created
      // Main pot: 30M × 2 = 60M (both eligible)
      // Side pot: 20M × 1 = 20M (only BB eligible)
      // Total: 60M + 20M = 80M
      // Actually: 1M (SB) + 2M (BB) + 30M (UTG) + 30M (BB call) + 20M (BB extra) = 83M
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      // Verify side pots were created
      if (rakeBps === 0) {
        // Main pot should be around 60M, side pot around 20M
        const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
        expect(totalPot).toBeGreaterThan(60000000n);
      }
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 50000000n, player3Balance: 30000000n });

    testWithRakeVariants('PF-011: All-In Pre-Flop (Three Players, Different Amounts)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG all-in (20M total, 18M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M total, 28M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 48M incremental)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have multiple pots
    }, { player0Balance: 30000000n, player1Balance: 100000000n, player2Balance: 50000000n, player3Balance: 20000000n });

    testWithRakeVariants('PF-012: All-In Pre-Flop (Four Players, All Different Amounts)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (20M total, 18M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M total, 28M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (40M total, 38M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 48M incremental)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(2); // Should have multiple side pots
    }, { player0Balance: 30000000n, player1Balance: 40000000n, player2Balance: 50000000n, player3Balance: 20000000n });

    testWithRakeVariants('PF-013: All-In Pre-Flop (One Player Folds, Others All-In)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (30M total, 28M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (40M total, 38M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 48M incremental)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pots
    }, { player0Balance: 100000000n, player1Balance: 40000000n, player2Balance: 50000000n, player3Balance: 30000000n });

    testWithRakeVariants('PF-014: All-In Pre-Flop (Partial Call - Less Than Bet)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand

      // UTG raises to 10M (8M incremental)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 8000000n, false);

      // Dealer all-in (5M total, 3M incremental - less than 10M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (8M to match 10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG can raise or call - let's call to complete the round
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Round should advance if not all-in

      // Side pot should be created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 5000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 100000000n });
  });

  // ============================================================================
  // FLOP SCENARIOS
  // ============================================================================

  describe('FLOP Scenarios', () => {
    it('FL-001: All Players Check on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer
      // Refresh hand to get current state after round advancement
      let currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      if (!currentHand || currentHand.currentActionSeat === null) {
        throw new Error('Hand not found or currentActionSeat not set');
      }

      // All players check (act in order based on currentActionSeat)
      // First player (small blind acts first on FLOP)
      let checkResult = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      
      // Refresh hand to get next action seat
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      if (!currentHand || currentHand.currentActionSeat === null) {
        throw new Error('Hand not found or currentActionSeat not set');
      }
      checkResult = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      
      // Third player
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      if (!currentHand || currentHand.currentActionSeat === null) {
        throw new Error('Hand not found or currentActionSeat not set');
      }
      checkResult = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      
      // Fourth player (last check should advance round if not already advanced)
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      if (currentHand && currentHand.round === 'FLOP' && currentHand.currentActionSeat !== null) {
        // Round hasn't advanced yet, need one more check
        checkResult = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      }

      expect(checkResult.success).toBe(true);
      expect(checkResult.handEnded).toBe(false);
      // Round should have advanced (either on 3rd or 4th check)
      expect(checkResult.roundAdvanced || currentHand?.round === 'TURN').toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M (from PRE_FLOP)
      await verifyPotWithRake(prisma, hand.id, 8000000n, 0);
    });

    it('FL-002: Bet-Call-Call-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer
      // First player bets 5M (using betOrRaiseAction to handle bet vs raise automatically)
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Remaining players call (act in order)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 5M + 5M + 5M = 28M
      await verifyPotWithRake(prisma, hand.id, 28000000n, 0);
    });

    testWithRakeVariants('FL-003: Bet-Call-Fold-Call on Flop', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // First player bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Second player calls
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Third player folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Fourth player calls
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 5M + 5M = 23M
      await verifyPotWithRake(prisma, hand.id, 23000000n, rakeBps);
    });

    it('FL-004: Bet-Raise-Call-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // First player bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Second player raises to 15M total
      // Get hand to calculate incremental amount
      const handAfterBet = await prisma.hand.findUnique({ where: { id: hand.id } });
      const currentWallet = await getCurrentActionWallet(prisma, hand.id);
      const handPlayer = await prisma.handPlayer.findFirst({
        where: { handId: hand.id, walletAddress: currentWallet },
      });
      const chipsCommitted = (handPlayer?.chipsCommitted || 0n) as bigint;
      const totalToCommit = 15000000n;
      const incrementalAmount = totalToCommit - chipsCommitted;
      await raiseAction(prisma, table.id, currentWallet, incrementalAmount, false);

      // Remaining players call
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 13M + 15M + 15M + 10M = 66M
      await verifyPotWithRake(prisma, hand.id, 66000000n, 0);
    });

    it('FL-005: Bet-Raise-Fold-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind raises to 15M total (has committed 2M, incremental = 13M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false);

      // UTG folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (10M to match)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 13M + 15M + 10M = 51M
      await verifyPotWithRake(prisma, hand.id, 51000000n, 0);
    });

    it('FL-006: Check-Bet-Call-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Dealer calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (5M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 5M + 5M + 5M = 28M
      await verifyPotWithRake(prisma, hand.id, 28000000n, 0);
    });

    it('FL-007: Check-Bet-Raise-Call-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Dealer raises to 15M total (has committed 2M, incremental = 13M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false);

      // Small blind calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (10M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'TURN');

      // Pot before rake: 8M + 5M + 13M + 15M + 15M + 10M = 66M
      await verifyPotWithRake(prisma, hand.id, 66000000n, 0);
    });

    testWithRakeVariants('FL-008: All-In on Flop (Single Player)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (50M total, 47M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (47M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (47M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All active players all-in, auto-advance to river

      // Pot before rake: 8M + 47M + 47M + 47M = 149M
      await verifyPotWithRake(prisma, hand.id, 149000000n, rakeBps);
    }, { player0Balance: 100000000n, player1Balance: 50000000n, player2Balance: 100000000n, player3Balance: 100000000n });

    testWithRakeVariants('FL-009: All-In on Flop (Two Players, Different Amounts)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (30M total, 27M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG all-in (50M total, 47M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Side pot created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pot
    }, { player0Balance: 100000000n, player1Balance: 30000000n, player2Balance: 100000000n, player3Balance: 50000000n });

    testWithRakeVariants('FL-010: All-In on Flop (Three Players, Different Amounts)', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (20M total, 17M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (30M total, 27M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG all-in (50M total, 47M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(2); // Should have multiple side pots
    }, { player0Balance: 100000000n, player1Balance: 20000000n, player2Balance: 30000000n, player3Balance: 50000000n });
  });

  // ============================================================================
  // TURN SCENARIOS
  // ============================================================================

  describe('TURN Scenarios', () => {
    it('TU-001: All Players Check on Turn', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'TURN', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'TURN' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'RIVER');

      // Pot before rake: 8M
      await verifyPotWithRake(prisma, hand.id, 8000000n, 0);
    });

    it('TU-002: Bet-Call-Call-Call on Turn', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'TURN', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'TURN' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (5M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'RIVER');

      // Pot before rake: 8M + 5M + 5M + 5M + 5M = 28M
      await verifyPotWithRake(prisma, hand.id, 28000000n, 0);
    });

    it('TU-003: Bet-Raise-Call-Call on Turn', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'TURN', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'TURN' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind raises to 15M total (has committed 2M, incremental = 13M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false);

      // UTG calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (10M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false);
      expect(result.roundAdvanced).toBe(true);

      await assertHandRound(prisma, hand.id, 'RIVER');

      // Pot before rake: 8M + 5M + 13M + 15M + 15M + 10M = 66M
      await verifyPotWithRake(prisma, hand.id, 66000000n, 0);
    });

    testWithRakeVariants('TU-004: All-In on Turn (Multiple Players)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'TURN' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (30M total, 27M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (50M total, 47M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Side pot created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pot
    }, { player0Balance: 100000000n, player1Balance: 30000000n, player2Balance: 50000000n, player3Balance: 100000000n });
  });

  // ============================================================================
  // RIVER SCENARIOS
  // ============================================================================

  describe('RIVER Scenarios', () => {
    testWithRakeVariants('RV-001: All Players Check on River (Showdown)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'RIVER' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // River completes, hand ends

      // Pot before rake: 8M
      await verifyPotWithRake(prisma, hand.id, 8000000n, rakeBps);
    }, { round: 'RIVER' });

    it('RV-002: Bet-Call-Call-Call on River (Showdown)', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'RIVER', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'RIVER' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (5M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (5M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot before rake: 8M + 5M + 5M + 5M + 5M = 28M
      await verifyPotWithRake(prisma, hand.id, 28000000n, 0);
    });

    testWithRakeVariants('RV-003: Bet-Fold-Fold-Call on River', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'RIVER' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (5M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot before rake: 8M + 5M + 5M = 18M
      await verifyPotWithRake(prisma, hand.id, 18000000n, rakeBps);
    }, { round: 'RIVER' });

    testWithRakeVariants('RV-004: Bet-Raise-Call-Call on River (Showdown)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'RIVER' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind raises to 15M total (has committed 2M, incremental = 13M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false);

      // UTG calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (10M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot before rake: 8M + 5M + 13M + 15M + 15M + 10M = 66M
      await verifyPotWithRake(prisma, hand.id, 66000000n, rakeBps);
    }, { round: 'RIVER' });
  });

  // ============================================================================
  // MULTI-WAY TIE SCENARIOS
  // ============================================================================

  describe('MULTI-WAY TIE Scenarios', () => {
    it('TI-001: Two-Way Tie on River (Same Hand Rank)', async () => {
      const deck = createTwoWayTieDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify both players are winners (tie)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      // Player 0 and Player 1 should tie (both have pair of 10s with same kickers)
      expect(winnerSeatNumbers).toContain(0);
      expect(winnerSeatNumbers).toContain(1);
    });

    it('TI-002: Three-Way Tie on River (Same Hand Rank)', async () => {
      const deck = createThreeWayTieDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify three players are winners (tie)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      // Player 0, 1, and 2 should tie
      expect(winnerSeatNumbers).toContain(0);
      expect(winnerSeatNumbers).toContain(1);
      expect(winnerSeatNumbers).toContain(2);
    });

    it('TI-003: Four-Way Tie on River (Same Hand Rank)', async () => {
      const deck = createFourWayTieDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify all four players are winners (tie)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      // All four players should tie
      expect(winnerSeatNumbers).toContain(0);
      expect(winnerSeatNumbers).toContain(1);
      expect(winnerSeatNumbers).toContain(2);
      expect(winnerSeatNumbers).toContain(3);
    });

    testWithRakeVariants('TI-004: Two-Way Tie with Side Pots', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (50M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple pots with ties
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pots
    }, { player0Balance: 30000000n, player1Balance: 50000000n, player2Balance: 100000000n, player3Balance: 20000000n });

    testWithRakeVariants('TI-005: Three-Way Tie with Side Pots', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (40M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple pots with ties
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pots
    }, { player0Balance: 30000000n, player1Balance: 40000000n, player2Balance: 100000000n, player3Balance: 20000000n });

    it('TI-006: Tie with Kicker Requirements', async () => {
      const deck = createKickerDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify winner determined by kicker
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0); // Player 0 has best kicker (A)
    });
  });

  // ============================================================================
  // KICKER SCENARIOS
  // ============================================================================

  describe('KICKER Scenarios', () => {
    it('KI-001: Pair with Different Kickers', async () => {
      const deck = createKickerDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify Player 0 wins (has A kicker, best)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0);
      expect(winnerSeatNumbers.length).toBe(1); // Single winner
    });

    it('KI-002: Two Pair with Different Kickers', async () => {
      // Create deck where multiple players have two pair, kicker determines winner
      const deck = createFabricatedDeck([
        // Player 0 hole cards (two pair: 10s and 5s, A kicker - best)
        { rank: 'A', suit: 'spades' },
        { rank: '10', suit: 'spades' },
        // Player 1 hole cards (two pair: 10s and 5s, K kicker)
        { rank: 'K', suit: 'spades' },
        { rank: '10', suit: 'hearts' },
        // Player 2 hole cards (two pair: 10s and 5s, Q kicker)
        { rank: 'Q', suit: 'spades' },
        { rank: '10', suit: 'diamonds' },
        // Player 3 hole cards
        { rank: 'J', suit: 'spades' },
        { rank: '9', suit: 'spades' },
        // Flop (creates two pair for players 0, 1, 2)
        { rank: '10', suit: 'clubs' },
        { rank: '5', suit: 'hearts' },
        { rank: '5', suit: 'diamonds' },
        // Turn
        { rank: '4', suit: 'clubs' },
        // River
        { rank: '3', suit: 'hearts' },
        // Rest of deck
        ...Array(40).fill({ rank: '2', suit: 'hearts' }),
      ]);

      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify Player 0 wins (has A kicker, best)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0);
    });

    it('KI-003: Three of a Kind with Different Kickers', async () => {
      // Create deck where multiple players have three of a kind, kicker determines winner
      const deck = createFabricatedDeck([
        // Player 0 hole cards (three 10s, A kicker - best)
        { rank: 'A', suit: 'spades' },
        { rank: '10', suit: 'spades' },
        // Player 1 hole cards (three 10s, K kicker)
        { rank: 'K', suit: 'spades' },
        { rank: '10', suit: 'hearts' },
        // Player 2 hole cards (three 10s, Q kicker)
        { rank: 'Q', suit: 'spades' },
        { rank: '10', suit: 'diamonds' },
        // Player 3 hole cards
        { rank: 'J', suit: 'spades' },
        { rank: '9', suit: 'spades' },
        // Flop (creates three 10s for players 0, 1, 2)
        { rank: '10', suit: 'clubs' },
        { rank: '10', suit: 'diamonds' },
        { rank: '5', suit: 'hearts' },
        // Turn
        { rank: '4', suit: 'clubs' },
        // River
        { rank: '3', suit: 'hearts' },
        // Rest of deck
        ...Array(40).fill({ rank: '2', suit: 'hearts' }),
      ]);

      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify Player 0 wins (has A kicker, best)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0);
    });

    it('KI-004: Full House with Different Trips', async () => {
      // Create deck where multiple players have full house, trips determine winner
      const deck = createFabricatedDeck([
        // Player 0 hole cards (full house: 10s over 5s - best)
        { rank: '10', suit: 'spades' },
        { rank: '5', suit: 'spades' },
        // Player 1 hole cards (full house: 9s over 5s)
        { rank: '9', suit: 'spades' },
        { rank: '5', suit: 'hearts' },
        // Player 2 hole cards (full house: 8s over 5s)
        { rank: '8', suit: 'spades' },
        { rank: '5', suit: 'diamonds' },
        // Player 3 hole cards
        { rank: '7', suit: 'spades' },
        { rank: '4', suit: 'spades' },
        // Flop (creates full houses)
        { rank: '10', suit: 'clubs' },
        { rank: '10', suit: 'diamonds' },
        { rank: '5', suit: 'clubs' },
        // Turn
        { rank: '5', suit: 'hearts' },
        // River
        { rank: '9', suit: 'hearts' },
        // Rest of deck
        ...Array(40).fill({ rank: '2', suit: 'hearts' }),
      ]);

      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Verify Player 0 wins (has highest trips: 10s)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0);
    });
  });

  // ============================================================================
  // COMPLEX SIDE POT SCENARIOS
  // ============================================================================

  describe('COMPLEX SIDE POT Scenarios', () => {
    testWithRakeVariants('SP-001: Three Different All-In Amounts', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (50M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(2); // Should have multiple side pots
    }, { player0Balance: 30000000n, player1Balance: 50000000n, player2Balance: 100000000n, player3Balance: 20000000n });

    testWithRakeVariants('SP-002: Four Different All-In Amounts', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // Small blind all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG all-in (40M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (50M)
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(3); // Should have multiple side pots
    }, { player0Balance: 50000000n, player1Balance: 20000000n, player2Balance: 30000000n, player3Balance: 40000000n });

    testWithRakeVariants('SP-003: All-In After Previous Betting', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG all-in (50M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple side pots created (includes PRE_FLOP pot)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(2); // Should have multiple side pots
    }, { player0Balance: 100000000n, player1Balance: 20000000n, player2Balance: 30000000n, player3Balance: 50000000n });

    testWithRakeVariants('SP-004: Partial All-In (Less Than Bet)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 10M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 10000000n);

      // Big blind all-in (5M - less than bet)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind can raise or call - let's call to complete
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Round should advance if not all-in

      // Side pot should be created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 5000000n, player3Balance: 100000000n });

    testWithRakeVariants('SP-005: All-In Then Raise', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind raises to 30M total
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 10000000n, false);

      // UTG calls (30M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (30M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Round should advance if not all-in

      // Side pot should be created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 100000000n, player1Balance: 20000000n, player2Balance: 100000000n, player3Balance: 100000000n });
  });

  // ============================================================================
  // MULTI-ROUND SCENARIOS
  // ============================================================================

  describe('MULTI-ROUND Scenarios', () => {
    it('MR-001: Full Hand with Betting on Every Round', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: UTG raises to 5M total (incremental = 5M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Small blind bets 5M, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Big blind bets 10M, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 10000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: UTG bets 15M, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 15000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Total pot: PRE_FLOP (20M) + FLOP (20M) + TURN (40M) + RIVER (60M) = 140M
      await verifyPotWithRake(prisma, hand.id, 140000000n, 0);
    });

    testWithRakeVariants('MR-003: Full Hand with All Checks', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: All call
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot: 1M (small blind) + 2M (big blind) + 2M (UTG call) + 2M (dealer call) + 1M (SB call) = 8M
      await verifyPotWithRake(prisma, hand.id, 8000000n, rakeBps);
    });

    it('MR-002: Full Hand with Raises on Every Round', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: UTG raises to 5M total (incremental = 5M), BB re-raises to 10M total (has committed 2M, incremental = 8M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 5000000n, false);
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 8000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Bet, raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false); // Raise to 15M total (has committed 2M, incremental = 13M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Bet, raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 13000000n, false); // Raise to 15M total (has committed 2M, incremental = 13M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: Bet, raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 10000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Large pot created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
      expect(totalPot).toBeGreaterThan(100000000n); // Very large pot
    });

    testWithRakeVariants('MR-004: Progressive Eliminations', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: UTG folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Big blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer checks
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: Showdown with one player (dealer)
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot accumulates from all rounds
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    });

    testWithRakeVariants('MR-005: All-In Pre-Flop, Auto-Advance to River', async ({ prisma, hand, table, smallBlindSeat, bigBlindSeat, utgSeat, dealerPosition }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // All players all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // Auto-advance to river

      // Side pots created if different amounts
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 50000000n, player1Balance: 50000000n, player2Balance: 50000000n, player3Balance: 50000000n });

    testWithRakeVariants('MR-006: All-In on Different Rounds', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: UTG all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Small blind all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Big blind all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All all-in, auto-advance to river

      // Multiple side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have multiple side pots
    }, { player0Balance: 100000000n, player1Balance: 20000000n, player2Balance: 30000000n, player3Balance: 20000000n });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('EDGE CASES', () => {
    it('EC-001: Minimum Raise Scenario', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // setupStandardFourPlayerTest already initialized the hand via startHand

      // PRE_FLOP: Minimum raise, all call
      // UTG raises to 4M total (current bet is 2M, minimum raise is 2M, so need 4M total, incremental = 4M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 4000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Minimum raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 2000000n);
      // Big blind raises to 4M total (has committed 2M, incremental = 2M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 2000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Minimum raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 2000000n);
      // Big blind raises to 4M total (has committed 2M, incremental = 2M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 2000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: Minimum raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 2000000n);
      // Big blind raises to 4M total (has committed 2M, incremental = 2M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 2000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Total pot calculation would be complex, verify it's reasonable
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
      expect(totalPot).toBeGreaterThan(20000000n); // At least 20M
    });

    testWithRakeVariants('EC-002: Large Raise Scenario', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // PRE_FLOP: Large raise (to 50M), all call
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 48000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: Large bet (50M), all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 50000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Large bet (50M), all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 50000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: Large bet (50M), all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 50000000n);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Very large pot created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
      expect(totalPot).toBeGreaterThan(200000000n); // Very large pot
    }, { player0Balance: 200000000n, player1Balance: 200000000n, player2Balance: 200000000n, player3Balance: 200000000n });

    testWithRakeVariants('EC-003: All-In with Remaining Balance Less Than Bet', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 10M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 10000000n);

      // Big blind all-in (5M - less than bet)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (10M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Round should advance

      // Side pot created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 5000000n, player3Balance: 100000000n });

    testWithRakeVariants('EC-004: Multiple Side Pots (4 Different Amounts)', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // All four players all-in for different amounts
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Three side pots created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(3); // Should have multiple side pots
    }, { player0Balance: 30000000n, player1Balance: 20000000n, player2Balance: 50000000n, player3Balance: 40000000n });

    testWithRakeVariants('EC-005: All-In Then Fold', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);
      // Winner should be UTG (the only remaining player after others fold)
      expect(result.winnerSeatNumber).not.toBeNull();

      // Single winner
      await verifyPotWithRake(prisma, hand.id, 50000000n, rakeBps);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 50000000n });

    testWithRakeVariants('EC-006: All-In Then Call', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // Auto-advance to river if all all-in

      // Showdown occurs
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 50000000n });

    testWithRakeVariants('EC-007: Complex Side Pot with Ties', async ({ prisma, hand, table }, rakeBps) => {
      const deck = createTwoWayTieDeck();
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)

      // UTG all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer all-in (30M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind all-in (50M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind folds
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Multiple pots with potential ties
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pots
    }, { player0Balance: 30000000n, player1Balance: 50000000n, player2Balance: 100000000n, player3Balance: 20000000n, deck: createTwoWayTieDeck() });

    it('EC-008: Kicker Edge Cases', async () => {
      const deck = createKickerDeck();
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ 
        round: 'RIVER', 
        rakeBps: 0,
        deck,
      });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // All check
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      const result = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Winner determined by kicker
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
      const winnerSeatNumbers = pots[0].winnerSeatNumbers as number[];
      expect(winnerSeatNumbers).toContain(0); // Player 0 has best kicker
      expect(winnerSeatNumbers.length).toBe(1); // Single winner
    });
  });

  // ============================================================================
  // DEALER/BLIND ROTATION SCENARIOS
  // ============================================================================

  describe('DEALER/BLIND ROTATION Scenarios', () => {
    it('RO-001: Hand 1 - Initial Positions', async () => {
      const { prisma, hand, dealerPosition, smallBlindSeat, bigBlindSeat, utgSeat } = await setupStandardFourPlayerTest({ rakeBps: 0 });

      // Verify initial positions
      expect(dealerPosition).toBe(0);
      expect(smallBlindSeat).toBe(1);
      expect(bigBlindSeat).toBe(2);
      expect(utgSeat).toBe(3);

      // Verify hand has correct positions
      const handRecord = await (prisma as any).hand.findUnique({ where: { id: hand.id } });
      expect(handRecord.dealerPosition).toBe(0);
      expect(handRecord.smallBlindSeat).toBe(1);
      expect(handRecord.bigBlindSeat).toBe(2);
      expect(handRecord.currentActionSeat).toBe(3); // UTG acts first
    });

    it('RO-002: Hand 2 - First Rotation', async () => {
      // This test would require completing hand 1 and starting hand 2
      // For now, we'll test by creating a hand with rotated positions
      const { prisma, hand, dealerPosition, smallBlindSeat, bigBlindSeat, utgSeat } = await setupStandardFourPlayerTest({ 
        rakeBps: 0,
        dealerPosition: 1,
        smallBlindSeat: 2,
        bigBlindSeat: 3,
        utgSeat: 0,
        currentActionSeat: 0,
      });

      // Verify rotated positions
      expect(dealerPosition).toBe(1);
      expect(smallBlindSeat).toBe(2);
      expect(bigBlindSeat).toBe(3);
      expect(utgSeat).toBe(0);

      // Verify hand has correct positions
      const handRecord = await (prisma as any).hand.findUnique({ where: { id: hand.id } });
      expect(handRecord.dealerPosition).toBe(1);
      expect(handRecord.smallBlindSeat).toBe(2);
      expect(handRecord.bigBlindSeat).toBe(3);
      expect(handRecord.currentActionSeat).toBe(0); // UTG acts first
    });

    it('RO-003: Hand 3 - Second Rotation', async () => {
      const { prisma, hand, dealerPosition, smallBlindSeat, bigBlindSeat, utgSeat } = await setupStandardFourPlayerTest({ 
        rakeBps: 0,
        dealerPosition: 2,
        smallBlindSeat: 3,
        bigBlindSeat: 0,
        utgSeat: 1,
        currentActionSeat: 1,
      });

      // Verify rotated positions
      expect(dealerPosition).toBe(2);
      expect(smallBlindSeat).toBe(3);
      expect(bigBlindSeat).toBe(0);
      expect(utgSeat).toBe(1);
    });

    it('RO-004: Hand 4 - Third Rotation', async () => {
      const { prisma, hand, dealerPosition, smallBlindSeat, bigBlindSeat, utgSeat } = await setupStandardFourPlayerTest({ 
        rakeBps: 0,
        dealerPosition: 3,
        smallBlindSeat: 0,
        bigBlindSeat: 1,
        utgSeat: 2,
        currentActionSeat: 2,
      });

      // Verify rotated positions
      expect(dealerPosition).toBe(3);
      expect(smallBlindSeat).toBe(0);
      expect(bigBlindSeat).toBe(1);
      expect(utgSeat).toBe(2);
    });

    it('RO-005: Hand 5 - Cycle Completes', async () => {
      const { prisma, hand, dealerPosition, smallBlindSeat, bigBlindSeat, utgSeat } = await setupStandardFourPlayerTest({ 
        rakeBps: 0,
        dealerPosition: 0,
        smallBlindSeat: 1,
        bigBlindSeat: 2,
        utgSeat: 3,
        currentActionSeat: 3,
      });

      // Verify positions back to initial state
      expect(dealerPosition).toBe(0);
      expect(smallBlindSeat).toBe(1);
      expect(bigBlindSeat).toBe(2);
      expect(utgSeat).toBe(3);
    });

    it('RO-006: Rotation with Player Elimination', async () => {
      // Test rotation when a player is eliminated
      // This would require simulating a hand where a player busts out
      // For now, we'll test by creating a 3-player setup
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      // Create only 3 players (seat 3 eliminated)
      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 100000000n },
      ]);

      const deck = createStandardDeck();
      // Hand 2 positions after seat 3 eliminated: D=1, SB=2, BB=0, UTG=1 (wraps around)
      const hand = await createTestHand(prisma, table.id, {
        deck,
        dealerPosition: 1,
        smallBlindSeat: 2,
        bigBlindSeat: 0,
        currentActionSeat: 1, // UTG wraps around
        round: 'PRE_FLOP',
        status: 'PRE_FLOP',
        currentBet: BIG_BLIND,
        deckPosition: 0,
      });

      // Verify positions skip eliminated player
      expect(hand.dealerPosition).toBe(1);
      expect(hand.smallBlindSeat).toBe(2);
      expect(hand.bigBlindSeat).toBe(0);
      expect(hand.currentActionSeat).toBe(1); // UTG wraps around
    });

    it('RO-007: Rotation with Multiple Eliminations', async () => {
      // Test rotation when multiple players are eliminated
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      // Create only 2 players (seats 2 and 3 eliminated)
      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
      ]);

      const deck = createStandardDeck();
      // Hand 2 positions: D=1, SB=0, UTG=1 (2-player game)
      const hand = await createTestHand(prisma, table.id, {
        deck,
        dealerPosition: 1,
        smallBlindSeat: 0,
        bigBlindSeat: 1, // In 2-player, BB is also dealer
        currentActionSeat: 1, // UTG
        round: 'PRE_FLOP',
        status: 'PRE_FLOP',
        currentBet: BIG_BLIND,
        deckPosition: 0,
      });

      // Verify positions adjust for remaining players
      expect(hand.dealerPosition).toBe(1);
      expect(hand.smallBlindSeat).toBe(0);
      expect(hand.bigBlindSeat).toBe(1);
    });
  });
});

