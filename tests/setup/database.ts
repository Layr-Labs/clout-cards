/**
 * Test database setup and teardown using Testcontainers
 *
 * This file sets up a PostgreSQL container before tests run and tears it down after.
 * It also runs Prisma migrations and generates the Prisma client.
 *
 * IMPORTANT: This file must set DATABASE_URL before any service modules are imported,
 * so that the global prisma instance in src/db/client.ts uses the test database.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

let postgresContainer: PostgreSqlContainer;
let testPrisma: PrismaClient;
let originalDatabaseUrl: string | undefined;

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
 * Sets up PostgreSQL container and runs migrations
 */
beforeAll(async () => {
  console.log('Starting PostgreSQL test container...');
  
  // Save original DATABASE_URL if it exists
  originalDatabaseUrl = process.env.DATABASE_URL;
  
  // Start PostgreSQL container
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('cloutcards_test')
    .withUsername('testuser')
    .withPassword('testpass')
    .start();

  // Get connection string
  const connectionString = postgresContainer.getConnectionUri();
  
  // Parse connection string to extract components
  // Format can be: postgresql://username:password@host:port/database
  // or: postgres://username:password@host:port/database
  const url = new URL(connectionString);
  const host = url.hostname;
  const port = url.port || '5432';
  const username = url.username;
  const password = url.password;
  const database = url.pathname.slice(1); // Remove leading '/'
  
  // Set DATABASE_URL and individual DB_* variables
  // This ensures prisma.config.ts's constructDatabaseUrl() uses the test container
  process.env.DATABASE_URL = connectionString;
  process.env.DB_HOST = host;
  process.env.DB_PORT = port;
  process.env.DB_USERNAME = username;
  process.env.DB_PASSWORD = password;
  process.env.DB_NAME = database;
  
  console.log(`Test database: ${host}:${port}/${database}`);
  
  // Clear the module cache to force re-import of modules that use prisma
  // This ensures the global prisma instance uses the test database
  if (require.cache) {
    try {
      const clientPath = require.resolve('../../src/db/client');
      if (require.cache[clientPath]) {
        delete require.cache[clientPath];
      }
    } catch (e) {
      // Module not loaded yet, that's fine
    }
  }
  
  console.log('Pushing Prisma schema to test database...');
  
  // Use db push with explicit schema path to bypass prisma.config.ts
  // This ensures we use the test container's DATABASE_URL
  try {
    execSync(`npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss`, {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        DATABASE_URL: connectionString,
      },
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error('Failed to push schema:', error);
    throw error;
  }
  
  console.log('Generating Prisma client...');
  
  // Generate Prisma client
  try {
    execSync('npx prisma generate', {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        DATABASE_URL: connectionString,
      },
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error('Failed to generate Prisma client:', error);
    throw error;
  }
  
  // Create Prisma client instance
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

