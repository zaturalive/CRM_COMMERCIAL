# Actions immediates — CRM Commercial — 2026-05-18

> Ce document est destine a la prochaine instance Claude lancee depuis
> `/home/dimitry/Documents/Perso/Projets/CRM_commercial/`. Il liste, par ordre
> de priorite, ce qui doit etre fait apres la session du 2026-05-18.
>
> Pour le contexte complet : `README.md` racine + `docs/architecture/decisions/`.

---

## Statut au 2026-05-18 (debut de session prochaine)

- **Repo cree** : fork de `crm-chirurgien` au commit `8c68cfb` (16 mai)
- **Git** : 3 commits locaux sur `main`, **pas encore lie a un remote GitHub**
- **Configs adaptees** : noms, ports (3300/4100), DB (`crm_commercial`), seed sans CHIRURGIEN
- **Doc creee** : README racine, ADR-0001 (fork), ADR-0002 (suppression CHIRURGIEN + notes), SKILL `byan-hds-check`, HDS-CHECK-REPORT
- **Code metier** : INCHANGE par rapport au repo source (schema Prisma + routes + composants identiques au commit `8c68cfb`). L'adaptation au CRM Commercial reste a faire.

## Priorisation

| Priorite | Tache | Durée estimée |
|----------|-------|---------------|
| P0 | Link GitHub remote + push | 5 min |
| P1 | Migration Prisma : retirer `UserRole.CHIRURGIEN` + `Process.noteMedecin` | 30-60 min |
| P1 | Adapter le code backend / frontend aux decisions ADR-0002 | 2-4 h |
| P2 | Reformuler les 3 stories BLOCKED restantes | 1 h |
| P3 | Arbitrer + traiter les 8 stories SUSPECT | 2-3 h |
| P4 | Sprint 1 : adaptation vocabulaire commercial (patient -> client, etc.) | 2-3 j |
| P5 | Relancer une 2e passe HDS sur les stories apres ADR-0002 | 30 min |

---

## P0 — Link GitHub remote (5 min)

Le user va creer le repo GitHub vide (suggestion : nom `crm-commercial`). A son retour :

```bash
cd /home/dimitry/Documents/Perso/Projets/CRM_commercial
git remote add origin git@github.com:<user>/crm-commercial.git
git push -u origin main
```

Verifier ensuite que les 3 commits arrivent bien sur GitHub :

```bash
git log --oneline -5
# 1. feat: fork initial depuis crm-chirurgien (commit 8c68cfb du 2026-05-16)
# 2. feat: skill byan-hds-check + annotations HDS-CHECK des 50 stories
# 3. (potentiel commit ADR-0002 + maj seed/README/SKILL/REPORT)
```

---

## P1 — Implementer les decisions de l'ADR-0002

### P1.A — Migration Prisma (30 min)

L'ADR-0002 dit : retirer `UserRole.CHIRURGIEN` et `Process.noteMedecin`. Dans
`apps/backend/prisma/schema.prisma` :

```diff
 enum UserRole {
   ADMIN
   COMMERCIAL
-  CHIRURGIEN
 }
```

```diff
 model Process {
   ...
-  noteMedecin                String?
   noteCommerciale            String?
   ...
 }
```

Generer la migration :

```bash
docker compose -f docker/docker-compose.yml exec backend npx prisma migrate dev --name remove_chirurgien_role_and_note_medecin
```

Verifier que la migration ne casse pas les seeds : les seeds modifies n'utilisent
deja plus le role CHIRURGIEN (commit precedent).

### P1.B — Backend : adapter routes et middleware (1-2 h)

Fichiers a modifier en priorite :

| Fichier | Modification |
|---------|--------------|
| `apps/backend/src/routes/auth.ts` | Retirer la validation `UserRole.CHIRURGIEN` du login |
| `apps/backend/src/routes/processes.ts` | Retirer le role-gating CHIRURGIEN sur `PATCH /:id/notes` (retirer `noteMedecin` du body schema). Le COMMERCIAL ecrit `noteCommerciale` seul. |
| `apps/backend/src/routes/devis.ts` | Retirer le role-gating CHIRURGIEN sur PATCH devis-interventions (isDone, etc.). Le COMMERCIAL fait l'action. Idem stays/:stayId/date. |
| `apps/backend/src/routes/demo.ts` | Retirer l'option CHIRURGIEN du switch-role |
| `apps/backend/src/schemas/auth.ts` | Adapter le Zod schema UserRole |
| `apps/backend/src/schemas/processes.ts` | Retirer `noteMedecin` du Zod schema notes |
| `apps/backend/src/schemas/devis.ts` | Retirer les conditions role CHIRURGIEN |
| `apps/backend/tests/**` | Adapter les tests qui mocquaient un user CHIRURGIEN |

