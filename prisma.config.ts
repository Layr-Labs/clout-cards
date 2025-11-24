/**
 * Prisma configuration file
 * 
 * Configured for PostgreSQL database connections.
 * Database connection URL is constructed from individual environment variables.
 * 
 * For local development, uses hardcoded defaults (no env vars needed):
 * - DB_HOST: 'localhost' (default)
 * - DB_PORT: '5432' (default)
 * - DB_USERNAME: 'cloutcards' (default)
 * - DB_PASSWORD: 'cloutcards' (default)
 * - DB_NAME: 'cloutcards_dev' (default)
 * 
 * For production, requires all variables via environment.
 * Environment is detected via NODE_ENV or ENVIRONMENT variables.
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Default database configuration for local development (matches docker-compose.yml)
const LOCAL_DB_CONFIG = {
  host: 'localhost',
  port: '5432',
  username: 'cloutcards',
  password: 'cloutcards',
  database: 'cloutcards_dev',
};

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  );
}

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

// Set DATABASE_URL in environment so Prisma schema validation works
process.env.DATABASE_URL = constructDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
