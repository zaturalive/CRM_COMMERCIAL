# UC-37 : Generer le PDF du devis

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S07`
**Statut** : Implemente

## Scenario nominal

1. Dans DevisBuilder, click "Telecharger PDF"
2. Le bouton passe en etat de chargement : spinner `Loader2`, libelle « Generation... », bouton desactive (`downloadingPdf`)
3. GET `/api/devis/:id/pdf`
4. Backend :
   - Read `Devis` + toutes ses relations (prestations + fees + stays + options + custom + clinique + client + cabinet)
   - Resout le template de devis (mentions legales + `accentColor`) a la volee depuis `Tenant.settings.legal` (cf UC-94)
   - Render HTML via `apps/backend/src/services/devisTemplate.ts` (bandeaux teintes par `accentColor`, texte clair/sombre par luminance)
   - Launch Puppeteer (chromium headless), set HTML, generate PDF buffer
5. Stream PDF avec `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="<reference>.pdf"`
6. Le navigateur telecharge le fichier ; le bouton revient a son etat normal

## Postcondition

- L'utilisateur recupere le PDF (telechargement)

## Regles metier

- **RM1** : PDF non stocke en BDD — generation a la volee (snapshot live a partir de la BDD)
- **RM2** : Locale FR au MVP (cf RM5 UC-05)
- **RM3** : Signature numerique du PDF V1.1 (XAdES)
- **RM4** : Mentions legales + couleur d'accent resolues a la volee (template cabinet, UC-94) — pas figees sur le devis
- **RM5** : Feedback de chargement obligatoire (spinner) car la generation Puppeteer n'est pas instantanee

## Tests

- `apps/backend/tests/security/devis-pdf-commercial.test.ts`

## Notes techniques

- **Route** : `GET /api/devis/:id/pdf`
- **Resolution template** : `apps/backend/src/services/devisLoader.ts` (`buildDevisPdfInput`, `resolveLegalMentions`)
- **Template HTML** : `apps/backend/src/services/devisTemplate.ts` (accent + luminance)
- **Composant** : `DevisBuilder.tsx` (etat `downloadingPdf`, bouton « Telecharger PDF »)
- **Lib** : `puppeteer` (deja installe)

---

*UC-37 cree le 2026-05-22. Maj 2026-06-07 : bouton « Telecharger PDF » avec spinner, disposition `attachment`, template (mentions + couleur) resolu a la volee (cf UC-94).*
