-- AlterTable
ALTER TABLE "hand_players" ADD COLUMN     "has_acted_this_round" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "round_contribution" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "hands" ADD COLUMN     "round_starting_seat" INTEGER;
