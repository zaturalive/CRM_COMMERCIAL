# UC-101 : Migration import CSV externe

**Domaine** : Integrations / Externes
**Acteur primaire** : Editeur (Dimitry) ou ADMIN d'un tenant — manuel, executable via CLI
**Acteur secondaire** : Systeme (Prisma + tsx + Zod validation)
**Niveau** : Subfunction
**Stories liees** : nouvelle (D9 deadline)
**Statut** : **Deadline D9 — a livrer avant le 29 mai 2026**

---

## Precondition

- Le tenant cible existe en BDD
- Le fichier CSV source est sur la machine ou le container du backend
- Le mapping JSON est defini ou utilise le defaut (Client mapping)
- L'operateur (Dimitry / ADMIN) a accs au container backend

## Declencheur

- Commande CLI executee dans le container backend :
  ```
  docker compose exec backend npm run migrate:external -- \
    --tenant=cabinet-delobaux \
    --file=/tmp/clients-export.csv \
    --table=Client \
    --mapping=/tmp/mapping.json \
    --dry-run
  ```

## Scenario nominal

1. L'operateur prepare le fichier CSV + mapping JSON (ou utilise le mapping defaut)
2. L'operateur execute la commande avec `--dry-run` d'abord pour valider
3. Le script `prisma/migrate-external.ts` :
   - Lit le CSV via une lib (papaparse ou similar)
   - Lit le mapping JSON
   - Resout le `tenantId` depuis le slug
   - Pour chaque ligne CSV :
     - Mappe les colonnes vers les champs Prisma (ex `Prenom` → `firstName`)
     - Valide avec Zod (`createClientSchema` ou equivalent)
     - **Dry-run** : log la ligne validee, ne pas inserer
     - **Sans dry-run** : insere en BDD via Prisma
   - Aggregera le rapport : N lignes lues, N validees, N inserees, N skippees, N erreurs avec listing
4. Le script ecrit un log structure dans `_byan-output/migrations/<timestamp>.log` + affiche le rapport ecran
5. Exit code 0 si succes, 1 si erreurs

## Alternatives

- **A1** : Mode SQL dump au lieu de CSV → autre script `migrate-external-sql.ts` (V1)
- **A2** : Mapping non fourni → defaut Client mapping codé dans le script
- **A3** : Format de date variable dans CSV (FR `JJ/MM/AAAA` ou ISO) → tolerant + tentative auto-detection

## Exceptions

- **E1** : Tenant slug inexistant → exit 1 + erreur explicite
- **E2** : Fichier CSV inaccessible → exit 1
- **E3** : Mapping JSON malforme → exit 1
- **E4** : Zod validation fail sur ligne N → log la ligne, continue avec les autres (mode tolerant)
- **E5** : Erreur Prisma unique constraint → log conflict, skip la ligne
- **E6** : Network DB down → exit 1 + log erreur transitoire

## Postcondition

- **BDD** : N nouvelles entrees dans la table cible (Client, Process, etc.)
- **Filesystem** : log dans `_byan-output/migrations/<timestamp>.log`
- **Stdout** : rapport synthetique

## Regles metier

- **RM1** : One-shot import — pas de sync continu
- **RM2** : Tenant isolation : toutes les rows ont le `tenantId` du --tenant
- **RM3** : Tolerance erreurs : on continue avec les bonnes rows, on log les mauvaises
- **RM4** : Dry-run obligatoire avant prod (recommandation, pas enforce)
- **RM5** : Pas d'upsert au MVP — un re-import de meme CSV cree des doublons (sauf si unique constraint)
- **RM6** : Conformite RGPD : si le CSV contient des donnees Art. 9 (sante), le script doit **rejeter** ces lignes (futur scan automatique en V1)

## Format mapping JSON

```json
{
  "table": "Client",
  "columns": {
    "firstName": "Prenom",
    "lastName": "Nom",
    "phone": "Telephone",
    "email": "Email",
    "city": "Ville",
    "source": "Source",
    "doctolibUrl": "URL_Doctolib"
  },
  "defaults": {
    "source": "AUTRE"
  },
  "transforms": {
    "phone": "stripSpaces",
    "email": "toLowerCase"
  }
}
```

## Tests

- `apps/backend/tests/integration/migrate-external.test.ts` (a creer en D9) — scenarios :
  - CSV valide + dry-run → 0 inserts, rapport coherent
  - CSV valide + apply → N inserts, rows en BDD
  - CSV avec ligne malformee → skip + log, le reste insere
  - Tenant inexistant → exit 1
  - Mapping manquant → defaut Client mapping

## Notes techniques

- **Fichier** : `apps/backend/prisma/migrate-external.ts` (a creer)
- **Lib** : `papaparse` pour CSV (a ajouter en dep si besoin), `zod` pour validation, Prisma pour insertion
- **CLI args** : `--tenant`, `--file`, `--table`, `--mapping`, `--dry-run`
- **Logging** : `_byan-output/migrations/<timestamp>.log` (jsonl format)
- **Permissions** : execution dans le container backend uniquement (admin server)

## Note importante

**Duree imprevisible** : depend du nettoyage des donnees source. Si les CSV sont "sales" (encoding, separators, formats de date heterogenes), prevoir 1-2 jours de nettoyage manuel ou de scripts dedies avant d'importer.

---

*UC-101 cree le 2026-05-22. A implementer en D9 (deadline 29 mai). Migration manuelle one-shot entre Dimitry et Florian, pas d'UI cliente au MVP.*
