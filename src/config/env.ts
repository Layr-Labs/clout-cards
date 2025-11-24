/**
 * Environment configuration and utilities
 *
 * Centralizes environment variable access, environment detection, and common
 * configuration logic used across the backend.
 */

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
export function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  );
}

/**
 * Parses an integer environment variable with validation
 *
 * @param envVar - Environment variable name
 * @param defaultValue - Default value if env var is not set
 * @param min - Optional minimum value (inclusive)
 * @returns Parsed integer value
 * @throws {Error} If value is invalid or below minimum
 */
export function parseIntEnv(envVar: string, defaultValue: number, min: number = 0): number {
  const value = process.env[envVar];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min) {
    throw new Error(`Invalid ${envVar}: "${value}". Must be an integer >= ${min}.`);
  }
  return parsed;
}

/**
 * Gets a string environment variable with optional default
 *
 * @param envVar - Environment variable name
 * @param defaultValue - Default value if env var is not set
 * @returns Environment variable value or default
 */
export function getStringEnv(envVar: string, defaultValue: string): string {
  return process.env[envVar] || defaultValue;
}
