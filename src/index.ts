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
import { createTable, CreateTableInput, getAllTables } from './services/tables';
import { getRecentEvents } from './db/events';
import { verifyEventSignature } from './services/eventVerification';
import twitterAuthRoutes from './routes/twitterAuth';
import { getTeePublicKey } from './db/eip712';
import { requireWalletAuth } from './middleware/walletAuth';
import { getEscrowBalance, getEscrowBalanceWithWithdrawal } from './services/escrowBalance';
import { signEscrowWithdrawal } from './services/withdrawalSigning';
import { startContractListener } from './services/contractListener';
import { prisma } from './db/client';

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
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON request bodies

// Twitter OAuth routes
app.use('/', twitterAuthRoutes);

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
    console.error('Error getting admin addresses:', error);
    res.status(500).json({
      error: 'Failed to retrieve admin addresses',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
      res.status(400).json({
        error: 'Invalid request',
        message: 'Address query parameter is required',
      });
      return;
    }

    // Generate session message using reusable utility
    const message = generateSessionMessage(address);

    res.status(200).json({ message });
  } catch (error) {
    console.error('Error generating session message:', error);
    res.status(400).json({
      error: 'Invalid address',
      message: error instanceof Error ? error.message : 'Address must be a valid Ethereum address',
    });
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

    // Parse BigInt values from strings
    const createTableInput: CreateTableInput = {
      name: tableInput.name,
      minimumBuyIn: BigInt(tableInput.minimumBuyIn),
      maximumBuyIn: BigInt(tableInput.maximumBuyIn),
      perHandRake: tableInput.perHandRake,
      maxSeatCount: tableInput.maxSeatCount,
      smallBlind: BigInt(tableInput.smallBlind),
      bigBlind: BigInt(tableInput.bigBlind),
      isActive: tableInput.isActive,
    };

    // Create the table (includes event logging in transaction)
    const table = await createTable(createTableInput, adminAddress);

    // Convert BigInt fields to strings for JSON response
    res.status(200).json({
      id: table.id,
      name: table.name,
      minimumBuyIn: table.minimumBuyIn.toString(),
      maximumBuyIn: table.maximumBuyIn.toString(),
      perHandRake: table.perHandRake,
      maxSeatCount: table.maxSeatCount,
      smallBlind: table.smallBlind.toString(),
      bigBlind: table.bigBlind.toString(),
      isActive: table.isActive,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    });
  } catch (error) {
    console.error('Error creating table:', error);
    const statusCode = error instanceof Error && error.message.includes('must be') ? 400 : 500;
    res.status(statusCode).json({
      error: 'Failed to create table',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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

    // Convert BigInt fields to strings for JSON response
    const tablesJson = tables.map((table) => ({
      id: table.id,
      name: table.name,
      minimumBuyIn: table.minimumBuyIn.toString(),
      maximumBuyIn: table.maximumBuyIn.toString(),
      perHandRake: table.perHandRake,
      maxSeatCount: table.maxSeatCount,
      smallBlind: table.smallBlind.toString(),
      bigBlind: table.bigBlind.toString(),
      isActive: table.isActive,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    }));

    res.status(200).json(tablesJson);
  } catch (error) {
    console.error('Error fetching poker tables:', error);
    res.status(500).json({
      error: 'Failed to fetch poker tables',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
 *   - Each session includes: walletAddress, twitterHandle, seatNumber, joinedAt, tableBalanceGwei
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
    const tableIdParam = req.query.tableId;
    
    if (!tableIdParam) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'tableId query parameter is required',
      });
      return;
    }

    const tableId = parseInt(tableIdParam as string, 10);
    if (isNaN(tableId) || tableId <= 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'tableId must be a positive integer',
      });
      return;
    }

    // Verify table exists
    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      select: { id: true },
    });

    if (!table) {
      res.status(404).json({
        error: 'Table not found',
        message: `No table found with id: ${tableId}`,
      });
      return;
    }

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
        walletAddress: true,
        twitterHandle: true,
        seatNumber: true,
        joinedAt: true,
        tableBalanceGwei: true,
      },
    });

    // Convert BigInt fields to strings for JSON response
    const playersJson = seatSessions.map((session: {
      walletAddress: string;
      twitterHandle: string | null;
      seatNumber: number;
      joinedAt: Date;
      tableBalanceGwei: bigint;
    }) => ({
      walletAddress: session.walletAddress,
      twitterHandle: session.twitterHandle,
      seatNumber: session.seatNumber,
      joinedAt: session.joinedAt.toISOString(),
      tableBalanceGwei: session.tableBalanceGwei.toString(),
    }));

    res.status(200).json(playersJson);
  } catch (error) {
    console.error('Error fetching table players:', error);
    res.status(500).json({
      error: 'Failed to fetch table players',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
        res.status(400).json({
          error: 'Invalid request',
          message: 'limit must be a number between 1 and 100',
        });
        return;
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
    console.error('Error fetching events:', error);
    res.status(500).json({
      error: 'Failed to fetch events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    console.error('Error getting TEE public key:', error);
    res.status(500).json({
      error: 'Failed to retrieve TEE public key',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    console.error('Error fetching escrow balance:', error);
    res.status(500).json({
      error: 'Failed to fetch balance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
app.post('/signEscrowWithdrawal', requireWalletAuth({ addressSource: 'query' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const walletAddress = (req as Request & { walletAddress: string }).walletAddress;
    const { amountGwei, toAddress } = req.body;

    // Validate request body
    if (!amountGwei || !toAddress) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'amountGwei and toAddress are required',
      });
      return;
    }

    // Validate toAddress matches walletAddress (for now, player must withdraw to their own wallet)
    if (ethers.getAddress(toAddress.toLowerCase()) !== ethers.getAddress(walletAddress.toLowerCase())) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'toAddress must match walletAddress',
      });
      return;
    }

    // Parse amountGwei
    let amountGweiBigInt: bigint;
    try {
      amountGweiBigInt = BigInt(amountGwei);
    } catch (error) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'amountGwei must be a valid number',
      });
      return;
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
    console.error('Error signing escrow withdrawal:', error);
    
    // Check if it's a conflict (pending withdrawal)
    if (error instanceof Error && error.message.includes('already pending')) {
      res.status(409).json({
        error: 'Conflict',
        message: error.message,
      });
      return;
    }

    // Check if it's a validation error (amount exceeds balance)
    if (error instanceof Error && error.message.includes('exceeds escrow balance')) {
      res.status(400).json({
        error: 'Invalid request',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to sign withdrawal',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
app.listen(APP_PORT, (): void => {
  console.log(`Server is running on port ${APP_PORT}`);
  
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
});
