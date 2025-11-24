/**
 * TEE Backend Service Layer (Frontend)
 *
 * Provides a clean abstraction for making RPC calls to the TEE backend from the frontend.
 * Handles request/response formatting, error handling, and timeouts.
 *
 * All RPC calls are made to the TEE endpoint configured via environment variables.
 * The service automatically handles local vs production endpoint configuration.
 */

import { getTeeEndpoint, getTeeTimeout, getTeeApiVersion } from '../config/env';

/**
 * TEE RPC request payload
 */
export interface TeeRpcRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

/**
 * TEE RPC response
 */
export interface TeeRpcResponse<T = unknown> {
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id?: string | number;
}

/**
 * TEE service error
 */
export class TeeServiceError extends Error {
  public readonly code?: number;
  public readonly data?: unknown;

  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = 'TeeServiceError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Makes an RPC call to the TEE backend
 *
 * @param method - RPC method name
 * @param params - Optional parameters object
 * @param timeout - Optional timeout override (defaults to VITE_TEE_TIMEOUT env var)
 *
 * @returns Promise resolving to the RPC result
 * @throws {TeeServiceError} If the RPC call fails or returns an error
 * @throws {Error} If the request fails (network error, timeout, etc.)
 */
export async function callTeeRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  timeout?: number
): Promise<T> {
  const endpoint = getTeeEndpoint();
  const apiVersion = getTeeApiVersion();
  const requestTimeout = timeout || getTeeTimeout();

  const url = `${endpoint}/api/${apiVersion}/rpc`;

  const request: TeeRpcRequest = {
    method,
    params: params || {},
    id: Date.now().toString(), // Simple ID generation
  };

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new TeeServiceError(
        `TEE backend returned HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const data = (await response.json()) as TeeRpcResponse<T>;

    // Check for RPC-level error
    if (data.error) {
      throw new TeeServiceError(
        data.error.message || 'Unknown RPC error',
        data.error.code,
        data.error.data
      );
    }

    if (data.result === undefined) {
      throw new TeeServiceError('RPC response missing result field');
    }

    return data.result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof TeeServiceError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new TeeServiceError(
          `TEE RPC call timed out after ${requestTimeout}ms`,
          408 // Request Timeout
        );
      }
      throw new TeeServiceError(
        `Network error calling TEE backend: ${error.message}`,
        undefined,
        error
      );
    }

    throw new TeeServiceError('Unknown error calling TEE backend');
  }
}

/**
 * Health check for TEE backend
 *
 * @returns Promise resolving to true if TEE is healthy, false otherwise
 */
export async function checkTeeHealth(): Promise<boolean> {
  try {
    const endpoint = getTeeEndpoint();
    const response = await fetch(`${endpoint}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout for health checks
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Gets TEE backend information
 *
 * @returns Promise resolving to TEE backend info
 */
export async function getTeeInfo(): Promise<{
  version?: string;
  chainId?: number;
  houseAddress?: string;
  [key: string]: unknown;
}> {
  return callTeeRpc('tee_info');
}

