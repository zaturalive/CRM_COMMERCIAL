# Données extraites de l'Excel Florian — pour le paramétrage du CRM
## Uniquement les tarifs, catalogues et configurations — aucune donnée patient

> Source : `Copie_de_Copie_de_SUIVI_REGLEMENTS_2025_2026.xlsx`
> Extraction : 17 avril 2026
> Usage : seed de la BDD du CRM pour le MVP

---

## 1. Grilles tarifaires des cliniques

### 1.1 Clinique CEPE — Frais par durée d'opération

| Durée OP | Frais clinique (bloc) | Anesthésie | Ambulatoire | Total |
|---|---|---|---|---|
| 1h | 760 € | 500 € | 420 € | 1 680 € |
| 1h15 | 950 € | 700 € | 420 € | 2 070 € |
| 1h30 | 1 140 € | 700 € | 420 € | 2 260 € |
| 2h | 1 520 € | 900 € | 420 € | 2 840 € |
| 2h30 | 1 900 € | 1 100 € | 420 € | 3 420 € |
| 3h | 2 280 € | 1 300 € | 420 € | 4 000 € |
| 3h30 | 2 660 € | 1 500 € | 420 € | 4 580 € |
| 4h | 3 040 € | 1 700 € | 420 € | 5 160 € |

Note : CEPE ne facture pas d'hospitalisation séparée, uniquement ambulatoire à 420 € fixe.

### 1.2 Clinique ALPHAND — Frais par durée d'opération

| Durée OP | Frais bloc | Anesthésie | Ambulatoire | Hospitalisation | Total ambu | Total hospit |
|---|---|---|---|---|---|---|
| 1h | 750 € | 500 € | 350 € | 650 € | 1 600 € | 1 900 € |
| 1h30 | 1 125 € | 700 € | 350 € | 650 € | 2 175 € | 2 475 € |
| 2h | 1 500 € | 900 € | 350 € | 650 € | 2 750 € | 3 050 € |
| 2h30 | 1 875 € | 1 100 € | 350 € | 650 € | 3 325 € | 3 625 € |
| 3h | 2 250 € | 1 300 € | 350 € | 650 € | 3 900 € | 4 200 € |
| 3h30 | 2 625 € | 1 500 € | 350 € | 650 € | 4 475 € | 4 775 € |
| 4h | 3 000 € | 1 700 € | 350 € | 650 € | — | — |
| 4h30 | 3 375 € | 1 900 € | 350 € | 650 € | — | — |

Note : ALPHAND distingue ambulatoire (350 €) et hospitalisation (650 €). Le total change en fonction.

### 1.3 Différences structurelles entre les 2 cliniques

| Critère | CEPE | ALPHAND |
|---|---|---|
| Frais fixes ambulatoire | 420 € | 350 € |
| Hospitalisation possible | Non mentionné | Oui, 650 € |
| Nom du poste "clinique" | "Frais clinique" | "Frais bloc" |
| Tranches horaires dispo | 1h → 4h | 1h → 4h30 |

**Implication pour le modèle BDD** : la table `Clinique` doit pouvoir stocker des grilles tarifaires différentes, certaines avec hospitalisation, d'autres sans. La structure n'est pas uniforme.

---

## 2. Catalogue des interventions chirurgicales — Honoraires chirurgien

Tarifs clinique "Konfidentiel" (le cabinet de Florian). Évolution des prix sur 3 ans.

