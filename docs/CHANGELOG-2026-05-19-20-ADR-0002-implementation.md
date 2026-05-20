# CHANGELOG — Session 2026-05-19 / 2026-05-20

Implementation complete de l'ADR-0002 (retrait UserRole.CHIRURGIEN + Process.noteMedecin)
+ P2 (reformulation des 3 stories BLOCKED EP02-S05, EP05-S02, EP06-S04).

> Ce document recense toutes les modifications appliquees pendant la session.
> Reference ADR : `docs/architecture/decisions/0002-suppression-role-chirurgien-et-notes.md`
> Plan d'action source : `docs/ACTIONS-IMMEDIATES-2026-05-18.md`

---

## Resume haut niveau

| Priorite | Statut | Description |
|----------|--------|-------------|
| P0 | ✓ | Remote GitHub `zaturalive/CRM_COMMERCIAL` configure, push initial |
| P1.A | ✓ | Migration Prisma `20260519134100_remove_chirurgien_role_and_note_medecin` |
| P1.B | ✓ | Backend : 15 fichiers code + tests + seeds purges |
| P1.C | ✓ | Frontend : 20 fichiers UI + tests/e2e purges |
| P1.D | ✓ | Smoke test programmatique : 259/259 tests verts, login admin+commercial OK |
| P2 | ✓ | 4 stories BLOCKED (EP02-S05, EP04-S05, EP05-S02, EP06-S04) reformulees, seed labels commercialise |

Total commits : 5 (mais 4 a pusher sur origin/main lors de la derniere mesure).

---

## P0 — Remote GitHub

- Remote `origin` ajoute : `https://github.com/zaturalive/CRM_COMMERCIAL.git`
- Push initial des 3 commits (fork + skill HDS + ADR-0002 + actions immediates) fait par l'utilisateur via `! git push -u origin main` (l'agent n'a pas les credentials HTTPS).

## P1.A — Migration Prisma

### Schema (`apps/backend/prisma/schema.prisma`)

```diff
 enum UserRole {
   ADMIN
   COMMERCIAL
-  CHIRURGIEN
 }

 model Process {
   ...
   noteCommerciale            String?
-  noteMedecin                String?
   ...
 }
```

### Migration generee

Dossier : `apps/backend/prisma/migrations/20260519134100_remove_chirurgien_role_and_note_medecin/`

```sql
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
```

NB : Prisma migrate dev exige un TTY pour confirmer la perte de donnees. Comme l'environnement etait non-interactif, la migration a ete generee via `prisma migrate diff` puis appliquee via `prisma migrate deploy`. Le client Prisma a ensuite ete regenere via `prisma generate`.

### Resultat sur la DB

