-- CreateTable
CREATE TABLE "player_escrow_balances" (
    "wallet_address" VARCHAR(42) NOT NULL,
    "balance_gwei" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_escrow_balances_pkey" PRIMARY KEY ("wallet_address")
);
