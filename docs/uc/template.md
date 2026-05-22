# UC-NN : Titre de l'UC

**Domaine** : Auth / Pipeline / Process / Client / Devis / Documents / Agenda / Dashboard / Follow-up / Templates / i18n / Admin / Integrations
**Acteur primaire** : ADMIN / COMMERCIAL / Personne concernee (client final) / Outil externe (Florian) / Editeur (Dimitry)
**Acteur secondaire** : Systeme / Bot WhatsApp / Drive Google / Postgres / Puppeteer / Claude API
**Niveau** : `User goal` (UC metier) ou `Subfunction` (UC technique sous-jacent)
**Stories liees** : `EPxx-Syy`, `EPxx-Syy`
**Statut** : Implemente / Deadline (D5/D6/D7/...) / V1 / V1.1 / V2

---

## Precondition

- L'utilisateur est authentifie (sauf UC-01 Login lui-meme)
- L'utilisateur a accepte la CGU (sauf UC-03 Onboarding CGU)
- Le tenant est actif (`Tenant.isActive = true` — V1)
- ...

## Declencheur

Quel evenement / quelle action utilisateur lance l'UC.

## Scenario nominal (happy path)

1. L'utilisateur ouvre la page X
2. Le systeme affiche Y
3. L'utilisateur clique sur Z
4. Le systeme valide la regle metier R
5. Le systeme persiste D
6. Le systeme affiche la confirmation C

## Alternatives

- **A1** : Si X alors Y (a la place de l'etape N du scenario nominal)
- **A2** : Si Z alors W

## Exceptions

- **E1** : Erreur reseau → toast d'erreur + bouton retry + log
- **E2** : Validation Zod echoue → 400 + form errors affichees inline
- **E3** : Cross-tenant tentative → 404 (anti-enumeration)
- **E4** : Auth expiree → redirect /login + sauvegarde de la route initiale

## Postcondition

- **Etat BDD** :
  - Table T1 : N rangs crees / modifies
  - Table T2 : ...
- **Etat UI** :
  - L'utilisateur voit la page X
  - Le toast Y s'affiche

## Regles metier

- **RM1** : ...
- **RM2** : ...

## Tests E2E

- `apps/frontend/tests/e2e/xxx.spec.ts` — scenario "..."

## Notes techniques

- **Route API** : `POST /api/processes/:id/devis`
- **Composants front** : `<ProcessForm />`, `<Pipeline />`
- **Hooks / services** : `syncProcessDocuments`, `reconcileStays`
- **Tables touchees** : `Process`, `Devis`, `DevisIntervention`
- **Permissions** : ADMIN + COMMERCIAL

---

*UC-NN cree le YYYY-MM-DD. Maintenance : a maj si le scenario nominal change.*
