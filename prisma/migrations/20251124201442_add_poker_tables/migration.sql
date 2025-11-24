-- CreateTable
CREATE TABLE "poker_tables" (
    "poker_table_id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "minimum_buy_in" BIGINT NOT NULL,
    "maximum_buy_in" BIGINT NOT NULL,
    "per_hand_rake" INTEGER NOT NULL,
    "max_seat_count" INTEGER NOT NULL,
    "small_blind" BIGINT NOT NULL,
    "big_blind" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poker_tables_pkey" PRIMARY KEY ("poker_table_id"),
    -- Validation constraints
    CONSTRAINT "poker_tables_per_hand_rake_non_negative" CHECK ("per_hand_rake" >= 0),
    CONSTRAINT "poker_tables_max_seat_count_range" CHECK ("max_seat_count" >= 0 AND "max_seat_count" <= 8),
    CONSTRAINT "poker_tables_buy_in_range" CHECK ("maximum_buy_in" >= "minimum_buy_in"),
    CONSTRAINT "poker_tables_minimum_buy_in_positive" CHECK ("minimum_buy_in" > 0),
    CONSTRAINT "poker_tables_blind_range" CHECK ("big_blind" >= "small_blind"),
    CONSTRAINT "poker_tables_small_blind_positive" CHECK ("small_blind" > 0),
    CONSTRAINT "poker_tables_big_blind_positive" CHECK ("big_blind" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "poker_tables_name_key" ON "poker_tables"("name");

-- CreateIndex (composite index for buy-in range searches)
CREATE INDEX "poker_tables_minimum_buy_in_maximum_buy_in_idx" ON "poker_tables"("minimum_buy_in", "maximum_buy_in");
