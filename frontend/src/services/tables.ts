/**
 * Table service for frontend
 *
 * Provides functions to interact with backend table endpoints.
 */

import { getBackendUrl } from '../config/env';

/**
 * Input for creating a new poker table
 */
export interface CreateTableInput {
  name: string;
  minimumBuyIn: string; // BigInt as string
  maximumBuyIn: string; // BigInt as string
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string; // BigInt as string
  bigBlind: string; // BigInt as string
  isActive?: boolean;
  adminAddress: string;
}

/**
 * Created table response
 */
export interface CreatedTable {
  id: number;
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Poker table from API
 */
export interface PokerTable {
  id: number;
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a new poker table
 *
 * @param input - Table creation parameters
 * @param signature - Session signature from localStorage
 * @returns Promise that resolves to the created table
 * @throws {Error} If the request fails or validation fails
 */
export async function createTable(
  input: CreateTableInput,
  signature: string
): Promise<CreatedTable> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/createTable`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signature}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to create table: ${response.status} ${response.statusText}`
    );
  }

  const table: CreatedTable = await response.json();
  return table;
}

/**
 * Gets all poker tables from the backend
 *
 * @returns Promise that resolves to an array of poker tables
 * @throws {Error} If the request fails
 */
export async function getPokerTables(): Promise<PokerTable[]> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/pokerTables`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch poker tables: ${response.status} ${response.statusText}`
    );
  }

  const tables: PokerTable[] = await response.json();
  return tables;
}

