/**
 * Database client initialization and connection management
 *
 * This module provides a Prisma client instance configured for PostgreSQL.
 * The database connection URL is constructed from individual environment variables
 * (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME) to avoid configuration errors.
 *
 * The client automatically detects the environment (production vs local development)
 * and uses appropriate connection settings.
 */

import { PrismaClient } from '@prisma/client';
import { constructDatabaseUrl } from '../config/database';


/**
 * Constructs and sets the DATABASE_URL environment variable
 *
 * This must be called before PrismaClient is instantiated, as Prisma reads
 * DATABASE_URL from the environment. We construct it from individual variables
 * to prevent configuration errors.
 */
const databaseUrl = constructDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

/**
 * Prisma client instance
 *
 * Configured for PostgreSQL database connections. The connection URL is automatically
 * constructed from individual environment variables (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME)
 * to prevent configuration errors.
 *
 * Environment detection:
 * - Production: NODE_ENV=production or ENVIRONMENT=production
 * - Local development: Otherwise
 *
 * The Prisma client uses the pg driver for PostgreSQL connections and automatically
 * handles connection pooling and query optimization.
 *
 * @example
 * ```typescript
 * import { prisma } from './db/client';
 * const events = await prisma.event.findMany();
 * ```
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Closes the Prisma client connection
 *
 * Should be called during application shutdown to ensure clean disconnection.
 *
 * @returns Promise that resolves when connection is closed
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

