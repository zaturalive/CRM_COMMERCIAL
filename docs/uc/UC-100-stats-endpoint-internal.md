# UC-100 : Endpoint stats interne (outil externe de Florian)

**Domaine** : Integrations / Externes
**Acteur primaire** : Outil externe de Florian (conteneur partage sur le meme network Docker)
**Acteur secondaire** : Systeme (Prisma reads aggregations)
**Niveau** : Subfunction (UC technique)
**Stories liees** : nouvelle (D8 deadline)
**Statut** : **Deadline D8 — a livrer avant le 29 mai 2026**

---

## Precondition

- L'outil externe de Florian est deploye dans un conteneur connecte au meme network Docker que `crm-commercial-backend`
- Le caller est sur le subnet Docker partage (IPs `172.x.x.x` ou similaire)
- Le `tenantId` demande existe en BDD
- Le `from` et `to` (date range) sont fournis et valides

## Declencheur

- L'outil externe de Florian fait une requete HTTP : `GET /api/internal/tenant/:tenantId/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`

## Scenario nominal

1. L'outil Florian envoie la requete depuis le network Docker partage
2. Middleware `requireInternalNetwork` verifie que l'IP source est dans le subnet Docker (filtre IP CIDR)
3. Handler valide les query params : `tenantId` (UUID), `from` et `to` (dates ISO valides, `from < to`, plage max 1 an)
4. Handler execute en parallele 8 aggregations Prisma :
   - `ca = SUM(devis.totalCached) WHERE tenantId AND firstSignedAt BETWEEN from AND to`
   - `caConfirme = SUM WHERE acomptePaidAt IS NOT NULL`
   - `caEnAttente = SUM WHERE firstSignedAt IS NOT NULL AND acomptePaidAt IS NULL`
   - `nbDevisSignes = COUNT WHERE firstSignedAt IS NOT NULL`
   - `nbProcessTotal = COUNT processes WHERE createdAt BETWEEN from AND to`
   - `conversion = nbDevisSignes / nbProcessTotal` (0 si div par 0)
   - `nbPrestations = COUNT DevisIntervention JOIN Devis WHERE firstSignedAt BETWEEN from AND to`
   - `nbClients = COUNT DISTINCT clientId WHERE process.createdAt BETWEEN from AND to`
5. Handler retourne 200 + JSON

## Alternatives

- **A1** : `from` ou `to` absent → defaut `from = debut mois courant`, `to = now()`
- **A2** : Plage > 1 an → 400 + "Plage trop large, max 1 an"
- **A3** : `tenantId` inexistant → 404

## Exceptions

- **E1** : IP source hors du subnet Docker → 403 `Internal only`
- **E2** : `tenantId` malforme (pas UUID) → 400
- **E3** : Erreur Prisma → 500 + log
- **E4** : Timeout > 5s → 504

## Postcondition

- **BDD** : aucune ecriture (lecture seule)
- **Optionnel V1** : 1 entree `AuditLog` (action="stats.pulled", details: tenantId, from, to, callerIp)

## Regles metier

- **RM1** : Endpoint **internal-only** : pas d'auth API key, juste filtre IP Docker
- **RM2** : Pas de PII personnelle dans la reponse (pas de firstName/lastName) — seulement aggregations
- **RM3** : Plage max 1 an pour eviter timeout
- **RM4** : Reponse cacheable cote outil Florian (snapshot ponctuel)

## Format de reponse

```json
{
  "tenantId": "uuid",
  "period": {
    "from": "2026-05-01T00:00:00.000Z",
    "to": "2026-05-31T23:59:59.999Z"
  },
  "ca": 1500000,
  "caConfirme": 1000000,
  "caEnAttente": 500000,
  "conversion": 0.42,
  "nbDevisSignes": 12,
  "nbProcessTotal": 28,
  "nbPrestations": 24,
  "nbClients": 18,
  "computedAt": "2026-05-29T10:00:00.000Z"
}
```

(Tous les montants en centimes EUR.)

## Tests E2E + integration

- `apps/backend/tests/integration/internal-stats.test.ts` (a creer en D8) — scenarios :
  - GET happy path avec from/to → 200 + JSON conforme
  - GET sans tenantId → 400
  - GET avec IP externe → 403 (mock middleware)
  - GET avec plage > 1 an → 400

## Notes techniques

- **Route** : `GET /api/internal/tenant/:tenantId/stats` (NON authentifie par JWT, filtre IP Docker only)
- **Middleware** : `requireInternalNetwork` (a creer dans `apps/backend/src/middleware/`)
- **Fichier handler** : `apps/backend/src/routes/internal.ts` (a creer)
- **Service** : reuse `dashboardService.ts` pour les aggregations (DRY)
- **Securite** : IP filtering uniquement (pas de JWT car outil Florian n'en a pas)
- **Network** : conteneur Florian connecte a `crm-commercial-network` (declaree dans `docker-compose.yml`)
- **CORS** : pas de CORS (pas un endpoint public)

## Question ouverte

- Frequence de pull cote outil Florian : a la demande utilisateur ? cron 1/h ? Florian decide.

---

*UC-100 cree le 2026-05-22. A implementer en D8 (deadline 29 mai).*
