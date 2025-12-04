/**
 * Database configuration utilities
 *
 * Centralizes database connection URL construction logic used across
 * the backend (Prisma client, Prisma config, etc.).
 */

import { isProduction } from './env';

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
export function constructDatabaseUrl(): string {
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
    // AWS RDS requires SSL connections - add sslmode=require for production
    return `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}?sslmode=require`;
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

