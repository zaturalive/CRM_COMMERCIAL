-- P4 Sprint vocabulaire commercial (2026-05-20)
-- Renomme les colonnes pour aligner le modele de donnees avec la terminologie
-- commerciale. RENAME COLUMN est non-destructif (preserve les donnees).
--
-- Process.consultationDate         -> Process.dateRendezVous
-- DevisIntervention.dateIntervention -> DevisIntervention.datePrestation
-- DevisIntervention.timeIntervention -> DevisIntervention.heurePrestation
--
-- L'index sur (cliniqueId, dateIntervention) est renomme implicitement par
-- ALTER INDEX pour preserver les statistiques de l'optimiseur.

-- RenameColumn
ALTER TABLE "Process" RENAME COLUMN "consultationDate" TO "dateRendezVous";

-- RenameColumn
ALTER TABLE "DevisIntervention" RENAME COLUMN "dateIntervention" TO "datePrestation";

-- RenameColumn
ALTER TABLE "DevisIntervention" RENAME COLUMN "timeIntervention" TO "heurePrestation";

-- RenameIndex
ALTER INDEX "DevisIntervention_cliniqueId_dateIntervention_idx" RENAME TO "DevisIntervention_cliniqueId_datePrestation_idx";
