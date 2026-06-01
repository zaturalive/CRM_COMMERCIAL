-- DropIndex
DROP INDEX "Client_tenantId_email_idx";

-- DropIndex
DROP INDEX "Client_tenantId_phone_idx";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "emailSearchHash" TEXT;

-- CreateIndex
CREATE INDEX "Client_tenantId_emailSearchHash_idx" ON "Client"("tenantId", "emailSearchHash");
