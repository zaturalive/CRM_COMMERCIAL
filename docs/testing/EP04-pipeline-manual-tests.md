# EP04 — Pipeline : tests manuels

> Checklist de tests manuels pour valider EP04 (S01 à S05) avant démo.
> Date : 23 avril 2026 — veille démo.
> Stories couvertes par les commits : `822a159` (S01-S03), `4ef518f` (S04-S05), `459af56` (+ Nouveau patient), `055f6e0` (filtre intensity), `6b96700` (placeholders tabs).
> Non couvert ici : EP04-S06 archivage auto (pas de commit dédié, statut incertain).

---

## 0. Préparation

### 0.1 Lancer la stack (docker-first)

```bash
docker compose up -d
docker compose exec backend npx prisma migrate dev    # si besoin
docker compose exec backend npx tsx prisma/seed.ts    # si base vide
```

- [ ] Frontend accessible sur `http://localhost:3200` (ou port configuré)
- [ ] Backend répond sur `http://localhost:4000/api/health` (ou équivalent)
- [ ] Aucune erreur dans `docker compose logs backend` / `logs frontend`

### 0.2 Users de démo

Tous sur tenant `cabinet-delobaux`, password `demo` :

| Email | Rôle |
|---|---|
| florian@cabinet-delobaux.fr | ADMIN |
| julie@cabinet-delobaux.fr | COMMERCIAL |
| ~~alexis@cabinet-delobaux.fr~~ | ~~CHIRURGIEN~~ — **retire par ADR-0002** |

### 0.3 Seed pipeline

- [ ] `/pipeline` affiche au moins 1 process → seed processes présent
- [ ] Sinon : créer 3-4 processes via "+ Nouveau patient" avant de commencer

---

## 1. Sidebar + guards par rôle (EP01-S03)

### 1.1 ADMIN (florian)
- [ ] Sidebar affiche : Dashboard, Pipeline, Clients, Agenda, Paramétrage
- [ ] `/pipeline` accessible directement

### 1.2 COMMERCIAL (julie)
- [ ] Sidebar affiche : Dashboard, Pipeline, Clients, Agenda, Paramétrage
- [ ] `/pipeline` accessible directement

### ~~1.3 CHIRURGIEN (alexis)~~
- ~~[ ] Sidebar **n'affiche PAS** Pipeline~~
- ~~[ ] Taper `/pipeline` manuellement → **redirect vers `/dashboard`**~~
> Section caduque post-ADR-0002 : le role CHIRURGIEN n'existe plus dans le fork commercial. La pipeline est accessible a tous les roles authentifies.

### 1.4 Role switcher
- [ ] En tant que COMMERCIAL, switcher en bas de sidebar visible
- [ ] Switch → ADMIN → sidebar inchangée (déjà tout)
- ~~[ ] Switch → CHIR → Pipeline disparaît~~ — caduc (ADR-0002)

---

## 2. Layout pipeline (EP04-S01)

- [ ] 5 colonnes visibles dans l'ordre : **Contact → Consultation → Post-consult → Confirmée → Op programmée**
- [ ] Chaque colonne a une **barre colorée 4px** en haut
- [ ] **Bloc CA** au-dessus de chaque colonne (ou en tête de page) avec 3 lignes : Potentiel / Confirmé / En attente
- [ ] **2 sections parallèles en bas** visibles :
  - [ ] Non qualifié (rouge)
  - [ ] Follow-up (amber)
- [ ] Bouton **"+ Nouveau patient"** en haut à droite

---

## 3. Filtres (EP04-S01 + 055f6e0)

- [ ] **Search patient** : taper un nom partiel → liste filtrée en temps réel
- [ ] Effacer le search → liste complète revient
- [ ] **Filtre qualification** (qualifié / non qualifié / tous) fonctionne
- [ ] **Filtre intensity range** (slider 1-10) fonctionne
- [ ] Combiner search + qualification + intensity simultanément
- [ ] Reset des filtres clair et visible

---

## 4. ProcessCard (EP04-S03)

Sur au moins 3 cartes différentes, vérifier :

- [ ] Nom patient affiché clairement
- [ ] **CopyButton hover-only** à côté du nom (apparaît au survol, masqué au repos)
- [ ] Clic sur CopyButton → toast "Copié !" + check vert 2s
- [ ] **Badge qualification** : Check vert (qualifié) OU X rouge (non qualifié)
- [ ] **Intensity** affichée en police mono
- [ ] Liste des interventions visible
- [ ] **Badge consultation** : "Aujourd'hui" / "À venir" / "Passée" selon date
- [ ] Tags conditionnels : signé / acompte / devis en cours (seront **vides si pas de devis** — normal, EP05 pas fait)
- [ ] Date mono + montant + CopyButton
- [ ] **Hover** → scale + shadow visible
- [ ] Curseur pointer sur la carte entière

