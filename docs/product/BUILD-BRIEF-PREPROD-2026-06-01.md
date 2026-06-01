# BUILD BRIEF — Vague pre-prod CRM Commercial (Vencor) — a charger dans l'ultracode

> **Role de ce fichier** : brief autonome pour la session de build (ultracode). Il contient tout
> le contexte, les contraintes, les decisions et le plan story-par-story. La session qui le charge
> doit pouvoir executer toute la vague sans autre input. Source de verite complementaire :
> `docs/product/ETAT-PRE-PROD-2026-06-01.md` + les fichiers `docs/product/stories/EPxx-Sxx.md`.

---

## 0. Mission

Construire la **base avant prod** du CRM Commercial : 18 stories (securite, provisioning, comptes,
back office editeur, devis), en **dev + tests unitaires + tests de securite**, en **TDD**.
C'est l'**application** uniquement. L'infra/serveur est faite ailleurs (FD `vencor-hardening-zero-trust`
+ repo `vencor-infra`). Ce n'est PAS la V1 (Stripe, Yousign, WhatsApp/IA, sync Google Calendar).

Stack : monorepo — `apps/frontend` (Next.js 15), `apps/backend` (Express + Prisma), `packages/shared`.

---

## 1. Contraintes dures (NON NEGOCIABLES)

1. **Modele** : tous les agents dev/test tournent en **opus 4.8, effort max**. Pas de downgrade vers
   sonnet/haiku, meme sous ultracode. Dans un Workflow : `model: 'opus'` sur chaque `agent()`.
2. **TDD** : pour chaque story, ecrire les **tests de securite + tests unitaires AVANT** le code.
   Le code passe quand les tests passent.
3. **Zero regression** : `npm test` reste vert sur les tests pre-existants (l'app a deja une suite
   securite + unit). Une story ne casse pas l'existant.
4. **Isolation multi-tenant** : ne pas regresser. Elle est portee par `tenantId` (JWT) + Prisma
   `$extends`. Tout acces cross-tenant doit etre explicite, trace et borne.
5. **Pas d'emoji** dans le code, les commits, les specs (Mantra IA-23). Commentaires pour le POURQUOI
   uniquement (IA-24).
