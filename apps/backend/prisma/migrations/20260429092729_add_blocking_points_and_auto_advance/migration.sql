-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "autoAdvanceProcesses" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BlockingPointTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#F59E0B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockingPointTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessBlockingPoint" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessBlockingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockingPointTag_tenantId_isActive_idx" ON "BlockingPointTag"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BlockingPointTag_tenantId_label_key" ON "BlockingPointTag"("tenantId", "label");

-- CreateIndex
CREATE INDEX "ProcessBlockingPoint_processId_resolvedAt_idx" ON "ProcessBlockingPoint"("processId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ProcessBlockingPoint_tagId_idx" ON "ProcessBlockingPoint"("tagId");

-- AddForeignKey
ALTER TABLE "BlockingPointTag" ADD CONSTRAINT "BlockingPointTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessBlockingPoint" ADD CONSTRAINT "ProcessBlockingPoint_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessBlockingPoint" ADD CONSTRAINT "ProcessBlockingPoint_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "BlockingPointTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
