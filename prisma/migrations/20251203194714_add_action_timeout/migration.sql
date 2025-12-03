-- AlterTable
ALTER TABLE "hands" ADD COLUMN     "action_timeout_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "poker_tables" ADD COLUMN     "action_timeout_seconds" INTEGER;
