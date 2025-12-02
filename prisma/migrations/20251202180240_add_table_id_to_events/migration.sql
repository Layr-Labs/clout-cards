-- AlterTable
ALTER TABLE "events" ADD COLUMN     "table_id" INTEGER;

-- CreateIndex
CREATE INDEX "events_table_id_idx" ON "events"("table_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "poker_tables"("poker_table_id") ON DELETE SET NULL ON UPDATE CASCADE;
