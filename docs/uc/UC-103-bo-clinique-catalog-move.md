# UC-103 : Back Office — copier / deplacer / supprimer un catalogue clinique

**Domaine** : Admin / Back Office
**Acteur primaire** : Editeur (Back Office, alias PlatformAdmin) — `requireEditor`
**Acteur secondaire** : Systeme (Postgres, Prisma transaction, audit log)
**Niveau** : User goal
**Stories liees** : nouvelle (extension EP10 — parametrage clinique au Back Office ; pas encore de story dediee)
**Statut** : Implemente

---

## Precondition

- L'editeur est authentifie au Back Office (jeton editeur), 2FA enrolee : chaine `requireJWT + requireEditor + requireEditor2faEnrolled + auditLog`
- Au moins deux cabinets (tenants) existent pour pouvoir copier/deplacer entre eux
- Le « catalogue » d'une clinique = la `Clinique` + ses `CliniqueTarif` + ses `CliniqueOption`. Les `Intervention` et `DocumentLabel` sont tenant-scoped (pas clinic-scoped) → jamais touches ici

## Declencheur

L'editeur ouvre `/admin/cliniques`, choisit un cabinet **source** (et, pour copier/deplacer, un cabinet **cible**) puis declenche une action sur une ligne clinique.

## Scenario nominal (happy path)

1. L'editeur ouvre la section « Catalogues cliniques » du Back Office
2. Il selectionne un cabinet source → `GET /api/admin/tenants/:tenantId/cliniques` liste les cliniques (+ compteurs tarifs/options)
3. Il selectionne un cabinet cible (distinct de la source)
4. **Copier** : il clique « Copier → » sur une clinique → `POST /api/admin/cliniques/:cliniqueId/copy` body `{ targetTenantId }`
5. Le backend recree une **nouvelle** `Clinique` cote cible (nouvel id) + recopie tarifs et options. La source reste inchangee
6. Reponse **201** ; message « clinique copiee vers <cabinet> »

## Alternatives

- **A1 (deplacer)** : « Deplacer → » (apres confirmation) → `POST /api/admin/cliniques/:cliniqueId/move` body `{ targetTenantId }`. Re-parent : la `Clinique` change de `tenantId`, ses tarifs/options suivent (meme `cliniqueId`). Reponse 200, la liste source est rechargee
- **A2 (supprimer)** : « Supprimer » (apres confirmation) → `DELETE /api/admin/cliniques/:cliniqueId`. Supprime la clinique + son catalogue (cascade tarifs/options). Reponse **204**

## Exceptions

- **E1** : Clinique source introuvable → 404
- **E2** : Cabinet cible introuvable → 404 (copy/move)
- **E3** : Cabinet cible == source → **400** « Le cabinet cible est identique au cabinet source » (copy/move)
- **E4 (move)** : Clinique referencee par des devis (`DevisIntervention` / `DevisStay`, refs > 0) → **409** `code: "CLINIQUE_IN_USE"` « referencee par N ligne(s) de devis — deplacement impossible (utilisez la copie) ». Deplacer orphelinerait ces devis cote source
- **E5 (delete)** : Clinique referencee par des devis (refs > 0) → **409** `code: "CLINIQUE_IN_USE"` « suppression impossible » (garde explicite plutot qu'une 500 de contrainte FK `onDelete: Restrict`)
- **E6** : Editeur non authentifie / 2FA non enrolee → 401/403 (chaine de garde Back Office)
- **E7** : Validation Zod (`targetTenantId` manquant) → 400

## Postcondition

- **Etat BDD** :
  - Copy : 1 nouvelle `Clinique` (nouvel id) cote cible + N `CliniqueTarif` + M `CliniqueOption` copies ; source inchangee
  - Move : `Clinique.tenantId` re-parente vers la cible ; enfants suivent (id inchanges)
  - Delete : `Clinique` + tarifs + options supprimes (cascade)
  - Toute action est tracee par `auditLog`
- **Etat UI** :
  - Message de succes ; pour move/delete la liste du cabinet source est rechargee
  - Pour les 409 : message d'erreur explicite, aucune mutation

## Regles metier

- **RM1** : Copy = duplication non destructive (nouvel id, source intacte) ; Move = re-parent (id conserves) ; Delete = suppression dure + cascade
- **RM2** : Move et Delete sont **refuses (409, `CLINIQUE_IN_USE`)** si la clinique est referencee par des devis (`DevisIntervention` ou `DevisStay`). Pour reaffecter une clinique « en usage », passer par la **copie**
- **RM3** : Cible != source obligatoire pour copy/move (400 sinon)
- **RM4** : Seules la `Clinique` + ses tarifs + options sont concernees ; jamais les `Intervention` ni `DocumentLabel` (tenant-scoped)
- **RM5** : Operations cross-tenant via `basePrisma` (pas de filtre tenant implicite) — l'isolation est portee explicitement par les `tenantId` du path/body, le tout sous garde `requireEditor`

## Tests E2E

- Couverture dediee a ajouter (copy / move / delete + gardes 400/404/409 `CLINIQUE_IN_USE`). Les routes Back Office existantes sont couvertes cote securite dans `apps/backend/tests/security/` ; la CRUD clinique tenant l'est par `cliniques.test.ts`

## Notes techniques

- **Routes API** :
  - `GET /api/admin/tenants/:tenantId/cliniques`
  - `POST /api/admin/cliniques/:cliniqueId/copy` body `{ targetTenantId }`
  - `POST /api/admin/cliniques/:cliniqueId/move` body `{ targetTenantId }`
  - `DELETE /api/admin/cliniques/:cliniqueId`
- **Fichiers** :
  - Backend : `apps/backend/src/routes/adminCliniques.ts` (monte via `routes/admin.ts`)
  - Garde : `apps/backend/src/app.ts` (`requireJWT + requireEditor + requireEditor2faEnrolled + auditLog`)
  - Frontend : `apps/frontend/src/app/admin/cliniques/page.tsx`
- **Tables touchees** : `Clinique`, `CliniqueTarif`, `CliniqueOption` (lecture seule : `DevisIntervention`, `DevisStay` pour la garde de reference)
- **Permissions** : Editeur Back Office uniquement (pas les utilisateurs tenant)

---

*UC-103 cree le 2026-06-07. Maintenance : a maj si la copie inclut un jour les Intervention/DocumentLabel, ou si l'on ajoute un « merge » de catalogues.*