6. **Commits** : `type: description` (feat/fix/test/refactor/chore/docs), sans emoji, atomiques (une
   story = un commit coherent, tests + code ensemble ou tests d'abord puis code).
7. **HDS / non-HDS** : aucune donnee de sante (Art. 9 RGPD). Pour les stories devis (EP16), passer le
   rendu final dans le skill `byan-hds-check`. Les elements medicaux (consentement medical, frais
   anesthesiste, antecedents) sont BLOCKED.
8. **Hook fact-check** : un PreToolUse hook bloque l'ecriture de fichiers contenant des absolus non
   sources (adverbes d'absolu temporel, superlatifs non etayes, formulations de certitude non sourcees).
   Rediger les tests, docs et commentaires en evitant ces formulations, ou les sourcer (RFC / CVE / URL).
9. **Branche** : tout le travail sur **`feat/preprod-base`** (creer depuis le HEAD actuel de
   `feat/wave3-security-cicd`, qui porte deja les stories + ce brief). Ne PAS commiter sur la branche
   infra. Ne PAS toucher `_byan-output/fd-state.json` (il appartient a la session infra).
10. **Perimetre** : app seulement. Ne pas faire backup DB, monitoring, TLS, DNS, Docker, CI (= infra).

---

## 2. Etat verifie du code (audit 2026-06-01) — ne pas re-decouvrir

**Deja en place (ne pas refaire)** : Helmet + HSTS (`apps/backend/src/app.ts:40`), rate-limit login
10/15min prod (`middleware/rateLimit.ts`), health check backend `/api/health` (`app.ts:65`), isolation
multi-tenant (`tenantId` JWT + Prisma `$extends`), bcrypt + dummy-hash timing-safe (`requireJWT.ts`),
DEMO_MODE coupable via `NEXT_PUBLIC_DEMO_MODE`.

**Absent (a construire)** : reset password, change password, creation cabinet/comptes (UI), gate CGU,
modele `AuditLog`, chiffrement at-rest, RGPD self-service, 2FA, health check front, niveau editeur /
back office, devis PDF utilisable + remise + apercu.

**Creds de demo a neutraliser** : `apps/backend/prisma/seed.ts:185` cree les comptes avec le mot de
passe "demo" en dur. Les comptes de prod partent avec `mustChangePassword = true`.

**Roles actuels** : `ADMIN`, `COMMERCIAL` (le `CHIRURGIEN` a ete retire — ADR-0002). Pas de niveau
au-dessus d'ADMIN.

---

## 3. Decisions verrouillees (2026-06-01)

- **Provisioning** : modele a 2 niveaux. L'**editeur** (plateforme) cree les cabinets + le 1er admin ;
  l'**admin de cabinet** gere ses propres commerciaux.
- **Acces editeur aux tenants** : l'editeur accede a n'importe quel tenant **en autonomie**
  (impersonation/observation, lecture par defaut), sans qu'un user du cabinet lui cree un compte (EP17-S04).
- **Audit** : middleware global sur toutes les routes qui logue qui/quoi/ou/comment/quand (EP14-S04).
- **CGU** : texte redige par Claude avec le contexte projet complet (EP14-S07), revue juriste
  ulterieure non bloquante.
- **Email** : SMTP auto-heberge ou Brevo gratuit, pas au demarrage. Au demarrage, le reset passe par
  l'admin/editeur (mot de passe temporaire) — pas de blocage.
- **Devis** : fix utilisable + mentions legales (EP16-S01), remise (EP16-S02), petite previsualisation
  a droite (EP16-S03). Le wizard/brouillon reste V1.1.
- **Audit log + pgcrypto** : 2FA et CGU partent en degrade (crypto app-level, trace via ligne Tenant /
  log applicatif) ; la version propre est livree par EP14-S04 et EP14-S05.

---

## 4. Branche & orchestration

- Branche unique **`feat/preprod-base`** (depuis le HEAD actuel). Simplicite : une seule histoire,
  pas de conflit cross-branche sur `schema.prisma`.
- **Migrations Prisma** : consolidees / sequencees pour eviter les collisions. Si plusieurs stories
  ajoutent des colonnes, regrouper ou ordonner les migrations.
- **Workflow ultracode** : Vague 0 et Vague 1 sequencees (cœur partage). Vague 2 en pipeline par story,
  parallelisable avec **worktree isolation** pour les writers concurrents ; coordonner les migrations.
- **Etape 0 du run** : synchroniser l'index doc (`epics.md`, `backlog.md`, `ETAT-PRE-PROD`) pour
  inclure EP16-S03, EP14-S07, EP17 et marquer les dependances comme resolues.

---

## 5. Vague 0 — Decisions d'architecture a produire (1 passe architecte)

Produire un ADR (`docs/architecture/decisions/0009-preprod-foundations.md`) tranchant :
- **D1 — Niveau editeur** : recommandation = **table `PlatformAdmin` dediee** (isolation plus nette
  qu'un enum dans `UserRole` qui est tenant-scope). Impacte JWT, `requireJWT`, `$extends`.
- **D2 — Jeton d'impersonation editeur** (EP17-S04) : `{ editorId, tenantId, scope, expiresAt }`,
  distinct du JWT normal ; `requireJWT` le reconnait et propage `editorId` a l'audit.
- **D3 — Middleware audit** (EP14-S04) : global sur `/api`, capture en `res.on("finish")`, `bodyHash`
  SHA-256 (corps non stocke en clair), sanitization, ecriture non-bloquante.
- **D4 — Chiffrement at-rest** (EP14-S05) : app-level AES-256-GCM, cle via env/KMS, format versionne.
- **D5 — Password policy** (EP15-S04) : longueur min + regles, `mustChangePassword`, partagee reset/change.
- **D6 — Fonction de calcul devis** (EP16) : une seule source pour le total (avec remise), consommee
  par editeur + apercu + PDF + KPIs.
- **D7 — `EmailSender`** : interface (impl SMTP auto-heberge ou Brevo free), + chemin degrade reset
  par admin/editeur sans email.

---

## 6. Plan de build — vagues et stories

### Vague 1 — Fondations (cœur partage, sequence) → CHECKPOINT UTILISATEUR
| Story | Objet | Touche |
|---|---|---|
| EP17-S01 | Niveau editeur (`PlatformAdmin`) + `requireEditor` (back) + guard `/admin` (front) + coquille BO | JWT, requireJWT, middleware, schema, front middleware |
| EP14-S04 | Modele `AuditLog` + middleware global toutes routes | schema, app.ts, middleware |
| EP15-S04 | Password policy + `mustChangePassword` + change-password + gate force 1er login | schema, auth, front gate |
| EP14-S05 | Chiffrement at-rest app-level (helper + champs sensibles) | crypto helper, $extends, schema |

A la fin de la Vague 1 : **s'arreter**, presenter le diff du socle pour validation utilisateur.

### Vague 2 — Features (apres validation du socle)
**Groupe A — Provisioning / Back Office / comptes**
| Story | Objet | Dep |
|---|---|---|
| EP17-S02 | CRUD tenants (cree/liste/modifie/suspend) + 1er admin | S01 |
| EP15-S02 | Gestion users intra-cabinet (admin) | S01, S04 |
| EP17-S03 | CRUD users cross-tenant (editeur) | S01, S02 |
| EP15-S03 | Reset mdp (chemin degrade admin sans email) | S04 |
| EP15-S05 | Desactivation DEMO_MODE + retrait switcher en prod | — |
| EP17-S04 | Acces editeur autonome a un tenant (impersonation, lecture) | S01, S04 |
| EP17-S05 | Visualisation/analyse des logs d'audit | S04, S01 |

**Groupe B — Securite / conformite**
| Story | Objet | Dep |
|---|---|---|
| EP14-S07 | Redaction texte CGU non-HDS (par Claude, contexte projet) | — |
| EP14-S02 | Gate CGU + onboarding (consomme S07) | S07, S04 (degradable) |
| EP14-S01 | 2FA TOTP admin (login 2 etapes) | S05 (degradable), S04 (degradable) |
| EP14-S06 | RGPD self-service (export + suppression/anonymisation) | S04 (degradable) |

**Groupe C — Devis**
| Story | Objet | Dep |
|---|---|---|
| EP16-S01 | Refonte rendu PDF (mentions legales commerciales) | calc D6 |
| EP16-S02 | Champ remise dedie | EP16-S01 |
| EP16-S03 | Petite previsualisation a droite du devis maker | EP16-S01, S02 |

**Hors vague** : EP14-S03 (sous-domaine, depend infra), EP15-S01 (superseded par EP17-S02).

---

## 7. Recette TDD par story + Definition of Done

Pour chaque story :
1. Lire le fichier `docs/product/stories/EPxx-Sxx.md` (AC + tests de securite y sont listes).
2. Ecrire les **tests de securite** listes dans la story (fichier cible indique dans la story) + les
   tests unitaires des regles metier. Ils echouent (rouge).
3. Implementer jusqu'au vert.
4. Revue (quinn) + peer review conformite (compliance) ; pour EP16, passe `byan-hds-check`.
5. `npm test` complet : zero regression.
6. Commit `type: description` (sans emoji).

**Definition of Done** : tests securite + unit verts ; zero regression ; isolation multi-tenant verifiee ;
pas d'emoji ; HDS-check OK (devis) ; revue passee ; commit atomique.

---

## 8. Roster d'agents (par tache, tous opus 4.8 max)

| Tache | Agent |
|---|---|
| Decisions archi (Vague 0) | `bmad-bmm-architect` (Winston) |
| Implementation | `bmad-bmm-dev` (Amelia) |
| Tests unit + tests securite (TDD, ecrits avant) | `bmad-tea-tea` (Murat) |
| Revue de couverture / QA | `bmad-bmm-quinn` |
| Peer review securite/RGPD | `bmad-compliance` |
| Garde HDS (devis) | skill `byan-hds-check` |

---

## 9. Orchestration suggeree (Workflow ultracode)

- Vague 0 : 1 agent architecte → ADR-0009.
- Vague 1 : sequence story-par-story (cœur partage) ; chaque story = pipeline `tests securite+unit → impl → review`.
- Checkpoint : retour utilisateur sur le diff du socle.
- Vague 2 : pipeline par story ; paralleliser les groupes A/B/C avec worktree isolation pour les writers
  concurrents ; consolider les migrations Prisma ; verification adversariale des tests de securite
  (plusieurs verificateurs essaient de refuter chaque test critique).
- Completeness critic en fin de vague : "quelle AC non couverte, quel test manquant, quelle isolation
  non verifiee ?".

---

## 10. Index des stories (chemins)

EP14 : `EP14-S01.md` (2FA), `EP14-S02.md` (CGU gate), `EP14-S04.md` (audit middleware),
`EP14-S05.md` (at-rest), `EP14-S06.md` (RGPD), `EP14-S07.md` (texte CGU). [EP14-S03 hors vague]
EP15 : `EP15-S02.md` (users cabinet), `EP15-S03.md` (reset), `EP15-S04.md` (change+force),
`EP15-S05.md` (demo off). [EP15-S01 superseded]
EP16 : `EP16-S01.md` (PDF), `EP16-S02.md` (remise), `EP16-S03.md` (apercu).
EP17 : `EP17-S01.md` (socle BO+guard), `EP17-S02.md` (CRUD tenants), `EP17-S03.md` (users cross-tenant),
`EP17-S04.md` (acces editeur), `EP17-S05.md` (viewer logs).
Tous sous `docs/product/stories/`.

---

## 11. References

- Etat verifie + plan : `docs/product/ETAT-PRE-PROD-2026-06-01.md`
- Index epics : `docs/product/epics.md` (EP14-17) ; backlog : `docs/product/backlog.md` §10
- Checklist securite : `docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md`
- Legal/CGU : `docs/legal/CGU-clause-HDS-non-medical.md`, `docs/legal/MESSAGING-IN-APP-NON-HDS.md`
- ADRs : 0001 (fork), 0002 (roles), 0003 (non-HDS), 0008 (jumeau commercial)
- Regles projet : `.claude/CLAUDE.md` + `.claude/rules/` (mantras, fact-check, HDS)

---

*Brief cree le 2026-06-01. A charger dans la session ultracode. Construire sur `feat/preprod-base`,
fondations d'abord, checkpoint, puis features. Opus 4.8 max effort, TDD, zero regression, non-HDS.*
