-- CreateTable
CREATE TABLE "table_seat_sessions" (
    "table_seat_session_id" SERIAL NOT NULL,
    "table_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "table_balance_gwei" BIGINT NOT NULL,
    "twitter_handle" VARCHAR(255),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "table_seat_sessions_pkey" PRIMARY KEY ("table_seat_session_id")
);

-- CreateIndex
CREATE INDEX "table_seat_sessions_table_id_idx" ON "table_seat_sessions"("table_id");

-- CreateIndex
CREATE INDEX "table_seat_sessions_wallet_address_idx" ON "table_seat_sessions"("wallet_address");

-- CreateIndex
CREATE INDEX "table_seat_sessions_is_active_idx" ON "table_seat_sessions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "table_seat_sessions_table_id_seat_number_is_active_key" ON "table_seat_sessions"("table_id", "seat_number", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "table_seat_sessions_wallet_address_is_active_key" ON "table_seat_sessions"("wallet_address", "is_active");

-- AddForeignKey
ALTER TABLE "table_seat_sessions" ADD CONSTRAINT "table_seat_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "poker_tables"("poker_table_id") ON DELETE CASCADE ON UPDATE CASCADE;
