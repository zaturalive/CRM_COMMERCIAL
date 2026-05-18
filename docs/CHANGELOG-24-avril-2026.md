# CHANGELOG 24 avril 2026 — Livraison MVP + evolutions post-specs

> **Contexte.** Version demo du 24 avril 2026 pour Dr Delobaux / cabinet Delobaux Lyon.
> Livraison des 8 epics EP01-EP08 (specifies dans CDCF v2.0 + CDCT v1.5), plus
> 8 evolutions fonctionnelles decidees pendant le sprint final suite aux retours
> utilisateur (Dimitry / Acadenice).
>
> Ce document prolonge `files(2)/CHANGELOG-22-avril-2026.md`.

---

## 1. Epics livres

Tous les 8 epics sont **DONE**. Detail dans `docs/product/epics.md`.

| Epic | Scope | Stories |
|---|---|---|
| EP01 | Foundation multi-tenant + auth + design | S01-S04 |
| EP02 | Parametrage admin (cliniques, interventions, labels) | S01-S05 |
| EP03 | Fiche Client + historique + panneau devis | S01-S03 |
| EP04 | Pipeline kanban + Process Panel + notes role-based | S01-S06 |
| EP05 | Devis technique + commercial + PDF + calculs | S01-S07 |
| EP06 | Documents checklist + upload + badge + mock WhatsApp | S01-S04 |
| EP07 | Agenda vue projetee + EventSheet + PaymentProgressBar | S01-S03 |
| EP08 | Dashboard 4 KPIs + chart CA + previsionnel | S01-S02 |

---

## 2. Evolutions fonctionnelles post-specs

Ces 8 features sont **hors scope CDCF v2.0 initial** mais decidees pendant
l'implementation suite a des retours utilisateur. Elles doivent etre
integrees au CDCF a sa prochaine revision.

### 2.1. Parametrage "Cabinet" — acompte configurable

**Demande** : le montant d'acompte n'etait pas parametrable. Chaque
cabinet veut un montant fixe different (Delobaux : 1500 €).

**Livre** :
- Schema : `Tenant.acompteDefaultAmount Int @default(150000)` (centimes)
- Route `GET/PATCH /api/settings`
- Page `/config/cabinet` — input montant en euros + nom cabinet
- Utilise par agendaProjection, checkAutoArchive, payment summary

**References** : commits `1182044`, `0ea752c`. Tests : 6 security +
2 E2E settings.spec.ts.

### 2.2. Split button "Nouveau dossier sur patient existant"

**Demande** : un patient peut avoir N dossiers (ex: revient 18 mois
apres une lipo pour une rhino). Impossible de creer un 2e dossier sans
recreer le client.

**Livre** :
- Composant `NewDossierButton` : split avec chevron dropdown
- `PatientPickerDialog` : search debounced 250ms sur `/api/clients?q=`
- Clic sur un patient → `POST /api/processes { clientId }` + ouvre
  Process Panel du nouveau dossier

**References** : commit `892ed42`. Tests : +3 backend (multi-dossier,
sans interventions, cross-tenant) + 3 E2E new-dossier.spec.ts.

### 2.3. Actions inline dans le Process Panel (stage CONTACT)

**Demande** : la vue d'ensemble etait read-only. Impossible d'ajouter
une intervention, de definir la consultationDate, ou de qualifier
depuis le panel.

**Livre** :
- Bouton **"Modifier"** sur section Patient → ouvre ClientFormDialog
- Bouton **"Qualifier"** → QualificationDialog (Oui/Non + slider 1-10 + motivation)
- Bouton **"+ Ajouter"** interventions → InterventionPickerDialog
- Bouton **"Definir date consult"** → ConsultationDateDialog (datetime-local)
- Bouton trash sur chaque intervention pour retirer

**References** : commit `df32dbc`.

### 2.4. Suppression definitive des process

**Demande** : archivage (`isArchived=true`) masque mais garde la data.
Besoin d'un vrai DELETE cascade pour nettoyer les dossiers tests /
erreurs.

**Livre** :
- Backend `DELETE /api/processes/:id` avec double opt-in
  `body.confirm === "suppression"` (400 sinon)
- Cascade Prisma : Process → ProcessIntervention, ProcessDocument,
  Devis (+ DevisIntervention, options, stays, fees)
- Frontend : bouton rouge "Supprimer le dossier" dans footer
  ProcessPanel → dialog avec input texte "tape suppression"
  (case-sensitive)

**References** : commit `df32dbc`. Tests : +4 security (sans confirm,
mauvais texte, succes + 404 apres, cross-tenant).

### 2.5. Devis inputs en euros + label Qte

**Demande** : inputs prix affichaient des centimes bruts (38000 au
lieu de 380 €). Champ quantite ambigu a cote (pas de label).

