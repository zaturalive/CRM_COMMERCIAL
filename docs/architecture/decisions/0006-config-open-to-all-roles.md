# ADR-0006 — Paramétrage ouvert à tous les rôles (revert "ADMIN exclusif")

**Date** : 23 avril 2026
**Statut** : Accepte — supersede CDCF v2.0 F28 et CDCT v1.5 §1.3
**Decideur** : Dimitry (user)

---

## Contexte

Les specs autoritaires (`files(2)/`) ecrites du 17 au 22 avril disaient toutes que le module Parametrage etait **reserve au role ADMIN** :

- CDCF v2.0 §8.1 F28 : *"Paramétrage uniquement accessible au rôle Admin dans la sidebar"*
- CDCT v1.5 §1.3 : *"Admin — sidebar Parametrage : Visible (exclusif)"*
- MVP v4 §3.8 CF1 : *"Accès sidebar uniquement pour rôle Admin"*

C'est ce qui a ete implemente au commit `192758d` (EP01-S03) puis `c5f6df7` (EP02) :
- Sidebar frontend : item "Parametrage" cache hors ADMIN
- Layout `/(app)/config/*` : `redirect("/dashboard")` si `session.role !== "ADMIN"`
- Routes backend `/api/cliniques`, `/api/interventions`, `/api/document-labels` : `requireRole(["ADMIN"])` sur POST/PATCH/DELETE

Tests Vitest + E2E verifiaient ce comportement (69 + 15 verts).

Le 23 avril, apres lecture des chats Claude Design (handoff bundle `crm-chirurgien/chats/chat2.md`), le user a indique :

> *"le parametrage doit s'afficher quand c'est un comm chir et admin, et tout le monde peut ajouter des parametrages !"*

Et confirme lors du challenge :

> *"B parametrage ouvert, car en vrai le chir et le comm peuvent vouloir ajouter des choses sans avoir besoin de nos services !"*

---

## Decision

**Le Parametrage est ouvert a tous les roles authentifies** (ADMIN, COMMERCIAL, CHIRURGIEN).

Concretement :
- Sidebar : item "Parametrage" visible pour les 3 roles
- Layout `/config/*` : plus de guard role, seul `redirect("/login")` si pas authentifie
- Routes backend : plus de `requireRole(["ADMIN"])` sur `/api/cliniques/*`, `/api/interventions/*`, `/api/document-labels/*`. Seul `requireJWT` + `requireTenant` s'appliquent (auth + isolation tenant)

---

## Raisonnement

1. **Autonomie operationnelle** : en situation reelle, le commercial qui rencontre une nouvelle clinique ou le chirurgien qui decouvre un nouveau protocole doit pouvoir l'ajouter sans attendre qu'un admin passe. La frustration d'un "appele le support" est plus couteuse que le risque d'une mauvaise donnee saisie.
2. **Realite de la structure** : le "role ADMIN" dans le cabinet Delobaux est Florian, qui n'est pas quotidien. Restreindre a Florian bloque le quotidien de Julie et du Dr Delobaux.
3. **Mitigation du risque** :
   - L'isolation tenant reste intacte (un user n'a pas acces aux donnees d'un autre cabinet)
   - Le bouton "Supprimer" conserve ses garde-fous metier (409 si clinique referencee par un devis, label utilise par un process, etc.)
   - Les actions sont auditables (tables `createdAt`/`updatedAt`, audit logs en V1)
4. **Simplicite** : une seule regle ("authentifie = peut tout faire sur son tenant") plus simple a raisonner que des matrices role-par-role.

---

## Consequences

### Positives
- UX plus fluide pour les 3 roles
- Code backend plus simple (moins de middleware)
- Tests Vitest et E2E simplifies (plus de cases "COMM recoit 403")

### Negatives / risques residuels
- Un commercial ou chirurgien peut supprimer une clinique ou une intervention par erreur. Mitigation : dialog de confirmation deja en place + 409 si referencee.
- Les specs ecrites du 17-22 avril sont **incorrectes** sur ce point. Ne pas se referer a F28, CDCT §1.3, MVP v4 §3.8 CF1 sur la question RBAC — se referer a cet ADR.

---

## Alternative rejetee — role ADMIN exclusif

Respecter les specs telles quelles aurait demande :
- Florian (admin unique) doit creer toutes les cliniques/interventions/labels meme quand il n'est pas au cabinet
- Julie / Dr Delobaux doivent attendre ou utiliser le "switch role demo" (reserve a la demo, pas a la prod)

User a explicitement rejete cette option lors du challenge.

---

## Documentation touchee (pour memoire)

Les fichiers suivants contiennent des references a l'"ADMIN exclusif" ; ils restent inchanges pour preserver l'historique des decisions, mais **cet ADR les supersede** :
- `docs/architecture/overview.md` §3.7
- `docs/architecture/api-contracts.md` §8
- `docs/stacks/frontend.md`
- `docs/product/epics.md` EP02
- `docs/product/stories/EP02-S04.md`, `EP02-S05.md`, `EP03-S01.md` (qui mentionnent ADMIN exclusif)
- `docs/product/stories/EP01-S03.md` (sidebar role-aware : le comportement reel inclut Parametrage pour tous)

Un lien vers cet ADR a ete ajoute en entete de `docs/README.md` §8 "Contradictions tranchees".

---

*Reference : CDCF v2.0 F28, CDCT v1.5 §1.3, MVP v4 §3.8 CF1 — tous revertes.
INT utilisateur 23/04 14h45 (chat2.md Claude Design + confirmation directe Option B).*
