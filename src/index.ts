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
import './config/env'; // Loads dotenv.config() and initializes environment
import { getAdminAddresses } from './services/admins';
import { parseIntEnv } from './config/env';

/**
 * Express application instance
 *
 * Handles HTTP requests and routing. Configured with middleware and route handlers.
 */
const app = express();

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
});
