# Feedback — retours beta-testeurs & utilisateurs reels

Ce dossier archive les retours terrain (beta-testeurs, utilisateurs cabinets) et leur analyse.

## Convention de nommage

`FEEDBACK-<NOM-TESTEUR>-<AAAA-MM-JJ>.md`

- `<NOM-TESTEUR>` : prenom ou identifiant du testeur (ex. CECILLIA)
- `<AAAA-MM-JJ>` : date du feedback (pas de la saisie)

Chaque fiche contient : metadonnees (testeur, role, produit teste, dates, source), la **capture fidele** du retour, puis l'**analyse** (tri commercial/medical, triangulation backlog, UX nouveau, contre-signaux, validations).

## Index

| Fichier | Testeur | Date | Produit teste | Resume |
|---|---|---|---|---|
| [FEEDBACK-CECILLIA-2026-05-28.md](FEEDBACK-CECILLIA-2026-05-28.md) | Cecillia (coordinatrice Dr Marival) | 2026-05-28 | CRM Chirurgien (jumeau medical) | ~70 % UX/flux commercial transposable, ~30 % medical hors-scope ; priorite = degraissage UI |

## A distinguer

- `docs/product/RETOUR-COMMERCIAL-2026-05-27.md` : brief commercial (demande produit, priorisation V1.1/V1.2/V2) — c'est une source de besoins, pas un retour de test.
- Ce dossier : retours d'usage sur le produit existant.

## Regle de tri (rappel)

Le projet est non-HDS (ADR-0002 / ADR-0003). Tout feedback issu du jumeau medical doit passer le filtre : ce qui touche aux donnees Art. 9 RGPD (donnees patients medicales, documents medicaux, consentement aux soins) est **hors-scope** et ne doit pas etre reintroduit. Voir skill `byan-hds-check`.