- Enum `UserRole` reduit a `{ADMIN, COMMERCIAL}` (verifiable via `\dT+` dans psql)
- Colonne `Process.noteMedecin` retiree
- Tests : login `chirurgien@cabinet-demo.fr` retourne 401 (user n'existe plus dans le seed)

---

## P1.B — Backend (15 fichiers + 2 suppressions)

### Routes
- `apps/backend/src/routes/devis.ts` — retrait des 4 role-gating `role === "CHIRURGIEN"` (lignes 483, 491, 669, 707, 928, 950). Le COMMERCIAL+ADMIN ont maintenant la main sur acompte, solde, stay, reschedule.
- `apps/backend/src/routes/processes.ts` — retrait role-gating sur `PATCH /:id/notes` (la note commerciale est la seule conservee). Retrait de l'import `stripHiddenNotes` + de tous les call-sites (8 occurrences inline).
- `apps/backend/src/routes/pipeline.ts` — retrait `stripHiddenNotes` + variable `role` devenue inutilisee.
- `apps/backend/src/routes/followup.ts` — meme nettoyage.
- `apps/backend/src/routes/demo.ts` — commentaire JSDoc des roles maj.

### Schemas Zod
- `apps/backend/src/schemas/auth.ts` — `switchRoleSchema` reduit a `["ADMIN", "COMMERCIAL"]`.
- `apps/backend/src/schemas/processes.ts` — `notesSchema` simplifie : `noteCommerciale` requis (plus de union avec noteMedecin).
- `apps/backend/src/schemas/devis.ts` — commentaire JSDoc maj (COMMERCIAL_ONLY_FIELDS conserve comme const documentaire).

### Libs
- `apps/backend/src/lib/processSerializer.ts` — **fichier supprime** (la fonction `stripHiddenNotes` n'a plus de raison d'etre puisque CHIRURGIEN n'existe plus).
- `apps/backend/src/lib/processEnrichment.ts` — champ `noteMedecin` retire de l'interface `ProcessForEnrichment` + de l'objet retourne par `enrichProcess`.

### Tests securite
- `apps/backend/tests/security/notes-bypass.test.ts` — **fichier supprime** (les 5 tests testaient le bypass noteMedecin / CHIRURGIEN qui n'existent plus).
- `apps/backend/tests/security/processes.test.ts` — describe block "Notes role-differenciees" remplace par "Note commerciale (ADR-0002)" avec 4 tests focalises sur noteCommerciale + lecture seule.
- `apps/backend/tests/security/devis.test.ts` — 5 tests CHIR-boundary supprimes (PATCH cliniqueId 403, PATCH timeIntervention 403, CHIR PATCH stay 403, PATCH /acompte CHIR 403, PATCH /solde CHIR 403). Reste des tests, les actors `chirA` renommes en `commA` partout.
- `apps/backend/tests/security/cliniques.test.ts` — 2 tests CHIRURGIEN supprimes.
- `apps/backend/tests/security/interventions.test.ts` — 2 tests CHIRURGIEN supprimes.
- `apps/backend/tests/helpers/testAuth.ts` — `setupTestTenant` ne cree plus que 2 users (ADMIN + COMMERCIAL).

### Seeds
- `apps/backend/prisma/seed.ts` — commentaires maj, plus aucune reference a CHIRURGIEN/noteMedecin dans la logique.
- `apps/backend/prisma/seed.example.ts` — user CHIRURGIEN retire du template.
- `apps/backend/prisma/seed.local.ts` — user `alexis@cabinet-delobaux.fr` (Dr Delobaux CHIRURGIEN) retire. 4 `noteMedecin: "..."` contenant des informations medicales (BMI, ASA, ptose, etc.) **supprimes** (donnees sante en clair dans le code source).

---

## P1.C — Frontend (20 fichiers + 0 suppression)

### Types
- `apps/frontend/src/types/processes.ts` — champ `noteMedecin: string | null` retire des interfaces `PipelineProcess` + `ProcessDetail`.

### Composants pipeline
- `apps/frontend/src/components/pipeline/ProcessNotes.tsx` — **reecrit completement**. Plus de section note medicale, plus de variable `noteMedecin`, plus de logique de role-gating. Composant reduit a une textarea note commerciale avec auto-save 2s.
- `apps/frontend/src/components/pipeline/ProcessTabs.tsx` — `role` reduit a `"ADMIN" | "COMMERCIAL"`. Logique conditionnelle simplifiee (plus de cas special CHIRURGIEN pour le tab par defaut).
- `apps/frontend/src/components/pipeline/StageContextBanner.tsx` — message du stage CONSULTATION : "Le chirurgien rencontre le patient" → "Rendez-vous client realise. Noter le compte-rendu commercial.".
- `apps/frontend/src/components/pipeline/ConsultationDateDialog.tsx` — texte de la modal maj : "Quand le patient rencontre le chirurgien" → "Date du rendez-vous avec le client".

### Composants devis
- `apps/frontend/src/components/devis/DevisBuilder.tsx` — variable `isChirurgien` retiree, tous les `disabled={isChirurgien}` remplaces par `disabled={false}`. Titre "Partie technique (chirurgien)" → "Partie technique". Phrase "Lecture seule pour ce role" retiree. Commentaire d'en-tete maj.

### Composants layout
- `apps/frontend/src/components/layout/Sidebar.tsx` — type `UserRole` reduit a `"ADMIN" | "COMMERCIAL"`. Tous les `roles: [..., "CHIRURGIEN"]` purges (10 occurrences). Texte "CRM Chirurgien" remplace par "CRM Commercial" dans le branding sidebar.
- `apps/frontend/src/components/layout/RoleSwitcher.tsx` — array `ROLES` reduit a 2 elements + grid passe de `grid-cols-3` a `grid-cols-2`.

### Composants agenda
- `apps/frontend/src/components/agenda/EventSheet.tsx` — bloc `if (role !== "CHIRURGIEN" && role !== "ADMIN") { toast.error("Reserve au chirurgien") return; }` retire (tout role authentifie peut toggler isDone).

### Pages
- `apps/frontend/src/app/layout.tsx` — `<title>` et description metadata : "CRM Chirurgien" → "CRM Commercial".
- `apps/frontend/src/app/(app)/follow-up/page.tsx` — `<title>` maj.
- `apps/frontend/src/app/(app)/config/layout.tsx` — commentaire JSDoc maj (mention ADR-0002).
- `apps/frontend/src/app/(app)/dashboard/page.tsx` — commentaire JSDoc maj.
- `apps/frontend/src/app/(app)/pipeline/page.tsx` — commentaire JSDoc maj.
- `apps/frontend/src/app/login/page.tsx` — branding "CRM Chirurgien" → "CRM Commercial". Liste comptes demo passee de 3 a 2 utilisateurs.

### Tests Vitest
- `apps/frontend/src/lib/optimistic/movePipelineProcess.test.ts` — `noteMedecin: null` retire de la fixture `makeProcess`.

### Tests e2e Playwright
- `apps/frontend/tests/e2e/role-aware.spec.ts` — 3 tests CHIRURGIEN supprimes ("CHIRURGIEN voit tous les onglets", "CHIRURGIEN atteint /pipeline", "CHIRURGIEN atteint /config/document-labels"). Test "switcher visible pour COMMERCIAL et permet de passer ADMIN" maj (plus de `role-switch-chirurgien`). Boucle "switcher present pour chaque role" reduite a 2 emails.
- `apps/frontend/tests/e2e/agenda.spec.ts` — helper `loginChir(page)` renomme `loginComm(page)` (utilise julie@ commercial au lieu d'alexis@). Tous les `await loginChir(page)` remplaces.
- `apps/frontend/tests/e2e/devis.spec.ts` — test "CHIRURGIEN voit la section technique mais la commerciale est disabled" supprime.
- `apps/frontend/tests/e2e/devis-error-toast.spec.ts` — test `patchIntervention duration = 0` reecrit (utilise julie sans switcher CHIR).
- `apps/frontend/tests/e2e/visual-audit.spec.ts` — screenshot "03 - dashboard chirurgien" renomme "03 - dashboard admin". Toutes les references `alexis@cabinet-delobaux.fr` remplacees par `julie@cabinet-delobaux.fr`.
- `apps/frontend/tests/e2e/auth.spec.ts` — login `alexis@` remplace par `julie@`.

---

## P1.D — Smoke test (programmatique)

### Backend (sur :4100)
- `GET /api/health` → 200 `{success: true, status: ok}`
- `POST /api/auth/login {commercial@cabinet-demo.fr}` → 200 + JWT signe
- `POST /api/auth/login {admin@cabinet-demo.fr}` → 200 + JWT signe
- `POST /api/auth/login {chirurgien@cabinet-demo.fr}` → 401 Invalid credentials (user inexistant)
- `npm run test` → 29 tests verts (unit + integration)
- `npm run test:security` → 230 tests verts (21 fichiers)

### Frontend (sur :3301)
- `GET /login` → 200, HTML contient "CRM Commercial", description "CRM multi-tenant pour cabinets de prestations esthetiques"
- `GET /dashboard | /pipeline | /agenda | /follow-up | /clients | /config/cliniques` → 307 redirect vers /login (auth guard fonctionne)
- 0 mention de "chirurgien" dans le HTML rendu de /login

### Configuration docker
- Port frontend change de **3300 → 3301** car le port 3300 est deja occupe par `autofront_ai` sur la machine de dev. Modifie dans `docker/docker-compose.yml`, `.env`, `.env.example`. Pas de breaking change pour la prod (les ports sont configurables via les env vars).
- Docker compose appele avec `--env-file /home/dimitry/Documents/Perso/Projets/CRM_commercial/.env` pour resoudre la non-injection des secrets (compose cherche `.env` relativement au compose file par defaut).

---

## P2 — Reformulation des 4 stories BLOCKED

### EP02-S05 — Document Labels
- **Avant** : 11 labels medicaux (Bilan sanguin, Consentement eclaire, ECG, Mammographie, Echographie mammaire, Ordonnance pre-op, Photos face/profil/dos, Consultation anesthesiste, Piece d'identite).
- **Apres** : 8 labels administratifs / financiers (Carte d'identite, Justificatif de domicile, RIB, Mutuelle, Attestation employeur, Devis signe, CGV signees, Plan de financement).
- **Story** : reecrite avec "documents administratifs et financiers" au lieu de "documents pre-operatoires".
- **Seed.ts** : array `DOCUMENT_LABELS` remplace + array `INTERVENTIONS[].labelSlugs` mis a jour pour pointer vers les nouveaux slugs (`id`, `rib`, `devis`, `cgv`, `mutuelle`, etc.).
- **Seed.local.ts** : array `labelsData` remplace + nouvelles constantes `baseDocs` / `baseDocsMutuelle` / `largeDocs` definies pour categoriser les prestations (faible / moyen / fort montant) en termes de documents requis.

### EP05-S02 — Devis technique
- **Avant** : titre "Devis technique (UI chirurgien)", user story "En tant que chirurgien, je veux remplir la partie technique du devis [...] afin de focusser sur l'acte medical."
- **Apres** : titre "Devis technique (UI partie technique)", user story "En tant qu'utilisateur (COMMERCIAL ou ADMIN), je veux remplir la partie technique du devis [...] afin de focusser sur la partie technique de la prestation avant l'enrichissement commercial (clinique, date, heure)."
- Acceptance criteria : le test "CHIR PATCH avec cliniqueId → 403" est retire (le code ne fait plus ce check).

### EP06-S04 — Preview Agent IA WhatsApp
- **Avant** : mocks pre-remplis "Pourriez-vous m'envoyer votre bilan sanguin en photo ?" + "Parfait, je vous rappelle aussi votre consentement eclaire a signer." + Dr Delobaux.
- **Apres** : mocks "Votre devis est pret a signer." + "Pouvez-vous envoyer votre RIB pour planifier l'acompte ?" + "Merci aussi d'envoyer votre carte d'identite pour finaliser le dossier. Le RDV de pre-prestation est confirme pour le 12 juin." + reference au "cabinet" au lieu de Dr Delobaux.
- Dict de reponses bot : keywords commercial (devis, rib, identite, rdv, acompte, solde) au lieu de keywords medicaux (bilan).

### EP04-S05 — Note commerciale (anciennement Notes commerciale + medicale)
- **Avant** : "En tant que chirurgien, je veux ecrire des notes medicales invisibles au commercial..."
- **Apres** : "En tant qu'utilisateur (COMMERCIAL ou ADMIN), je veux ecrire une note commerciale sur un process..."
- Acceptance criteria : reduit a 1 textarea + auto-save 2s. Tests securite reecrits autour de noteCommerciale uniquement. Note : le code etait deja conforme depuis P1.B/C, seule la story markdown manquait d'etre alignee.

### Rapport HDS mis a jour
- `docs/product/HDS-CHECK-REPORT-2026-05-18.md` : synthese globale enrichie d'une 4eme colonne "Apres P1 + P2 (2026-05-20)". Les 3 stories EP02-S05/EP05-S02/EP06-S04 sont rayees de la liste BLOCKED.

---

## Commits de la session

| SHA | Message | Fichiers |
|-----|---------|----------|
| `634e63d` | feat: backend retire role CHIRURGIEN et noteMedecin (ADR-0002) | 20 |
| `e4367f5` | feat: frontend retire UI CHIRURGIEN et editeur noteMedecin (ADR-0002) | 20 |
| `b1b7234` | test: retire les 2 tests CHIR boundary obsoletes sur acompte/solde | 1 |
| `9c89f9f` | chore: port frontend 3300 -> 3301 + metadata CRM Commercial | 4 |
| `<P2>` | feat: P2 — reformulation stories BLOCKED + seed labels commerciaux | ~7 (a commit) |

Format commit suivi : `type: description` (conventions BYAN — pas d'emoji, pas de "Generated with...").

---

## Ce qui n'a PAS ete fait dans cette session

- **P3** — arbitrage des 8 stories SUSPECT (patterns textes libres + uploads). Necessite decision user sur les mitigations (warnings UI, audits, restrictions).
- **P4** — Sprint 1 vocabulaire commercial (rename Patient → Client, Consultation → Rendez-vous, dateIntervention → datePrestation). Cible : 2-3 jours d'effort. Migration unique `rename_columns_commercial_vocabulary` a generer.
- **P5** — 2e passe HDS-CHECK complete sur les 50 stories avec les regles ADR-0002. A faire apres P3 + P4 pour avoir une vue finale.
- **package-lock.json + package.json** — nom du workspace frontend (`@crm-chirurgien/frontend`) inchange. P4 ou un cleanup ulterieur.
- **Documentation ancienne** (data-model.md, glossary.md, decisions/0005-test-strategy.md, etc.) — conservent leurs references au modele initial avec CHIRURGIEN. Ces docs documentent l'histoire et un encadre pointant vers ADR-0002 suffit (a faire en P4 / P5).

---

## Limitations connues

- **Push GitHub** : l'agent n'a pas les credentials HTTPS GitHub (pas de gh CLI ni de credential helper). Chaque push doit etre fait manuellement par l'utilisateur via le mode shell `!`. Recommandation : `gh auth login` une bonne fois, ou ajouter une cle SSH a GitHub.
- **Smoke test browser manuel** : effectue uniquement via curl. Le test manuel dans Chrome/Firefox (login admin → sidebar, login commercial → toutes les pages) reste a faire par l'utilisateur (URL : http://localhost:3301).
- **Migrate dev non-interactif** : Prisma exige un TTY pour les migrations qui suppriment des valeurs d'enum. Pour la suite, soit utiliser `--create-only` + `deploy`, soit lancer une session interactive `docker compose exec -it backend ...`.
- **Frontend conteneur** : doit etre redemarre avec `--env-file <chemin absolu>` pour que les secrets soient injectes (compose cherche `.env` relativement au chemin du compose file par defaut, ce qui ne correspond pas a `.env` racine du repo).
