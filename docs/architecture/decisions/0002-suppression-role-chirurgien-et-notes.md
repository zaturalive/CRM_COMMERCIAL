# ADR-0002 — Suppression du role CHIRURGIEN et du concept noteMedecin/notePraticien

> **Date** : 2026-05-18
> **Statut** : Accepted
> **Decideur** : Dimitry (user product owner)
> **Contexte amont** : [ADR-0001 (fork)](0001-fork-depuis-crm-chirurgien.md), [ADR-0008 du repo source](../../../../CRM_chirurgien/docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md), [byan-hds-check SKILL §7.4](../../../.claude/skills/byan-hds-check/SKILL.md)

---

## 1. Contexte

Apres premiere passe d'audit HDS sur les 50 stories du repo (cf. `docs/product/HDS-CHECK-REPORT-2026-05-18.md`), deux questions structurelles emergent :

1. Faut-il garder le role `CHIRURGIEN` (renomme `PRATICIEN`) dans le CRM Commercial ?
2. Faut-il garder un champ `noteMedecin` / `notePraticien` quelque part dans le schema ?

Le SKILL `byan-hds-check` §7.4 proposait initialement deux options pour `noteMedecin` : (a) retirer ou (b) renommer avec contractualisation. Idem pour le role : conserver avec rename `praticien` ou retirer.

Apres reflexion, decision tranchee.

## 2. Decision

### 2.1 Suppression du role CHIRURGIEN

- Le role `CHIRURGIEN` (et son potentiel rename `PRATICIEN`) est retire de la plateforme commerciale.
- L'enum `UserRole` ne contient plus que `{ADMIN, COMMERCIAL}` dans le schema Prisma cible (modification a faire dans une story dediee, voir §4).
- Le `COMMERCIAL` recupere l'integralite des droits qui etaient reserves au `CHIRURGIEN` dans le repo source : action `isDone` sur DevisIntervention, reprogrammation des sejours, lecture / ecriture des notes commerciales, agenda complet, devis technique inclus.
- Pas de role-gating distinct pour les actions historiquement chirurgien : un seul role operationnel cote utilisateur final (le COMMERCIAL), un seul role admin (l'ADMIN).

### 2.2 Suppression du concept noteMedecin / notePraticien

- Le champ `Process.noteMedecin` du repo source est **retire** dans le CRM Commercial.
- Aucun autre champ destine a recueillir des observations medicales du praticien n'est introduit, quel que soit le nom (`notePraticien`, `noteChirurgien`, `observationsCliniques`, etc.).
- Le champ `Process.noteCommerciale` est conserve (note commerciale pure, suivi de la relation client).
- Raison : meme avec une clause contractuelle d'interdiction d'y stocker des informations medicales, le risque que l'utilisateur final saisisse de la donnee Art. 9 RGPD dans un champ texte libre destine au praticien reste juge trop eleve.

## 3. Consequences

### 3.1 Sur le schema Prisma (a faire dans une story dediee)

- `enum UserRole` : passer de `{ADMIN, COMMERCIAL, CHIRURGIEN}` a `{ADMIN, COMMERCIAL}`. Migration Prisma a generer.
- `Process.noteMedecin` : drop column. Migration a generer.
- Pour les autres champs textes libres restants (qualificationReason, followupReasonDetail, notes diverses), voir SKILL §7.5 — mitigation par guideline UI + clause contractuelle + audit periodique (pas de suppression).

### 3.2 Sur les routes backend

- `PATCH /api/processes/:id/notes` : retirer le champ `noteMedecin` du payload accepte. Garder uniquement `noteCommerciale`.
- Retirer toute la logique role-gating CHIRURGIEN dans les routes processes / devis / documents (devis-interventions PATCH, sejours, paiements, etc.). Les actions sont accessibles a COMMERCIAL.
- Aucun endpoint a renommer ou supprimer (les endpoints existants restent — seul le role-check change).

### 3.3 Sur le frontend

- Retirer le RoleSwitcher de l'option CHIRURGIEN.
- Retirer les UI conditionnelles `if role === 'CHIRURGIEN'`.
- Retirer le bloc `noteMedecin` du composant ProcessNotes.
- Sidebar : pas de difference visible (sidebar role-aware deja prevue pour ADMIN/COMMERCIAL).

### 3.4 Sur le seed

- Deja fait dans le commit immediat (apres-ADR). Le user CHIRURGIEN est retire des 2 tenants du seed (`demo` et `cabinet-test`).

### 3.5 Sur le HDS-CHECK et les stories

- Le rapport `HDS-CHECK-REPORT-2026-05-18.md` est mis a jour avec les nouvelles regles.
- Plusieurs stories OK avec rename (qui proposaient `chirurgien -> praticien`) deviennent `BLOCKED` ou `OK avec rename simplifie` (suppression de la reference au role plutot que rename).
- EP04-S05 (Notes commerciale + medicale) est ramene a sa partie commerciale uniquement.

## 4. Stories impactees

A traiter dans une story dediee EP00-S01 (ou equivalent) :

| Story | Impact |
|-------|--------|
| Toute story citant le role CHIRURGIEN dans une regle d'autorisation | Reformuler vers COMMERCIAL |
| EP04-S05 | Reduire au scope `noteCommerciale` uniquement |
| EP01-S03 (sidebar role switcher) | Retirer l'option CHIRURGIEN |
| EP01-S01 (auth multi-tenant) | Adapter le JWT pour ne pas accepter UserRole.CHIRURGIEN |
| Toutes les stories EP05-Sxx role-gated CHIRURGIEN (cocher isDone, reprog sejour) | Donner l'acces a COMMERCIAL |

Detail exhaustif dans le rapport HDS apres mise a jour.

## 5. Alternatives ecartees

| Alternative | Raison du rejet |
|-------------|-----------------|
| Renommer CHIRURGIEN en PRATICIEN | Apporte de la confusion (les utilisateurs reels peuvent penser que le CRM a vocation a heberger des donnees medicales). Mieux vaut retirer franchement. |
| Garder noteMedecin renomme notePraticien avec clause contractuelle | Risque resi tres eleve qu'un user saisisse de la donnee Art. 9. Clause contractuelle ne previent pas, elle deresponsabilise. Au stade non-HDS, mieux vaut ne pas exposer le champ. |
| Garder le role CHIRURGIEN sans rename ni acces aux fonctions | Le role devient inutilise et seme la confusion dans la doc et le code. Ockham (#37). |

## 6. Mise en oeuvre — qui fait quoi

- **Cette session (2026-05-18, instance Claude #1)** : documentation (cet ADR + maj README + maj SKILL + maj HDS-CHECK-REPORT + seed). Pas de modification du schema ni du code backend/frontend.
- **Prochaine session (instance Claude lancee depuis CRM_commercial)** : implementation effective (migration Prisma + adaptation routes + adaptation front + tests). Plan d'execution dans `docs/ACTIONS-IMMEDIATES-2026-05-18.md`.