Strategie : utiliser `grep -rn "CHIRURGIEN\|noteMedecin" apps/backend/src/` pour
localiser tous les usages avant de les retirer un par un.

### P1.C — Frontend : adapter UI et auth (1-2 h)

```bash
grep -rn "CHIRURGIEN\|noteMedecin\|chirurgien" apps/frontend/src/ | head -50
```

Fichiers a modifier en priorite :

| Fichier | Modification |
|---------|--------------|
| `apps/frontend/src/components/layout/RoleSwitcher.tsx` | Retirer l'option CHIRURGIEN du dropdown |
| `apps/frontend/src/components/layout/Sidebar.tsx` | Verifier qu'aucun item n'est conditionne sur role CHIRURGIEN |
| `apps/frontend/src/components/pipeline/ProcessNotes.tsx` | Retirer le bloc noteMedecin. Garder noteCommerciale uniquement. |
| `apps/frontend/src/components/devis/DevisBuilder.tsx` | Retirer le role-gating CHIRURGIEN (isDone, reprog date, etc.) |
| `apps/frontend/src/components/agenda/AgendaView.tsx` | Verifier role check (le COMMERCIAL voit tout) |
| `apps/frontend/src/lib/auth.ts` / NextAuth types | Adapter UserRole TS |

### P1.D — Smoke test

```bash
npm run dev    # demarrer le stack sur 3300/4100
npm run db:reset && npm run db:seed
```

Tester en navigateur :
- Login admin -> verifier sidebar
- Login commercial -> verifier acces a toutes les pages (pipeline + agenda + devis + parametrage)
- Confirmer qu'aucun bouton n'est grise par role CHIRURGIEN

---

## P2 — Reformuler les 3 stories BLOCKED restantes (1 h)

Apres l'ADR-0002, il reste 4 stories BLOCKED dont **3 a reformuler** (EP04-S05
est resolu par ADR-0002). Detail dans
`docs/product/HDS-CHECK-REPORT-2026-05-18.md` §Stories BLOCKED.

### EP02-S05 (Document Labels seed)

Fichier story : `docs/product/stories/EP02-S05.md`. Le seed mentionne :
`Bilan sanguin`, `ECG`, `Consentement eclaire`, `documents pre-operatoires`.

**Action** : remplacer par des labels commerciaux purs :
- Carte d'identite
- Justificatif de domicile
- RIB
- Mutuelle (carte tier-payant)
- Devis signe
- CGV signees

Reformuler la story + le code seed (`apps/backend/prisma/seed.ts` section
DOCUMENT_LABELS_BASE — a localiser).

### EP05-S02 (Devis technique UI chirurgien)

Fichier : `docs/product/stories/EP05-S02.md`. Mentionne "focusser sur l'acte
medical" et "UI chirurgien".

**Action** : reformuler en "saisir la partie technique du devis (prestation +
duree + honoraires)". Retirer toute reference au role CHIRURGIEN puisqu'il
n'existe plus (ADR-0002).

### EP06-S04 (Preview Agent IA mock WhatsApp)

Fichier : `docs/product/stories/EP06-S04.md`. Les messages mock pre-remplis
citent "bilan sanguin" et "consentement eclaire".

**Action** : reformuler les mocks avec :
- "Bonjour, votre devis est pret a signer."
- "Pouvez-vous envoyer votre RIB pour planifier l'acompte ?"
- "RDV de pre-prestation confirme pour le ..."
- "Merci d'envoyer la carte d'identite pour finaliser le dossier."

---

## P3 — Arbitrer les 8 stories SUSPECT (2-3 h)

Liste dans `docs/product/HDS-CHECK-REPORT-2026-05-18.md` §Stories SUSPECT.
Deux patterns recurrents :

### Pattern A — texte libre (EP09-S03, EP09-S04, EP09-S06)

Champs `note`, `body` template, etc. Risque que le COMMERCIAL y saisisse de la
donnee medicale. Mitigation possible :

- Guideline UI : placeholder explicite "saisissez une note commerciale (pas de donnee medicale)"
- Validation cote backend : warning si le texte contient des mots-cles `byan-hds-check` §3.1
- Audit periodique (script sql ou skill agent)
- Clause contractuelle dans le contrat user-final

**Decision user requise** : implementer le warning ou pas ? Audit a quelle frequence ?

### Pattern B — upload / template (EP06-S01, EP06-S02, EP10-S01, EP10-S02, EP10-S04)

Risque que l'utilisateur upload un PDF medical ou un template HTML medical.
Mitigation possible :

