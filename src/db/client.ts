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
import dotenv from 'dotenv';

dotenv.config();

/**
 * Determines if we're running in production
 *
 * Production is detected when:
 * - NODE_ENV === 'production', OR
 * - ENVIRONMENT === 'production'
 *
 * Otherwise, assumes local development.
 *
 * @returns true if in production, false for local development
 */
function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  );
}

/**
 * Default database configuration for local development
 *
 * These values match the Docker Compose setup and allow developers to run
 * locally without setting any environment variables.
 */
const LOCAL_DB_CONFIG = {
  host: 'localhost',
  port: '5432',
  username: 'cloutcards',
  password: 'cloutcards',
  database: 'cloutcards_dev',
};

/**
 * Constructs the PostgreSQL connection URL from individual environment variables
 *
 * For local development, uses hardcoded defaults that match docker-compose.yml:
 * - DB_HOST: 'localhost' (default)
 * - DB_PORT: '5432' (default)
 * - DB_USERNAME: 'cloutcards' (default)
 * - DB_PASSWORD: 'cloutcards' (default)
 * - DB_NAME: 'cloutcards_dev' (default)
 *
 * Environment variables can override defaults if needed for custom local setups.
 *
 * For production, requires:
 * - DB_HOST (required - RDS endpoint)
 * - DB_PORT (defaults to '5432')
 * - DB_USERNAME (required)
 * - DB_PASSWORD (required)
 * - DB_NAME (required)
 *
 * @returns PostgreSQL connection URL string
 * @throws {Error} If required environment variables are missing in production
 */
function constructDatabaseUrl(): string {
  const isProd = isProduction();

  if (isProd) {
    // Production: require all variables
    const username = process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || '5432';

    if (!username) {
      throw new Error('DB_USERNAME environment variable is required in production');
    }
    if (!password) {
      throw new Error('DB_PASSWORD environment variable is required in production');
    }
    if (!database) {
      throw new Error('DB_NAME environment variable is required in production');
    }
    if (!host) {
      throw new Error('DB_HOST environment variable is required in production');
    }

    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  } else {
    // Local development: use defaults, allow overrides via env vars
    const username = process.env.DB_USERNAME || LOCAL_DB_CONFIG.username;
    const password = process.env.DB_PASSWORD || LOCAL_DB_CONFIG.password;
    const database = process.env.DB_NAME || LOCAL_DB_CONFIG.database;
    const host = process.env.DB_HOST || LOCAL_DB_CONFIG.host;
    const port = process.env.DB_PORT || LOCAL_DB_CONFIG.port;

    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  }
}

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

