-- CreateEnum
CREATE TYPE "FollowupSubStage" AS ENUM ('J0', 'J1', 'J3', 'J7', 'J14', 'J30', 'ABANDON');

-- CreateEnum
CREATE TYPE "FollowupProgress" AS ENUM ('AVANCE', 'STAGNE', 'RECULE', 'PAS_DE_REPONSE');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('MAIL', 'SMS_WHATSAPP', 'VIDEO');

-- CreateEnum
CREATE TYPE "DocumentTemplateKind" AS ENUM ('PDF_UPLOADED', 'HTML_RENDERED');

-- CreateEnum
CREATE TYPE "TrackingEventType" AS ENUM ('CLICK_LINK', 'VIEW_VIDEO', 'OPEN_EMAIL', 'REPLY_MESSAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TrackingTargetKind" AS ENUM ('MESSAGE_TEMPLATE', 'DOCUMENT_TEMPLATE', 'EXTERNAL_URL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TrackingSource" AS ENUM ('MANUAL_DEMO', 'INFERRED', 'REAL');

-- AlterTable
ALTER TABLE "DocumentLabel" ADD COLUMN     "documentTemplateId" TEXT;

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "followupSubStage" "FollowupSubStage",
ADD COLUMN     "followupSubStageEnteredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FollowupStepLog" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "fromSubStage" "FollowupSubStage",
    "toSubStage" "FollowupSubStage" NOT NULL,
    "note" TEXT,
    "progressLabel" "FollowupProgress",
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowupStepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "previewImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionMessageTemplate" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "messageTemplateId" TEXT NOT NULL,
    "targetSubStage" "FollowupSubStage",
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageSendLog" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "messageTemplateId" TEXT,
    "kind" "MessageKind" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "userId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "DocumentTemplateKind" NOT NULL,
    "fileUrl" TEXT,
    "bodyHtml" TEXT,
    "variableSchema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionDocumentTemplate" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "documentTemplateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionDocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "processId" TEXT,
    "eventType" "TrackingEventType" NOT NULL,
    "targetKind" "TrackingTargetKind" NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT NOT NULL,
    "targetUrl" TEXT,
    "source" "TrackingSource" NOT NULL DEFAULT 'MANUAL_DEMO',
    "note" TEXT,
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowupStepLog_processId_occurredAt_idx" ON "FollowupStepLog"("processId", "occurredAt");

-- CreateIndex
CREATE INDEX "MessageTemplate_tenantId_isActive_idx" ON "MessageTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_key" ON "MessageTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "InterventionMessageTemplate_interventionId_idx" ON "InterventionMessageTemplate"("interventionId");

-- CreateIndex
CREATE INDEX "InterventionMessageTemplate_messageTemplateId_idx" ON "InterventionMessageTemplate"("messageTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionMessageTemplate_interventionId_messageTemplateI_key" ON "InterventionMessageTemplate"("interventionId", "messageTemplateId", "targetSubStage");

-- CreateIndex
CREATE INDEX "MessageSendLog_processId_sentAt_idx" ON "MessageSendLog"("processId", "sentAt");

-- CreateIndex
CREATE INDEX "DocumentTemplate_tenantId_isActive_idx" ON "DocumentTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_tenantId_name_key" ON "DocumentTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "InterventionDocumentTemplate_interventionId_idx" ON "InterventionDocumentTemplate"("interventionId");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionDocumentTemplate_interventionId_documentTemplat_key" ON "InterventionDocumentTemplate"("interventionId", "documentTemplateId");

-- CreateIndex
CREATE INDEX "TrackingEvent_tenantId_clientId_occurredAt_idx" ON "TrackingEvent"("tenantId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_processId_occurredAt_idx" ON "TrackingEvent"("processId", "occurredAt");

-- CreateIndex
CREATE INDEX "Process_tenantId_stage_followupSubStage_idx" ON "Process"("tenantId", "stage", "followupSubStage");

-- AddForeignKey
ALTER TABLE "DocumentLabel" ADD CONSTRAINT "DocumentLabel_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowupStepLog" ADD CONSTRAINT "FollowupStepLog_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowupStepLog" ADD CONSTRAINT "FollowupStepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionMessageTemplate" ADD CONSTRAINT "InterventionMessageTemplate_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionMessageTemplate" ADD CONSTRAINT "InterventionMessageTemplate_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionDocumentTemplate" ADD CONSTRAINT "InterventionDocumentTemplate_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionDocumentTemplate" ADD CONSTRAINT "InterventionDocumentTemplate_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
