# UC-37 : Generer le PDF du devis

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S07`
**Statut** : Implemente

## Scenario nominal

1. Dans DevisBuilder, click "PDF"
2. GET `/api/devis/:id/pdf`
3. Backend :
   - Read `Devis` + toutes ses relations (prestations + fees + stays + options + custom + clinique + client + cabinet)
   - Render HTML via `apps/backend/src/lib/devisTemplate.ts`
   - Launch Puppeteer (chromium headless), set HTML, generate PDF buffer
4. Stream PDF avec `Content-Type: application/pdf` + `Content-Disposition: inline; filename="devis-<reference>.pdf"`
5. Browser ouvre le PDF dans une vue inline

## Postcondition

- Le user voit le PDF dans le navigateur

## Regles metier

- **RM1** : PDF non stocke en BDD — generation a la volee (snapshot live a partir de la BDD)
- **RM2** : Locale FR au MVP (cf RM5 UC-05)
- **RM3** : Signature numerique du PDF V1.1 (XAdES)

## Tests

- `apps/backend/tests/security/devis-pdf.test.ts`

## Notes techniques

- **Route** : `GET /api/devis/:id/pdf`
- **Service** : `apps/backend/src/services/pdfGenerator.ts`
- **Template** : `apps/backend/src/lib/devisTemplate.ts` (HTML)
- **Lib** : `puppeteer` (deja installe)

---

*UC-37 stub.*
