-- repair-corrupt-devis-dates.sql
--
-- Script ponctuel de reparation des dates aberrantes dans Devis.
-- Cause : avant le fix de devisCalculator/reconcileStays, un input HTML
-- date mal rempli (l'utilisateur tape "2" puis tab → "0002-MM-DD") creait
-- une DevisIntervention avec annee < 100. reconcileStays normalisait via
-- Date.UTC(2, ...) qui ajoute 1900 (legacy ECMAScript) → DevisStay avec
-- annee 1902 alors que la DevisIntervention restait a 2 → mismatch dans
-- staysByKey → fallback "AMBULATOIRE" peu importe le mode reel.
--
-- Strategie : nuller les dateIntervention aberrantes (force la re-saisie
-- via le formulaire qui maintenant valide [2020, 2100]), supprimer les
-- DevisStay associes (orphelins, seront recrees au prochain reconcileStays
-- une fois la date re-saisie).
--
-- Execution :
--   docker exec -i crm-chirurgien-postgres psql -U crm_prod -d crm-chirurgie \
--     < apps/backend/scripts/repair-corrupt-devis-dates.sql
--
-- Idempotent.

BEGIN;

-- 1) DevisStay : suppression des stays avec annee aberrante.
DELETE FROM "DevisStay"
WHERE EXTRACT(YEAR FROM date) < 2020
   OR EXTRACT(YEAR FROM date) > 2100;

-- 2) DevisIntervention : nuller dateIntervention aberrante.
UPDATE "DevisIntervention"
SET "dateIntervention" = NULL
WHERE "dateIntervention" IS NOT NULL
  AND (EXTRACT(YEAR FROM "dateIntervention") < 2020
       OR EXTRACT(YEAR FROM "dateIntervention") > 2100);

-- 3) Devis : statut peut avoir besoin d'etre repropage. On laisse cela au
-- handler refreshDevisStatus qui sera appele au prochain PATCH (idempotent).
-- Pour forcer immediatement, on peut faire un UPDATE conditionnel : si tous
-- les DI n'ont pas de date, le statut redevient TECHNIQUE_REMPLI ou BROUILLON.

UPDATE "Devis" d
SET status = 'BROUILLON'
WHERE d.status NOT IN ('SIGNE', 'ENVOYE', 'REFUSE')
  AND NOT EXISTS (
    SELECT 1 FROM "DevisIntervention" di WHERE di."devisId" = d.id
  );

UPDATE "Devis" d
SET status = 'TECHNIQUE_REMPLI'
WHERE d.status NOT IN ('SIGNE', 'ENVOYE', 'REFUSE')
  AND EXISTS (
    SELECT 1 FROM "DevisIntervention" di WHERE di."devisId" = d.id
  )
  AND EXISTS (
    SELECT 1 FROM "DevisIntervention" di
    WHERE di."devisId" = d.id
      AND (di."cliniqueId" IS NULL OR di."dateIntervention" IS NULL)
  );

UPDATE "Devis" d
SET status = 'COMMERCIAL_REMPLI'
WHERE d.status NOT IN ('SIGNE', 'ENVOYE', 'REFUSE')
  AND EXISTS (
    SELECT 1 FROM "DevisIntervention" di WHERE di."devisId" = d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "DevisIntervention" di
    WHERE di."devisId" = d.id
      AND (di."cliniqueId" IS NULL OR di."dateIntervention" IS NULL)
  );

COMMIT;

-- Verification (a executer manuellement apres) :
-- SELECT id, "dateIntervention" FROM "DevisIntervention"
--  WHERE EXTRACT(YEAR FROM "dateIntervention") < 2020;
-- → doit etre vide.
