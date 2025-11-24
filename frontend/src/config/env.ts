/**
 * Environment configuration for frontend
 *
 * Centralizes environment variable access with proper defaults and validation.
 * Provides type-safe access to configuration values.
 *
 * Note: In Vite, environment variables must be prefixed with VITE_ to be exposed to the client.
 */

import { parseIntEnv, getStringEnv, normalizeUrl } from './utils';

/**
 * Determines if we're running in production
 *
 * Production is detected when:
 * - import.meta.env.MODE === 'production', OR
 * - VITE_ENVIRONMENT === 'production'
 *
 * Otherwise, assumes local development.
 *
 * @returns true if in production, false for local development
 */
export function isProduction(): boolean {
  return (
    import.meta.env.MODE === 'production' ||
    import.meta.env.VITE_ENVIRONMENT === 'production'
  );
}

/**
 * Gets the TEE backend endpoint URL
 *
 * For local development, defaults to http://localhost:8000 if not set.
 * 
 * Note: This is for FRONTEND only. The backend does not make RPC calls to TEE.
 * For production, requires VITE_TEE_ENDPOINT to be explicitly set.
 *
 * @returns TEE backend endpoint URL
 * @throws {Error} If VITE_TEE_ENDPOINT is not set in production
 */
export function getTeeEndpoint(): string {
  const isProd = isProduction();
  const endpoint = import.meta.env.VITE_TEE_ENDPOINT;

  if (!endpoint) {
    if (isProd) {
      throw new Error('VITE_TEE_ENDPOINT environment variable is required in production');
    } else {
      // Local development: use default
      return 'http://localhost:8000';
    }
  }

  return normalizeUrl(endpoint);
}

/**
 * Gets the TEE API timeout in milliseconds
 *
 * Defaults to 30000ms (30 seconds) if not set.
 *
 * @returns Timeout in milliseconds
 */
export function getTeeTimeout(): number {
  return parseIntEnv(import.meta.env.VITE_TEE_TIMEOUT, 30000, 1);
}

/**
 * Gets the TEE API version
 *
 * Defaults to 'v1' if not set.
 *
 * @returns API version string
 */
export function getTeeApiVersion(): string {
  return getStringEnv(import.meta.env.VITE_TEE_API_VERSION, 'v1');
}

