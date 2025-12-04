-- CreateTable
CREATE TABLE "leaderboard_stats" (
    "twitter_handle" VARCHAR(255) NOT NULL,
    "hands_played" INTEGER NOT NULL DEFAULT 0,
    "hands_won" INTEGER NOT NULL DEFAULT 0,
    "total_lifetime_bets" BIGINT NOT NULL DEFAULT 0,
    "total_lifetime_winnings" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_stats_pkey" PRIMARY KEY ("twitter_handle")
);

-- CreateIndex
CREATE INDEX "leaderboard_stats_total_lifetime_winnings_idx" ON "leaderboard_stats"("total_lifetime_winnings" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_stats_total_lifetime_bets_idx" ON "leaderboard_stats"("total_lifetime_bets" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_stats_hands_played_idx" ON "leaderboard_stats"("hands_played" DESC);

