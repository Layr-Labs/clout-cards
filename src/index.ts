/**
 * Main application entry point
 *
 * This module initializes and starts the Express HTTP server for the Clout Cards application.
 * It sets up routing, middleware, and begins listening for incoming HTTP requests.
 *
 * The server provides a health check endpoint and can be extended with additional API routes.
 * Environment configuration is loaded from .env file before server startup.
 */
import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import { ethers } from 'ethers';
import './config/env'; // Loads dotenv.config() and initializes environment
import { getAdminAddresses } from './services/admins';
import { parseIntEnv, isProduction } from './config/env';
import { generateSessionMessage } from './utils/messages';
import { requireAdminAuth } from './middleware/adminAuth';
import { createTable, CreateTableInput, getAllTables, updateTableActiveStatus } from './services/tables';
import { getRecentEvents } from './db/events';
import { verifyEventSignature } from './services/eventVerification';
import twitterAuthRoutes from './routes/twitterAuth';
import { getTeePublicKey } from './db/eip712';
import { requireWalletAuth } from './middleware/walletAuth';
import { requireTwitterAuth } from './middleware/twitterAuth';
import { getEscrowBalance, getEscrowBalanceWithWithdrawal } from './services/escrowBalance';
import { signEscrowWithdrawal } from './services/withdrawalSigning';
import { startContractListener } from './services/contractListener';
import { prisma } from './db/client';
import { joinTable } from './services/joinTable';
import { standUp } from './services/standUp';
import { rebuy } from './services/rebuy';
import { foldAction, callAction, checkAction, betAction, raiseAction, allInAction } from './services/playerAction';
import { getCurrentHandResponse } from './services/currentHand';
import { sendErrorResponse, ValidationError, ConflictError, NotFoundError, AppError } from './utils/errorHandler';
import { validateAndGetTableId, validateTableId } from './utils/validation';
import { serializeTable, serializeTableSeatSession, parseTableInput } from './utils/serialization';
import { initializeEventNotifier, registerEventCallback, EventNotification } from './db/eventNotifier';
import { startActionTimeoutChecker } from './services/actionTimeoutChecker';
import { startHandStartChecker } from './services/handStartChecker';
import { runMigrations } from './utils/runMigrations';
import { getLeaderboard, type LeaderboardSortBy } from './services/leaderboard';
import { subscribeToChat, sendSystemMessage, LOBBY_CHANNEL_ID } from './services/chat';
import chatRoutes from './routes/chat';
import lobbyChatRoutes from './routes/lobbyChat';
import { checkSolvency } from './services/accounting';

/**
 * Express application instance
 *
 * Handles HTTP requests and routing. Configured with middleware and route handlers.
 */
const app = express();

/**
 * CORS configuration
 *
 * Allows cross-origin requests from the frontend application.
 * In development, allows requests from Vite dev server (localhost:5173).
 * In production, should be configured to allow only specific origins.
 */
const corsOptions: CorsOptions = {
  origin: isProduction()
    ? process.env.CORS_ORIGIN?.split(',') || [] // Production: use CORS_ORIGIN env var (comma-separated)
    : ['http://localhost:5173', 'http://localhost:3000'], // Development: allow Vite and common dev ports
  credentials: true, // Allow cookies/auth headers if needed in the future
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Twitter-Access-Token'],
};

app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON request bodies

// Twitter OAuth routes
app.use('/', twitterAuthRoutes);

// Chat routes (real-time chat via SSE)
app.use('/api/tables', chatRoutes);

// Lobby chat routes (real-time chat for /play page)
app.use('/api/lobby', lobbyChatRoutes);

/**
 * Server port number
 *
 * Port on which the Express server will listen for incoming connections.
 * Reads from APP_PORT environment variable, defaults to 8000 if not set.
 *
 * @type {number}
 */
const APP_PORT: number = parseIntEnv('APP_PORT', 8000);

/**
 * GET /health
 *
 * Health check endpoint to verify the server is running and responsive.
 * Used by load balancers, monitoring systems, and deployment health checks.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - No path params, query params, headers, or body required
 *
 * Response:
 * - 200: { status: "ok" }
 *   - Indicates server is healthy and responding
 *
 * Error model:
 * - No error responses expected for this endpoint
 *   - If server is down, endpoint will be unreachable
 *
 * Rate limiting:
 * - No rate limiting applied (health checks should be lightweight)
 *
 * @param {Request} req - Express request object (unused in this handler)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 *
 * @throws {Error} If Express response methods fail (unlikely in normal operation)
 */
app.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok' });
});

/**
 * GET /admins
 *
 * Returns a list of all valid admin addresses.
 * No authentication required - this is public information.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - No path params, query params, headers, or body required
 *
 * Response:
 * - 200: string[] - Array of admin addresses (checksum format)
 *   - Local development: Returns Anvil's first default address
 *   - Production: Returns addresses from ADMIN_ADDRESSES env var (or empty array)
 *
 * Error model:
 * - 500: Server error if admin configuration is invalid
 *
 * @param {Request} req - Express request object (unused in this handler)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 *
 * @throws {Error} If admin configuration is invalid (caught and returned as 500)
 */
app.get('/admins', (req: Request, res: Response): void => {
  try {
    const admins = getAdminAddresses();
    res.status(200).json(admins);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to retrieve admin addresses');
  }
});

/**
 * GET /api/accounting/solvency
 *
 * Returns solvency information comparing total escrow balances to contract balance.
 * Used to verify that the smart contract holds enough ETH to cover all player balances.
 *
 * Auth:
 * - Requires admin signature authentication
 *
 * Request:
 * - Query params:
 *   - adminAddress: string (required) - Admin wallet address
 * - Headers:
 *   - Authorization: string (required) - Session signature
 *
 * Response:
 * - 200: {
 *     totalEscrowGwei: string,      // Sum of all player escrow balances
 *     contractBalanceGwei: string,  // Contract ETH balance in gwei
 *     isSolvent: boolean,           // true if contract >= escrow
 *     shortfallGwei: string | null, // Difference if insolvent
 *     breakdown: {
 *       playerCount: number,
 *       players: Array<{ address: string, balanceGwei: string }>
 *     }
 *   }
 *
 * Error model:
 * - 401: { error: string; message: string } - Unauthorized
 * - 500: { error: string; message: string } - RPC or database error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
app.get('/api/accounting/solvency', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const solvency = await checkSolvency();
    res.status(200).json(solvency);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to check solvency');
  }
});

// =============================================================================
// Verify Endpoints (Public - for transparency and verification)
// =============================================================================

/**
 * GET /api/verify/stats
 *
 * Returns platform-wide statistics for public verification.
 * This is a public endpoint - no authentication required.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Response:
 * - 200: {
 *     handsPlayed: number,
 *     totalBetVolumeGwei: string,
 *     totalEscrowFundsGwei: string,
 *     contractBalanceGwei: string,
 *     teeRakeBalanceGwei: string
 *   }
 *
 * Error model:
 * - 500: { error: string; message: string } - Database or RPC error
 */
