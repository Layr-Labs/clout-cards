/**
 * Test database setup and teardown using Testcontainers
 *
 * This file sets up a PostgreSQL container before tests run and tears it down after.
 * It also runs Prisma migrations and generates the Prisma client.
 *
 * IMPORTANT: This file starts the container and sets DATABASE_URL at the top level
 * (using top-level await) before any service modules import prisma. This ensures
 * PrismaClient instances use the test database connection string.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql';

// Start container and set DATABASE_URL BEFORE any modules that use prisma are imported
// This ensures service modules read the correct DATABASE_URL when they import prisma
console.log('Starting PostgreSQL test container...');

// Save original DATABASE_URL if it exists
const originalDatabaseUrl = process.env.DATABASE_URL;

// Start PostgreSQL container synchronously at top level
const postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
  .withDatabase('cloutcards_test')
  .withUsername('testuser')
  .withPassword('testpass')
  .start();

// Get connection string and set DATABASE_URL immediately
const connectionString = postgresContainer.getConnectionUri();

// Parse connection string to extract components
const url = new URL(connectionString);
const host = url.hostname;
const port = url.port || '5432';
const username = url.username;
const password = url.password;
const database = url.pathname.slice(1); // Remove leading '/'

// Set DATABASE_URL in environment BEFORE any modules import prisma
process.env.DATABASE_URL = connectionString;

// Also set individual DB_* variables for completeness
process.env.DB_HOST = host;
process.env.DB_PORT = port;
process.env.DB_USERNAME = username;
process.env.DB_PASSWORD = password;
process.env.DB_NAME = database;

console.log(`Test database: ${host}:${port}/${database}`);

// Now import modules that might use prisma (DATABASE_URL is already set)
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

let testPrisma: PrismaClient;

/**
 * Gets the test Prisma client instance
 * Use this in tests instead of importing prisma directly
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    throw new Error('Test database not initialized. Make sure tests are running with vitest.');
  }
  return testPrisma;
}

/**
 * Pushes schema and generates Prisma client
 * Container is already started and DATABASE_URL is already set at top level
 */
beforeAll(async () => {
  console.log('Pushing Prisma schema to test database...');
  
  // DATABASE_URL is already set in process.env at top level, so Prisma CLI will use it
  try {
    execSync(`npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss`, {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        DATABASE_URL: connectionString, // Explicitly pass to ensure it's available
      },
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error('Failed to push schema:', error);
    throw error;
  }
  
  console.log('Generating Prisma client...');
  
  // Generate Prisma client
  // DATABASE_URL is already set at top level, so Prisma will use the test database
  try {
    execSync('npx prisma generate', {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        DATABASE_URL: connectionString, // Explicitly pass to ensure it's available
      },
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error('Failed to generate Prisma client:', error);
    throw error;
  }
  
  // Create Prisma client instance for tests
  testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });
  
  // Test connection
  await testPrisma.$connect();
  
  console.log('Test database ready!');
}, 120000); // 2 minute timeout for container startup

/**
 * Cleans up database and stops container
 */
afterAll(async () => {
  console.log('Cleaning up test database...');
  
  if (testPrisma) {
    await testPrisma.$disconnect();
  }
  
  if (postgresContainer) {
    await postgresContainer.stop();
    console.log('PostgreSQL container stopped');
  }
  
  // Restore original DATABASE_URL if it existed
  if (originalDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
}, 30000); // 30 second timeout for cleanup

