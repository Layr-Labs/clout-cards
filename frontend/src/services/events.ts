/**
 * Events service for frontend
 *
 * Provides functions to interact with backend event endpoints.
 */

import { getBackendUrl } from '../config/env';

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
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/events?adminAddress=${encodeURIComponent(adminAddress)}&limit=${limit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signature}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch events: ${response.status} ${response.statusText}`
    );
  }

  const events: Event[] = await response.json();
  return events;
}

