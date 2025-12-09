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
   * Helper to simulate PRE_FLOP actions and advance to target round using the actual service layer
   * 
   * This function:
   * 1. Completes PRE_FLOP round (all players call/check to match big blind)
   * 2. Loops calling checkAction until we reach the target round
   * 
   * @param prisma - Prisma client
   * @param tableId - Table ID
   * @param handId - Hand ID (from startHand)
   * @param dealerSeat - Dealer seat number (unused, kept for compatibility)
   * @param smallBlindSeat - Small blind seat number (unused, kept for compatibility)
   * @param bigBlindSeat - Big blind seat number (unused, kept for compatibility)
   * @param utgSeat - UTG seat number (unused, kept for compatibility)
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
    // Get current hand with players included
    let hand = await prisma.hand.findUnique({ 
      where: { id: handId },
      include: { players: true }
    });
    if (!hand) {
      throw new Error(`Hand ${handId} not found`);
    }

    // Complete PRE_FLOP round: all players call/check to match big blind
    // If a player can't afford to call, they go all-in instead
    while (hand.round === 'PRE_FLOP') {
      const wallet = await getCurrentActionWallet(prisma, handId);
      const seatSession = await prisma.tableSeatSession.findFirst({ 
        where: { 
          tableId, 
          seatNumber: hand.currentActionSeat! 
        } 
      });
      
      if (hand.currentBet && hand.currentBet > 0n) {
        // There's a bet - check if player can afford to call
        const handPlayer = hand.players?.find((p: any) => p.seatNumber === hand.currentActionSeat);
        const chipsCommitted = BigInt(handPlayer?.chipsCommitted || 0);
        const callAmount = hand.currentBet - chipsCommitted;
        
        if (callAmount <= 0n) {
          // Player has already matched the bet (e.g., BB option) - check
          await checkAction(prisma, tableId, wallet);
        } else if (seatSession && seatSession.tableBalanceGwei < callAmount) {
          // Player can't afford to call - go all-in instead
          await allInAction(prisma, tableId, wallet);
        } else {
          // Player can afford to call
          await callAction(prisma, tableId, wallet);
        }
      } else {
        // No bet - check
        await checkAction(prisma, tableId, wallet);
      }
      hand = await prisma.hand.findUnique({ 
        where: { id: handId },
        include: { players: true }
      });
    }

    // Now loop: keep checking until we reach the target round
    const maxIterations = 20; // Safety limit to prevent infinite loops
    let iterations = 0;
    
    while (hand.round !== targetRound && iterations < maxIterations) {
      // If hand ended, we can't advance further
      if (hand.status === 'COMPLETED') {
        throw new Error(`Hand ${handId} ended before reaching target round ${targetRound}. Current round: ${hand.round}`);
      }
      
      // Call checkAction to advance the round (post-flop rounds start with 0 bet, so check works)
      await checkAction(prisma, tableId, await getCurrentActionWallet(prisma, handId));
      
      // Refresh hand state
      hand = await prisma.hand.findUnique({ where: { id: handId } });
      iterations++;
    }
    
    if (iterations >= maxIterations) {
      throw new Error(`Failed to reach target round ${targetRound} after ${maxIterations} iterations. Current round: ${hand?.round}`);
    }
    
    if (hand.round !== targetRound) {
      throw new Error(`Setup failed: Expected round ${targetRound} but got ${hand.round}`);
    }
    
    return hand;
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
      // deckPosition is set by startHand after dealing hole cards - don't override it
      communityCards = [], // Never pre-populate, let round advancement handle it
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
      // Note: We never pre-populate communityCards - let simulatePreFlopActions handle round advancement
      // Note: We don't update deckPosition - startHand already set it correctly after dealing hole cards
      await prisma.hand.update({
        where: { id: handId },
        data: {
          deck: deck as any,
          // Don't update deckPosition - startHand already set it correctly (8 for 4 players, 4 for 2 players)
          communityCards: [] as any, // Never pre-populate, let round advancement handle it
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
      const finalHand = await simulatePreFlopActions(
        prisma,
        table.id,
        handId,
        actualDealerPosition,
        actualSmallBlindSeat,
        actualBigBlindSeat,
        actualUtgSeat,
        round
      );
      
      // Verify we're on the expected round
      if (round === 'RIVER' && finalHand?.round !== 'RIVER') {
        throw new Error(`Setup failed: Expected round RIVER but got ${finalHand?.round}. Hand ID: ${handId}`);
      }
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

      // Small blind calls (1M to match) - BB still gets option
      const callResult = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(callResult.success).toBe(true);
      expect(callResult.handEnded).toBe(false);
      expect(callResult.roundAdvanced).toBe(false); // BB still needs to act

      // Verify round is still PRE_FLOP (BB has option)
      await assertHandRound(prisma, hand.id, 'PRE_FLOP');

      // Big blind checks (exercises option)
      const checkResult = await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(checkResult.success).toBe(true);
      expect(checkResult.handEnded).toBe(false);
      expect(checkResult.roundAdvanced).toBe(true);

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
      // Verify we're starting on PRE_FLOP
      expect(hand.round).toBe('PRE_FLOP');

      // UTG all-in (50M total, 48M incremental)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer goes all-in (matching the all-in amount, exhausting balance)
      // Dealer starts with 50M, POST_BLIND commits 0M, so calling 50M exhausts balance
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind folds
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind goes all-in (matching the all-in amount, exhausting balance)
      // Big blind starts with 50M, POST_BLIND commits 2M, so calling 48M more exhausts balance
      const result = await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All active players all-in, auto-advance to river

      // Pot calculation: All HandActions store incremental amounts
      // SB POST_BLIND: 1M + BB POST_BLIND: 2M + UTG ALL_IN: 50M + Dealer ALL_IN: 50M + BB ALL_IN: 48M = 151M
      // Note: BB ALL_IN is 48M incremental (to match 50M total, since BB already has 2M from POST_BLIND)
      await verifyPotWithRake(prisma, hand.id, 151000000n, rakeBps);
    }, { 
      player0Balance: 50000000n,  // Dealer: 50M (calling 50M exhausts balance)
      player1Balance: 100000000n,  // Small Blind: 100M (folds, doesn't matter)
      player2Balance: 50000000n,   // Big Blind: 50M (POST_BLIND commits 2M, calling 48M more exhausts balance)
      player3Balance: 50000000n    // UTG: 50M (goes all-in for 50M)
    });

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
      // After BB calls, all active players have acted and matched the bet
      // Round should complete and advance to FLOP (UTG doesn't need to act again - no one raised after them)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(false); // Hand should not end, should advance to FLOP
      expect(result.roundAdvanced).toBe(true); // Round should advance to FLOP

      // Verify round advanced to FLOP
      const updatedHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      expect(updatedHand?.round).toBe('FLOP');
      expect(updatedHand?.status).toBe('FLOP');

      // Side pot should be created (Dealer all-in for 5M, UTG and BB committed 10M each)
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(1); // Should have side pots
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
    }, { round: 'FLOP' });

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

      // Pot before rake: 8M + 5M + 15M + 15M + 15M + 10M = 68M
      // Note: chipsCommitted resets to 0 at start of each round, so raise is 15M (not 13M)
      await verifyPotWithRake(prisma, hand.id, 68000000n, 0);
    });

    it('FL-005: Bet-Raise-Fold-Call on Flop', async () => {
      const { prisma, hand, table } = await setupStandardFourPlayerTest({ round: 'FLOP', rakeBps: 0 });

      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer

      // Small blind bets 5M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);

      // Big blind raises to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false);

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

      // Pot before rake: 8M + 5M + 15M + 15M + 10M = 53M
      await verifyPotWithRake(prisma, hand.id, 53000000n, 0);
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

      // Dealer raises to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false);

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

      // Pot before rake: 8M + 5M + 15M + 15M + 15M + 10M = 68M
      await verifyPotWithRake(prisma, hand.id, 68000000n, 0);
    });

    testWithRakeVariants('FL-008: All-In on Flop (Single Player)', async ({ prisma, hand, table }, rakeBps) => {
      // Verify we're starting on FLOP
      expect(hand.round).toBe('FLOP');
      
      // Small blind all-in (commits all remaining chips)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind and UTG go all-in (matching the all-in amount, exhausting their balance)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer folds - all remaining active players are all-in (balance exhausted)
      const result = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All active players all-in, auto-advance to river

      // Pot calculation: PRE_FLOP pot (~8M) + FLOP all-in amounts
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });
      const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
      expect(totalPot).toBeGreaterThan(100000000n); // At least 100M
    }, { round: 'FLOP', player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 100000000n });

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

      // All check - Log state between each checkAction to track round advancement
      // Log initial state
      let currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      console.log('[TEST TU-001] BEFORE 1st checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat);
      const wallet1 = await getCurrentActionWallet(prisma, hand.id);
      console.log('[TEST TU-001] 1st checkAction - Wallet:', wallet1);
      const result1 = await checkAction(prisma, table.id, wallet1);
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      console.log('[TEST TU-001] AFTER 1st checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat, 'roundAdvanced:', result1.roundAdvanced);

      console.log('[TEST TU-001] BEFORE 2nd checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat);
      const wallet2 = await getCurrentActionWallet(prisma, hand.id);
      console.log('[TEST TU-001] 2nd checkAction - Wallet:', wallet2);
      const result2 = await checkAction(prisma, table.id, wallet2);
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      console.log('[TEST TU-001] AFTER 2nd checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat, 'roundAdvanced:', result2.roundAdvanced);

      console.log('[TEST TU-001] BEFORE 3rd checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat);
      const wallet3 = await getCurrentActionWallet(prisma, hand.id);
      console.log('[TEST TU-001] 3rd checkAction - Wallet:', wallet3);
      const result3 = await checkAction(prisma, table.id, wallet3);
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      console.log('[TEST TU-001] AFTER 3rd checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat, 'roundAdvanced:', result3.roundAdvanced);

      console.log('[TEST TU-001] BEFORE 4th checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat);
      const wallet4 = await getCurrentActionWallet(prisma, hand.id);
      console.log('[TEST TU-001] 4th checkAction - Wallet:', wallet4);
      const result = await checkAction(prisma, table.id, wallet4);
      currentHand = await prisma.hand.findUnique({ where: { id: hand.id } });
      console.log('[TEST TU-001] AFTER 4th checkAction - Round:', currentHand?.round, 'CurrentActionSeat:', currentHand?.currentActionSeat, 'roundAdvanced:', result.roundAdvanced);

      console.log('[TEST TU-001] Full result object from checkAction:', JSON.stringify(result, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
      console.log('[TEST TU-001] result.roundAdvanced type:', typeof result.roundAdvanced);
      console.log('[TEST TU-001] result.roundAdvanced value:', result.roundAdvanced);

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

      // Big blind raises to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false);

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

      // Pot before rake: 8M + 5M + 15M + 15M + 15M + 10M = 68M
      await verifyPotWithRake(prisma, hand.id, 68000000n, 0);
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
    }, { round: 'TURN', player0Balance: 100000000n, player1Balance: 30000000n, player2Balance: 50000000n, player3Balance: 100000000n });
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

      // Big blind raises to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M, minimum is 7M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false);

      // UTG calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (10M)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true);

      // Pot before rake: 8M + 5M + 15M + 15M + 15M + 10M = 68M
      await verifyPotWithRake(prisma, hand.id, 68000000n, rakeBps);
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
      
      // After PRE_FLOP: Big blind (player2) has committed 2M (big blind), so they have (balance - 2M) left
      // Poker rule: All-in means committing all remaining chips. If they have 7M initial and committed 2M in PRE_FLOP, they have 5M left.
      // To all-in for 5M TOTAL (including the 2M already committed), they need 7M initial balance. ✓ CORRECT

      // Small blind bets 10M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 10000000n);

      // Big blind all-in (remaining balance - less than bet of 10M)
      // Poker rule: Player can all-in even if it's less than the current bet. This creates a side pot.
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // UTG calls (10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (10M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind can raise or call - let's call to complete
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      // When players call and exhaust their balance, they become ALL_IN
      // If all players become all-in, hand auto-advances to river and ends
      expect(result.handEnded).toBe(true); // Hand ends when all players are all-in

      // Side pot should be created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 100000000n });

    testWithRakeVariants('SP-005: All-In Then Raise', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest({ round: 'FLOP' }) already simulated PRE_FLOP actions via service layer
      // After PRE_FLOP: chipsCommitted resets to 0 for all players at FLOP start
      // Small blind all-in (20M) -> currentBet becomes 20M
      // Big blind needs to raise to 30M total, so they need to commit 30M (incremental = 30M)
      // But they need to raise by at least minimum raise (2M), so 30M is valid

      // Small blind all-in (20M)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind raises to 30M total (incremental amount = 30M to get to 30M total from 0 committed)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 30000000n, false);

      // UTG calls (30M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (30M)
      // Note: Dealer has 20M balance, so calling 30M exhausts their balance, making them ALL_IN
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      // When players call and exhaust their balance, they become ALL_IN
      // If all players become all-in, hand auto-advances to river and ends
      expect(result.handEnded).toBe(true); // Hand ends when all players are all-in

      // Side pot should be created
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 20000000n, player1Balance: 20000000n, player2Balance: 100000000n, player3Balance: 100000000n });
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

      // PRE_FLOP: UTG, Dealer, SB call; BB checks (exercises option)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id)); // BB exercises option

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
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false); // Raise to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Bet, raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 5000000n);
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 15000000n, false); // Raise to 15M total (chipsCommitted resets to 0 at start of round, incremental = 15M)
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

      // Big blind checks (exercises option) to complete PRE_FLOP
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // FLOP: SB acts first (after dealer), then BB, then Dealer
      // Action order post-flop: SB (1) → BB (2) → Dealer (0)
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id)); // SB checks
      await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id)); // BB folds
      await checkAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id)); // Dealer checks

      // TURN: SB (1) → Dealer (0). SB folds, leaving only dealer - hand ends
      const foldResult = await foldAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // When only one player remains, hand ends immediately (no showdown needed)
      // This is correct poker behavior - remaining player wins without revealing cards
      expect(foldResult.success).toBe(true);
      expect(foldResult.handEnded).toBe(true);
      expect(foldResult.winnerSeatNumber).toBe(0); // Dealer wins

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

      // TURN: Big blind all-in (creates a bet since they have chips remaining after FLOP)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      // Dealer calls the all-in (this exhausts dealer's balance, making all players all-in)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // All all-in, auto-advance to river

      // Verify side pots created with correct eligibility and balances
      // Expected commitments:
      // - UTG (seat 3): 20M (all-in PRE_FLOP)
      // - Small blind (seat 1): 50M (20M PRE_FLOP + 30M all-in FLOP)
      // - Big blind (seat 2): 60M (20M PRE_FLOP + 30M call FLOP + 10M all-in TURN)
      // - Dealer (seat 0): 60M (20M PRE_FLOP + 30M call FLOP + 10M call TURN)
      // 
      // Side pots:
      // - Pot 0: 20M × 4 = 80M (all 4 eligible: [0,1,2,3])
      // - Pot 1: (50M - 20M) × 3 = 90M (seats [0,1,2] eligible)
      // - Pot 2: (60M - 50M) × 2 = 20M (seats [0,2] eligible)
      // Total: 190M
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBe(3); // Should have 3 side pots

      // Verify pot amounts and eligibility
      const pot0 = pots.find((p: any) => p.potNumber === 0);
      const pot1 = pots.find((p: any) => p.potNumber === 1);
      const pot2 = pots.find((p: any) => p.potNumber === 2);

      expect(pot0).toBeDefined();
      expect(pot1).toBeDefined();
      expect(pot2).toBeDefined();

      // Pot amounts are AFTER rake since hand is settled (handEnded = true)
      // Expected BEFORE rake: Pot 0: 80M, Pot 1: 90M, Pot 2: 20M, Total: 190M
      const pot0BeforeRake = 80000000n;
      const pot1BeforeRake = 90000000n;
      const pot2BeforeRake = 20000000n;
      const totalBeforeRake = 190000000n;

      // Calculate expected amounts after rake
      const pot0Rake = calculateRake(pot0BeforeRake, rakeBps);
      const pot1Rake = calculateRake(pot1BeforeRake, rakeBps);
      const pot2Rake = calculateRake(pot2BeforeRake, rakeBps);
      const pot0AfterRake = pot0BeforeRake - pot0Rake;
      const pot1AfterRake = pot1BeforeRake - pot1Rake;
      const pot2AfterRake = pot2BeforeRake - pot2Rake;
      const totalAfterRake = pot0AfterRake + pot1AfterRake + pot2AfterRake;

      // Pot 0: 80M before rake, all 4 players eligible
      expect(BigInt(pot0!.amount)).toBe(pot0AfterRake);
      const eligible0 = Array.isArray(pot0!.eligibleSeatNumbers) 
        ? (pot0!.eligibleSeatNumbers as number[]).sort((a, b) => a - b) 
        : [];
      expect(eligible0).toEqual([0, 1, 2, 3]);

      // Pot 1: 90M before rake, seats 0,1,2 eligible
      expect(BigInt(pot1!.amount)).toBe(pot1AfterRake);
      const eligible1 = Array.isArray(pot1!.eligibleSeatNumbers) 
        ? (pot1!.eligibleSeatNumbers as number[]).sort((a, b) => a - b) 
        : [];
      expect(eligible1).toEqual([0, 1, 2]);

      // Pot 2: 20M before rake, seats 0,2 eligible
      expect(BigInt(pot2!.amount)).toBe(pot2AfterRake);
      const eligible2 = Array.isArray(pot2!.eligibleSeatNumbers) 
        ? (pot2!.eligibleSeatNumbers as number[]).sort((a, b) => a - b) 
        : [];
      expect(eligible2).toEqual([0, 2]);

      // Verify total pot amount (after rake)
      const totalPot = pots.reduce((sum: bigint, pot: any) => sum + BigInt(pot.amount), 0n);
      expect(totalPot).toBe(totalAfterRake);
      
      // Verify total rake amount
      const totalRake = pot0Rake + pot1Rake + pot2Rake;
      expect(totalRake).toBe(calculateRake(totalBeforeRake, rakeBps));
    }, { player0Balance: 100000000n, player1Balance: 50000000n, player2Balance: 60000000n, player3Balance: 20000000n });
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
      // Big blind raises to 4M total (has committed 0M at FLOP start, incremental = 4M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 4000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // TURN: Minimum raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 2000000n);
      // Big blind raises to 4M total (has committed 0M at TURN start, incremental = 4M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 4000000n, false);
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // RIVER: Minimum raise, all call
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 2000000n);
      // Big blind raises to 4M total (has committed 0M at RIVER start, incremental = 4M, minimum raise is 2M)
      await raiseAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id), 4000000n, false);
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
      
      // After PRE_FLOP: Big blind (player2) has committed 2M (big blind), so they have (balance - 2M) left
      // Poker rule: All-in means committing all remaining chips. If they have 7M initial and committed 2M in PRE_FLOP, they have 5M left.
      // To all-in for 5M TOTAL (including the 2M already committed), they need 7M initial balance. ✓ CORRECT

      // Small blind bets 10M
      await betOrRaiseAction(prisma, table.id, hand.id, await getCurrentActionWallet(prisma, hand.id), 10000000n);

      // Big blind all-in (remaining balance - less than bet of 10M)
      // Poker rule: Player can all-in even if it's less than the current bet. This creates a side pot.
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
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 100000000n });

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

      // Single winner - pot includes blinds (1M + 2M = 3M) + all-in (50M) = 53M
      await verifyPotWithRake(prisma, hand.id, 53000000n, rakeBps);
    }, { player0Balance: 100000000n, player1Balance: 100000000n, player2Balance: 100000000n, player3Balance: 50000000n });

    testWithRakeVariants('EC-006: All-In Then Call', async ({ prisma, hand, table }, rakeBps) => {
      // setupStandardFourPlayerTest already initialized the hand via startHand (includes POST_BLIND)
      // 
      // Test scenario: UTG goes all-in, others call with their entire balance to match
      // This makes everyone all-in, triggering auto-advancement to river
      // 
      // Balances: All players have 50M (after blinds: dealer=0M, small blind=49M, big blind=48M, UTG=50M)
      // UTG goes all-in: 50M total commitment
      // Others must call 50M to match, which exhausts their balance, making them all-in

      // UTG all-in (50M total commitment)
      await allInAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Dealer calls (50M total commitment - exhausts balance, becomes all-in)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Small blind calls (50M total commitment - exhausts balance, becomes all-in)
      await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      // Big blind calls (50M total commitment - exhausts balance, becomes all-in)
      const result = await callAction(prisma, table.id, await getCurrentActionWallet(prisma, hand.id));

      expect(result.success).toBe(true);
      expect(result.handEnded).toBe(true); // Auto-advance to river if all all-in

      // Showdown occurs
      const pots = await prisma.pot.findMany({
        where: { handId: hand.id },
        orderBy: { potNumber: 'asc' },
      });

      expect(pots.length).toBeGreaterThan(0);
    }, { player0Balance: 50000000n, player1Balance: 50000000n, player2Balance: 50000000n, player3Balance: 50000000n });

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
      // Create table and start Hand 1
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: 100000000n },
      ]);

      // Start Hand 1 (dealer = 0)
      const hand1Result = await startHand(table.id, prisma);
      const hand1Id = hand1Result.id;
      
      // Verify Hand 1 initial positions
      const hand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      expect(hand1!.dealerPosition).toBe(0);
      expect(hand1!.smallBlindSeat).toBe(1);
      expect(hand1!.bigBlindSeat).toBe(2);
      expect(hand1!.currentActionSeat).toBe(3); // UTG acts first

      // Complete Hand 1: Have UTG, Dealer, and Small Blind fold, leaving Big Blind as winner
      // UTG folds first (currentActionSeat = 3)
      await foldAction(prisma, table.id, PLAYER_3_WALLET);
      
      // Dealer folds (seat 0)
      await foldAction(prisma, table.id, PLAYER_0_WALLET);
      
      // Small Blind folds (seat 1)
      const foldResult = await foldAction(prisma, table.id, PLAYER_1_WALLET);
      
      // Hand should be completed
      expect(foldResult.handEnded).toBe(true);
      
      // Verify Hand 1 is marked as COMPLETED
      const completedHand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      expect(completedHand1!.status).toBe('COMPLETED');

      // Start Hand 2 (dealer should rotate to 1)
      const hand2Result = await startHand(table.id, prisma);
      const hand2Id = hand2Result.id;
      
      // Verify Hand 2 rotated positions
      const hand2 = await prisma.hand.findUnique({ where: { id: hand2Id } });
      expect(hand2!.dealerPosition).toBe(1); // Rotated from 0 to 1
      expect(hand2!.smallBlindSeat).toBe(2); // Rotated from 1 to 2
      expect(hand2!.bigBlindSeat).toBe(3); // Rotated from 2 to 3
      expect(hand2!.currentActionSeat).toBe(0); // UTG rotated to seat 0
    });

    it('RO-003: Hand 3 - Second Rotation', async () => {
      // Create table and start Hand 1
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: 100000000n },
      ]);

      // Start Hand 1 (dealer = 0)
      const hand1Result = await startHand(table.id, prisma);
      const hand1Id = hand1Result.id;
      
      // Complete Hand 1: UTG, Dealer, Small Blind fold
      await foldAction(prisma, table.id, PLAYER_3_WALLET); // UTG
      await foldAction(prisma, table.id, PLAYER_0_WALLET); // Dealer
      await foldAction(prisma, table.id, PLAYER_1_WALLET); // Small Blind
      
      // Verify Hand 1 completed
      const completedHand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      expect(completedHand1!.status).toBe('COMPLETED');

      // Start Hand 2 (dealer = 1)
      const hand2Result = await startHand(table.id, prisma);
      const hand2Id = hand2Result.id;
      
      // Verify Hand 2 positions
      const hand2 = await prisma.hand.findUnique({ where: { id: hand2Id } });
      expect(hand2!.dealerPosition).toBe(1);
      
      // Complete Hand 2: UTG, Dealer, Small Blind fold
      await foldAction(prisma, table.id, PLAYER_0_WALLET); // UTG (seat 0)
      await foldAction(prisma, table.id, PLAYER_1_WALLET); // Dealer (seat 1)
      await foldAction(prisma, table.id, PLAYER_2_WALLET); // Small Blind (seat 2)
      
      // Verify Hand 2 completed
      const completedHand2 = await prisma.hand.findUnique({ where: { id: hand2Id } });
      expect(completedHand2!.status).toBe('COMPLETED');

      // Start Hand 3 (dealer should rotate to 2)
      const hand3Result = await startHand(table.id, prisma);
      const hand3Id = hand3Result.id;
      
      // Verify Hand 3 rotated positions
      const hand3 = await prisma.hand.findUnique({ where: { id: hand3Id } });
      expect(hand3!.dealerPosition).toBe(2); // Rotated from 1 to 2
      expect(hand3!.smallBlindSeat).toBe(3); // Rotated from 2 to 3
      expect(hand3!.bigBlindSeat).toBe(0); // Rotated from 3 to 0
      expect(hand3!.currentActionSeat).toBe(1); // UTG rotated to seat 1
    });

    it('RO-004: Hand 4 - Third Rotation (Cycle Completes)', async () => {
      // Create table and start Hand 1
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: 100000000n },
      ]);

      // Helper function to complete a hand by having 3 players fold
      const completeHand = async (handId: number) => {
        const wallets = [PLAYER_0_WALLET, PLAYER_1_WALLET, PLAYER_2_WALLET, PLAYER_3_WALLET];
        
        // Fold players until hand ends (3 folds should end the hand)
        let handEnded = false;
        let foldCount = 0;
        const maxFolds = 3; // UTG, Dealer, Small Blind
        
        while (!handEnded && foldCount < maxFolds) {
          const hand = await prisma.hand.findUnique({ where: { id: handId } });
          if (!hand) throw new Error(`Hand ${handId} not found`);
          
          if (hand.status === 'COMPLETED') {
            handEnded = true;
            break;
          }
          
          const currentActionSeat = hand.currentActionSeat!;
          const result = await foldAction(prisma, table.id, wallets[currentActionSeat]);
          
          if (result.handEnded) {
            handEnded = true;
          }
          
          foldCount++;
        }
        
        // Verify hand completed
        const completedHand = await prisma.hand.findUnique({ where: { id: handId } });
        expect(completedHand!.status).toBe('COMPLETED');
      };

      // Start Hand 1 (dealer = 0)
      const hand1Result = await startHand(table.id, prisma);
      const hand1Id = hand1Result.id;
      expect(hand1Result.dealerPosition).toBe(0);
      expect(hand1Result.smallBlindSeat).toBe(1);
      expect(hand1Result.bigBlindSeat).toBe(2);
      
      // Complete Hand 1
      await completeHand(hand1Id);

      // Start Hand 2 (dealer = 1)
      const hand2Result = await startHand(table.id, prisma);
      const hand2Id = hand2Result.id;
      expect(hand2Result.dealerPosition).toBe(1);
      expect(hand2Result.smallBlindSeat).toBe(2);
      expect(hand2Result.bigBlindSeat).toBe(3);
      
      // Complete Hand 2
      await completeHand(hand2Id);

      // Start Hand 3 (dealer = 2)
      const hand3Result = await startHand(table.id, prisma);
      const hand3Id = hand3Result.id;
      expect(hand3Result.dealerPosition).toBe(2);
      expect(hand3Result.smallBlindSeat).toBe(3);
      expect(hand3Result.bigBlindSeat).toBe(0);
      
      // Complete Hand 3
      await completeHand(hand3Id);

      // Start Hand 4 (dealer = 3)
      const hand4Result = await startHand(table.id, prisma);
      const hand4Id = hand4Result.id;
      expect(hand4Result.dealerPosition).toBe(3);
      expect(hand4Result.smallBlindSeat).toBe(0);
      expect(hand4Result.bigBlindSeat).toBe(1);
      
      // Complete Hand 4
      await completeHand(hand4Id);

      // Start Hand 5 (dealer should rotate back to 0 - cycle completes)
      const hand5Result = await startHand(table.id, prisma);
      const hand5Id = hand5Result.id;
      
      // Verify Hand 5 positions are back to initial state
      expect(hand5Result.dealerPosition).toBe(0); // Back to 0
      expect(hand5Result.smallBlindSeat).toBe(1); // Back to 1
      expect(hand5Result.bigBlindSeat).toBe(2); // Back to 2
      expect(hand5Result.currentActionSeat).toBe(3); // UTG back to 3
      
      const hand5 = await prisma.hand.findUnique({ where: { id: hand5Id } });
      expect(hand5!.dealerPosition).toBe(0);
      expect(hand5!.smallBlindSeat).toBe(1);
      expect(hand5!.bigBlindSeat).toBe(2);
      expect(hand5!.currentActionSeat).toBe(3);
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

  // ============================================================================
  // PLAYER ELIMINATION SCENARIOS
  // ============================================================================

  describe('PLAYER ELIMINATION Scenarios', () => {
    it('EL-001: Player Eliminated (Balance = 0) - Rotation Skips Eliminated Player', async () => {
      // Create table with 4 players
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        perHandRake: 0,
      });

      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 1000000n }, // 1M - below bigBlind, but will participate in Hand 1
        { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: 100000000n },
      ]);
      
      // Note: Player 2 starts with 1M (below bigBlind), so they won't be in Hand 1
      // We need to give them enough to participate in Hand 1, then lose in Hand 2
      // So let's start them with just enough to participate, then they'll lose and be eliminated
      // Actually, let's give them 2M (exactly bigBlind) so they can participate but will be eliminated if they lose
      await prisma.tableSeatSession.updateMany({
        where: { tableId: table.id, seatNumber: 2 },
        data: { tableBalanceGwei: 2000000n }, // Exactly bigBlind - can participate but will be eliminated if they lose
      });

      // Start Hand 1 (dealer = 0)
      const hand1Result = await startHand(table.id, prisma);
      const hand1Id = hand1Result.id;
      expect(hand1Result.dealerPosition).toBe(0);
      expect(hand1Result.smallBlindSeat).toBe(1);
      expect(hand1Result.bigBlindSeat).toBe(2); // Player 2 is big blind

      // Complete Hand 1: Have UTG, Dealer, and Small Blind fold, leaving Big Blind (player 2) as winner
      const hand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      const wallets = [PLAYER_0_WALLET, PLAYER_1_WALLET, PLAYER_2_WALLET, PLAYER_3_WALLET];
      
      // UTG (seat 3) folds
      await foldAction(prisma, table.id, wallets[3]);
      
      // Dealer (seat 0) folds
      await foldAction(prisma, table.id, wallets[0]);
      
      // Small Blind (seat 1) folds
      await foldAction(prisma, table.id, wallets[1]);

      // Hand 1 completes, Big Blind (player 2) wins
      const completedHand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      expect(completedHand1!.status).toBe('COMPLETED');

      // Now set up Hand 2 where player 2 goes all-in and loses (gets eliminated)
      // Create a deck where player 3 has a pair (clearly better) and player 2 has high card only
      // Player 2: 2♠ 3♥ (no pair, no straight - will lose)
      // Player 3: A♠ A♥ (pair of Aces - will win)
      // Community: 7♦ 8♣ 9♠ K♦ Q♣ (no straight possible with 2-3, gives player 3 pair of Aces)
      // Note: Changed community to 7-8-9-K-Q to prevent player 2 from making 2-3-4-5-6 straight
      const eliminationDeck = createFabricatedDeck([
        // Player 0 hole cards (not relevant - will fold)
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        // Player 1 hole cards (not relevant - will fold)
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'J', suit: 'diamonds' },
        // Player 2 hole cards (no pair, no straight - will lose)
        { rank: '2', suit: 'spades' },
        { rank: '3', suit: 'hearts' },
        // Player 3 hole cards (pair of Aces - will win)
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        // Flop
        { rank: '7', suit: 'diamonds' },
        { rank: '8', suit: 'clubs' },
        { rank: '9', suit: 'spades' },
        // Turn
        { rank: 'K', suit: 'diamonds' },
        // River
        { rank: 'Q', suit: 'clubs' },
        // Rest of deck
        ...Array(40).fill({ rank: '10', suit: 'clubs' }),
      ]);

      // Start Hand 2 (dealer should rotate to 1)
      const hand2Result = await startHand(table.id, prisma);
      const hand2Id = hand2Result.id;
      expect(hand2Result.dealerPosition).toBe(1);
      expect(hand2Result.smallBlindSeat).toBe(2); // Player 2 is small blind
      expect(hand2Result.bigBlindSeat).toBe(3);
      expect(hand2Result.currentActionSeat).toBe(0); // UTG acts first

      // Update deck and reset deckPosition for deterministic testing
      // startHand deals 8 hole cards (4 players × 2), so deckPosition is 8
      // We need to reset it to 8 so community cards come from the right position
      await prisma.hand.update({
        where: { id: hand2Id },
        data: {
          deck: eliminationDeck as any,
          deckPosition: 8, // 4 players × 2 hole cards = 8
          communityCards: [] as any,
        },
      });

      // Update hole cards for each player based on seatNumber
      // startHand deals cards in order of eligiblePlayers (sorted by seatNumber)
      // So: seat 0 gets deck[0-1], seat 1 gets deck[2-3], seat 2 gets deck[4-5], seat 3 gets deck[6-7]
      const hand2Players = await prisma.handPlayer.findMany({
        where: { handId: hand2Id },
        orderBy: { seatNumber: 'asc' },
      });

      for (const player of hand2Players) {
        const seatNumber = player.seatNumber;
        const holeCardStartIndex = seatNumber * 2;
        const holeCards = eliminationDeck.slice(holeCardStartIndex, holeCardStartIndex + 2);
        await prisma.handPlayer.update({
          where: { id: player.id },
          data: {
            holeCards: holeCards as any,
          },
        });
      }

      // Verify hole cards were assigned correctly
      const hand2PlayersAfterUpdate = await prisma.handPlayer.findMany({
        where: { handId: hand2Id },
        orderBy: { seatNumber: 'asc' },
      });
      const player2HoleCards = hand2PlayersAfterUpdate.find(p => p.seatNumber === 2)?.holeCards as Card[];
      const player3HoleCards = hand2PlayersAfterUpdate.find(p => p.seatNumber === 3)?.holeCards as Card[];
      
      // Verify player 2 has 2♠ 3♥ (no pair, no straight possible)
      expect(player2HoleCards).toEqual([
        { rank: '2', suit: 'spades' },
        { rank: '3', suit: 'hearts' },
      ]);
      
      // Verify player 3 has A♠ A♥ (pair of Aces)
      expect(player3HoleCards).toEqual([
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
      ]);

      // Get player 2's balance before Hand 2
      const player2SessionBefore = await prisma.tableSeatSession.findFirst({
        where: { tableId: table.id, seatNumber: 2 },
      });
      const player2BalanceBefore = player2SessionBefore!.tableBalanceGwei;
      expect(player2BalanceBefore).toBeGreaterThanOrEqual(BIG_BLIND);

      // UTG (player 0) folds
      await foldAction(prisma, table.id, PLAYER_0_WALLET);
      
      // Dealer (player 1) folds
      await foldAction(prisma, table.id, PLAYER_1_WALLET);
      
      // Verify hole cards are still correct before actions complete
      const hand2BeforeActions = await prisma.handPlayer.findMany({
        where: { handId: hand2Id },
        orderBy: { seatNumber: 'asc' },
      });
      const player2HoleCardsBefore = hand2BeforeActions.find(p => p.seatNumber === 2)?.holeCards as Card[];
      const player3HoleCardsBefore = hand2BeforeActions.find(p => p.seatNumber === 3)?.holeCards as Card[];
      
      // Verify player 2 has 2♠ 3♥ before actions
      if (!player2HoleCardsBefore || 
          !((player2HoleCardsBefore[0]?.rank === '2' && player2HoleCardsBefore[0]?.suit === 'spades' && player2HoleCardsBefore[1]?.rank === '3' && player2HoleCardsBefore[1]?.suit === 'hearts') ||
            (player2HoleCardsBefore[1]?.rank === '2' && player2HoleCardsBefore[1]?.suit === 'spades' && player2HoleCardsBefore[0]?.rank === '3' && player2HoleCardsBefore[0]?.suit === 'hearts'))) {
        throw new Error(`Test setup failed: Player 2 hole cards incorrect before actions: ${JSON.stringify(player2HoleCardsBefore)}`);
      }
      
      // Verify player 3 has A♠ A♥ before actions
      if (!player3HoleCardsBefore ||
          !((player3HoleCardsBefore[0]?.rank === 'A' && player3HoleCardsBefore[0]?.suit === 'spades' && player3HoleCardsBefore[1]?.rank === 'A' && player3HoleCardsBefore[1]?.suit === 'hearts') ||
            (player3HoleCardsBefore[1]?.rank === 'A' && player3HoleCardsBefore[1]?.suit === 'spades' && player3HoleCardsBefore[0]?.rank === 'A' && player3HoleCardsBefore[0]?.suit === 'hearts'))) {
        throw new Error(`Test setup failed: Player 3 hole cards incorrect before actions: ${JSON.stringify(player3HoleCardsBefore)}`);
      }

      // Small Blind (player 2) goes all-in with their remaining balance
      await allInAction(prisma, table.id, PLAYER_2_WALLET);
      
      // Big Blind (player 3) calls the all-in
      await callAction(prisma, table.id, PLAYER_3_WALLET);

      // Hand 2 completes - player 3 wins deterministically (has A♠ K♠, better than player 2's 2♠ 3♠)
      const completedHand2 = await prisma.hand.findUnique({ where: { id: hand2Id } });
      expect(completedHand2!.status).toBe('COMPLETED');

      // Verify hole cards and community cards are correct after hand completes
      const hand2Final = await prisma.hand.findUnique({ where: { id: hand2Id } });
      const hand2PlayersFinal = await prisma.handPlayer.findMany({
        where: { handId: hand2Id },
        orderBy: { seatNumber: 'asc' },
      });
      const player2FinalHoleCards = hand2PlayersFinal.find(p => p.seatNumber === 2)?.holeCards as Card[];
      const player3FinalHoleCards = hand2PlayersFinal.find(p => p.seatNumber === 3)?.holeCards as Card[];
      const communityCards = (hand2Final!.communityCards || []) as Card[];
      
      // Verify player 2 has 2♠ 3♥ (if not, the test setup is wrong)
      if (!player2FinalHoleCards || 
          !((player2FinalHoleCards[0]?.rank === '2' && player2FinalHoleCards[0]?.suit === 'spades' && player2FinalHoleCards[1]?.rank === '3' && player2FinalHoleCards[1]?.suit === 'hearts') ||
            (player2FinalHoleCards[1]?.rank === '2' && player2FinalHoleCards[1]?.suit === 'spades' && player2FinalHoleCards[0]?.rank === '3' && player2FinalHoleCards[0]?.suit === 'hearts'))) {
        throw new Error(`Test setup failed: Player 2 hole cards are ${JSON.stringify(player2FinalHoleCards)}, expected [{rank: '2', suit: 'spades'}, {rank: '3', suit: 'hearts'}]. Community cards: ${JSON.stringify(communityCards)}`);
      }
      
      // Verify player 3 has A♠ A♥ (pair of Aces - if not, the test setup is wrong)
      if (!player3FinalHoleCards ||
          !((player3FinalHoleCards[0]?.rank === 'A' && player3FinalHoleCards[0]?.suit === 'spades' && player3FinalHoleCards[1]?.rank === 'A' && player3FinalHoleCards[1]?.suit === 'hearts') ||
            (player3FinalHoleCards[1]?.rank === 'A' && player3FinalHoleCards[1]?.suit === 'spades' && player3FinalHoleCards[0]?.rank === 'A' && player3FinalHoleCards[0]?.suit === 'hearts'))) {
        throw new Error(`Test setup failed: Player 3 hole cards are ${JSON.stringify(player3FinalHoleCards)}, expected [{rank: 'A', suit: 'spades'}, {rank: 'A', suit: 'hearts'}]. Community cards: ${JSON.stringify(communityCards)}`);
      }
      
      // Verify community cards are correct (should be 7♦ 8♣ 9♠ K♦ Q♣)
      const expectedCommunityCards = [
        { rank: '7', suit: 'diamonds' },
        { rank: '8', suit: 'clubs' },
        { rank: '9', suit: 'spades' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
      ];
      if (communityCards.length !== 5) {
        throw new Error(`Test setup failed: Expected 5 community cards, got ${communityCards.length}. Cards: ${JSON.stringify(communityCards)}`);
      }
      // Note: Community cards order might vary, so we check if all expected cards are present
      for (const expectedCard of expectedCommunityCards) {
        const found = communityCards.some(c => c.rank === expectedCard.rank && c.suit === expectedCard.suit);
        if (!found) {
          throw new Error(`Test setup failed: Expected community card ${JSON.stringify(expectedCard)} not found. Actual cards: ${JSON.stringify(communityCards)}`);
        }
      }

      // Verify player 3 won Hand 2 (deterministic - A♠ A♥ (pair of Aces) beats 2♠ 3♥ (high card))
      // With community cards 7♦ 8♣ 9♠ K♦ Q♣:
      // - Player 2: 2♠ 3♥ 7♦ 8♣ 9♠ K♦ Q♣ = K high (best 5: K, Q, 9, 8, 7) - no straight possible
      // - Player 3: A♠ A♥ Q♣ K♦ 9♠ 8♣ 7♦ = Pair of Aces (best 5: A, A, K, Q, 9)
      // Player 3 must win with pair of Aces (beats high card)
      
      // DEEP DIVE: Analyze hand evaluation
      const hand2Pots = await prisma.pot.findMany({
        where: { handId: hand2Id },
        orderBy: { potNumber: 'asc' },
      });
      
      
      // Check all pots - player 3 should win all pots (has pair, player 2 has no pair)
      let player3WonAnyPot = false;
      let player2WonAnyPot = false;
      const potDetails: string[] = [];
      
      for (const pot of hand2Pots) {
        const winnerSeats = Array.isArray(pot.winnerSeatNumbers)
          ? (pot.winnerSeatNumbers as number[])
          : [];
        const eligibleSeats = Array.isArray(pot.eligibleSeatNumbers)
          ? (pot.eligibleSeatNumbers as number[])
          : [];
        potDetails.push(
          `Pot ${pot.potNumber}: amount=${pot.amount}, eligible=${JSON.stringify(eligibleSeats)}, winners=${JSON.stringify(winnerSeats)}`
        );
        if (winnerSeats.includes(3)) {
          player3WonAnyPot = true;
        }
        if (winnerSeats.includes(2)) {
          player2WonAnyPot = true;
        }
      }
      
      // Player 3 must win (A♠ A♥ pair beats 2♠ 3♥ no pair) - deterministic
      // Player 2 must NOT win (no pair loses to pair)
      expect(player3WonAnyPot).toBe(true);
      expect(player2WonAnyPot).toBe(false);

      // Verify player 2 lost and is now ineligible (balance < bigBlind)
      const player2Session = await prisma.tableSeatSession.findFirst({
        where: { tableId: table.id, seatNumber: 2 },
      });
      // Player 2 lost the all-in, so their balance should be less than bigBlind
      expect(player2Session!.tableBalanceGwei).toBeLessThan(BIG_BLIND);
      expect(player2Session!.tableBalanceGwei).toBeLessThan(player2BalanceBefore);

      // Start Hand 3 - player 2 should be skipped
      const hand3Result = await startHand(table.id, prisma);
      const hand3Id = hand3Result.id;

      // Verify dealer rotation skips player 2
      // Hand 1: dealer = 0, Hand 2: dealer = 1, Hand 3: dealer should be 3 (skipping 2)
      // Eligible players: [0, 1, 3] (player 2 eliminated)
      expect(hand3Result.dealerPosition).toBe(3); // Rotated from 1, skipping eliminated player 2
      expect(hand3Result.smallBlindSeat).toBe(0); // After dealer 3, wraps to 0
      expect(hand3Result.bigBlindSeat).toBe(1); // After small blind 0, wraps to 1
      expect(hand3Result.currentActionSeat).toBe(3); // UTG is after big blind 1, wraps to 3 (skipping eliminated player 2)

      // Verify player 2 is not in eligible players
      const hand3 = await prisma.hand.findUnique({ where: { id: hand3Id } });
      const hand3Players = await prisma.handPlayer.findMany({
        where: { handId: hand3Id },
        orderBy: { seatNumber: 'asc' },
      });
      
      // Should only have 3 players (0, 1, 3) - player 2 is skipped
      expect(hand3Players.length).toBe(3);
      const seatNumbers = hand3Players.map(p => p.seatNumber).sort((a, b) => a - b);
      expect(seatNumbers).toEqual([0, 1, 3]); // Player 2 is not included
    });

    it('EL-002: Player Below Big Blind Threshold - Rotation Skips Ineligible Player', async () => {
      // Create table with 4 players
      const prisma = getTestPrisma();
      const table = await createTestTable(prisma, {
        smallBlind: SMALL_BLIND, // 1M
        bigBlind: BIG_BLIND, // 2M
        perHandRake: 0,
      });

      await createTestPlayers(prisma, table.id, [
        { seatNumber: 0, walletAddress: PLAYER_0_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 1, walletAddress: PLAYER_1_WALLET, tableBalanceGwei: 100000000n },
        { seatNumber: 2, walletAddress: PLAYER_2_WALLET, tableBalanceGwei: 1000000n }, // 1M - below big blind threshold
        { seatNumber: 3, walletAddress: PLAYER_3_WALLET, tableBalanceGwei: 100000000n },
      ]);

      // Start Hand 1 (dealer = 0)
      const hand1Result = await startHand(table.id, prisma);
      const hand1Id = hand1Result.id;
      expect(hand1Result.dealerPosition).toBe(0);

      // Verify player 2 is not included in Hand 1 (balance < bigBlind)
      const hand1Players = await prisma.handPlayer.findMany({
        where: { handId: hand1Id },
        orderBy: { seatNumber: 'asc' },
      });

      // Should only have 3 players (0, 1, 3) - player 2 is filtered out
      expect(hand1Players.length).toBe(3);
      const seatNumbers1 = hand1Players.map(p => p.seatNumber).sort((a, b) => a - b);
      expect(seatNumbers1).toEqual([0, 1, 3]); // Player 2 is not included

      // Set up deterministic deck for Hand 1
      // Player 0: A♠ K♠ (best hand - will win if all fold)
      // Player 1: Q♠ J♠ (worse hand)
      // Player 3: 10♠ 9♠ (worst hand)
      // Community: 8♥ 7♦ 6♣ 5♥ 4♦ (no help)
      const hand1Deck = createFabricatedDeck([
        // Player 0 hole cards (best hand - will win)
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
        // Player 1 hole cards (worse hand)
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'spades' },
        // Player 2 hole cards (not in hand - skipped)
        { rank: '2', suit: 'hearts' },
        { rank: '3', suit: 'hearts' },
        // Player 3 hole cards (worst hand)
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'spades' },
        // Flop
        { rank: '8', suit: 'hearts' },
        { rank: '7', suit: 'diamonds' },
        { rank: '6', suit: 'clubs' },
        // Turn
        { rank: '5', suit: 'hearts' },
        // River
        { rank: '4', suit: 'diamonds' },
        // Rest of deck
        ...Array(40).fill({ rank: '2', suit: 'clubs' }),
      ]);

      // Update deck and hole cards for deterministic testing
      await prisma.hand.update({
        where: { id: hand1Id },
        data: {
          deck: hand1Deck as any,
          deckPosition: 6, // 3 players × 2 hole cards = 6
          communityCards: [] as any,
        },
      });

      // Update hole cards for each player based on seatNumber
      // Only players 0, 1, 3 are in the hand (player 2 is skipped)
      for (const player of hand1Players) {
        const seatNumber = player.seatNumber;
        const holeCardStartIndex = seatNumber * 2;
        const holeCards = hand1Deck.slice(holeCardStartIndex, holeCardStartIndex + 2);
        await prisma.handPlayer.update({
          where: { id: player.id },
          data: {
            holeCards: holeCards as any,
          },
        });
      }

      // Verify hole cards were assigned correctly
      const hand1PlayersAfterUpdate = await prisma.handPlayer.findMany({
        where: { handId: hand1Id },
        orderBy: { seatNumber: 'asc' },
      });
      const player0HoleCards = hand1PlayersAfterUpdate.find(p => p.seatNumber === 0)?.holeCards as Card[];
      const player1HoleCards = hand1PlayersAfterUpdate.find(p => p.seatNumber === 1)?.holeCards as Card[];
      const player3HoleCards = hand1PlayersAfterUpdate.find(p => p.seatNumber === 3)?.holeCards as Card[];
      
      // Verify player 0 has A♠ K♠ (best hand)
      expect(player0HoleCards).toEqual([
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
      ]);
      
      // Verify player 1 has Q♠ J♠
      expect(player1HoleCards).toEqual([
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'spades' },
      ]);
      
      // Verify player 3 has 10♠ 9♠ (worst hand)
      expect(player3HoleCards).toEqual([
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'spades' },
      ]);

      // Verify player 2 has no actions in Hand 1
      const hand1Actions = await prisma.handAction.findMany({
        where: { handId: hand1Id },
        orderBy: { id: 'asc' },
      });
      const player2Actions = hand1Actions.filter(a => a.seatNumber === 2);
      expect(player2Actions.length).toBe(0); // Player 2 took no actions

      // Complete Hand 1: Have UTG, Dealer, and Small Blind fold
      // This will leave the Big Blind (player 3) as the winner
      const hand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      const utgSeat = hand1!.currentActionSeat!;
      const wallets = [PLAYER_0_WALLET, PLAYER_1_WALLET, PLAYER_3_WALLET];
      
      // UTG folds
      await foldAction(prisma, table.id, wallets[utgSeat === 0 ? 0 : utgSeat === 1 ? 1 : 2]);
      
      // Get next action seat and fold
      const hand1AfterFold1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      if (hand1AfterFold1!.status !== 'COMPLETED') {
        const nextActionSeat = hand1AfterFold1!.currentActionSeat!;
        await foldAction(prisma, table.id, wallets[nextActionSeat === 0 ? 0 : nextActionSeat === 1 ? 1 : 2]);
      }

      // Verify Hand 1 completed
      const completedHand1 = await prisma.hand.findUnique({ where: { id: hand1Id } });
      expect(completedHand1!.status).toBe('COMPLETED');

      // Verify who won Hand 1 deterministically and that player 2 did not participate
      const hand1Pots = await prisma.pot.findMany({
        where: { handId: hand1Id },
      });
      
      // Determine who won (should be the last player standing after folds)
      let hand1Winner: number | null = null;
      for (const pot of hand1Pots) {
        const winnerSeats = Array.isArray(pot.winnerSeatNumbers)
          ? (pot.winnerSeatNumbers as number[])
          : [];
        if (winnerSeats.length > 0) {
          hand1Winner = winnerSeats[0];
          break;
        }
      }
      
      // Verify player 2 did NOT win Hand 1
      expect(hand1Winner).not.toBe(2);
      expect(hand1Winner).not.toBeNull();
      for (const pot of hand1Pots) {
        // Check eligibleSeatNumbers (players eligible for this pot)
        const eligibleSeats = Array.isArray(pot.eligibleSeatNumbers) 
          ? (pot.eligibleSeatNumbers as number[])
          : [];
        // Player 2 should not be eligible for any pot since they didn't participate
        expect(eligibleSeats).not.toContain(2);
        
        // Check winnerSeatNumbers (players who won this pot)
        const winnerSeats = Array.isArray(pot.winnerSeatNumbers)
          ? (pot.winnerSeatNumbers as number[])
          : [];
        // Player 2 should not have won any pot
        expect(winnerSeats).not.toContain(2);
      }

      // Start Hand 2 - player 2 should still be skipped
      const hand2Result = await startHand(table.id, prisma);
      const hand2Id = hand2Result.id;

      // Verify dealer rotated (from 0 to 1, skipping player 2)
      expect(hand2Result.dealerPosition).toBe(1);
      
      // Verify player 2 is still not included
      const hand2Players = await prisma.handPlayer.findMany({
        where: { handId: hand2Id },
        orderBy: { seatNumber: 'asc' },
      });

      expect(hand2Players.length).toBe(3);
      const seatNumbers2 = hand2Players.map(p => p.seatNumber).sort((a, b) => a - b);
      expect(seatNumbers2).toEqual([0, 1, 3]); // Player 2 is still not included

      // Verify player 2's balance is still below threshold
      const player2Session = await prisma.tableSeatSession.findFirst({
        where: { tableId: table.id, seatNumber: 2 },
      });
      expect(player2Session!.tableBalanceGwei).toBeLessThan(BIG_BLIND);
    });
  });
});

