/*
  Warnings:

  - You are about to drop the column `has_acted_this_round` on the `hand_players` table. All the data in the column will be lost.
  - You are about to drop the column `round_contribution` on the `hand_players` table. All the data in the column will be lost.
  - You are about to drop the column `round_starting_seat` on the `hands` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "hand_players" DROP COLUMN "has_acted_this_round",
DROP COLUMN "round_contribution";

-- AlterTable
ALTER TABLE "hands" DROP COLUMN "round_starting_seat";
