# Extrait Cabinet Delobaux — Donnees source pour seed

## Contenu du dossier

| Fichier | Usage | Commit ? |
|---------|-------|----------|
| `donnees-configuration-seed.md` | Extraction curee par Florian : tarifs, catalogues, configs (aucune donnee patient) | Oui |
| `extrait_delobaux.xlsx` | Fichier Excel brut du cabinet (contient des feuilles avec noms patients) | Non — RGPD |

## Regles RGPD

Le fichier `extrait_delobaux.xlsx` est gitignored (cf `.gitignore`).
Les feuilles suivantes contiennent des donnees patients et ne devraient pas etre commitees
ni extraites vers le seed [CLAIM L1] RGPD art. 5.1.c (minimisation) :

- `Reglements Chirurgie` (colonnes A-S avec noms/montants)
- `SOINS 2024-2025` / `SOINS 2026` (suivi par patient)
- `SUIVI REGLEMENTS 2021-2024` (historique reglements)
- `INJECTABLES ALEXIS TVA` (suivi injectables avec nominatif)
- `Suivi Reglements soins nutriti` (paiements nominatifs)

Pour le seed, on utilise uniquement :
- Grilles tarifaires cliniques (CEPE, ALPHAND)
- Catalogue chirurgie et medecine esthetique (prix + durees)
- Liste des praticiens (roles uniquement, pas de donnees personnelles)
- Types de soins (categories)

## Extraction de donnees depuis le xlsx (en local uniquement)

```bash
# Conversion vers CSV via libreoffice (toutes les feuilles)
libreoffice --headless --convert-to csv \
  --outdir /tmp/delobaux \
  docs/extrait_delobaux/extrait_delobaux.xlsx

# Lecture via python + openpyxl
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('docs/extrait_delobaux/extrait_delobaux.xlsx', data_only=True)
for s in wb.sheetnames:
    print('---', s)
"
```

## Generation du seed

Les donnees reelles du Cabinet Delobaux sont encodees dans `apps/backend/prisma/seed.ts`
(gitignored). Le template public est `apps/backend/prisma/seed.example.ts`.

Execution :

```bash
docker compose -f docker/docker-compose.yml --env-file .env \
  exec backend npx prisma db seed
```
