-- CreateTable
CREATE TABLE "events" (
    "event_id" SERIAL NOT NULL,
    "block_ts" TIMESTAMP(3) NOT NULL,
    "player" VARCHAR(42),
    "kind" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "digest" CHAR(66) NOT NULL,
    "sig_r" VARCHAR(66) NOT NULL,
    "sig_s" VARCHAR(66) NOT NULL,
    "sig_v" INTEGER NOT NULL,
    "nonce" BIGINT,
    "tee_version" INTEGER NOT NULL,
    "tee_pubkey" VARCHAR(66) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "events_player_idx" ON "events"("player");

-- CreateIndex
CREATE INDEX "events_kind_idx" ON "events"("kind");

-- CreateIndex
CREATE INDEX "events_block_ts_idx" ON "events"("block_ts");

-- CreateIndex
CREATE INDEX "events_digest_idx" ON "events"("digest");
