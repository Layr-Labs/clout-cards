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
import { constructDatabaseUrl } from "./src/config/database";

// Note: constructDatabaseUrl is imported from shared config to avoid duplication

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
