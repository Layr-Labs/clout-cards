/**
 * Frontend configuration utilities
 *
 * Provides helper functions for parsing and validating environment variables.
 */

/**
 * Parses an integer environment variable with validation
 *
 * @param envVar - Environment variable value (from import.meta.env)
 * @param defaultValue - Default value if env var is not set
 * @param min - Optional minimum value (inclusive)
 * @returns Parsed integer value
 * @throws {Error} If value is invalid or below minimum
 */
export function parseIntEnv(value: string | undefined, defaultValue: number, min: number = 0): number {
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min) {
    throw new Error(`Invalid environment variable: "${value}". Must be an integer >= ${min}.`);
  }
  return parsed;
}

/**
 * Gets a string environment variable with optional default
 *
 * @param value - Environment variable value (from import.meta.env)
 * @param defaultValue - Default value if env var is not set
 * @returns Environment variable value or default
 */
export function getStringEnv(value: string | undefined, defaultValue: string): string {
  return value || defaultValue;
}

/**
 * Removes trailing slashes from a URL string
 *
 * @param url - URL string to normalize
 * @returns URL without trailing slash
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