**Livre** :
- Les 4 inputs prix (fees existants, fee inline add, options custom
  existantes, options custom add) affichent en euros format 0.00
- Suffixe "€" visible dans l'input
- Conversion `Math.round(euros * 100)` en centimes a l'envoi
- Chaque input quantite labelise "Qte" via `<label>` visible

**References** : commit `60a4ec1`.

### 2.6. Chirurgien acces full pipeline

**Demande** : CHIR etait bloque de `/pipeline` (redirect dashboard).
Depuis l'agenda, clic "Ouvrir la fiche process" → redirect inexplicable.

**Livre** :
- Retire le guard `redirect("/dashboard")` de `/pipeline/page.tsx`
- Sidebar : Pipeline visible pour CHIRURGIEN
- Droits granulaires (noteCommerciale, champs commerciaux devis)
  restent verrouilles au niveau composant

**References** : commit `60a4ec1`. Tests : 3 modifications
role-aware.spec.ts.

### 2.7. Erreurs de formulaire lisibles (helper formatApiError)

**Demande** : telephone mal format → toast "Validation error" sans
detail. Zod details etaient presents dans la reponse mais pas extraits.

**Livre** :
- Helper `formatApiError(res)` descend recursivement dans l'objet
  Zod details et extrait le 1er message `_errors[0]`
- Branche dans ClientFormDialog, PipelineView, QualificationDialog,
  ConsultationDateDialog, DeleteProcessDialog, DocumentsTab (upload)
- Test E2E : saisie "06 12" → toast "Numero francais invalide
  (format : 06 12 34 56 78)" visible

**References** : commit `df32dbc`.

### 2.8. Refresh silencieux du Process Panel

**Demande** : apres toute action (ajouter doc, cocher intervention,
modifier patient), le panel revenait sur l'onglet "Vue d'ensemble"
meme si l'utilisateur etait sur Documents/Devis. Type vieux site.

**Livre** :
- ProcessPanel.load() : supprime `setLoading(true)` pendant le refresh
- Conditional rendering affiche le spinner uniquement au 1er load
  (detail===null). Les refreshes laissent le sous-arbre monte
- ProcessTabs garde son `useState(tab)` actif car il n'est plus
  demontage/remontage

**References** : commit `4eec7bd`.

### 2.9. Picker de documents a 3 modes

**Demande** : quand un document est supprime de la checklist auto
(via Trash2 sur une row), le bouton "Ajouter un document" ne permettait
que de creer un nouveau doc ad-hoc. Pas de reimport depuis le catalogue
ou depuis les labels rattaches aux interventions du dossier.

**Livre** :
- Backend : nouvelle route `GET /api/processes/:id/documents/available`
  qui separe les labels en 2 sets :
  - `recommended` : labels rattaches aux interventions du process (via
    `InterventionDocumentLabel`), non encore presents dans
    `ProcessDocuments`. Ce sont les documents "attendus" supprimes.
  - `others` : autres labels du catalogue non attaches.
- Nouvelle route `POST /api/processes/:id/documents/attach-labels`
  avec body `{ labelIds: string[] }` (max 50, skip les doublons).
- `POST /api/processes/:id/documents` accepte maintenant soit `name`
  (doc ad-hoc) soit `documentLabelId` (snapshot depuis le label),
  mutuellement exclusifs via Zod refine.
- Frontend : `AddDocumentDialog` refactore en 3 sections :
  1. **Recommandes par les interventions** (card violette + icone
     Sparkles) — seulement visible s'il y a des docs attendus manquants
  2. **Autres documents du catalogue**
  3. **Creer un nouveau document** (input libre)
- Sections 1+2 multi-select (checkboxes + ring accent). Bouton principal
  passe de "Aucune selection" → "Importer N documents".

**References** : commit `1277623`. Tests : +5 security (isolation
tenant sur available, cross-tenant attach refuse, batch doublons skip,
POST documentLabelId snapshot name, mutex name/documentLabelId) + 1 E2E
(supprimer doc recommande → picker surligne → re-import → reapparait).

### 2.10. Gestion interventions depuis le label + config elargi

**Demande** : sur la page `/config/document-labels`, impossible de voir
ni modifier les interventions liees a un label (la colonne affichait
juste le count). Pour associer rapidement un label a plusieurs
interventions, il fallait faire des allers-retours via chaque fiche
intervention. Par ailleurs, les tables de `/config/*` etaient trop
etroites (max-w-5xl = 1024px, resultats serres sur grand ecran).

**Livre backend** :
- `GET /api/document-labels/:id/interventions` → `string[]` des
  interventionIds lies (pour pre-cocher le dialog)
- `PUT /api/document-labels/:id/interventions { interventionIds }` →
  remplace le set complet en une seule transaction. Valide que chaque
  interventionId appartient au tenant (404 sinon). Max 200.