app.get('/api/verify/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get total completed hands count
    const handsResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM hands WHERE status = 'COMPLETED'
    `;
    const handsPlayed = Number(handsResult[0].count);

    // Get total bet volume (sum of all betting actions)
    const betVolumeResult = await prisma.$queryRaw<[{ total: bigint | null }]>`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM hand_actions
      WHERE action IN ('POST_BLIND', 'CALL', 'RAISE', 'ALL_IN')
    `;
    const totalBetVolumeGwei = (betVolumeResult[0].total || 0n).toString();

    // Get total escrow funds (escrow + table balances) using accounting service
    const { getTotalEscrowBalance, getTotalTableBalance, getContractBalance } = await import('./services/accounting');
    const { totalGwei: escrowGwei } = await getTotalEscrowBalance();
    const { totalGwei: tableGwei } = await getTotalTableBalance();
    const totalEscrowFundsGwei = (escrowGwei + tableGwei).toString();

    // Get contract balance
    const contractBalanceGwei = (await getContractBalance()).toString();

    // Get TEE rake balance
    const teeAddress = getTeePublicKey().toLowerCase();
    const teeBalanceResult = await prisma.$queryRaw<[{ balance_gwei: bigint } | null]>`
      SELECT balance_gwei FROM player_escrow_balances
      WHERE LOWER(wallet_address) = ${teeAddress}
    `;
    const teeRakeBalanceGwei = teeBalanceResult[0]?.balance_gwei?.toString() || '0';

    res.status(200).json({
      handsPlayed,
      totalBetVolumeGwei,
      totalEscrowFundsGwei,
      contractBalanceGwei,
      teeRakeBalanceGwei,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to get verify stats');
  }
});

/**
 * GET /api/verify/activity
 *
 * Returns hourly activity data for the last 48 hours.
 * Used for time-series graphs showing hands played and bet volume over time.
 * This is a public endpoint - no authentication required.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Response:
 * - 200: {
 *     handsPerHour: Array<{ hour: string, count: number }>,
 *     volumePerHour: Array<{ hour: string, volumeGwei: string }>
 *   }
 *
 * Error model:
 * - 500: { error: string; message: string } - Database error
 */
app.get('/api/verify/activity', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get hands completed per hour for last 48 hours
    const handsPerHourResult = await prisma.$queryRaw<Array<{ hour: Date; count: bigint }>>`
      SELECT date_trunc('hour', completed_at) as hour, COUNT(*) as count
      FROM hands
      WHERE status = 'COMPLETED' AND completed_at > NOW() - INTERVAL '48 hours'
      GROUP BY date_trunc('hour', completed_at)
      ORDER BY hour ASC
    `;

    const handsPerHour = handsPerHourResult.map(row => ({
      hour: row.hour.toISOString(),
      count: Number(row.count),
    }));

    // Get bet volume per hour for last 48 hours
    const volumePerHourResult = await prisma.$queryRaw<Array<{ hour: Date; volume: bigint }>>`
      SELECT date_trunc('hour', timestamp) as hour, COALESCE(SUM(amount), 0) as volume
      FROM hand_actions
      WHERE action IN ('POST_BLIND', 'CALL', 'RAISE', 'ALL_IN')
        AND timestamp > NOW() - INTERVAL '48 hours'
      GROUP BY date_trunc('hour', timestamp)
      ORDER BY hour ASC
    `;

    const volumePerHour = volumePerHourResult.map(row => ({
      hour: row.hour.toISOString(),
      volumeGwei: row.volume.toString(),
    }));

    res.status(200).json({
      handsPerHour,
      volumePerHour,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to get verify activity');
  }
});

/**
 * GET /api/verify/events
 *
 * Returns paginated events for public verification.
 * Each event includes signature verification status.
 * This is a public endpoint - no authentication required.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - page: number (optional, default: 1) - Page number (1-indexed)
 *   - limit: number (optional, default: 20, max: 100) - Items per page
 *
 * Response:
 * - 200: {
 *     events: Array<Event>,
 *     totalCount: number,
 *     page: number,
 *     totalPages: number,
 *     limit: number
 *   }
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid query parameters
 * - 500: { error: string; message: string } - Database error
 */
app.get('/api/verify/events', async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM events
    `;
    const totalCount = Number(countResult[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated events (newest first)
    const events = await prisma.event.findMany({
      orderBy: { eventId: 'desc' },
      skip: offset,
      take: limit,
    });

    // Convert BigInt fields to strings and verify signatures
    const eventsJson = events.map((event) => {
      // Verify signature
      const isValid = verifyEventSignature(
        event.kind,
        event.payloadJson,
        event.digest,
        event.sigR,
        event.sigS,
        event.sigV,
        event.teePubkey,
        event.nonce || undefined
      );

      return {
        eventId: event.eventId,
        blockTs: event.blockTs.toISOString(),
        player: event.player,
        tableId: event.tableId,
        kind: event.kind,
        payloadJson: event.payloadJson,
        digest: event.digest,
        sigR: event.sigR,
        sigS: event.sigS,
        sigV: event.sigV,
        nonce: event.nonce?.toString() || null,
        teeVersion: event.teeVersion,
        teePubkey: event.teePubkey,
        ingestedAt: event.ingestedAt.toISOString(),
        signatureValid: isValid,
      };
    });

    res.status(200).json({
      events: eventsJson,
      totalCount,
      page,
      totalPages,
      limit,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to get verify events');
  }
});

/**
 * GET /sessionMessage
 *
 * Returns a session message for wallet signature authentication.
 * The message includes the Ethereum address and should be signed by the wallet
 * to establish a session. The signature is stored client-side in localStorage.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - address: string (required) - Ethereum address to generate message for
 *
 * Response:
 * - 200: { message: string }
 *   - Message format: "Sign on to Clout Cards with address #{ETH_ADDRESS}"
 *   - The address will be in checksum format
 *
 * Error model:
 * - 400: { error: string, message: string } - Invalid or missing address parameter
 * - 500: { error: string, message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/sessionMessage', (req: Request, res: Response): void => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      throw new ValidationError('Address query parameter is required');
    }

    // Generate session message using reusable utility
    const message = generateSessionMessage(address);

    res.status(200).json({ message });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to generate session message', 400);
  }
});

/**
 * POST /createTable
 *
 * Creates a new poker table. Requires admin authentication via signature.
 *
 * Auth:
 * - Requires admin signature in Authorization header
 * - Signature must be valid for the admin's session message
 * - Uses requireAdminAuth middleware to verify authentication
 *
 * Request:
 * - Headers:
 *   - Authorization: string (required) - Session signature from localStorage (Bearer token)
 *   - Content-Type: application/json
 * - Body:
 *   - name: string (required) - Unique table name
 *   - minimumBuyIn: string (required) - Minimum buy-in in gwei (as string to handle BigInt)
 *   - maximumBuyIn: string (required) - Maximum buy-in in gwei (as string to handle BigInt)
 *   - perHandRake: number (required) - Rake per hand in basis points (0-10000)
 *   - maxSeatCount: number (required) - Maximum seats (0-8)
 *   - smallBlind: string (required) - Small blind in gwei (as string to handle BigInt)
 *   - bigBlind: string (required) - Big blind in gwei (as string to handle BigInt)
 *   - isActive: boolean (optional) - Whether table is active (defaults to true)
 *   - adminAddress: string (required) - Admin address creating the table
 *
 * Response:
 * - 200: { id: number; name: string; ... } - Created table record
 * - 400: { error: string; message: string } - Invalid input or validation error
 * - 401: { error: string; message: string } - Unauthorized (not admin or invalid signature)
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object (with adminAddress attached by middleware)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/createTable', requireAdminAuth(), async (req: Request, res: Response): Promise<void> => {
  try {
    // Admin address is attached to req by requireAdminAuth middleware
    const adminAddress = (req as Request & { adminAddress: string }).adminAddress;
    const { adminAddress: _, ...tableInput } = req.body; // Remove adminAddress from tableInput

    // Parse BigInt values from strings using utility
    const createTableInput = parseTableInput(tableInput);

    // Create the table (includes event logging in transaction)
    const table = await createTable(createTableInput, adminAddress);

    // Serialize BigInt fields to strings for JSON response
    res.status(200).json(serializeTable(table));
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to create table');
  }
});

/**
 * GET /pokerTables
 *
 * Returns a list of all poker tables in the database.
 * No authentication required - this is public information.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - No path params, query params, headers, or body required
 *
 * Response:
 * - 200: Array of poker table objects
 *   - Each table includes: id, name, minimumBuyIn, maximumBuyIn, perHandRake,
 *     maxSeatCount, smallBlind, bigBlind, isActive, createdAt, updatedAt
 *   - BigInt fields (minimumBuyIn, maximumBuyIn, smallBlind, bigBlind) are returned as strings
 *   - Tables are ordered by creation date (newest first)
 *
 * Error model:
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object (unused in this handler)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/pokerTables', async (req: Request, res: Response): Promise<void> => {
  try {
    const tables = await getAllTables();

    // For each table, get the last completed hand's completedAt timestamp
    // This allows the frontend to calculate countdown timer on page reload
    const tablesWithHandInfo = await Promise.all(
      tables.map(async (table) => {
        const lastCompletedHand = await (prisma as any).hand.findFirst({
          where: {
            tableId: table.id,
            status: 'COMPLETED',
          },
          orderBy: {
            completedAt: 'desc',
          },
          select: {
            completedAt: true,
          },
        });

        // Check if there's currently an active hand
        const activeHand = await (prisma as any).hand.findFirst({
          where: {
            tableId: table.id,
            status: {
              not: 'COMPLETED',
            },
          },
          select: {
            id: true,
          },
        });

        return {
          ...serializeTable(table),
          handStartDelaySeconds: table.handStartDelaySeconds ?? 30,
          lastHandCompletedAt: lastCompletedHand?.completedAt?.toISOString() || null,
          hasActiveHand: !!activeHand,
        };
      })
    );

    res.status(200).json(tablesWithHandInfo);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch poker tables');
  }
});

/**
 * GET /tablePlayers
 *
 * Returns all active seat sessions for a given poker table.
 * No authentication required - this is public information.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - tableId: number (required) - The poker table ID
 *
 * Response:
 * - 200: Array of active seat session objects, ordered by seat number
 *   - Each session includes: id, walletAddress, twitterHandle, twitterAvatarUrl, seatNumber, joinedAt, tableBalanceGwei
 *   - twitterAvatarUrl may be null if the user doesn't have a profile image
 *   - BigInt fields (tableBalanceGwei) are returned as strings
 *   - Sessions are ordered by seatNumber ascending
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid or missing tableId parameter
 * - 404: { error: string; message: string } - Table not found
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/tablePlayers', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate table ID and verify table exists
    const tableId = await validateAndGetTableId(req.query.tableId);

    // Get all active seat sessions for this table, ordered by seat number
    const seatSessions = await prisma.tableSeatSession.findMany({
      where: {
        tableId: tableId,
        isActive: true,
      },
      orderBy: {
        seatNumber: 'asc',
      },
      select: {
        id: true,
        walletAddress: true,
        twitterHandle: true,
        twitterAvatarUrl: true,
        seatNumber: true,
        joinedAt: true,
        tableBalanceGwei: true,
      },
    }) as unknown as Array<{
      id: number;
      walletAddress: string;
      twitterHandle: string | null;
      twitterAvatarUrl: string | null;
      seatNumber: number;
      joinedAt: Date;
      tableBalanceGwei: bigint;
    }>;

    // Serialize BigInt fields to strings for JSON response
    const playersJson = seatSessions.map((session) => ({
      id: session.id,
      walletAddress: session.walletAddress,
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
      seatNumber: session.seatNumber,
      joinedAt: session.joinedAt.toISOString(),
      tableBalanceGwei: session.tableBalanceGwei.toString(),
    }));

    res.status(200).json(playersJson);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch table players');
  }
});

/**
 * GET /api/leaderboard
 *
 * Returns leaderboard statistics for top players.
 * No authentication required - this is public information.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - sortBy: 'winnings' | 'bets' | 'hands' (optional, default: 'winnings')
 *   - limit: number (optional, default: 20, max: 100)
 *
 * Response:
 * - 200: Array of leaderboard entry objects
 *   - Each entry includes: rank, twitterHandle, handsPlayed, handsWon, totalLifetimeBets, totalLifetimeWinnings
 *   - BigInt fields (totalLifetimeBets, totalLifetimeWinnings) are returned as strings
 *   - Entries are ordered by the specified sortBy criteria (descending)
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid sortBy or limit parameter
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/api/leaderboard', async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse and validate query parameters
    const sortByParam = req.query.sortBy as string;
    const limitParam = req.query.limit as string;

    // Validate sortBy
    const validSortBy: LeaderboardSortBy[] = ['winnings', 'bets', 'hands'];
    const sortBy: LeaderboardSortBy = validSortBy.includes(sortByParam as LeaderboardSortBy)
      ? (sortByParam as LeaderboardSortBy)
      : 'winnings';

    // Validate limit
    let limit = 20;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        throw new ValidationError('Limit must be a positive number');
      }
      limit = Math.min(parsedLimit, 100); // Cap at 100
    }

    // Fetch leaderboard data
    const leaderboard = await getLeaderboard(sortBy, limit);

    // Serialize BigInt fields to strings for JSON response
    const leaderboardJson = leaderboard.map((entry) => ({
      rank: entry.rank,
      twitterHandle: entry.twitterHandle,
      handsPlayed: entry.handsPlayed,
      handsWon: entry.handsWon,
      totalLifetimeBets: entry.totalLifetimeBets.toString(),
      totalLifetimeWinnings: entry.totalLifetimeWinnings.toString(),
    }));

    res.status(200).json(leaderboardJson);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch leaderboard');
  }
});

/**
 * GET /admin/tableSessions
 *
 * Returns all seat sessions (active and inactive) for a given poker table.
 * Requires admin authentication.
 *
 * Auth:
 * - Requires admin signature authentication via requireAdminAuth middleware
 *
 * Request:
 * - Query params:
 *   - tableId: number (required) - The poker table ID
 *
 * Response:
 * - 200: Array of seat session objects, ordered by joinedAt descending
 *   - Each session includes: id, walletAddress, twitterHandle, twitterAvatarUrl, seatNumber, 
 *     joinedAt, leftAt, isActive, tableBalanceGwei
 *   - twitterAvatarUrl may be null if the user doesn't have a profile image
 *   - BigInt fields (tableBalanceGwei) are returned as strings
 *   - leftAt is null for active sessions
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid or missing tableId parameter
 * - 401: { error: string; message: string } - Unauthorized (not admin)
 * - 404: { error: string; message: string } - Table not found
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/admin/tableSessions', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate table ID and verify table exists
    const tableId = await validateAndGetTableId(req.query.tableId);

    // Get all seat sessions for this table (active and inactive), ordered by joinedAt descending
    const seatSessions = await prisma.tableSeatSession.findMany({
      where: {
        tableId: tableId,
      },
      orderBy: {
        joinedAt: 'desc',
      },
      select: {
        id: true,
        walletAddress: true,
        twitterHandle: true,
        twitterAvatarUrl: true,
        seatNumber: true,
        joinedAt: true,
        leftAt: true,
        isActive: true,
        tableBalanceGwei: true,
      },
    }) as unknown as Array<{
      id: number;
      walletAddress: string;
      twitterHandle: string | null;
      twitterAvatarUrl: string | null;
      seatNumber: number;
      joinedAt: Date;
      leftAt: Date | null;
      isActive: boolean;
      tableBalanceGwei: bigint;
    }>;

    // Serialize BigInt fields to strings for JSON response
    const sessionsJson = seatSessions.map(serializeTableSeatSession);

    res.status(200).json(sessionsJson);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch table sessions');
  }
});

/**
 * POST /admin/tables/:tableId/status
 *
 * Updates a table's active status (activate or deactivate).
 * Requires admin authentication.
 *
 * When a table is deactivated:
 * - Existing hands can complete normally
 * - No new hands will start
 * - Players cannot join the table
 * - Chat is disabled
 * - Players can still stand up to recover funds
 *
 * Auth:
 * - Requires admin signature authentication via requireAdminAuth middleware
 *
 * Request:
 * - Path params:
 *   - tableId: number (required) - The poker table ID
 * - Query params:
 *   - adminAddress: string (required) - Admin wallet address for auth
 * - Body:
 *   - isActive: boolean (required) - New active status
 *
 * Response:
 * - 200: { id: number; name: string; isActive: boolean; updatedAt: string }
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid or missing parameters
 * - 401: { error: string; message: string } - Unauthorized (not admin)
 * - 404: { error: string; message: string } - Table not found
 * - 409: { error: string; message: string } - Table already in requested state
 * - 500: { error: string; message: string } - Server error
 *
 * Side effects:
 * - Creates a TEE-signed TABLE_ACTIVATED or TABLE_DEACTIVATED event
 * - On deactivation, sends a system chat message to the table
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/admin/tables/:tableId/status', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse and validate tableId from path params
    const tableIdStr = req.params.tableId;
    if (!tableIdStr) {
      throw new ValidationError('tableId is required');
    }

    const tableId = parseInt(tableIdStr, 10);
    if (isNaN(tableId) || tableId <= 0) {
      throw new ValidationError('tableId must be a positive integer');
    }

    // Validate request body
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean');
    }

    // Get admin address from middleware
    const adminAddress = (req as Request & { adminAddress: string }).adminAddress;

    // Update table status (creates TEE-signed event)
    const updatedTable = await updateTableActiveStatus(tableId, isActive, adminAddress);

    // If table was deactivated, send system chat message
    if (!isActive) {
      sendSystemMessage(
        tableId,
        'This table has been deactivated by an administrator. Current hand will complete, but no new hands will start.'
      );
    }

    // Return updated table state
    res.status(200).json({
      id: updatedTable.id,
      name: updatedTable.name,
      isActive: updatedTable.isActive,
      updatedAt: updatedTable.updatedAt.toISOString(),
    });
  } catch (error) {
    // Check for "already in state" error and return 409 Conflict
    if (error instanceof Error && error.message.includes('already')) {
      sendErrorResponse(res, new ConflictError(error.message), 'Failed to update table status');
    } else {
      sendErrorResponse(res, error, 'Failed to update table status');
    }
  }
});

/**
 * POST /admin/leaderboard/reset
 *
 * Resets the leaderboard by deleting all records from the leaderboard_stats table.
 * Requires admin authentication.
 *
 * Auth:
 * - Requires admin signature authentication via requireAdminAuth middleware
 *
 * Request:
 * - Query params:
 *   - adminAddress: string (required) - Admin wallet address for auth
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *
 * Response:
 * - 200: { success: true; recordsDeleted: number }
 *
 * Error model:
 * - 401: { error: string; message: string } - Unauthorized (not admin)
 * - 500: { error: string; message: string } - Server error
 *
 * Side effects:
 * - Deletes all records from leaderboard_stats table
 * - Creates a TEE-signed LEADERBOARD_RESET event
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/admin/leaderboard/reset', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    // Get admin address from middleware
    const adminAddress = (req as Request & { adminAddress: string }).adminAddress;

    // Use transaction to delete records and create event atomically
    const result = await prisma.$transaction(async (tx) => {
      // Delete all records from leaderboard_stats
      const deleteResult = await tx.leaderboardStats.deleteMany({});
      const recordsDeleted = deleteResult.count;

      // Create event payload
      const payload = {
        kind: 'leaderboard_reset',
        admin: adminAddress,
        timestamp: new Date().toISOString(),
        recordsDeleted,
      };
      const payloadJson = JSON.stringify(payload);

      // Import EventKind dynamically to avoid circular dependency
      const { createEventInTransaction, EventKind } = await import('./db/events');

      // Create TEE-signed event
      await createEventInTransaction(tx, EventKind.LEADERBOARD_RESET, payloadJson, adminAddress, null);

      return recordsDeleted;
    });

    res.status(200).json({
      success: true,
      recordsDeleted: result,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to reset leaderboard');
  }
});

/**
 * POST /admin/reprocessEvents
 *
 * Reprocesses contract events (Deposited, WithdrawalExecuted) from a specified block range.
 * Used to catch up on missed events after server downtime or to recover from sync issues.
 * Requires admin authentication.
 *
 * Auth:
 * - Requires admin signature authentication via requireAdminAuth middleware
 *
 * Request:
 * - Query params:
 *   - adminAddress: string (required) - Admin wallet address for auth
 * - Body:
 *   - fromBlock: number (required) - Starting block number (inclusive)
 *   - toBlock: number (optional) - Ending block number (inclusive), defaults to latest
 *   - dryRun: boolean (optional) - If true, preview what would be processed without changes
 *
 * Response:
 * - 200: {
 *     success: boolean,
 *     fromBlock: number,
 *     toBlock: number,
 *     dryRun: boolean,
 *     depositsProcessed: number,
 *     depositsSkipped: number,
 *     withdrawalsProcessed: number,
 *     withdrawalsSkipped: number,
 *     errors: number,
 *     events: Array<{
 *       type: 'deposit' | 'withdrawal',
 *       txHash: string,
 *       blockNumber: number,
 *       player: string,
 *       amountGwei: string,
 *       nonce?: string,
 *       status: 'processed' | 'skipped' | 'error',
 *       reason?: string
 *     }>
 *   }
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid parameters
 * - 401: { error: string; message: string } - Unauthorized (not admin)
 * - 500: { error: string; message: string } - RPC or processing error
 *
 * Side effects:
 * - When not dry run: updates escrow balances and creates event records for missed events
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
app.post('/admin/reprocessEvents', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { fromBlock, toBlock, dryRun } = req.body;

    // Validate fromBlock
    if (fromBlock === undefined) {
      throw new ValidationError('fromBlock is required');
    }

    const fromBlockNum = parseInt(String(fromBlock), 10);
    if (isNaN(fromBlockNum) || fromBlockNum < 0) {
      throw new ValidationError('fromBlock must be a non-negative integer');
    }

    // Validate toBlock if provided
    let toBlockNum: number | undefined;
    if (toBlock !== undefined) {
      toBlockNum = parseInt(String(toBlock), 10);
      if (isNaN(toBlockNum) || toBlockNum < 0) {
        throw new ValidationError('toBlock must be a non-negative integer');
      }
      if (toBlockNum < fromBlockNum) {
        throw new ValidationError('toBlock must be greater than or equal to fromBlock');
      }
    }

    // Validate dryRun
    const isDryRun = dryRun === true || dryRun === 'true';

    // Import and call the reprocess function
    const { reprocessEventsFromBlock } = await import('./services/contractListener');

    const result = await reprocessEventsFromBlock(fromBlockNum, toBlockNum, isDryRun);

    res.status(200).json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to reprocess events');
  }
});

/**
 * POST /joinTable
 *
 * Allows a fully authenticated user to join a poker table at a specific seat.
 *
 * Auth:
 * - Requires wallet signature authentication via requireWalletAuth middleware
 * - Requires Twitter access token authentication via requireTwitterAuth middleware
 * - User must be fully logged in (both wallet and Twitter)
 *
 * Request:
 * - Body: {
 *     tableId: number,        // Table ID to join
 *     seatNumber: number,     // Seat number (0 to maxSeatCount-1)
 *     buyInAmountGwei: string // Buy-in amount in gwei (must be within table range)
 *   }
 * - Query params:
 *   - walletAddress: string (Ethereum address - must match connected wallet)
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *   - X-Twitter-Access-Token: <twitter_access_token>
 *
 * Response:
 * - 200: {
 *     id: number,
 *     tableId: number,
 *     walletAddress: string,
 *     seatNumber: number,
 *     tableBalanceGwei: string,
 *     twitterHandle: string | null,
 *     joinedAt: string
 *   }
 *
 * Error model:
 * - 400: { error: "Invalid request"; message: string } - Invalid parameters or validation failure
 * - 401: { error: "Unauthorized"; message: string } - Invalid or missing authentication
 * - 409: { error: "Conflict"; message: string } - Seat occupied, user already seated, or pending withdrawal
 * - 500: { error: "Failed to join table"; message: string } - Server error
 *
 * Side effects:
 * - Creates a join_table event in the database
 * - Deducts buy-in amount from player's escrow balance
 * - Creates table seat session (atomic transaction)
 * - Fails if user has pending withdrawal
 * - Fails if seat is already occupied (race condition protection)
 *
 * @param {Request} req - Express request object with walletAddress and twitterAccessToken attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/joinTable', requireWalletAuth({ addressSource: 'query' }), requireTwitterAuth(), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const twitterAccessToken = (req as Request & { twitterAccessToken: string }).twitterAccessToken;
    const { tableId, seatNumber, buyInAmountGwei } = req.body;

    // Validate request body
    if (tableId === undefined || seatNumber === undefined || !buyInAmountGwei) {
      throw new ValidationError('tableId, seatNumber, and buyInAmountGwei are required');
    }

    // Validate types
    const tableIdNum = validateTableId(tableId);
    const seatNumberNum = parseInt(String(seatNumber), 10);
    const buyInAmountGweiBigInt = BigInt(buyInAmountGwei);

    if (isNaN(seatNumberNum) || seatNumberNum < 0) {
      throw new ValidationError('seatNumber must be a non-negative integer');
    }

    if (buyInAmountGweiBigInt <= 0n) {
      throw new ValidationError('buyInAmountGwei must be greater than 0');
    }

    // Join the table
    const session = await joinTable(
      walletAddress,
      twitterAccessToken,
      {
        tableId: tableIdNum,
        seatNumber: seatNumberNum,
        buyInAmountGwei: buyInAmountGweiBigInt,
      }
    );

    res.status(200).json({
      id: session.id,
      tableId: session.tableId,
      walletAddress: session.walletAddress,
      seatNumber: session.seatNumber,
      tableBalanceGwei: session.tableBalanceGwei.toString(),
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
      joinedAt: session.joinedAt.toISOString(),
    });
  } catch (error) {
    // Map service errors to appropriate HTTP status codes
    if (error instanceof Error && !(error instanceof AppError)) {
      if (error.message.includes('pending withdrawal') ||
          error.message.includes('already occupied') ||
          error.message.includes('already seated')) {
        sendErrorResponse(res, new ConflictError(error.message), 'Failed to join table');
        return;
      }
      
      if (error.message.includes('Insufficient escrow') ||
          error.message.includes('below minimum') ||
          error.message.includes('exceeds maximum')) {
        sendErrorResponse(res, new ValidationError(error.message), 'Failed to join table');
        return;
      }
      
      if (error.message.includes('not found') || error.message.includes('not active')) {
        sendErrorResponse(res, new NotFoundError(error.message), 'Failed to join table');
        return;
      }
    }
    
    sendErrorResponse(res, error, 'Failed to join table');
  }
});

/**
 * POST /standUp
 *
 * Allows a player to leave a poker table and move their balance back to escrow.
 *
 * Auth:
 * - Requires wallet signature authentication via requireWalletAuth middleware
 *
 * Request:
 * - Body: {
 *     tableId: number  // Table ID to stand up from
 *   }
 * - Query params:
 *   - walletAddress: string (Ethereum address - must match connected wallet)
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *
 * Response:
 * - 200: {
 *     id: number,
 *     tableId: number,
 *     walletAddress: string,
 *     seatNumber: number,
 *     tableBalanceGwei: string,
 *     twitterHandle: string | null,
 *     twitterAvatarUrl: string | null,
 *     joinedAt: string,
 *     leftAt: string,
 *     isActive: boolean
 *   }
 *
 * Error model:
 * - 400: { error: "Invalid request"; message: string } - Invalid parameters
 * - 401: { error: "Unauthorized"; message: string } - Missing or invalid authentication
 * - 404: { error: "Not found"; message: string } - No active session found
 * - 500: { error: "Failed to stand up"; message: string } - Server error
 *
 * Side effects:
 * - Creates a leave_table event in the database
 * - Adds table balance back to player's escrow balance
 * - Marks session as inactive and sets leftAt timestamp
 *
 * @param {Request} req - Express request object with walletAddress attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/standUp', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const { tableId } = req.body;

    // Validate request body
    if (tableId === undefined) {
      throw new ValidationError('tableId is required');
    }

    // Validate types
    const tableIdNum = validateTableId(tableId);

    // Stand up from the table
    const session = await standUp(walletAddress, {
      tableId: tableIdNum,
    });

    res.status(200).json(serializeTableSeatSession(session));
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to stand up');
  }
});

/**
 * POST /rebuy
 *
 * Allows a seated player to add more chips to their table balance from escrow.
 *
 * Auth:
 * - Requires wallet signature authentication via requireWalletAuth middleware
 *
 * Request:
 * - Body: {
 *     tableId: number,        // Table ID where player is seated
 *     rebuyAmountGwei: string // Amount to add in gwei
 *   }
 * - Query params:
 *   - walletAddress: string (Ethereum address - must match connected wallet)
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *
 * Response:
 * - 200: {
 *     id: number,
 *     tableId: number,
 *     walletAddress: string,
 *     seatNumber: number,
 *     tableBalanceGwei: string,
 *     twitterHandle: string | null,
 *     twitterAvatarUrl: string | null,
 *     joinedAt: string
 *   }
 *
 * Error model:
 * - 400: { error: "Invalid request"; message: string } - Invalid parameters or validation failure
 * - 401: { error: "Unauthorized"; message: string } - Invalid or missing authentication
 * - 404: { error: "Not found"; message: string } - No active session or table not found
 * - 409: { error: "Conflict"; message: string } - Pending withdrawal or active hand participation
 * - 500: { error: "Failed to rebuy"; message: string } - Server error
 *
 * Side effects:
 * - Creates a join_table event in the database (with isRebuy flag)
 * - Deducts rebuy amount from player's escrow balance
 * - Updates table seat session balance (atomic transaction)
 * - Fails if user has pending withdrawal
 * - Fails if user is participating in an active hand
 *
 * @param {Request} req - Express request object with walletAddress attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.post('/rebuy', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const { tableId, rebuyAmountGwei } = req.body;

    // Validate request body
    if (tableId === undefined || !rebuyAmountGwei) {
      throw new ValidationError('tableId and rebuyAmountGwei are required');
    }

    // Validate types
    const tableIdNum = validateTableId(tableId);
    const rebuyAmountGweiBigInt = BigInt(rebuyAmountGwei);

    if (rebuyAmountGweiBigInt <= 0n) {
      throw new ValidationError('rebuyAmountGwei must be greater than 0');
    }

    // Process the rebuy
    const session = await rebuy(walletAddress, {
      tableId: tableIdNum,
      rebuyAmountGwei: rebuyAmountGweiBigInt,
    });

    res.status(200).json({
      id: session.id,
      tableId: session.tableId,
      walletAddress: session.walletAddress,
      seatNumber: session.seatNumber,
      tableBalanceGwei: session.tableBalanceGwei.toString(),
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
      joinedAt: session.joinedAt.toISOString(),
    });
  } catch (error) {
    // Map service errors to appropriate HTTP status codes
    if (error instanceof Error && !(error instanceof AppError)) {
      if (error.message.includes('pending withdrawal') ||
          error.message.includes('active hand')) {
        sendErrorResponse(res, new ConflictError(error.message), 'Failed to rebuy');
        return;
      }
      
      if (error.message.includes('Insufficient escrow') ||
          error.message.includes('exceeds maximum')) {
        sendErrorResponse(res, new ValidationError(error.message), 'Failed to rebuy');
        return;
      }
      
      if (error.message.includes('No active session') ||
          error.message.includes('not found') ||
          error.message.includes('not active')) {
        sendErrorResponse(res, new NotFoundError(error.message), 'Failed to rebuy');
        return;
      }
    }
    
    sendErrorResponse(res, error, 'Failed to rebuy');
  }
});

/**
 * GET /currentHand
 *
 * Gets the current active hand for a table, including all hand state.
 *
 * Auth:
 * - Requires wallet signature authentication via requireWalletAuth middleware
 *
 * Request:
 * - Query params:
 *   - tableId: number (required) - Table ID to get hand for
 *   - walletAddress: string (required) - Wallet address (for authentication and to return user's hole cards)
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *
 * Response:
 * - 200: {
 *     handId: number,
 *     status: string,
 *     round: string | null,
 *     communityCards: Array<{suit: string, rank: string}>,
 *     players: Array<{
 *       seatNumber: number,
 *       walletAddress: string,
 *       twitterHandle: string | null,
 *       twitterAvatarUrl: string | null,
 *       status: string,
 *       chipsCommitted: string,
 *       holeCards: Array<{suit: string, rank: string}> | null  // Only for authorized player if active
 *     }>,
 *     pots: Array<{
 *       potNumber: number,
 *       amount: string,
 *       eligibleSeatNumbers: number[]
 *     }>,
 *     dealerPosition: number | null,
 *     smallBlindSeat: number | null,
 *     bigBlindSeat: number | null,
 *     currentActionSeat: number | null,
 *     currentBet: string | null,
 *     lastRaiseAmount: string | null
 *   }
 * - 404: { error: "NOT_FOUND"; message: string } - No active hand found
 * - 401: { error: "UNAUTHORIZED"; message: string } - Unauthorized
 *
 * @param {Request} req - Express request object with walletAddress attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/currentHand', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const tableId = req.query.tableId;

    // Validate query params
    if (!tableId) {
      throw new ValidationError('tableId is required');
    }

    const tableIdNum = validateTableId(tableId);

    // Get current hand response with hole cards for authorized player
    const handResponse = await getCurrentHandResponse(tableIdNum, walletAddress, true);

    res.status(200).json(handResponse);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to get current hand');
  }
});

/**
 * GET /watchCurrentHand
 *
 * Gets the current active hand for a table, including all hand state, without requiring authentication.
 * This endpoint is used for watching a hand when not logged in.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - tableId: number (required) - Table ID to get hand for
 *
 * Response:
 * - 200: {
 *     handId: number,
 *     status: string,
 *     round: string | null,
 *     communityCards: Array<{suit: string, rank: string}>,
 *     players: Array<{
 *       seatNumber: number,
 *       walletAddress: string,
 *       twitterHandle: string | null,
 *       twitterAvatarUrl: string | null,
 *       status: string,
 *       chipsCommitted: string,
 *       holeCards: null  // Never returns hole cards (all players)
 *     }>,
 *     pots: Array<{
 *       potNumber: number,
 *       amount: string,
 *       eligibleSeatNumbers: number[]
 *     }>,
 *     dealerPosition: number | null,
 *     smallBlindSeat: number | null,
 *     bigBlindSeat: number | null,
 *     currentActionSeat: number | null,
 *     currentBet: string | null,
 *     lastRaiseAmount: string | null
 *   }
 * - 404: { error: "NOT_FOUND"; message: string } - No active hand found
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/watchCurrentHand', async (req: Request, res: Response): Promise<void> => {
  try {
    const tableId = req.query.tableId;

    // Validate query params
    if (!tableId) {
      throw new ValidationError('tableId is required');
    }

    const tableIdNum = validateTableId(tableId);

    // Get current hand response without hole cards (public viewing)
    const handResponse = await getCurrentHandResponse(tableIdNum, undefined, false);

    res.status(200).json(handResponse);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to get current hand');
  }
});

/**
 * POST /action
 *
 * Process a player action (fold, call, raise) during a poker hand.
 *
 * Auth:
 * - Requires wallet signature in query params
 * - Uses requireWalletAuth middleware to verify authentication
 *
 * Request:
 * - Query params:
 *   - address: string (required) - Wallet address
 *   - signature: string (required) - Signature for authentication
 * - Body:
 *   - tableId: number (required) - Table ID
 *   - action: string (required) - Action type ('FOLD', 'CALL', 'CHECK', 'BET', 'RAISE', 'ALL_IN')
 *   - amountGwei?: string (optional) - Bet/raise amount in gwei (required for BET/RAISE)
 *   - amount?: number (optional) - Bet amount for RAISE (in gwei)
 *
 * Response:
 * - 200: { success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }
 * - 400: { error: string; message: string } - Invalid request
 * - 401: { error: string; message: string } - Unauthorized
 * - 404: { error: string; message: string } - Hand/table not found
 * - 409: { error: string; message: string } - Not player's turn or invalid state
 * - 500: { error: string; message: string } - Server error
 *
 * Error model:
 * - Validation errors for missing/invalid parameters
 * - State errors for invalid game state (not player's turn, already folded, etc.)
 */
app.post('/action', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const { tableId, action } = req.body;

    // Validate request body
    if (!tableId) {
      throw new ValidationError('tableId is required');
    }

    if (!action) {
      throw new ValidationError('action is required');
    }

    const tableIdNum = validateTableId(tableId);

    // Validate action type
    const validActions = ['FOLD', 'CALL', 'CHECK', 'BET', 'RAISE', 'ALL_IN'];
    if (!validActions.includes(action)) {
      throw new ValidationError(`Invalid action. Must be one of: ${validActions.join(', ')}`);
    }

    let result;
    if (action === 'FOLD') {
      result = await foldAction(prisma, tableIdNum, walletAddress);
    } else if (action === 'CALL') {
      result = await callAction(prisma, tableIdNum, walletAddress);
    } else if (action === 'CHECK') {
      result = await checkAction(prisma, tableIdNum, walletAddress);
    } else if (action === 'BET') {
      const { amountGwei } = req.body;
      if (!amountGwei) {
        throw new ValidationError('amountGwei is required for BET action');
      }
      const amount = BigInt(amountGwei);
      result = await betAction(prisma, tableIdNum, walletAddress, amount);
    } else if (action === 'RAISE') {
      const { amountGwei } = req.body;
      if (!amountGwei) {
        throw new ValidationError('amountGwei is required for RAISE action');
      }
      const amount = BigInt(amountGwei);
      
      // Check if there's a current bet - if not, this should be a BET, not a RAISE
      // (This can happen when frontend sends RAISE for all-in at start of new betting round)
      const hand = await (prisma as any).hand.findFirst({
        where: {
          tableId: tableIdNum,
          status: { not: 'COMPLETED' },
        },
      });
      
      const currentBet = hand?.currentBet || 0n;
      if (currentBet === 0n) {
        // No current bet - use BET action instead
        result = await betAction(prisma, tableIdNum, walletAddress, amount);
      } else {
        // Current bet exists - use RAISE action
        result = await raiseAction(prisma, tableIdNum, walletAddress, amount);
      }
    } else if (action === 'ALL_IN') {
      // ALL_IN is now handled as a RAISE with the player's full stack (incremental amount)
      // Get current hand and player state to get tableBalanceGwei
      const hand = await (prisma as any).hand.findFirst({
        where: {
          tableId: tableIdNum,
          status: { not: 'COMPLETED' },
        },
        include: {
          players: true,
        },
      });

      if (!hand) {
        throw new NotFoundError('No active hand found');
      }

      // Get player's seat session
      const seatSession = await prisma.tableSeatSession.findFirst({
        where: {
          tableId: tableIdNum,
          walletAddress: walletAddress.toLowerCase(),
          isActive: true,
        },
      });

      if (!seatSession) {
        throw new NotFoundError('Player not seated at table');
      }

      // Get hand player record
      const handPlayer = hand.players.find(
        (p: any) => p.seatNumber === seatSession.seatNumber
      );

      if (!handPlayer) {
        throw new NotFoundError('Player not in hand');
      }

      // For all-in, the incremental amount is the player's entire remaining balance
      const allInIncrementalAmount = seatSession.tableBalanceGwei;
      const currentBet = hand.currentBet || 0n;

      // ALL_IN is handled as a BET if currentBet === 0, otherwise as a RAISE
      if (currentBet === 0n) {
        // No current bet - use BET action
        result = await betAction(prisma, tableIdNum, walletAddress, allInIncrementalAmount);
      } else {
        // Current bet exists - use RAISE action
        result = await raiseAction(prisma, tableIdNum, walletAddress, allInIncrementalAmount);
      }
    } else {
      throw new ValidationError(`Action ${action} is not implemented`);
    }

    res.status(200).json({
      success: result.success,
      handEnded: result.handEnded,
      roundAdvanced: result.roundAdvanced || false,
      tableId: result.tableId,
      winnerSeatNumber: result.winnerSeatNumber,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to process action');
  }
});

/**
 * GET /events
 *
 * Returns the most recent events from the event table.
 * Requires admin authentication via signature.
 *
 * Auth:
 * - Requires admin signature in Authorization header
 * - Uses requireAdminAuth middleware to verify authentication
 *
 * Request:
 * - Headers:
 *   - Authorization: string (required) - Session signature from localStorage (Bearer token)
 *   - Content-Type: application/json
 * - Query params:
 *   - limit: number (optional) - Maximum number of events to return (default: 50, max: 100)
 *
 * Response:
 * - 200: Array of event objects
 *   - Each event includes: eventId, blockTs, player, kind, payloadJson, digest,
 *     sigR, sigS, sigV, nonce, teeVersion, teePubkey, ingestedAt
 *   - Events are ordered by eventId descending (newest first)
 *   - BigInt fields (nonce) are returned as strings
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid limit parameter
 * - 401: { error: string; message: string } - Unauthorized (not admin or invalid signature)
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object (with adminAddress attached by middleware)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/events', requireAdminAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse limit from query params
    const limitParam = req.query.limit;
    let limit = 50; // Default limit

    if (limitParam) {
      const parsedLimit = parseInt(limitParam as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        throw new ValidationError('limit must be a number between 1 and 100');
      }
      limit = parsedLimit;
    }

    const events = await getRecentEvents(limit);

    // Convert BigInt fields to strings for JSON response and verify signatures
    const eventsJson = events.map((event) => {
      // Verify signature
      const isValid = verifyEventSignature(
        event.kind,
        event.payloadJson,
        event.digest,
        event.sigR,
        event.sigS,
        event.sigV,
        event.teePubkey,
        event.nonce
      );

      return {
        eventId: event.eventId,
        blockTs: event.blockTs.toISOString(),
        player: event.player,
        kind: event.kind,
        payloadJson: event.payloadJson,
        digest: event.digest,
        sigR: event.sigR,
        sigS: event.sigS,
        sigV: event.sigV,
        nonce: event.nonce?.toString() || null,
        teeVersion: event.teeVersion,
        teePubkey: event.teePubkey,
        ingestedAt: event.ingestedAt.toISOString(),
        signatureValid: isValid,
      };
    });

    res.status(200).json(eventsJson);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch events');
  }
});

/**
 * GET /tee/publicKey
 *
 * Returns the TEE's public key (Ethereum address) that is used to authorize
 * withdrawals and other operations on the smart contract.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - No path params, query params, headers, or body required
 *
 * Response:
 * - 200: { publicKey: string }
 *   - publicKey: The TEE's Ethereum address (0x-prefixed hex string, 42 characters)
 *   - This address should be used as the "house" address when deploying/upgrading the CloutCards contract
 *
 * Error model:
 * - 500: { error: string; message: string } - Server error (e.g., MNEMONIC not configured)
 *
 * @param {Request} req - Express request object (unused in this handler)
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/tee/publicKey', (req: Request, res: Response): void => {
  try {
    const publicKey = getTeePublicKey();
    res.status(200).json({ publicKey });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to retrieve TEE public key');
  }
});

/**
 * GET /playerEscrowBalance
 *
 * Returns the escrow balance for a player's wallet address.
 *
 * Auth:
 * - Requires wallet signature authentication via Authorization header
 *
 * Request:
 * - Query params:
 *   - walletAddress: string (Ethereum address)
 * - Headers:
 *   - Authorization: Bearer <signature> (session signature)
 *
 * Response:
 * - 200: { balanceGwei: string }
 *   - balanceGwei: Escrow balance in gwei (as string to handle large numbers)
 *
 * Error model:
 * - 400: { error: "Invalid request"; message: string } - Missing or invalid walletAddress
 * - 401: { error: "Unauthorized"; message: string } - Invalid or missing signature
 * - 500: { error: "Failed to fetch balance"; message: string } - Server error
 *
 * @param {Request} req - Express request object with walletAddress attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/playerEscrowBalance', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const escrowState = await getEscrowBalanceWithWithdrawal(walletAddress);
    
    res.status(200).json({
      balanceGwei: escrowState.balanceGwei.toString(),
      nextWithdrawalNonce: escrowState.nextWithdrawalNonce?.toString() || null,
      withdrawalSignatureExpiry: escrowState.withdrawalSignatureExpiry?.toISOString() || null,
      withdrawalPending: escrowState.withdrawalPending,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch balance');
  }
});

/**
 * POST /signEscrowWithdrawal
 *
 * Sign a withdrawal request for a player's escrow balance.
 *
 * Auth:
 * - Requires wallet authentication via requireWalletAuth middleware
 * - Wallet address must match the address in the session signature
 * - Player must be withdrawing from their connected wallet
 *
 * Request:
 * - Body: {
 *     amountGwei: string, // Amount to withdraw in gwei
 *     toAddress: string   // Recipient address (must match walletAddress for now)
 *   }
 * - Query params:
 *   - walletAddress: string (Ethereum address - must match connected wallet)
 *
 * Response:
 * - 200: {
 *     nonce: string,
 *     expiry: string,
 *     v: number,
 *     r: string,
 *     s: string
 *   }
 *   - nonce: Withdrawal nonce used in the signature
 *   - expiry: Expiry timestamp (Unix timestamp in seconds)
 *   - v, r, s: ECDSA signature components for the withdrawal digest
 *
 * Error model:
 * - 400: { error: "Invalid request"; message: string } - Invalid parameters or validation failure
 * - 401: { error: "Unauthorized"; message: string } - Invalid or missing signature
 * - 409: { error: "Conflict"; message: string } - Withdrawal already pending
 * - 500: { error: "Failed to sign withdrawal"; message: string } - Server error
 *
 * Side effects:
 * - Creates a withdrawal_request event in the database
 * - Updates player escrow balance with nonce and expiry (atomic transaction)
 * - Prevents race conditions by ensuring only one pending withdrawal at a time
 *
 * @param {Request} req - Express request object with walletAddress attached
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
/**
 * GET /api/tables/:tableId/events
 *
 * Server-Sent Events (SSE) stream for table events.
 * Streams events as they occur for a specific table in real-time using PostgreSQL LISTEN/NOTIFY.
 *
 * Auth:
 * - No authentication required (public endpoint for watching table events)
 *
 * Request:
 * - Path params:
 *   - tableId: number (Table ID to subscribe to)
 * - Query params:
 *   - lastEventId: number (optional) - Resume from this event ID for reconnection
 *
 * Response:
 * - Content-Type: text/event-stream
 * - Streams events in SSE format:
 *   - id: {eventId}\n
 *   - data: {payloadJson}\n\n
 * - Events are filtered by tableId
 * - Automatically reconnects if connection drops (browser handles this)
 *
 * Error model:
 * - 400: Invalid table ID
 * - 500: Server error (connection issues, etc.)
 *
 * @param req - Express request object
 * @param res - Express response object
 */
app.get('/api/tables/:tableId/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const tableId = parseInt(req.params.tableId, 10);
    const lastEventIdParam = req.query.lastEventId
      ? parseInt(req.query.lastEventId as string, 10)
      : null;

    if (isNaN(tableId)) {
      res.status(400).json({ error: 'Invalid table ID' });
      return;
    }

    // Validate lastEventId if provided
    if (lastEventIdParam !== null && (isNaN(lastEventIdParam) || lastEventIdParam < 0)) {
      res.status(400).json({ error: 'Invalid lastEventId' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if using nginx

    // Send initial connection message
    res.write(': connected\n\n');

    // Only send missed events if lastEventId is provided and > 0 (reconnection scenario)
    // If lastEventId is 0 or not provided, skip missed events (fresh page load)
    if (lastEventIdParam !== null && lastEventIdParam > 0) {
      try {
        const missedEvents = await prisma.event.findMany({
          where: {
            tableId: tableId,
            eventId: { gt: lastEventIdParam },
          },
          orderBy: { eventId: 'asc' },
          take: 100, // Limit to prevent huge initial payload
        });

        console.log(`[SSE] Sending ${missedEvents.length} missed events for table ${tableId} (lastEventId: ${lastEventIdParam})`);

        for (const event of missedEvents) {
          res.write(`id: ${event.eventId}\n`);
          res.write(`data: ${event.payloadJson}\n\n`);
        }
      } catch (error) {
        console.error(`[SSE] Error fetching missed events for table ${tableId}:`, error);
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: 'Failed to fetch missed events' })}\n\n`);
      }
    } else {
      console.log(`[SSE] Skipping missed events for table ${tableId} (fresh page load, lastEventId: ${lastEventIdParam})`);
    }

    // Set up notification listener for new events
    // Only send events that match this tableId
    const notificationHandler = (notification: EventNotification) => {
      // Only send if it's for this table and newer than lastEventId (if provided)
      const minEventId = lastEventIdParam !== null && lastEventIdParam > 0 ? lastEventIdParam : 0;
      if (notification.tableId === tableId && notification.eventId > minEventId) {
        // Fetch the full event to get payloadJson
        prisma.event
          .findUnique({
            where: { eventId: notification.eventId },
            select: { eventId: true, payloadJson: true },
          })
          .then((event) => {
            if (event && !res.closed) {
              try {
                res.write(`id: ${event.eventId}\n`);
                res.write(`data: ${event.payloadJson}\n\n`);
              } catch (error) {
                console.error(`[SSE] Error writing event ${event.eventId} to stream:`, error);
              }
            }
          })
          .catch((error) => {
            console.error(`[SSE] Error fetching event ${notification.eventId}:`, error);
          });
      }
    };

    // Register callback for this connection (game events via PostgreSQL LISTEN/NOTIFY)
    const unsubscribeEvents = registerEventCallback(notificationHandler);

    // Register for chat messages (in-memory pub/sub, no database)
    const unsubscribeChat = subscribeToChat(tableId, res);

    // Keep connection alive with periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (!res.closed) {
        try {
          res.write(': heartbeat\n\n');
        } catch (error) {
          clearInterval(heartbeatInterval);
          unsubscribeEvents(); // Unregister game events callback on error
          unsubscribeChat(); // Unregister chat callback on error
        }
      } else {
        clearInterval(heartbeatInterval);
        unsubscribeEvents(); // Unregister game events callback when connection closed
        unsubscribeChat(); // Unregister chat callback when connection closed
      }
    }, 30000); // Send heartbeat every 30 seconds

    // Handle client disconnect - cleanup
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribeEvents(); // Unregister game events callback
      unsubscribeChat(); // Unregister chat callback
      console.log(`[SSE] Client disconnected from table ${tableId} events stream`);
    });
  } catch (error) {
    console.error('[SSE] Error setting up event stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to set up event stream' });
    } else {
      res.end();
    }
  }
});

/**
 * GET /lobby/events
 *
 * Server-Sent Events (SSE) stream for lobby chat.
 * Streams chat messages for the game lobby (/play page) in real-time.
 * Unlike table events, this only handles chat - no game events.
 *
 * Auth:
 * - No authentication required (public endpoint for watching lobby chat)
 *
 * Response:
 * - Content-Type: text/event-stream
 * - Streams chat messages in SSE format:
 *   - id: {messageId}\n
 *   - data: {payloadJson}\n\n
 *
 * Side effects:
 * - Registers connection for lobby chat broadcasts
 * - Automatically unregisters on connection close
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
app.get('/lobby/events', (req: Request, res: Response): void => {
  try {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if using nginx

    // Send initial connection message
    res.write(': connected to lobby events\n\n');

    console.log('[SSE] Client connected to lobby events stream');

    // Register for lobby chat messages (in-memory pub/sub, no database)
    const unsubscribeChat = subscribeToChat(LOBBY_CHANNEL_ID, res);

    // Keep connection alive with periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (!res.closed) {
        try {
          res.write(': heartbeat\n\n');
        } catch (error) {
          clearInterval(heartbeatInterval);
          unsubscribeChat();
        }
      } else {
        clearInterval(heartbeatInterval);
        unsubscribeChat();
      }
    }, 30000); // Send heartbeat every 30 seconds

    // Handle client disconnect - cleanup
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribeChat();
      console.log('[SSE] Client disconnected from lobby events stream');
    });
  } catch (error) {
    console.error('[SSE] Error setting up lobby event stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to set up lobby event stream' });
    } else {
      res.end();
    }
  }
});

app.post('/signEscrowWithdrawal', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const { amountGwei, toAddress } = req.body;

    // Validate request body
    if (!amountGwei || !toAddress) {
      throw new ValidationError('amountGwei and toAddress are required');
    }

    // Validate toAddress matches walletAddress (for now, player must withdraw to their own wallet)
    if (ethers.getAddress(toAddress.toLowerCase()) !== ethers.getAddress(walletAddress.toLowerCase())) {
      throw new ValidationError('toAddress must match walletAddress');
    }

    // Parse amountGwei
    let amountGweiBigInt: bigint;
    try {
      amountGweiBigInt = BigInt(amountGwei);
    } catch (error) {
      throw new ValidationError('amountGwei must be a valid number');
    }

    // Sign the withdrawal request
    const signature = await signEscrowWithdrawal(
      walletAddress,
      toAddress,
      amountGweiBigInt
    );

    res.status(200).json({
      nonce: signature.nonce.toString(),
      expiry: signature.expiry.toString(),
      v: signature.v,
      r: signature.r,
      s: signature.s,
    });
  } catch (error) {
    // Map service errors to appropriate HTTP status codes
    if (error instanceof Error && !(error instanceof AppError)) {
      if (error.message.includes('already pending')) {
        sendErrorResponse(res, new ConflictError(error.message), 'Withdrawal already pending');
        return;
      }
      
      if (error.message.includes('exceeds escrow balance')) {
        sendErrorResponse(res, new ValidationError(error.message), 'Invalid withdrawal amount');
        return;
      }

      // Handle nonce mismatch / blockchain sync errors
      if (error.message.includes('syncing with the blockchain')) {
        sendErrorResponse(res, new ConflictError(error.message), 'Withdrawal sync required');
        return;
      }
    }
    
    sendErrorResponse(res, error, 'Failed to sign withdrawal');
  }
});

/**
 * GET /api/tables/:tableId/handHistory
 *
 * Returns the history of completed hands for a specific table.
 * Provides summary information including winners, pot sizes, and community cards.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Path params:
 *   - tableId: number (Table ID to get history for)
 * - Query params:
 *   - limit: number (optional, max 50, default 20)
 *
 * Response:
 * - 200: Array of hand summaries
 *   - Each entry includes: id, startedAt, completedAt, winners, totalPot, communityCards
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid tableId or limit
 * - 404: { error: string; message: string } - Table not found
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/api/tables/:tableId/handHistory', async (req: Request, res: Response): Promise<void> => {
  try {
    const tableId = parseInt(req.params.tableId, 10);
    if (isNaN(tableId)) {
      throw new ValidationError('Invalid table ID');
    }

    // Parse and validate limit
    let limit = 20;
    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
        throw new ValidationError('limit must be a number between 1 and 50');
      }
      limit = parsedLimit;
    }

    // Verify table exists
    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      select: { id: true, name: true },
    });

    if (!table) {
      throw new NotFoundError('Table not found');
    }

    // Fetch completed hands with related data
    const hands = await prisma.hand.findMany({
      where: {
        tableId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
      include: {
        pots: {
          select: {
            potNumber: true,
            amount: true,
            winnerSeatNumbers: true,
          },
        },
        players: {
          select: {
            seatNumber: true,
            walletAddress: true,
            holeCards: true,
            status: true,
          },
        },
      },
    });

    // Transform to response format
    const handSummaries = hands.map((hand) => {
      // Calculate total pot
      const totalPot = hand.pots.reduce((sum, pot) => sum + pot.amount, 0n);

      // Get winner info from pots
      const winnerSeats = new Set<number>();
      hand.pots.forEach((pot) => {
        const winners = pot.winnerSeatNumbers as number[] | null;
        if (winners) {
          winners.forEach((seat) => winnerSeats.add(seat));
        }
      });

      // Map winners to their wallet addresses and amounts
      const winners = Array.from(winnerSeats).map((seatNumber) => {
        const player = hand.players.find((p) => p.seatNumber === seatNumber);
        // Calculate winnings for this player across all pots
        let winnings = 0n;
        hand.pots.forEach((pot) => {
          const potWinners = pot.winnerSeatNumbers as number[] | null;
          if (potWinners && potWinners.includes(seatNumber)) {
            winnings += pot.amount / BigInt(potWinners.length);
          }
        });
        return {
          seatNumber,
          walletAddress: player?.walletAddress || 'unknown',
          amount: winnings.toString(),
        };
      });

      return {
        id: hand.id,
        startedAt: hand.startedAt.toISOString(),
        completedAt: hand.completedAt?.toISOString() || null,
        winners,
        totalPot: totalPot.toString(),
        communityCards: hand.communityCards as any[],
        playerCount: hand.players.length,
      };
    });

    res.status(200).json(handSummaries);
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch hand history');
  }
});

/**
 * GET /api/hands/:handId/events
 *
 * Returns all events for a specific hand, including full signature data for verification.
 * Also returns the hand record with deck commitment (shuffleSeedHash).
 *
 * SECURITY: Sensitive fields (deck, shuffleSeed, deckNonce) are only revealed for
 * COMPLETED hands to prevent mid-hand deck leakage. For active hands, these fields
 * return null.
 *
 * Auth:
 * - No authentication required (public endpoint for transparency)
 *
 * Request:
 * - Path params:
 *   - handId: number (Hand ID to get events for)
 *
 * Response:
 * - 200: {
 *     hand: {
 *       id, shuffleSeedHash,
 *       shuffleSeed (null if not completed),
 *       deckNonce (null if not completed),
 *       deck (null if not completed),
 *       startedAt, completedAt, communityCards
 *     },
 *     events: Array of events with signature data
 *   }
 *
 * Error model:
 * - 400: { error: string; message: string } - Invalid handId
 * - 404: { error: string; message: string } - Hand not found
 * - 500: { error: string; message: string } - Server error
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 *
 * @returns {void} Sends response directly via res.json()
 */
app.get('/api/hands/:handId/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const handId = parseInt(req.params.handId, 10);
    if (isNaN(handId)) {
      throw new ValidationError('Invalid hand ID');
    }

    // Fetch the hand with all related data
    const hand = await prisma.hand.findUnique({
      where: { id: handId },
      include: {
        players: {
          select: {
            seatNumber: true,
            walletAddress: true,
            holeCards: true,
            status: true,
          },
        },
        pots: {
          select: {
            potNumber: true,
            amount: true,
            winnerSeatNumbers: true,
          },
        },
      },
    });

    if (!hand) {
      throw new NotFoundError('Hand not found');
    }

    // Fetch wallet-to-Twitter handle mapping from TableSeatSession
    // This allows us to display Twitter handles for player actions
    const sessions = await prisma.tableSeatSession.findMany({
      where: {
        tableId: hand.tableId,
        walletAddress: {
          in: hand.players.map((p) => p.walletAddress),
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
      select: {
        walletAddress: true,
        twitterHandle: true,
      },
    });

    // Create a map of wallet address to Twitter handle (use most recent session per wallet)
    const walletToTwitter: Record<string, string> = {};
    for (const session of sessions) {
      const lowerAddr = session.walletAddress.toLowerCase();
      if (!walletToTwitter[lowerAddr] && session.twitterHandle) {
        walletToTwitter[lowerAddr] = session.twitterHandle;
      }
    }

    // Fetch all events related to this hand
    // Events are filtered by looking for hand.id in the payloadJson
    const events = await prisma.event.findMany({
      where: {
        OR: [
          // Match hand_start, hand_end, community_cards events for this hand
          {
            kind: { in: ['hand_start', 'hand_end', 'community_cards'] },
            payloadJson: { contains: `"id":${handId}` },
          },
          // Match bet events (player actions - stored as 'bet' kind)
          {
            kind: 'bet',
            payloadJson: { contains: `"id":${handId}` },
          },
        ],
      },
      orderBy: {
        eventId: 'asc',
      },
      select: {
        eventId: true,
        kind: true,
        payloadJson: true,
        digest: true,
        sigR: true,
        sigS: true,
        sigV: true,
        teePubkey: true,
        teeVersion: true,
        blockTs: true,
      },
    });

    // Return hand data with deck for verification, and all events with signatures
    // SECURITY: Only reveal deck, shuffleSeed, and deckNonce for COMPLETED hands
    // to prevent mid-hand deck leakage
    const isCompleted = hand.status === 'COMPLETED';
    
    res.status(200).json({
      hand: {
        id: hand.id,
        tableId: hand.tableId,
        shuffleSeedHash: hand.shuffleSeedHash,
        // Only reveal sensitive data after hand completion
        shuffleSeed: isCompleted ? hand.shuffleSeed : null,
        deckNonce: isCompleted ? hand.deckNonce : null,
        deck: isCompleted ? hand.deck : null,
        startedAt: hand.startedAt.toISOString(),
        completedAt: hand.completedAt?.toISOString() || null,
        communityCards: hand.communityCards,
        dealerPosition: hand.dealerPosition,
        players: hand.players,
        pots: hand.pots.map((pot) => ({
          potNumber: pot.potNumber,
          amount: pot.amount.toString(),
          winnerSeatNumbers: pot.winnerSeatNumbers,
        })),
      },
      events: events.map((event) => ({
        eventId: event.eventId,
        kind: event.kind,
        payloadJson: event.payloadJson,
        digest: event.digest,
        sigR: event.sigR,
        sigS: event.sigS,
        sigV: event.sigV,
        teePubkey: event.teePubkey,
        teeVersion: event.teeVersion,
        blockTs: event.blockTs.toISOString(),
      })),
      // Include EIP-712 domain info for client-side verification
      eip712Domain: {
        name: 'CloutCardsEvents',
        version: '1',
        chainId: parseInt(process.env.CHAIN_ID || '31337', 10),
        verifyingContract: ethers.ZeroAddress,
      },
      // Wallet address to Twitter handle mapping for display
      walletToTwitter,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to fetch hand events');
  }
});

/**
 * Starts the Express server and begins listening for incoming connections
 *
 * Binds the Express application to the specified port and starts accepting HTTP requests.
 * Logs the port number to console when server is ready. Server runs indefinitely
 * until stopped via process termination or explicit shutdown.
 *
 * @param {number} port - Port number to listen on
 *   - Must be a valid port number (typically 1-65535)
 *   - Should not conflict with other services running on the system
 *
 * @param {Function} callback - Callback function executed when server starts listening
 *   - Called once the server has successfully bound to the port
 *   - Receives no parameters
 *   - Logs server startup message to console
 *
 * @returns {void} Does not return a value, server runs indefinitely until stopped
 *
 * @throws {Error} If port is already in use or invalid
 *   - EADDRINUSE: Port is already bound by another process
 *   - EACCES: Insufficient permissions to bind to port (common for ports < 1024)
 *   - Other system-level errors related to network binding
 *
 * Side effects:
 * - Binds to network port (I/O operation)
 * - Logs to console (I/O operation)
 * - Keeps process alive indefinitely
 */
/**
 * Starts the server after running database migrations
 *
 * Ensures database schema is up to date before accepting HTTP requests.
 * If migrations fail, the server will not start.
 */
(async () => {
  // Run database migrations before starting the server
  // This ensures the database schema is up to date before accepting requests
  try {
    await runMigrations();
  } catch (error) {
    console.error('❌ Failed to run database migrations. Server will not start.');
    console.error('Please ensure database is accessible and migrations can be applied.');
    console.error(error);
    process.exit(1);
  }

  // Start the server after migrations succeed
  app.listen(APP_PORT, async (): Promise<void> => {
  console.log(`Server is running on port ${APP_PORT}`);
  
  // Initialize event notifier for SSE
  try {
    await initializeEventNotifier();
    console.log('✅ Event notifier initialized for SSE');
  } catch (error) {
    console.error('⚠️  Failed to initialize event notifier:', error);
    console.error('SSE endpoints will not receive real-time updates');
  }
  
  // Start listening to contract events if contract address is configured
  const contractAddress = process.env.CLOUTCARDS_CONTRACT_ADDRESS;
  if (contractAddress) {
    try {
      // For local development, always use Anvil default RPC (not from env)
      // For production, use RPC_URL env var
      const isProd = isProduction();
      const rpcUrl = isProd ? process.env.RPC_URL : undefined; // undefined = use default Anvil
      startContractListener(contractAddress, rpcUrl);
    } catch (error) {
      console.error('Failed to start contract listener:', error);
      console.error('Contract events will not be processed. Set CLOUTCARDS_CONTRACT_ADDRESS to enable.');
    }
  } else {
    console.log('⚠️  CLOUTCARDS_CONTRACT_ADDRESS not set - contract event listener not started');
  }
  
  // Start action timeout checker (checks every 1.5 seconds)
  try {
    startActionTimeoutChecker(1500);
    console.log('✅ Action timeout checker started');
  } catch (error) {
    console.error('⚠️  Failed to start action timeout checker:', error);
  }

  // Start hand start checker (checks every 1.5 seconds)
  try {
    startHandStartChecker(1500);
    console.log('✅ Hand start checker started');
  } catch (error) {
    console.error('⚠️  Failed to start hand start checker:', error);
  }
  });
})();
