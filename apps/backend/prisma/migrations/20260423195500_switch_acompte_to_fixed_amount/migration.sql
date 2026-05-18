-- Drop ancien % et ajoute montant fixe (centimes)
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "acompteDefaultPct";
ALTER TABLE "Tenant" ADD COLUMN "acompteDefaultAmount" INTEGER NOT NULL DEFAULT 150000;