**Livre frontend** :
- `LinkInterventionsDialog` : dialog avec liste de toutes les
  interventions actives du tenant, regroupees par categorie
  (CHIRURGIE / MED_ESTH / SOIN). Checkbox + ring accent au coche.
  Search par nom. Boutons "Tout cocher / Tout decocher".
- Bouton save dynamique : affiche le nombre de changements ("Enregistrer
  (N changements)" ou "Aucun changement" si identique).
- Ajoute dans la liste des labels (`/config/document-labels`) :
  - icone Link2 en action de ligne
  - badge "N" cliquable dans la colonne "Interventions liees"
- Layout `/config/*` passe de `max-w-5xl` a `max-w-7xl` (1280px) :
  grilles tarifaires, options catalogue, tables plus larges.

**References** : commit `9642a6e`. Tests : +6 security documentLabels
(GET interventions liees, PUT replace set, PUT set vide = delete all,
PUT cross-tenant interventionId → 404, PUT non-array → 400, PUT sur
labelId cross-tenant → 404).

### 2.11. Fix silent failure DevisBuilder

**Demande** : modifier un champ dans le devis (prix fee, duration
intervention, etc.) provoquait "Chargement" visible brievement puis
rien ne changeait. Aucun toast d'erreur. L'input gardait la valeur
tapee meme apres rejet backend (`defaultValue` uncontrolled).

**Cause** : dans `DevisBuilder.tsx`, les 10+ handlers de mutation
(patchIntervention, patchFee, deleteFee, addFee, toggleOption, etc.)
appelaient `apiFetch().then(refresh)` **sans verifier `res.success`**.
Les 400 Zod (prix negatif, duration=0, price > 100M€) passaient
silencieusement.

**Livre** :
- Helper `runMutation(path, init)` dans DevisBuilder : execute
  apiFetch, affiche `toast.error(formatApiError(res))` si !success,
  ne refresh que si success. Retourne `boolean`.
- 10 handlers refactores pour passer par `runMutation`.
- Bonus UI : dans `InterventionRow`, le local state `duration` est
  revert a `di.duration` quand `onPatch` retourne false. Evite de
  laisser un input avec valeur invalide apres rejet backend.

**References** : commit a venir. Tests : sous-agent a ecrit
`devis-error-toast.spec.ts` (4 tests) reproduisant le scenario.

### 2.12. Paiement manuel acompte + solde

**Demande** : pas de facon d'enregistrer les versements recus.
Backend avait `acomptePaidAt` + `soldePaidAmount` mais aucune UI ni
route dediee.

**Livre backend** :
- `PATCH /api/devis/:id/acompte { paid: boolean }` → set/unset
  acomptePaidAt. COMM+ADMIN only (403 CHIR). Cross-tenant safe.
- `PATCH /api/devis/:id/solde { soldePaidAmount: cents }` → set le
  montant total verse. Validation int >= 0, max 100M€. COMM+ADMIN only.

**Livre frontend** :
- `PaymentManageDialog` : toggle acompte + input solde en euros.
  Preview live + recap des changements (ex: "+350 €").
- Bouton "Gerer les paiements" sous la PaymentProgressBar dans
  l'OverviewTab. Visible des qu'il y a un devis signe.
- `processes.payment.acompteAmount` expose pour que le dialog sache
  combien vaut le toggle "acompte paye".

**References** : commit a venir. Tests : +8 backend security (acompte
toggle true/false/CHIR-403, solde ok/negatif/decimal/CHIR-403,
cross-tenant 404).

### 2.13. Sidebar : items desactives lisibles

**Demande** : les items V1/V1.1 (Paiements, Agent IA, etc.) etaient
illisibles — `opacity-40` cascadait sur `text-white/70` = 28%
effective, invisible.

**Livre** :
- Retire `opacity-40`, ajoute `text-white/55` (couleur explicite).
- Badge : `bg-amber-400/25 text-amber-200` pour distinguer les V1+
  des items actifs.

**References** : commit a venir.

### 2.14. Carnet d'idees — features post-MVP

Documentees en §7 de `docs/product/backlog.md` pour reprise V1 :

- **7.1 Facturation (V1.1)** : FACT-YYYY-NNNN distinct des devis.
- **7.2 Agent IA alertes (V1.2)** : parser WhatsApp pour extraire
  les engagements temporels ("dans 2 jours") → table
  `ScheduledAlert` + notif matinale cabinet + relance auto patient.
- **7.3 Stripe (V1.1)** : webhook auto-update acompte/solde.
- **7.4 Audit logs + RGPD (V1 prod)** : HDS, export/suppression.
- **7.5 2FA ADMIN (V1 prod)** : TOTP obligatoire sante.

---

## 3. Modifications des droits d'acces (ADR silencieuse)

Revisions des droits par rapport a CDCF v2.0 §11 :

| Resource | CDCF v2.0 initial | Live | Raison |
|---|---|---|---|
| `/config/*` Parametrage | ADMIN exclusif | **Tous les roles** | Decision user 23/04 |
| `/pipeline` | ADMIN + COMMERCIAL | **Tous les roles** | Decision user 24/04 |
| Upload documents | ADMIN + COMMERCIAL | inchange | — |
| Edition noteCommerciale | COMMERCIAL | inchange | — |
| Cochage intervention `isDone` | CHIRURGIEN + ADMIN | inchange | — |

Un commentaire `// Decision user JJ/MM` est present dans le code a chaque
point de revision (Sidebar.tsx, pipeline/page.tsx, config/layout.tsx).

---

## 4. Securite — audit final

### Resume

- **16 risques audites** (SEC-01..SEC-16)
- **11 tests vitest/playwright ajoutes** couvrant tous les angles
- **4 vraies failles fixees** : JWT algorithm confusion (SEC-01),
  Helmet manquant (SEC-04), rate-limit prod (SEC-09), timing-attack
  login (SEC-11)
- **13 filets anti-regression** sur patterns deja corrects
- Rapport complet : `docs/security-audit-23-04.md`

### Tests securite (231 total)

- Mass-assignment tenantId spoof : 6 tests
- Role-based note bypass : 6 tests
- JWT hardening : 4 tests (+ timing-attack : 2)
- CORS strict : 4 tests
- Error leak (pas de stack en prod) : 3 tests
- Demo route prod disabled : 3 tests
- Rate limit prod : 2 tests
- Body size 10mb : 2 tests
- Helmet headers : 6 tests
- Cross-tenant isolation par module : clients 17, interventions 16,
  auth 14, settings 6, agenda 5, documents-upload 10, dashboard 6,
  processes 16 (+4 suppression)
- Advanced angles : ReDoS / path-traversal / header-injection 6 tests

---

## 5. Tests — recap

| Type | Nombre | Fichiers |
|---|---|---|
| **Unit (vitest)** | 27 | tests/unit/{devisCalculator, syncProcessDocuments, agendaProjection, dashboardService} + integration/devisPdf |
| **Security (vitest + supertest)** | 231 | tests/security/* (22 fichiers) |
| **E2E (Playwright)** | 57 | tests/e2e/* (12 specs dont visual-audit 14 captures) |

Zero regression a chaque livraison.

---

## 6. Qualite — points forts / points faibles

### Points forts

1. Multi-tenant isole par Prisma extended client (22 tests security
   cross-tenant prouvent zero leak)
2. JWT HS256 pinned (algo confusion attack bloquee)
3. Helmet complet (6 headers)
4. Rate limit login prod (brute force bloque)
5. Zod validation stricte entrante, detailed error extraction en sortie
6. Error handler sans leak de stack en prod
7. Puppeteer in-memory (pas de surface path traversal PDF)
8. Process Panel refresh silencieux (UX moderne)

### Points faibles residuels (a traiter V1)

- Pas de password policy forte (SEC-15)
- Pas d'audit logs legal (SEC-16)
- CSP en preset Helmet, pas durci
- Pas de 2FA ADMIN
- Uploads : defense profondeur OK (UUID storage) mais pas de magic-bytes check
- MIME verifie cote client uniquement (multer) — un attaquant peut
  envoyer `Content-Type: application/pdf` sur un fichier .exe
- Orphelins fichiers uploads si Process delete cascade (backend route
  DELETE manuel nettoie, mais pas si on supprime via cascade Prisma)

---

## 7. Script load-fake-data

Outil dev pour peupler l'UI en volume (30 clients, 30 processes, 15 devis
varies). `docker compose exec -T backend npx tsx prisma/load-fake-data.ts`.

Idempotent : les fake-* sont purges et recrees. Les seed-* restent
intacts.

References : commit `e83507a`.

---

## 8. Phasage rappel

Extrait CDCF v2.0 §12 (reste d'actualite a ce jour) :

| Phase | Echeance | Contenu |
|---|---|---|
| **MVP** (livre) | 24 avril 2026 | 8 epics + 8 evolutions post-specs + securite |
| V1.1 | 4 semaines post-MVP | Stripe + signatures differees + Yousign |
| V1.2 | 6 semaines post-MVP | Agent IA WhatsApp reel + Claude Vision |
| V1 prod | 8-10 semaines | HDS + RGPD + Instagram/Mail + templates |
| V1.5 | 2-4 semaines post-V1 | Portail patient + phototheque |
| V2 | 8-12 semaines post-V1 | Doctolib + comptabilite + post-op |

---

*24 avril 2026 — Dimitry Acadenice + Claude Opus 4.7*
