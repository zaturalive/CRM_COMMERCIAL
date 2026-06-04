-- AlterTable
ALTER TABLE "PlatformAdmin" ADD COLUMN     "loginOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loginOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "loginOtpHash" TEXT,
ADD COLUMN     "mfaEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpSecret" TEXT;
