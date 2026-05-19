-- ADR-0002 : retrait du role UserRole.CHIRURGIEN et du champ Process.noteMedecin.
-- Cf docs/architecture/decisions/0002-suppression-role-chirurgien-et-notes.md
--
-- WARNING : si des donnees existaient avec role=CHIRURGIEN ou noteMedecin non null,
-- elles seront perdues. En dev (seed reset) c'est attendu. En prod, prevoir un
-- back-up + une etape de bascule role CHIRURGIEN -> COMMERCIAL avant la migration.

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'COMMERCIAL');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Process" DROP COLUMN "noteMedecin";