---

## 5. Création "+ Nouveau patient" (459af56)

- [ ] Clic sur bouton → formulaire / dialog création client
- [ ] Champs : firstName, lastName, phone (obligatoire), email, ville, source, doctolibUrl
- [ ] Validation téléphone FR `0XXXXXXXXX` → format invalide refusé
- [ ] Validation email malformé → refusé
- [ ] Valider avec données valides →
  - [ ] Client créé
  - [ ] Process associé auto-créé en stage CONTACT
  - [ ] **Process Panel s'ouvre directement** sur ce nouveau process
  - [ ] Nouvelle carte visible en colonne CONTACT

---

## 6. Drag & Drop (EP04-S01)

### 6.1 Transition simple
- [ ] Prendre une carte CONTACT
- [ ] La glisser vers CONSULTATION → **dialog "Forcer la transition"** apparaît
- [ ] Lire la raison indiquée (devrait être "consultationDate manquante" ou équivalent)
- [ ] **Annuler** → carte revient en CONTACT

### 6.2 Transition valide
- [ ] Ouvrir le process (clic carte)
- [ ] Tab Vue d'ensemble → remplir **date de consultation**
- [ ] Fermer panel
- [ ] Re-drag CONTACT → CONSULTATION → **passe directement** (pas de dialog)
- [ ] Carte bien déplacée

### 6.3 Transition bloquée par EP05 (attendu)
- [ ] Drag une carte CONSULTATION → POST_CONSULT
- [ ] Dialog "Forcer" apparaît avec raison "devis intervention manquant" ou équivalent
- [ ] Cocher **force=true** → la carte passe quand même
- [ ] Vérifier en Network tab : `PATCH /api/processes/:id/stage` avec `{ force: true }`

---

## 7. Process Panel (EP04-S04)

### 7.1 Ouverture / fermeture
- [ ] Clic sur carte → **panel 720px slide-in depuis la droite** (animation ~200ms)
- [ ] Backdrop semi-transparent derrière
- [ ] Touche **Échap** → ferme le panel
- [ ] Clic sur backdrop → ferme
- [ ] Bouton X en haut du panel → ferme

### 7.2 Header du panel
- [ ] Nom patient + **CopyButton** à côté
- [ ] Référence du process (ex: PROC-001)
- [ ] Téléphone

### 7.3 ProcessStepper
- [ ] 5 icônes alignées (Contact → ... → Op programmée)
- [ ] Icône de l'étape **actuelle** mise en évidence
- [ ] Icônes **passées** marquées visuellement (check ou fond différent)
- [ ] Icônes **futures** en grisé
- [ ] **Hover** sur une icône → scale 1.05 + **tooltip** "Déplacer vers X"
- [ ] Clic sur étape passée → process revient (avec ou sans confirmation)
- [ ] Clic sur étape future → transition (avec dialog forcer si besoin)

### 7.4 Sorties secondaires
- [ ] Bouton **Non qualifié** (rouge) visible
- [ ] Bouton **Follow-up** (amber) visible
- [ ] Clic "Non qualifié" → dialog avec champ raison obligatoire
- [ ] Soumettre sans raison → erreur
- [ ] Soumettre avec raison → carte disparaît du kanban
- [ ] Carte réapparaît dans section "Non qualifié" en bas avec la raison visible
- [ ] Même flow pour "Follow-up" mais raison est un **enum** : TEMPS / ARGENT / HÉSITATION / AUTRE
- [ ] Enum "AUTRE" → champ texte libre complémentaire ?

### 7.5 StageContextBanner
- [ ] Banner coloré selon stage actuel
- [ ] Message d'action prioritaire (ex: "Envoyer devis" en POST_CONSULT)

### 7.6 Footer actions
- [ ] Bouton d'action rapide selon stage
- [ ] Ex: en POST_CONSULT → bouton primary "→ Confirmée"

### 7.7 URL hash
- [ ] Ouvrir un process → URL contient `?process=<id>` (ou hash)
- [ ] **Copier l'URL**, ouvrir nouvel onglet, coller → panel **s'ouvre automatiquement** sur ce process
- [ ] Recharger page avec le hash → panel restauré

---

## 8. Tabs du panel (EP04-S04)

### 8.1 Tab Vue d'ensemble
- [ ] Infos patient (read-only ici, éditables via "Modifier" vers fiche client)
- [ ] Qualification : curseur intensity 1-10 + raison
- [ ] Modifier intensity → **auto-save** (vérifier via Network)
- [ ] Liste des interventions associées
- [ ] Dates clés : consultation, etc.