| Intervention | Durée | Marge (coeff) | Prix fin 2024 |
|---|---|---|---|
| Lipo Abdo Hommes SIX PACKS | 2h | 4.5 | 9 000 € |
| Lipo Abdo Hommes SIX PACKS + U Graft | 2h30 | 4.5 | 11 000 € |
| Lipo Abdo / Flancs Femmes | 1h30 | 6 | 9 000 € |
| Lipo Dos + X PINE | 1h30 | 4.5 | 7 000 € |
| Lipo 360 Hommes | 3h | 4.5 | 14 000 € |
| Lipo 360 Femmes | 3h | 4.5 | 13 000 € |
| Lipo 360 Femmes + BBL | 3h30 | 5 | 17 000 € |
| Lipo Bras VASER | 1h (CEPE) / 1h30 | 5.5 | 5 500 € |
| Brachioplastie | 1h30 | 4 | 6 000 € |
| Pectoraux LPS | 30 min | 9 | 4 500 € |
| Épaules LPS | 30 min | 8 | 4 000 € |
| Pectoraux HD + LPS | 1h min | 6 | 6 000 € |
| Épaules HD + LPS | 30 min | 10 | 5 000 € |
| Trapèzes ou Biceps | 30 min | 7 | 4 500 € |
| Cas Secondaire | — | — | 4 000 € |
| Cas Tertiaire | — | — | 5 000 € |
| SMART BBL | 1h30 (CEPE) / 2h30-3h | 6.5 | 10 000 € |
| SMART BBL en association | 1h | — | 6 500 € |
| Lipoedème Mollets + Genoux | 2h (CEPE) / 2h30 | 3.2 | 7 500 € |
| Lipoedème Cuisses | 3h | 2.5 | 8 500 € |
| Abdominoplastie | 2h | 4.75 | 9 500 € |
| Abdominoplastie + lipo Abdo | 2h30 | 4.5 | 11 000 € |
| Abdominoplastie + lipo 360° | 3h30 | 4.5 | 15 000 € |
| Renuvion 1 zone | — | 5.5 | 3 500 € |
| Renuvion 2 zones | — | 4.37 | 5 500 € |
| Prothèses mammaires | 1h | 6 | 6 000 € |
| Pexie | 1h30 | 5.5 | 8 000 € |
| Changement de Prothèses | 1h | 5.5 | 5 500 € |
| Nanofat | 1h | 5.5 | 5 500 € |
| Blépharoplastie 4 Paupières | 1h30 | — | 6 000 € |
| CARCINO | — | 3.8 | 650 € |

**Implication pour le modèle BDD** : chaque intervention a un prix d'honoraires qui peut évoluer dans le temps. Le coefficient de "marge" est stocké mais pas montré au patient. La durée peut varier selon la clinique.

---

## 3. Catalogue des actes de médecine esthétique

| Acte | Prix 2024 | Notes |
|---|---|---|
| **Injectables** | | |
| Botox 3 zones | ~380 € | — |
| Botox 1 zone | ~310 € | — |
| Acide Hyaluronique | ~370 € | Produit DEFINE (coût 59.40 €, marge 290.60 €) |
| PRP | ~370 € | Produit PRECISE (coût 63 €, marge 287 €) |
| Ellansé | ~450 € | Produit VOLUME (coût 69 €, marge 281 €) |
| Lanluma | ~990 € | — |
| **Peelings** | | |
| Peeling Niveau 1 (3-5 séances, 1/semaine) | 160 € | — |
| Peeling Niveau 2 (1-3 séances, 3/semaine) | 229 € | Forfait 3 séances : 600 € |
| Peeling Niveau 3 | 790 € | — |
| **Dermapen** | | |
| Dermapen (3 à 6 séances) | 159 € | Minimum 3 séances |
| Dermapen + Peeling | 299 € | — |
| Dermapen + PRP (1x/mois) | 250 € | Minimum 3 séances |
| **Laser péribuccal** | | |
| Péribuccal supérieur | 900-1 300 € | — |
| Péribuccal inférieur | 900-1 300 € | — |
| Péribuccal total | 1 590 € | — |
| **Laser périorbitaire** | | |
| Périorbitaire supérieur | 900 € | — |
| Périorbitaire inférieur | 900 € | — |
| Périorbitaire total | 1 490 € | — |
| **Tâches et vaisseaux** | | |
| Tâches brunes (1-3 séances, 1/mois) | 270 € | — |
| Tâches brunes grande zone | 490 € | — |
| Télangiectasies | 210 € | — |
| **HydraFacial** | | |
| Base | 180 € | — |
| Deluxe | 230 € | — |
| Perk lèvres/yeux | 50 € | — |
| Platinium | 300 € | — |
| **Radiofréquence (Virtue)** | | |
| Petite zone (visage, mains) | 250 € | — |
| Zone moyenne (cou, décolleté) | 350 € | — |
| Grande zone (abdomen, cuisses) | 490 € | — |

**Implication pour le modèle BDD** : les actes de médecine esthétique ont une logique différente des chirurgies (pas de frais bloc/anesthésie, mais des forfaits multi-séances et des coûts produit). Il faudra probablement un flag `type` (chirurgie vs médecine esthétique) sur la table `Intervention`.

---

## 4. Produits injectables — coûts et marges

| Produit | Gamme | Coût produit | Marge nette |
|---|---|---|---|
| DEFINE | Acide Hyaluronique | 59.40 € | 290.60 € |
| PRECISE | PRP | 63.00 € | 287.00 € |
| VOLUME | Ellansé | 69.00 € | 281.00 € |
| EXTREME | — | 72.00 € | 278.00 € |
| LIPS | Timed | 24.20 € | 325.80 € |
| INTENSE | — | 51.84 € | 298.16 € |
| INTENSE FLUX | — | 41.80 € | 308.20 € |
| STIMULATE | — | 59.40 € | 290.60 € |
| Neauvia | — | — | — |

