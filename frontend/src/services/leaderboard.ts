/**
 * Leaderboard service for frontend
 *
 * Provides functions to interact with backend leaderboard endpoints.
 */

import { apiClient } from './apiClient';

/**
 * Sort options for leaderboard queries
 */
export type LeaderboardSortBy = 'winnings' | 'bets' | 'hands';

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  twitterHandle: string;
  handsPlayed: number;
  handsWon: number;
  totalLifetimeBets: string; // BigInt as string
  totalLifetimeWinnings: string; // BigInt as string
}

/**
 * Gets the top players from the leaderboard
 *
 * @param sortBy - Sort criteria: 'winnings', 'bets', or 'hands' (default: 'winnings')
 * @param limit - Maximum number of entries to return (default: 20)
 * @returns Promise that resolves to an array of leaderboard entries
 * @throws {Error} If the request fails
 */
export async function getLeaderboard(
  sortBy: LeaderboardSortBy = 'winnings',
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams({
    sortBy,
    limit: limit.toString(),
  });
  return apiClient<LeaderboardEntry[]>(`/api/leaderboard?${params.toString()}`);
}

