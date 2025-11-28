/**
 * Events service for frontend
 *
 * Provides functions to interact with backend event endpoints.
 */

import { apiClient } from './apiClient';

/**
 * Event from API
 */
export interface Event {
  eventId: number;
  blockTs: string;
  player: string | null;
  kind: string;
  payloadJson: string;
  digest: string;
  sigR: string;
  sigS: string;
  sigV: number;
  nonce: string | null;
  teeVersion: number;
  teePubkey: string;
  ingestedAt: string;
  signatureValid: boolean;
}

/**
 * Gets recent events from the backend
 *
 * @param signature - Session signature from localStorage
 * @param adminAddress - Admin address
 * @param limit - Maximum number of events to fetch (default: 50, max: 100)
 * @returns Promise that resolves to an array of events
 * @throws {Error} If the request fails
 */
export async function getEvents(
  signature: string,
  adminAddress: string,
  limit: number = 50
): Promise<Event[]> {
  return apiClient<Event[]>(`/events?limit=${limit}`, {
    requireAuth: true,
    signature,
    adminAddress,
  });
}

