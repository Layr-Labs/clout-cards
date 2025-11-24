/**
 * Configuration utilities
 *
 * Provides helper functions for parsing and validating environment variables.
 */

/**
 * Removes trailing slashes from a URL string
 *
 * @param url - URL string to normalize
 * @returns URL without trailing slash
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

