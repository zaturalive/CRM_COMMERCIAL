-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "cguAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "cguSignatoryName" TEXT,
ADD COLUMN     "cguVersion" TEXT;