**Implication** : données internes de marge, à ne jamais montrer au patient. Utile pour le dashboard CA et le calcul de rentabilité.

---

## 5. Types de soins pratiqués (hors chirurgie)

Extraits de la feuille "SOINS 2026", ces types apparaissent comme catégories de suivi :

- Microneedling
- PRX33
- Épilation Laser
- Rituels OC (Olivier Claire)
- JetPeel
- HydraFacial
- Timed
- RF Virtue (Radiofréquence)
- Compléments Collagène (vente)
- Produits Olivier Claire (vente)

**Implication** : ces soins sont suivis en volume et CA mensuel. Pas forcément dans le MVP chirurgie mais à prévoir dans la table `Intervention` avec le flag type = "soin".

---

## 6. Praticiens identifiés

Depuis les différentes feuilles, les praticiens qui interviennent :

| Praticien | Rôle | Feuille source |
|---|---|---|
| Dr Delobaux (Alexis) | Chirurgien principal | Règlements Chirurgie, INJECTABLES |
| Dr Pozner | Remplaçant | Rempla Dr Pozner |
| Dr Debuc | Remplaçant | Rempla Dr Debuc |
| Elias | Remplaçant | Rempla Elias |
| Florence | Praticienne soins | SOINS 2024-2026 |
| Meriam | Praticienne soins | SOINS 2024-2026 |
| Prescillia | Praticienne soins | SOINS 2026 |
| Maëva | Praticienne soins | SOINS 2026 |

**Implication** : le CRM doit pouvoir associer un praticien à un acte, et gérer les remplaçants.

---

## 7. Données GHM (Groupes Homogènes de Malades)

| Code GHM | Description | Tarif GHM | Nb prestations | Total |
|---|---|---|---|---|
| 09Z02B | Chirurgie esthétique, avec complication significative | 1 899.98 € | 69 | 131 098.62 € |
| 09C23 | Interventions majeures tumeur maligne peau, niveau 1 | 884.19 € | 47 | 41 556.93 € |

**Implication** : données de facturation CPAM, probablement pas dans le MVP mais utile pour le reporting V1.

---

## 8. Feuilles à ignorer pour le MVP

| Feuille | Contenu | Pourquoi on l'ignore |
|---|---|---|
| Règlements Chirurgie (colonnes A-S) | Suivi patient par patient avec noms, dates, montants | Données patients personnelles |
| SOINS 2024-2025 | Détail des soins par patient | Données patients personnelles |
| SOINS 2026 | Détail des soins par patient | Données patients personnelles |
| SUIVI REGLEMENTS 2021-2024 | Historique des règlements | Données patients personnelles |
| CA 2024 | CA par praticien par mois | Données internes RH/compta |
| CALCUL CA SOINS | Calcul primes par praticien | Données internes RH/compta |
| Rempla Elias/Pozner/Debuc | Suivi remplaçants | Données internes |
| INJECTABLES ALEXIS TVA | Suivi injectables avec TVA | Données comptables |
| Suivi Règlements soins nutriti | Suivi paiements soins | Données patients |
| New Age | Loyer cabinet | Données comptables |

---

## 9. Résumé — ce qu'on a pour seeder la BDD

| Donnée | Statut | Prêt pour le seed ? |
|---|---|---|
| Grille tarifaire CEPE (8 tranches horaires) | Complet | ✅ Oui |
| Grille tarifaire ALPHAND (8 tranches + hospit) | Complet | ✅ Oui |
| Catalogue chirurgie (~30 interventions + prix + durées) | Complet | ✅ Oui |
| Catalogue médecine esthétique (~25 actes + prix) | Complet | ✅ Oui |
| Coûts produits injectables + marges | Complet | ✅ Oui (données internes) |
| Liste praticiens (8) | Complet | ✅ Oui |
| Types de soins (10 catégories) | Complet | ✅ Oui |
| Données patients | Présentes mais ignorées | ❌ Pas dans le MVP |
| Données CA / primes / compta | Présentes | ❌ Pas dans le MVP |

---

## 10. Questions à lever avec Florian

- Les prix listés sont "fin 2024". Faut-il utiliser ces prix pour le seed ou il a des prix 2025/2026 mis à jour ?
- Le coefficient de marge (ex : 4.5) est-il un multiplicateur interne ou un ratio ? Comment l'interpréter exactement ?
- Les durées d'opération qui varient entre CEPE et la colonne "ITV" : laquelle est la bonne à utiliser pour le calcul du devis ?
- Les forfaits multi-séances en médecine esthétique (ex : "3 séances à 600€") : on les modélise comment dans le devis ? Un seul devis avec prix forfaitaire, ou 3 devis séparés ?
