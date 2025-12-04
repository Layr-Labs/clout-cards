/**
 * Database migration utility
 *
 * Runs Prisma migrations on application startup to ensure database schema is up to date.
 * Uses `prisma migrate deploy` which is safe for production and idempotent.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { constructDatabaseUrl } from '../config/database';

const execAsync = promisify(exec);

/**
 * Runs database migrations using Prisma migrate deploy
 *
 * This function executes `npx prisma migrate deploy` which:
 * - Applies pending migrations to the database
 * - Is idempotent (safe to run multiple times)
 * - Designed for production environments
 * - Fails if migrations cannot be applied (ensuring app doesn't start with outdated schema)
 *
 * @throws {Error} If migrations fail to apply
 */
export async function runMigrations(): Promise<void> {
  try {
    console.log('🔄 Running database migrations...');
    
    // Construct DATABASE_URL before running migrations
    // This ensures the password is properly URL-encoded and the connection string is correct
    const databaseUrl = constructDatabaseUrl();
    
    // Get the project root directory (where package.json and prisma folder are)
    const projectRoot = path.resolve(__dirname, '../..');
    
    // Run prisma migrate deploy
    // This command applies pending migrations and is safe for production
    const { stdout, stderr } = await execAsync(
      'npx prisma migrate deploy',
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          // Explicitly set DATABASE_URL to ensure it's available to Prisma
          DATABASE_URL: databaseUrl,
        },
      }
    );

    if (stdout) {
      console.log(stdout);
    }
    
    if (stderr && !stderr.includes('Already up to date')) {
      // Prisma sometimes outputs to stderr even on success, but "Already up to date" is fine
      console.warn('Migration warnings:', stderr);
    }

    console.log('✅ Database migrations completed successfully');
  } catch (error: any) {
    console.error('❌ Database migration failed:', error.message);
    if (error.stdout) {
      console.error('Migration output:', error.stdout);
    }
    if (error.stderr) {
      console.error('Migration errors:', error.stderr);
    }
    throw new Error(`Database migrations failed: ${error.message}`);
  }
}