- Restreindre les types de fichier (deja fait : JPEG/PNG/PDF, max 10 Mo)
- Pre-check filename (refuser `*-medical-*`, `*-bilan-*`, etc. — fragile)
- Modal d'avertissement avant upload : "rappel : pas de document medical"
- Audit periodique des fileUrl + scan des noms

**Decision user requise** : niveau de restriction ?

---

## P4 — Sprint 1 : adaptation vocabulaire commercial (2-3 j)

Une fois les BLOCKED + SUSPECT traites, lancer le sprint 1 d'adaptation
vocabulaire. Les 27 stories `OK avec rename` du rapport HDS donnent le periphérique.

Strategie suggeree (a valider avec user) :

### Sprint 1.1 — Schema Prisma + migrations (1/2 j)

| Ancien nom | Nouveau nom |
|------------|-------------|
| `Process.consultationDate` | `Process.dateRendezVous` |
| `DevisIntervention.dateIntervention` | `DevisIntervention.datePrestation` |
| `DevisIntervention.timeIntervention` | `DevisIntervention.heurePrestation` |
| `Intervention` (table) | conserver le nom technique, renommer les libelles UI seulement |

Generer une migration unique : `rename_columns_commercial_vocabulary`.

### Sprint 1.2 — Backend (1/2 j)

`grep -rn "patient\|consultation\|chirurgien\|intervention" apps/backend/src/`
puis remplacements ciblés (attention aux mots techniques type "intervention"
dans le nom de la table — conserver).

### Sprint 1.3 — Frontend (1 j)

Libelles UI : Patient -> Client, Consultation -> Rendez-vous, etc.
Plus volumineux mais moins risque.

### Sprint 1.4 — Tests E2E + smoke (1/2 j)

Adapter les selecteurs Playwright qui contiennent l'ancien vocabulaire.

---

## P5 — Seconde passe HDS-CHECK (30 min)

Apres ADR-0002 + reformulations, relancer le skill `byan-hds-check` sur les 50
stories pour avoir des verdicts a jour.

Commande suggeree (a la prochaine instance Claude) :

```
Relancer le skill byan-hds-check sur toutes les stories de
docs/product/stories/ en appliquant les regles ADR-0002 (role
CHIRURGIEN BLOCKED, notePraticien BLOCKED) et regenerer le rapport
docs/product/HDS-CHECK-REPORT-2026-05-18.md.
```

---

## Risques connus

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Migration Prisma echoue par incompatibilite avec donnees existantes | Moyen | Le seed est vide, pas de risque sur dev. Sur prod, verifier les donnees avant migration. |
| Tests E2E cassent apres rename | Faible | Tests E2E adaptes en Sprint 1.4 |
| User final tente de remplir un texte libre avec donnee medicale | Eleve | Voir P3 (mitigation pattern A) |
| Code source contient des references croisees au repo source (imports relatifs ?) | Faible | Le clone est autonome, mais re-verifier au demarrage |

---

## Commandes prêtes a copier

```bash
# Demarrer le stack
cd /home/dimitry/Documents/Perso/Projets/CRM_commercial
cp .env.example .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -hex 32)|" .env
npm run dev

# Migrer + seed
npm run db:migrate
npm run db:seed

# Smoke test connexions
# - http://localhost:3300 -> login admin@cabinet-demo.fr / demo
# - http://localhost:3300 -> login commercial@cabinet-test.fr / demo

# Push GitHub (apres creation du repo distant)
git remote add origin git@github.com:<user>/crm-commercial.git
git push -u origin main

# Localiser les usages CHIRURGIEN avant retrait
grep -rn "CHIRURGIEN\|noteMedecin\|chirurgien" apps/ --include='*.ts' --include='*.tsx' | head -50

# Lancer 2e passe HDS apres ADR-0002 (manuel, via Claude)
# Demander : "Relance le skill byan-hds-check sur les stories en appliquant ADR-0002"
```

---

## Liens cles

- `README.md` racine — quick start
- `docs/architecture/decisions/0001-fork-depuis-crm-chirurgien.md` — ADR fork
- `docs/architecture/decisions/0002-suppression-role-chirurgien-et-notes.md` — ADR decisions du jour
- `docs/document-reference-complet-crm-commercial.md` — contexte complet (Florian + entreprise mexicaine + contrat)
- `docs/product/HDS-CHECK-REPORT-2026-05-18.md` — audit HDS des stories
- `.claude/skills/byan-hds-check/SKILL.md` — protocole HDS

Repo source de reference (lecture seule) :
- `../CRM_chirurgien/docs/architecture/features-tables-mapping.md` — audit code du 2026-05-16
- `../CRM_chirurgien/docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md` — decision pivot
