-- Drop existing unique constraints that include isActive
-- These prevent multiple inactive sessions (history) for the same seat/player
DROP INDEX IF EXISTS "unique_active_seat";
DROP INDEX IF EXISTS "unique_active_player";

-- Create partial unique indexes that only enforce uniqueness when isActive = true
-- This allows multiple inactive sessions (for history) while preventing duplicate active sessions
CREATE UNIQUE INDEX "unique_active_seat" ON "table_seat_sessions"("table_id", "seat_number") WHERE "is_active" = true;
CREATE UNIQUE INDEX "unique_active_player" ON "table_seat_sessions"("wallet_address") WHERE "is_active" = true;
