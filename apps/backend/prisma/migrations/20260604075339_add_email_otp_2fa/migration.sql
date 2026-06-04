-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loginOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "loginOtpHash" TEXT,
ADD COLUMN     "mfaEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
