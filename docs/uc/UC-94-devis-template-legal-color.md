# UC-94 : Configurer le template de devis (mentions legales + couleur)

**Domaine** : Admin / Parametrage
**Acteur primaire** : Tous roles authentifies (ADR-0006 parametrage ouvert)
**Acteur secondaire** : Systeme (Prisma, rendu PDF via `resolveLegalMentions`)
**Niveau** : User goal
**Stories liees** : `EP16-S01` (rendu PDF commercial : mentions + couleur)
**Statut** : Implemente

---

## Precondition

- L'utilisateur est authentifie
- Le tenant est actif et a accepte les CGU (V1)

## Declencheur

L'utilisateur ouvre la page parametres du cabinet (`/config/cabinet`) et edite le bloc « template de devis » (mentions legales pre-remplies + couleur d'accent).

## Scenario nominal (happy path)

1. L'utilisateur ouvre `/config/cabinet`
2. Le frontend appelle `GET /api/settings` ; le backend remonte le bloc `legal` a plat (extrait de `Tenant.settings.legal`)
3. L'utilisateur renseigne les mentions : `raisonSociale`, `siret`, `adresse`, `telephone`, `email`, `validiteJours`, `cgvReference`
4. Il choisit la **couleur d'accent** du devis (`accentColor`, hex `#RRGGBB`) via le color-picker, le champ texte mono, ou l'une des 5 pastilles preset
5. Il clique « Enregistrer » → `PATCH /api/settings` body `{ ..., legal: { ..., accentColor } }`
6. Le backend valide (Zod `devisLegalSchema`, `.strict()`), puis **merge** `legal` dans `Tenant.settings.legal` (JSON) sans ecraser les autres cles de `settings` ni les champs `legal` non transmis
7. Le backend renvoie le settings mis a jour ; l'UI affiche le toast « Parametres enregistres »
8. Au prochain rendu PDF d'un devis du tenant, les mentions + la couleur sont resolues a la volee (cf UC-37)

## Alternatives

- **A1** : Couleur saisie via une pastille preset (`#0F1117`, `#6c63ff`, `#1e3a8a`, `#0f766e`, `#831843`) → meme effet que le color-picker

## Exceptions

- **E1** : `accentColor` ne respecte pas `^#[0-9a-fA-F]{6}$` → 400 (Zod, « Couleur invalide (#RRGGBB) »)
- **E2** : Cle inconnue dans `legal` → 400 (schema `.strict()`)
- **E3** : User non-authentifie → 401
- **E4** : Tenant introuvable → 404

## Postcondition

- **Etat BDD** : `Tenant.settings.legal` mis a jour (mentions + `accentColor`), merge non destructif
- **Etat UI** : champs refletant les valeurs enregistrees, toast de confirmation

## Regles metier

- **RM1** : Le template est **resolu a la volee** au rendu PDF (aucun snapshot fige sur le `Devis`) : le modifier impacte tous les devis du tenant (contrairement aux prix, cf UC-30 RM1/RM7)
- **RM2** : `accentColor` valide hex `#RRGGBB` ; fallback onyx `#0F1117` si absent ou invalide (cote backend a la resolution, `resolveLegalMentions` / `renderDevisHtml`)
- **RM3** : La couleur du texte pose sur les bandeaux du PDF est calculee par luminance (clair → texte sombre, fonce → texte blanc) pour rester lisible
- **RM4** : Merge non destructif : seules les cles transmises ecrasent l'existant dans `settings.legal`
- **RM5** : ADR-0006 : tous les roles authentifies peuvent editer le template (parametrage ouvert)

## Tests E2E

- `apps/frontend/tests/e2e/settings.spec.ts` — parametres cabinet (a etendre pour le bloc legal/couleur)
- `apps/backend/tests/security/devis-pdf-commercial.test.ts` — rendu PDF commercial (mentions + total)

## Notes techniques

- **Routes API** : `GET /api/settings`, `PATCH /api/settings` (champ `legal` incluant `accentColor`)
- **Fichiers** :
  - Backend : `apps/backend/src/routes/settings.ts` (extract + merge `legal`), `apps/backend/src/schemas/settings.ts` (`devisLegalSchema`)
  - Backend rendu : `apps/backend/src/services/devisLoader.ts` (`resolveLegalMentions`, fallback `accentColor`), `apps/backend/src/services/devisTemplate.ts` (accent + luminance)
  - Frontend : `apps/frontend/src/app/(app)/config/cabinet/page.tsx` (color-picker + presets + mentions)
- **Tables touchees** : `Tenant` (`settings.legal`)
- **Permissions** : tous roles (ADR-0006)
- **Voir aussi** : UC-37 (le PDF consomme ce template), UC-93 (autres parametres cabinet)

---

*UC-94 cree le 2026-06-07. Maintenance : a maj si les mentions legales sont un jour figees par snapshot au PDF.*