### 8.2 Tab Notes (voir section 10 détaillée)
- [ ] Dot accent si onglet prioritaire selon stage

### 8.3 Tab Documents
- [ ] Placeholder affiché : "EP06 à venir" (commit 6b96700)
- [ ] Pas d'erreur console

### 8.4 Tab Devis
- [ ] Placeholder affiché : "EP05 à venir"
- [ ] Pas d'erreur console

---

## 9. Sections Non qualifié + Follow-up (EP04-S02)

- [ ] Section **Non qualifié** (fond rouge clair) affiche les process sortis
- [ ] **CA perdu** visible et calculé correctement
- [ ] Cartes **non draggable** (ni sortie, ni entrée)
- [ ] Action "Requalifier" inline → process revient en CONTACT
- [ ] Section **Follow-up** (fond amber)
- [ ] **CA en attente** visible
- [ ] Raison affichée par carte (TEMPS/ARGENT/...)
- [ ] Action "Archiver" inline pour Follow-up

---

## 10. Notes role-based (EP04-S05) ⭐

**MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire la note medicale et le role CHIRURGIEN. La section 10 ne teste plus qu'une seule note (commerciale) pour ADMIN + COMMERCIAL.

### 10.1 En tant que COMMERCIAL (julie)
- [ ] Tab Notes : champ "Note commerciale" visible et **éditable**
- [ ] Taper du texte → attendre 2s → toast / indicateur "Sauvegardé"
- [ ] Recharger la page → texte persisté
- ~~[ ] Champ "Note médecin" : visible mais grisé / read-only~~ — caduc ADR-0002 (champ supprime)

### ~~10.2 En tant que CHIRURGIEN (alexis)~~
> Section caduque post-ADR-0002 : le role CHIRURGIEN n'existe plus.

### 10.2 En tant qu'ADMIN (florian)
- [ ] Tab Notes : **note commerciale éditable** (ADR-0002 : plus de note medecin)
- [ ] Auto-save fonctionne
- [ ] Recharger → persisté

---

## 11. Ce qui NE doit PAS marcher (attendu, pas des bugs)

Cocher si le comportement attendu est bien celui observé :

- [ ] Tab **Devis** = placeholder (EP05 pas fait)
- [ ] Tab **Documents** = placeholder (EP06 pas fait)
- [ ] Badge documents X/Y **absent ou 0/0** sur ProcessCard (EP06 pas fait)
- [ ] Tag "signé" / "acompte" **vides** (aucun devis en DB)
- [ ] Transition CONSULTATION → POST_CONSULT **nécessite force=true**
- [ ] Transition POST_CONSULT → CONFIRMEE **nécessite force=true**
- [ ] Barre progression paiement **absente** sur cartes OP_PROGRAMMEE (EP07-S03)
- [ ] **CA en attente = 0** en haut du pipeline (pas de devis → normal)

Si un de ces points se comporte différemment de ce qui est annoncé "attendu", c'est peut-être bon signe (plus de features livrées que prévu) ou c'est un bug d'affichage — à flagger.

---

## 12. Bugs / observations à consigner

| # | Ce que j'ai fait | Résultat attendu | Résultat observé | Gravité (bloquant/gênant/cosmétique) |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |

---

## 13. Verdict global

- [ ] **Démo OK** : les parcours 1→10 fonctionnent, aucun bug bloquant
- [ ] **Démo à risque** : parcours OK mais bug gênant à flagger à l'autre Claude
- [ ] **Démo KO** : bug bloquant, intervention nécessaire avant J-1

**Notes libres :**

```
(à remplir pendant/après le test)




```

---

## Annexes

### Commandes utiles pendant le test

```bash
# Voir les logs backend en direct
docker compose logs -f backend

# Voir les logs frontend
docker compose logs -f frontend

# Reset seed si données polluées par les tests
docker compose exec backend npx prisma migrate reset --force
docker compose exec backend npx tsx prisma/seed.ts

# Vérifier l'état d'un process en DB
docker compose exec backend npx prisma studio
# → ouvre http://localhost:5555
```

### Endpoints backend utiles pour curl

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"julie@cabinet-delobaux.fr","password":"demo","tenantSlug":"cabinet-delobaux"}'

# Récupérer pipeline
curl http://localhost:4000/api/pipeline \
  -H "Authorization: Bearer <JWT>"

# Forcer une transition
curl -X PATCH http://localhost:4000/api/processes/<id>/stage \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"stage":"POST_CONSULT","force":true}'
```
