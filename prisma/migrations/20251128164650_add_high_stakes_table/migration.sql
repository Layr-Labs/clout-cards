-- Insert High Stakes Table
-- Minimum buy-in: 1 ETH (1,000,000,000 gwei)
-- Maximum buy-in: 5 ETH (5,000,000,000 gwei)
-- Rake: 5% (500 basis points)
-- Max seats: 6
-- Small blind: 1,000,000 gwei
-- Big blind: 2,000,000 gwei
INSERT INTO "poker_tables" (
  "name",
  "minimum_buy_in",
  "maximum_buy_in",
  "per_hand_rake",
  "max_seat_count",
  "small_blind",
  "big_blind",
  "is_active",
  "created_at",
  "updated_at"
) VALUES (
  'High Stakes',
  1000000000,  -- 1 ETH in gwei
  5000000000,  -- 5 ETH in gwei
  500,         -- 5% rake (500 basis points)
  6,           -- Max 6 seats
  1000000,     -- Small blind: 1,000,000 gwei
  2000000,     -- Big blind: 2,000,000 gwei
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("name") DO NOTHING;
