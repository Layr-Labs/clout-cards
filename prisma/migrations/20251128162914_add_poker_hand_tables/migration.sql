-- CreateEnum
CREATE TYPE "HandStatus" AS ENUM ('WAITING_FOR_PLAYERS', 'SHUFFLING', 'PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BettingRound" AS ENUM ('PRE_FLOP', 'FLOP', 'TURN', 'RIVER');

-- CreateEnum
CREATE TYPE "PlayerActionType" AS ENUM ('POST_BLIND', 'FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN');

-- CreateEnum
CREATE TYPE "HandPlayerStatus" AS ENUM ('ACTIVE', 'FOLDED', 'ALL_IN');

-- CreateTable
CREATE TABLE "hands" (
    "hand_id" SERIAL NOT NULL,
    "table_id" INTEGER NOT NULL,
    "status" "HandStatus" NOT NULL DEFAULT 'WAITING_FOR_PLAYERS',
    "round" "BettingRound",
    "dealer_position" INTEGER,
    "small_blind_seat" INTEGER,
    "big_blind_seat" INTEGER,
    "current_action_seat" INTEGER,
    "current_bet" BIGINT,
    "last_raise_amount" BIGINT,
    "deck" JSONB NOT NULL,
    "deck_position" INTEGER NOT NULL DEFAULT 0,
    "community_cards" JSONB NOT NULL DEFAULT '[]',
    "shuffle_seed_hash" VARCHAR(66) NOT NULL,
    "shuffle_seed" VARCHAR(66),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "hands_pkey" PRIMARY KEY ("hand_id")
);

-- CreateTable
CREATE TABLE "hand_players" (
    "hand_player_id" SERIAL NOT NULL,
    "hand_id" INTEGER NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "status" "HandPlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "chips_committed" BIGINT NOT NULL DEFAULT 0,
    "hole_cards" JSONB NOT NULL,

    CONSTRAINT "hand_players_pkey" PRIMARY KEY ("hand_player_id")
);

-- CreateTable
CREATE TABLE "pots" (
    "pot_id" SERIAL NOT NULL,
    "hand_id" INTEGER NOT NULL,
    "pot_number" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "eligible_seat_numbers" JSONB NOT NULL,
    "winner_seat_numbers" JSONB,

    CONSTRAINT "pots_pkey" PRIMARY KEY ("pot_id")
);

-- CreateTable
CREATE TABLE "hand_actions" (
    "hand_action_id" SERIAL NOT NULL,
    "hand_id" INTEGER NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "round" "BettingRound" NOT NULL,
    "action" "PlayerActionType" NOT NULL,
    "amount" BIGINT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hand_actions_pkey" PRIMARY KEY ("hand_action_id")
);

-- CreateIndex
CREATE INDEX "hands_table_id_idx" ON "hands"("table_id");

-- CreateIndex
CREATE INDEX "hands_status_idx" ON "hands"("status");

-- CreateIndex
CREATE INDEX "hands_started_at_idx" ON "hands"("started_at");

-- CreateIndex
CREATE INDEX "hand_players_hand_id_idx" ON "hand_players"("hand_id");

-- CreateIndex
CREATE INDEX "hand_players_wallet_address_idx" ON "hand_players"("wallet_address");

-- CreateIndex
CREATE INDEX "hand_players_status_idx" ON "hand_players"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hand_players_hand_id_seat_number_key" ON "hand_players"("hand_id", "seat_number");

-- CreateIndex
CREATE INDEX "pots_hand_id_idx" ON "pots"("hand_id");

-- CreateIndex
CREATE UNIQUE INDEX "pots_hand_id_pot_number_key" ON "pots"("hand_id", "pot_number");

-- CreateIndex
CREATE INDEX "hand_actions_hand_id_idx" ON "hand_actions"("hand_id");

-- CreateIndex
CREATE INDEX "hand_actions_hand_id_round_idx" ON "hand_actions"("hand_id", "round");

-- CreateIndex
CREATE INDEX "hand_actions_seat_number_idx" ON "hand_actions"("seat_number");

-- CreateIndex
CREATE INDEX "hand_actions_timestamp_idx" ON "hand_actions"("timestamp");

-- AddForeignKey
ALTER TABLE "hands" ADD CONSTRAINT "hands_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "poker_tables"("poker_table_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("hand_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pots" ADD CONSTRAINT "pots_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("hand_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hand_actions" ADD CONSTRAINT "hand_actions_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("hand_id") ON DELETE CASCADE ON UPDATE CASCADE;
