# CRM Commercial

> Projet jumeau commercial du repo [crm-chirurgien](../CRM_chirurgien). Periode actuelle : **non-HDS** (pas de donnees de sante stockees). Bascule HDS prevue apres validation produit.

## Statut

- **Date fork** : 2026-05-18
- **Source** : `crm-chirurgien` commit `8c68cfb` (16 mai 2026)
- **Decision pivot** : voir [ADR-0008 du repo source](../CRM_chirurgien/docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md)
- **Synthese complete** : `docs/document-reference-complet-crm-commercial.md` v3.0
- **Editeur cible** : entreprise mexicaine (a definir dans le contrat)
- **Hebergement vise** : cloud standard (~10-50 €/mois) puis PaaS HDS apres validation
- **Conformite actuelle** : RGPD standard (pas de donnees Art. 9)

## Stack

Identique au repo source (Next.js 15 + Express + Prisma + Postgres + Docker Compose). Voir [docs/README.md](docs/README.md) pour le detail.

## Demarrage rapide

```bash
# 1. Copier le template d'env
cp .env.example .env

# 2. Generer les secrets dev
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -hex 32)|" .env

# 3. Lancer le stack
npm run dev

# 4. Migrer + seed
npm run db:migrate
npm run db:seed
```

URLs locales (ports decales vs repo source pour cohabitation) :
- Frontend : http://localhost:3300
- Backend  : http://localhost:4100
- Postgres : reseau interne `crm-commercial-network`

## Identifiants seed

Tenant `cabinet-test`, password `demo` :
- `admin-test@cabinet-test.local` (ADMIN)
- `commercial-test@cabinet-test.local` (COMMERCIAL)

Pas de user CHIRURGIEN dans le CRM Commercial (decision 2026-05-18, cf. ADR-0002). Le COMMERCIAL a acces a toutes les fonctionnalites qui etaient reservees CHIRURGIEN dans le repo source.

## Vocabulaire (projet commercial)

Le vocabulaire interne du repo source est conserve **dans le code** au moment du fork (Patient/Intervention/Consultation/Chirurgien). L'adaptation au vocabulaire commercial (Client/Prestation/Rendez-vous) est planifiee dans les stories EP01-S00 et suivantes (voir `docs/product/stories/`).

| Vocabulaire repo source | Vocabulaire cible commercial |
|--------------------------|------------------------------|
| Patient | **Client** |
| Intervention chirurgicale | **Prestation** |
| Consultation medicale | **Rendez-vous** |
| Dossier patient | **Fiche client** |
| Note medecin / Note medicale | **Retire** (decision 2026-05-18, cf. ADR-0002 — pas de stockage de notes praticien dans CRM Commercial) |
| Role CHIRURGIEN | **Retire** (le COMMERCIAL fait tout) |

## Donnees exclues du perimetre actuel (periode non-HDS)

Pour conserver le statut non-HDS :
- Pas de notes medicales NI notes praticien (decision 2026-05-18 — risque considere trop eleve meme avec contractualisation)
- Pas de photos avant/apres
- Pas d'antecedents medicaux
- Pas de prescriptions / ordonnances
- Pas de comptes-rendus operatoires
- Pas de role CHIRURGIEN sur la plateforme

L'agent `byan-hds-check` (skill BYAN) verifie chaque story pour detecter les mots-cles santé et alerter avant implementation. Voir `.claude/skills/byan-hds-check/`.

## Documentation

- [docs/README.md](docs/README.md) — Entree principale
- [docs/architecture/decisions/0001-fork-depuis-crm-chirurgien.md](docs/architecture/decisions/0001-fork-depuis-crm-chirurgien.md) — ADR fork
- [docs/document-reference-complet-crm-commercial.md](docs/document-reference-complet-crm-commercial.md) — Contexte complet (Florian + entreprise mexicaine + cadre contractuel)
- [docs/architecture/projets-paralleles-commercial-hds.md](docs/architecture/projets-paralleles-commercial-hds.md) — Detail des deux versions
- [docs/architecture/features-tables-mapping.md](docs/architecture/features-tables-mapping.md) — Audit du code source (instantane 2026-05-16)

## Cadre contractuel

Dimitry intervient comme sous-traitant freelance. Le contrat type est dans `docs/document-reference-complet-crm-commercial.md` Partie E.

Engagements cles :
- Obligation de moyen
- Clause de carence client : 5 jours ouvres
- Email = canal officiel (Art. 1366 Code Civil)
- Backlog avec pricing valide par email avant developpement
- Droit applicable : francais. Tribunaux : Nice (a confirmer avec avocat)
- Article 8.3 du contrat : le client s'engage a ne pas stocker de donnees Art. 9 RGPD pendant la periode non-HDS, sous sa seule responsabilite

## Differences avec le repo source (resume)

| Aspect | crm-chirurgien | crm-commercial |
|--------|---------------|----------------|
| Ports dev | 3200 / 4000 | 3300 / 4100 |
| DB | crm_chirurgien | crm_commercial |
| Domaine prod | crm-chirurgie.a3n.fr | a definir (crm-commercial.example.com placeholder) |
| Tenant seed pilote | cabinet-delobaux | cabinet-test |
| Conformite | RGPD + HDS planifie | RGPD standard (periode non-HDS) |
| Vocabulaire | sante | commercial (en cours d'adaptation) |
