# Methodologie Agile — CRM Commercial V1

**Date** : 2026-05-26 (mardi)
**Auteur** : Dimitry
**Sprint courant** : Sprint Final V1 (S0)
**Deadline V1** : vendredi 29 mai 2026 — 1 cabinet pilote utilise le site en prod
**Deadline interm.** : jeudi 28 mai matin — front rebrande pret pour demo clients (Florian)

---

## 1. Reformulation du besoin

> Avant de coder, on remet le besoin a plat avec ses propres mots. Si on n'arrive pas a le dire en 6 phrases simples, c'est qu'on n'a pas compris.

- **Le client (commanditaire) est** : Florian, revendeur intermediaire qui place le CRM aupres de cabinets de chirurgie esthetique. Il marge sur la revente. Il n'est pas chirurgien lui-meme.
- **Les utilisateurs finaux sont** : 2 roles dans chaque cabinet — l'**ADMIN** (le chirurgien proprietaire / le gerant) et le **COMMERCIAL** (l'assistant qui gere le pipeline de leads et les devis au quotidien).
- **Le probleme principal est** : les cabinets de chirurgie esthetique font de la vente **commerciale** (pas medicale), mais utilisent des outils medicaux (Doctolib) ou generalistes (HubSpot, Pipedrive) qui ne parlent pas leur metier. Resultat : des leads perdus, des devis faits a la main sur Excel, pas de visibilite CA, pas de relance structuree.
- **La premiere version (V1) doit permettre a** un cabinet (admin + 1 ou 2 commerciales) de gerer son pipeline commercial complet : lead → consultation → devis → operation → facturation. En **commercial pur** : pas de donnees medicales stockees.
- **La contrainte principale est** : **non-HDS**. Le projet refuse explicitement de devenir un DPI (Dossier Patient Informatise). Pas de bilans, pas d'ordonnances, pas de comptes-rendus operatoires. La conformite RGPD est obtenue par 4 leviers cumulatifs : CGU + messaging exhaustif + securite renforcee + hebergement Scaleway France (cf ADR-0003).
- **Ce projet ne doit pas devenir** : un dossier patient informatise, un outil de teleconsultation, un agenda medical, un substitut a Doctolib. Si une feature glisse vers du medical, elle est requalifiee commercialement (ex: pas de "note medecin", remplace par "note commerciale") ou supprimee (ex: enum CHIRURGIEN du role retire par ADR-0002).

### Contexte temporel actuel (J-3)

| Jour | Activite | Statut |
|------|----------|--------|
| Mardi 26 mai (auj) | Reformulation agile + relecture CDCF | en cours |
| Mercredi 27 mai | (user dispo limitee) — preparation assets rebrand | a faire |
| Jeudi 28 mai matin | Front rebrande livre pour demo clients Florian | a faire |
| Jeudi 28 mai aprem | D5 securite site + D6 securite serveur | a faire |
| Vendredi 29 mai matin | D7 onboarding CGU + D11 deploy prod + smoke | a faire |
| Vendredi 29 mai aprem | Cabinet pilote se logge en prod, debut utilisation reelle | livraison V1 |

---

## 2. Objectif produit

```
La V1 doit permettre a un cabinet de chirurgie esthetique (1 admin + 1-2 commerciales)
de gerer son pipeline commercial complet de bout en bout (lead → consultation → devis →
operation → facturation), de maniere centralisee et chiffree, afin de remplacer les
suivis Excel / WhatsApp / Doctolib eparpilles par un outil unique, mesurable, conforme
RGPD non-HDS.
```

**Mesure de succes V1** :
- 1 cabinet utilise activement l'app en production pendant 1 semaine sans rollback
- 0 incident de securite ou de fuite de donnees pendant la 1ere semaine
- 100% des CGU acceptees par les admins
- Au moins 5 process crees + 3 devis signes pendant la 1ere semaine d'usage reel
- Florian peut consulter ses stats consolidees via son outil externe (D8)

---

## 3. Personas utilisateurs

> Le template ne le demande pas explicitement mais sans personas les US sont creuses.

### Persona 1 : Florian — le revendeur (commanditaire)

- 35-45 ans, ex-commercial du secteur medical
- Pas dev, lit du code juste si vraiment necessaire
- Vend le SaaS a 5 cabinets initialement, objectif 30 cabinets en 1 an
- Veut : marge predictible, faible ops, stats consolidees sur ses cabinets, pas d'embrouille juridique HDS
- N'aime pas : delai, dependance technique, complexite

### Persona 2 : Stephane — ADMIN du cabinet (chirurgien proprietaire)

- 40-55 ans, chirurgien esthetique
- Pas tech, sait juste utiliser un navigateur et son iPhone
- Veut : voir son CA en 1 clic, savoir ce que fait sa commerciale, ne pas perdre de temps administratif
- Touche peu l'outil au quotidien — c'est sa commerciale qui l'utilise. Lui regarde le dashboard 2x par semaine.
- Critique : si l'outil bug → il l'abandonne en 48h et retourne a Excel

### Persona 3 : Julie — COMMERCIAL du cabinet (utilisateur principal)

- 25-35 ans, assistante commerciale a temps plein
- A l'aise avec WhatsApp, Doctolib, Excel
- 4-8 heures par jour devant l'outil
- Veut : pipeline drag-drop visuel, generer un devis vite, retrouver les coordonnees d'une cliente, recevoir une alerte pour les follow-up
- Critique : un click de trop → friction. Trop de champs obligatoires → resistance.

### Persona 4 : Marie — la cliente du cabinet (personne concernee RGPD)

- 25-65 ans, cherche une prestation esthetique
- Ne touche PAS l'outil directement (V1). Elle communique par WhatsApp avec Julie.
- Ses donnees personnelles sont saisies par Julie dans le CRM (nom, telephone, email, ville, source de prospection)
- Droits RGPD : acces, rectification, anonymisation, suppression (cf ADR-0003 Art. Z de la CGU)

---

## 4. User stories cles (10 stories pour le MVP V1)

> 50+ stories existent deja dans `docs/product/stories/`. Ici on selectionne les 10 KEY qui conditionnent la **livraison vendredi 29 mai**.

| ID | User story | Valeur | Stories projet liees |
|----|------------|--------|----------------------|
| US01 | En tant qu'**ADMIN**, je veux me connecter avec mon email + mot de passe + cabinet, afin d'acceder a l'outil de mon cabinet uniquement (isolation tenant) | Securite + RBAC | EP01-S01, UC-01 |
| US02 | En tant qu'**ADMIN du cabinet**, je veux accepter les CGU non-HDS a la 1ere connexion, afin d'autoriser legalement l'usage commercial de l'outil pour mes clients | Conformite RGPD + Art. 9.2.a | EP01-S02, UC-03 (D7) |
| US03 | En tant que **COMMERCIAL**, je veux creer un nouveau dossier client + process en 2 clics depuis le kanban, afin de capturer un lead en moins de 30 secondes | Productivite quotidienne | EP04-S01, UC-11, UC-20 |
| US04 | En tant que **COMMERCIAL**, je veux generer un devis pre-rempli depuis le process en 1 clic, avec snapshot fige des prix catalogue, afin de ne pas perdre de marge si le catalogue change | Differenciation metier | EP05-S01, UC-30 |
| US05 | En tant que **COMMERCIAL**, je veux televerser les documents commerciaux du client (CNI, RIB, CGV signees) avec un message d'alerte explicite anti-HDS, afin d'eviter d'y mettre par erreur un bilan medical | Conformite HDS + UX | EP06-S02, UC-41 |
| US06 | En tant que **COMMERCIAL**, je veux marquer un devis comme signe + enregistrer l'acompte recu, afin que le process avance automatiquement en stage CONFIRMEE | Pipeline fluide | EP05-S05, UC-35, UC-36 |
| US07 | En tant que **COMMERCIAL**, je veux voir mon agenda prestations a venir (vue jour/semaine/mois) avec drag-drop pour reprogrammer, afin d'eviter les conflits de planning clinique | Operations | EP07-S01, UC-50 |
| US08 | En tant qu'**ADMIN**, je veux consulter mon dashboard avec 4 KPIs (clients, process actifs, CA signe, taux conversion) + chart CA mensuel, afin de connaitre la sante commerciale de mon cabinet sans appeler ma commerciale | Pilotage cabinet | EP08-S01, UC-60 |
| US09 | En tant que **COMMERCIAL**, je veux relancer un client en sub-pipeline follow-up (J0/J1/J3/J7/J14/J30/ABANDON) avec note + label de progression, afin de ne pas oublier les leads tiedes | Conversion | EP09-S02, UC-70, UC-71 |
| US10 | En tant que **FLORIAN (revendeur externe)**, je veux consulter les stats agregees de mes cabinets via mon outil externe (sur le meme reseau Docker), afin de facturer mes cabinets sans appeler mes utilisateurs | Modele economique | nouvelle (D8), UC-100 |

---

## 5. Criteres d'acceptation (Given/When/Then)

> Format Gherkin. Chaque US a 1-3 criteres clairs et testables.

### US01 — Login

| Given | When | Then |
|-------|------|------|
| Je suis sur `/login`, j'ai un compte valide dans le cabinet `cabinet-delobaux` | Je saisis email + password + cabinet et je clique "Se connecter" | Je suis redirige vers `/dashboard` avec une session NextAuth posee (cookie HttpOnly) |
| Je saisis un mauvais password | Je clique "Se connecter" | Je reste sur `/login` avec le message "Email, mot de passe ou cabinet invalide" (anti-enumeration) |
| Je tente plus de 5 logins/min sur la meme IP | Je clique "Se connecter" la 6e fois | Je recois 429 Rate limit |

### US02 — Onboarding CGU

| Given | When | Then |
|-------|------|------|
| Je suis ADMIN, mon `Tenant.cguAcceptedAt` est null, je me logue | Je clique sur le bouton "Se connecter" sur `/login` | Je suis redirige vers `/onboarding/cgu` (PAS `/dashboard`) avec le texte integral des 3 articles X+Y+Z |
| Je suis sur `/onboarding/cgu`, je n'ai pas coche la case | Je clique "Accepter et continuer" | Le bouton reste disabled, rien ne se passe |
| Je coche la case + saisis mon nom de signataire | Je clique "Accepter et continuer" | `Tenant.cguAcceptedAt = now()`, je vois `/dashboard` avec banniere de rappel non-HDS, 1 entree dans `AuditLog` |
| Je suis COMMERCIAL, CGU non acceptee dans le tenant | Je me logue | Je vois un message "Votre administrateur doit accepter les CGU avant que vous puissiez utiliser l'outil" + bouton logout |

### US03 — Creer process

| Given | When | Then |
|-------|------|------|
| Je suis sur `/pipeline`, je clique "+ Nouveau dossier" puis "Nouveau client" | Je saisis prenom + nom + telephone (3 champs minimum) puis "Creer" | Un nouveau `Client` + `Process` (stage CONTACT) sont crees, le ProcessPanel s'ouvre |
| Je saisis un telephone invalide ("1234") | Je clique "Creer" | Toast d'erreur explicite "Telephone invalide" — pas de silent fail (cf test pipeline-full-flow telephone invalide) |

### US04 — Creer devis depuis process

| Given | When | Then |
|-------|------|------|
| Un process existe avec 2 ProcessIntervention liees | Je clique "Nouveau devis" dans l'onglet Devis | Un Devis est cree avec 2 DevisIntervention snapshot (prix + duree figes) + N DevisInterventionFee actives snapshot + status TECHNIQUE_REMPLI |
| Le process a 0 intervention | Je clique "Nouveau devis" | Le devis est cree avec status BROUILLON, aucune DevisIntervention |
| Apres creation du devis, je modifie le prix de l'`Intervention` dans le catalogue | Je retourne sur le devis | Le devis garde l'ancien prix snapshot (regle de snapshot fige RM1 UC-30) |

### US05 — Upload document (modal HDS)

| Given | When | Then |
|-------|------|------|
| Je suis sur l'onglet Documents d'un process, c'est mon 1er upload de la session | Je clique sur Upload + choisis un fichier PDF | Le modal HDS s'affiche avec la liste explicite des interdits (bilan, ordonnance, etc.) |
| Le modal est ouvert | Je clique "Annuler" | Le modal se ferme, aucun upload n'est lance, sessionStorage non set |
| Le modal est ouvert | Je clique "Je confirme et j'upload" | sessionStorage `crm-commercial:hds-upload-consent = "true"`, le fichier est uploade, `ProcessDocument.status = RECU` |
| J'ai deja confirme dans cette session, je clique Upload sur un autre document | (selection fichier) | Le modal **ne s'affiche pas**, upload direct |

### US06 — Sign devis + acompte

| Given | When | Then |
|-------|------|------|
| Un devis est en status TECHNIQUE_REMPLI ou COMMERCIAL_REMPLI | Je clique "Marquer signe" | `Devis.firstSignedAt = now()`, `status = SIGNE`, si tenant.autoAdvance le process passe en CONFIRMEE |
| Un devis signe sans acompte | Je clique "Acompte recu" | `Devis.acomptePaidAt = now()`, badge paiement affiche, eventuellement process auto-advance |

### US07 — Agenda prestations

| Given | When | Then |
|-------|------|------|
| Au moins 1 `DevisIntervention` a `datePrestation` ET `heurePrestation` non null | Je navigue sur `/agenda?view=week` | L'event est visible dans la grille avec libelle prestation + client + clinique |
| Je drag-drop un event sejour vers une autre date | Je relache | `DevisStay.date` est mise a jour + `DevisIntervention.datePrestation` cascade |

### US08 — Dashboard KPIs

| Given | When | Then |
|-------|------|------|
| 5 process + 3 devis signes existent dans le tenant | Je navigue sur `/dashboard` | 4 cards avec valeurs non vides : Clients (count), Process actifs, CA signe du mois, Taux conversion |
| Au moins 6 mois d'historique | Je vois le chart CA | Chart avec 12 mois glissants, montants en €, toggle semaine/mois/annee fonctionne |

### US09 — Follow-up sub-pipeline

| Given | When | Then |
|-------|------|------|
| Un process est en stage FOLLOWUP avec subStage J3 | Je drag-drop la carte de J3 vers J7 | Un dialog s'ouvre demandant note + progressLabel (AVANCE/STAGNE/RECULE/PAS_DE_REPONSE) |
| Je remplis note + progressLabel | Je clique "Confirmer" | `Process.followupSubStage = J7`, `followupSubStageEnteredAt = now()`, 1 nouveau `FollowupStepLog` cree |

### US10 — Stats endpoint (Florian)

| Given | When | Then |
|-------|------|------|
| L'outil externe de Florian est connecte au reseau Docker partage | Il fait `GET /api/internal/tenant/:tid/stats?from=...&to=...` | Reponse 200 avec JSON aggrégé (ca, conversion, nbPrestations, etc.) — pas de PII |
| Une requete arrive depuis une IP hors du subnet Docker | (idem) | 403 `Internal only` |

---

## 6. Product Backlog priorise (15 items)

> Priorisation MoSCoW + valeur 1-5 + effort 1-5. Mapping aux livrables D1-D15 deja identifies.

| ID | Item | Valeur 1-5 | Priorite MoSCoW | Effort 1-5 | Critere principal |
|----|------|------------|------------------|------------|--------------------|
| D14 | Rebrand front (CSS/HTML/JS Florian) | 5 | **MUST** | 3 | Demo clients jeudi 28 mai matin — non-negotiable |
| D5 | Securisation site (TLS, audit logs, 2FA admin) | 5 | **MUST** | 4 | Sans ca = pas de mise en prod safe |
| D6 | Securisation serveur Scaleway Dedibox (hardening, backups, Traefik) | 5 | **MUST** | 3 | Idem |
| D7 | Onboarding cabinet — acceptance CGU integree app | 5 | **MUST** | 2 | Conformite RGPD obligatoire ADR-0003 |
| D11 | Deploy production Scaleway Dedibox + DNS + smoke prod | 5 | **MUST** | 3 | Vendredi 29 mai livraison |
| D3 | Facture Claude 200€ | 1 | **SHOULD** | 1 | DEJA FAIT — admin |
| D4 | Acces nom de domaine | 1 | **SHOULD** | 1 | DEJA FAIT — Florian fournit |
| D10 | Tests E2E + smoke complet | 4 | **MUST** | 3 | Necessaire avant deploy prod |
| US02-cgu | Maj `Tenant` columns + migration Prisma | 3 | **MUST** | 2 | Inclus dans D7 |
| D8 | Endpoints stats internes (outil Florian) | 3 | **COULD** | 2 | Reportable a S+1 si time pressed |
| D9 | Migration externe CSV — BDD (script CLI) | 3 | **COULD** | 2 | Reportable a S+1 — 1er cabinet n'a peut-etre pas besoin |
| PD1 | Connecteur Google Drive (visualisation read-only V1.1) | 3 | **WONT** (V1) | 4 | Reportable V1.1 |
| PD2 | IA WhatsApp pour demande documents | 4 | **WONT** (V1) | 5 | Reportable V1.1 (gros chantier) |
| PD3 | Refactor maintainability (renommage + doc + tests) | 2 | **WONT** (V1) | 4 | Reportable V1.1 (deja partiellement fait en D13) |
| V2-multi | Multi-praticien par tenant | 3 | **WONT** (V1) | 4 | Reportable V2 |

Legendes :
- **MUST** : pas livrable sans ca → bloque la deadline 29 mai
- **SHOULD** : fortement souhaite mais contournable
- **COULD** : si on a du temps
- **WONT (V1)** : explicitement reporte apres deadline

---

## 7. MVP Scope (V1 — deadline 29 mai)

### Dans le MVP V1 (8 items)

| Item | Justification |
|------|---------------|
| D14 Rebrand front | Demo clients jeudi 28 — vitrine commerciale obligatoire pour Florian |
| D5 Securite site (TLS, audit logs, 2FA admin, refresh tokens, chiffrement BDD) | Pas de prod sans securite renforcee, surtout sans HDS — defense en profondeur ADR-0003 |
| D6 Securite serveur Scaleway Dedibox | Idem ; aussi : Dedibox = dedie = hardening manuel obligatoire |
| D7 Onboarding cabinet + acceptance CGU | Conformite RGPD imperative — sans CGU, l'usage est juridiquement risque |
| D10 Tests E2E + smoke | Filet de securite minimum avant prod |
| D11 Deploy production + DNS + smoke prod | C'est la livraison |
| D1, D2 (deja livres) | CDCF + Devis Scaleway acceptes |
| D12 i18n MVP fr/en (deja livre) | Demande explicite Florian (probable export EN un jour) |

### Hors MVP V1 (reporte V1.1 ou +)

| Item | Justification |
|------|---------------|
| D8 Endpoints stats internes | Florian peut faire un export manuel les 2 premieres semaines, sans urgence |
| D9 Migration externe CSV | Le 1er cabinet pilote peut commencer **vide** (re-saisie manuelle 5-10 clients pour bootstrap) |
| PD1 Google Drive read-only | Le stockage local marche pour 5 cabinets pendant 3 mois, pas de raison d'investir maintenant |
| PD2 IA WhatsApp bot | Feature additionnelle, gros chantier (1-2 semaines), pas critique pour le 1er cabinet |
| PD3 Refactor maintainability | Le code marche, on consolide quand on aura plus d'utilisateurs |
| V2-multi Multi-praticien | Le 1er cabinet n'a qu'1 chirurgien — V2 quand un cabinet a 3+ praticiens |
| API publique externe | Trop tot ; pas de demande utilisateur |
| App mobile native | Trop tot ; le navigateur mobile suffit en V1 |
| Reporting cohortes / funnels | Le dashboard 4 KPIs + previsionnel couvre 90% du besoin V1 |

---

## 8. Sprint Planning — Sprint Final V1 (mer-vendredi)

### Sprint Goal

> Mettre en production une V1 utilisable par 1 cabinet pilote, conforme RGPD non-HDS, avec un front rebrande pret pour la demo clients de jeudi matin.

### Sprint Backlog (ordonne par sequence d'execution)

1. **D14 — Rebrand front** (mer aprem + jeudi matin)
   - Lire les assets CSS/HTML/JS fournis par Florian
   - Mapper sur la stack Tailwind + shadcn existante (tokens CSS vars `--accent`, `--primary`, etc.)
   - Adapter le layout (Sidebar + Header) sans casser la prod existante
   - Smoke browser sur 5 pages (login, dashboard, pipeline, devis, agenda)

2. **D5 — Securite site** (jeudi aprem)
   - Activer HTTPS dev local (cert auto-signe ou via traefik dev)
   - Ajouter chiffrement at rest pgcrypto sur `Client.email`, `Client.phone` (pgp_sym_encrypt)
   - Creer table `AuditLog` + middleware Express qui logue toute mutation
   - 2FA admin (lib otplib) — endpoint setup + verify TOTP + recovery codes
   - Refresh tokens JWT court (8h) + table `RevokedToken`

3. **D6 — Securite serveur Scaleway Dedibox** (jeudi soir / vendredi matin)
   - Provision Dedibox (commande, reception IP, KVM access)
   - Reinstall Debian 12 from scratch via manager Scaleway
   - SSH cle + fail2ban + UFW (allow 22/80/443 only)
   - Hardening sysctl + sshd_config (no root, no password)
   - Docker + Docker Compose + Traefik 3.x + Let's Encrypt
   - Backup S3 chiffre quotidien (Scaleway Object Storage)
   - Monitoring Loki + Promtail + Grafana (basique)

4. **D7 — Onboarding CGU integree app** (vendredi matin)
   - Migration Prisma : `Tenant.cguAcceptedAt`, `cguVersion`, `cguSignatoryName`
   - Middleware Next.js `requireCguAccepted` qui redirect `/onboarding/cgu`
   - Page `/onboarding/cgu` avec texte CGU integral + checkbox + nom + bouton
   - Endpoint `POST /api/tenant/accept-cgu`
   - Banniere persistante non-HDS dans le dashboard apres acceptance

5. **D11 — Deploy production** (vendredi aprem)
   - Build images Docker (frontend, backend) + push registry
   - DNS config (A record vers IP Dedibox)
   - Compose up + healthchecks + migration prisma deploy
   - Seed initial : 1 tenant + 1 ADMIN (Stephane le chirurgien)
   - Smoke prod complet : login, CGU, create process, create devis, upload doc, dashboard
   - Florian valide visuellement avec son client

### Definition of Done (criteres acceptables pour clore le sprint)

1. Le 1er cabinet pilote peut se logger en prod via `https://<domaine>` sans erreur
2. L'ADMIN du cabinet accepte les CGU (1 entree dans `AuditLog`)
3. La commerciale du cabinet cree au moins 1 process + 1 devis sans erreur dans la 1ere session
4. Le front affiche le branding Florian (logo + couleurs + typo) sur toutes les pages principales
5. Les tests E2E principaux (auth, dashboard, pipeline, devis-create, document-upload) passent en CI
6. Backup automatique chiffre tourne au moins 1 fois (cron vendredi soir)
7. Le monitoring montre 0 erreur 5xx pendant les 2 premieres heures de prod
8. Aucun secret en clair dans le repo / docker-compose / logs

### Capacite estimee

- Mercredi : user dispo limitee → 0-2h dev de mon cote
- Jeudi : 7-8h dispo (rebrand matin + D5 aprem)
- Vendredi : 7-8h dispo (D6 + D7 + D11)
- **Total dispo** : ~14-18h sur 3 jours
- **Charge estimee MUST** : 16h (D14 4h + D5 5h + D6 4h + D7 2h + D11 1h) — **tendu mais tenable** si pas de bug imprevu

---

## 9. Kanban courant (Sprint Final V1)

> Regle WIP : maximum 2 cartes en colonne "In Progress" en meme temps.

### To Do
- **D14** Rebrand front (assets CSS/HTML/JS Florian a integrer)
- **D5** Securite site (TLS + chiffrement + 2FA + audit logs)
- **D6** Securite serveur Scaleway Dedibox
- **D7** Onboarding CGU integree app
- **D10** Tests E2E + smoke (iteration : fix 8 specs cassees apres renames)
- **D11** Deploy production

### In Progress
- **D14** (mardi 26 : user en train de relire CDCF + reception assets brand, demarrage code mer/jeu)

### Review
- (vide pour l'instant)

### Done
- **D1** CDCF post-POC integral (2026-05-20)
- **D2** Devis serveur Scaleway DEV1-L (2026-05-20) — **REVISITER** car le choix se porte sur Dedibox EM-A116X-SSD
- **D3** Facture Claude 200€ (admin, fait)
- **D4** Acces nom de domaine (Florian fournit, en route)
- **D12** i18n MVP fr/en next-intl (2026-05-20)
- **D13** Structuration UC + MCT + CDCT v2.0 (2026-05-22, 34 UCs livres)

### Backlog (pas dans le sprint courant)
- **D8** Stats endpoints internes — V1.1
- **D9** Migration externe CSV — V1.1
- **PD1** Drive Google read-only — V1.1
- **PD2** IA WhatsApp — V1.1+
- **PD3** Refactor maintainability — V1.1+
- **V2-multi** Multi-praticien — V2

---

## 10. Wireframe logique (CRM Commercial — pages cles)

> Pas un mockup pixel-perfect, juste la structure logique des pages critiques V1.

### [Login] — `/login`
- **Objectif** : authentifier l'utilisateur dans son tenant
- **US liees** : US01
- **Structure** :
  - Split layout : col gauche illustration + slogan / col droite formulaire
  - 3 champs : cabinet (pre-rempli depuis localStorage), email, password
  - 1 bouton "Se connecter" (primary CTA)
  - Lien secondaire "Mot de passe oublie ?" (V1.1)

### [Onboarding CGU] — `/onboarding/cgu` (D7 nouveau)
- **Objectif** : faire accepter explicitement les CGU non-HDS avant tout usage
- **US liees** : US02
- **Structure** :
  - Header bandeau amber "Outil commercial non-HDS — aucune donnee de sante ne doit y etre stockee"
  - 3 sections Art. X / Art. Y / Art. Z developpees in extenso (texte scrollable)
  - Champ libre "Nom complet du signataire" (pre-rempli ADMIN)
  - Date du jour (lecture seule)
  - Checkbox obligatoire "Je reconnais avoir lu et accepter"
  - Bouton primary "Accepter et continuer" (disabled tant que checkbox uncheck)
  - Bouton secondary "Annuler" (logout)

### [Dashboard] — `/dashboard`
- **Objectif** : vue ensemble cabinet en 1 ecran (ADMIN principal)
- **US liees** : US08
- **Structure** :
  - Header avec greeting personnalise ("Bonjour Stephane")
  - Banniere rappel non-HDS persistante 7 jours apres acceptance CGU
  - Row 4 KPI cards : Clients / Process actifs / CA signe du mois / Taux conversion
  - Section "CA mensuel" : chart 12 mois glissants + toggle granularite
  - Section "Previsionnel" : operations prochaines 30 jours + CA en attente

### [Pipeline] — `/pipeline`
- **Objectif** : kanban drag-drop des process (parcours commercial 5 stages)
- **US liees** : US03, US06
- **Structure** :
  - Header avec stats par colonne (count + CA potentiel / confirme / en attente)
  - Filtres : qualification, intensite, search nom client
  - 5 colonnes draggables : CONTACT / CONSULTATION / POST_CONSULT / CONFIRMEE / OP_PROGRAMMEE
  - Badge counter NON_QUALIFIE + FOLLOWUP (sections paralleles, sub-vues)
  - Floating action "+ Nouveau dossier" (split button : avec client existant / nouveau client)
  - Click sur une carte → ouvre ProcessPanel (sheet a droite)

### [ProcessPanel onglets] — `/pipeline?open=:processId`
- **Objectif** : detail process avec actions (qualif, devis, documents, follow-up)
- **US liees** : US04, US05
- **Structure** :
  - Sheet drawer a droite (ferme via X)
  - Header : nom client + stage badge + boutons Stage transition
  - 5 tabs : Vue ensemble / Qualif / Devis / Documents / Suivi
  - Tab Documents : checklist X/Y + section Recommandes + bouton "+ Ajouter doc"
  - Tab Devis : si vide → "Nouveau devis" bouton ; si rempli → row Devis + bouton Ouvrir

### [DevisBuilder] — `/devis/:devisId`
- **Objectif** : editer un devis (technique + commercial + total)
- **US liees** : US04, US06
- **Structure** :
  - Header : reference DEV-YYYY-NNNN + status badge + actions (PDF / Copy texte / Envoyer / Signer / Acompte)
  - Section "Partie technique" : prestations + fees (snapshot fige editables)
  - Section "Partie commerciale" : sejours + options catalogue + custom + clinique + date
  - Section sticky bottom : TOTAL en gros chiffres

### [Agenda] — `/agenda`
- **Objectif** : vue calendrier prestations
- **US liees** : US07
- **Structure** :
  - Toolbar : toggle jour/semaine/mois + navigation prev/next/today
  - Grille calendar (react-big-calendar)
  - Events colories par type (RDV consult = bleu, prestation = accent)
  - Click event → EventSheet (drawer)

### [Follow-up] — `/follow-up`
- **Objectif** : sub-kanban des process en stage FOLLOWUP
- **US liees** : US09
- **Structure** :
  - 7 colonnes : J0 / J1 / J3 / J7 / J14 / J30 / ABANDON
  - Cards draggables avec last note + progress label
  - Drag-drop → dialog (note + progressLabel)

### [Florian Stats — D8 reportable V1.1] — `GET /api/internal/tenant/:tid/stats`
- **Objectif** : endpoint backend uniquement (pas d'UI dans le CRM)
- **US liees** : US10
- **Structure** : JSON (cf UC-100)

---

## 11. Adaptation Log (depuis le brief initial Florian du 18 mai)

| Avant feedback | Nouvelle contrainte | Changement decide | Effet sur backlog/MVP |
|----------------|---------------------|-------------------|------------------------|
| Plan initial : tout livrer pour le 29 mai (D1-D11) sans rebrand specifique | Reception assets brand Florian le 25 mai + demo clients jeudi 28 | Ajout D14 rebrand front en MUST priorite haute | D8 + D9 reportes en V1.1 ; sprint resserre sur 8 items au lieu de 11 |
| Choix initial serveur : Scaleway DEV1-L Instance 38€/mois | User trouve offre Scaleway Dedibox EM-A116X-SSD 28€/mois (dedie 32GB) | Switch vers Dedibox | D2 a maj (devis serveur), D6 ajuste +0.5j (hardening dedie au lieu de VPS managed) |
| Plan initial securite site = bonus eventuel | Decision ADR-0003 = pas de HDS + mitigation par securite renforcee | D5 promote MUST priorite haute | Estimation 2j confirme, pas de rabais possible |
| Plan initial : juriste pour valider CGU | User refuse explicitement (cout + delai) | Substitution par "messaging in-app exhaustif" (27 emplacements) | MESSAGING-IN-APP-NON-HDS.md cree, charge UI augmentee |
| Plan initial : storage Google Drive depuis V1 | Decision : V1 en local, Drive V1.1 | Decale PD1 a V1.1 | Charge V1 reduite, Drive devient backlog post-deadline |
| Plan initial : migration externe en self-service | User : one-shot manuelle Florian/Dimitry | D9 simplifie en script CLI | Charge V1 reduite, plus de UI cliente a faire |
| Plan initial : Trust Score 100% sur HDS | HDS-CHECK : Trust Score 98.2% badge A | Accepte (Florian valide le risque residuel) | Pas d'iteration ; CGU + messaging compensent |
| Plan initial : pas de role-gating modifie | ADR-0002 retire CHIRURGIEN role + noteMedecin | Migration non-destructive + UI commercial | 33 commits dans P0-P7 ; impact sur stories existantes |

---

## 12. Retrospective (apres D13 — semaine du 18 au 22 mai)

### Ce qui a bien fonctionne

- **Methode P0-P7 + FD BYAN** : decoupage en phases courtes avec validation user a chaque phase → 0 retravail major sur ADR-0002 implementation
- **HDS-CHECK skill** : detecter automatiquement les mots-cles sante dans les stories a evite 5 regressions (P5 a flag 5 residus dans le code)
- **Renames non-destructifs** : migrations Prisma `ALTER TABLE RENAME COLUMN` au lieu de DROP+ADD → 0 perte de donnees
- **i18n MVP en 1 jour** : choix de next-intl mode "without routing" + 30 cles critiques = livraison rapide sans refactor major
- **Documentation D13** (34 UCs + MCT + CDCT v2.0) : structure solide pour onboarding nouveaux devs
- **Travail en pair humain + IA** : reduit le temps de structuration (UC, MCT, CDCT) de ~5j a 1j

### Ce qui a bloque

- **Tests E2E desynchronises apres renames** : 8 specs cassees (selectors `seed-p-07`, `process-card-`, helpers port 4000 legacy) — fix dans D10
- **Port 3300 conflit avec autofront_ai sur la machine dev** : decouvert tard, fix en passant a 3301 mais a casse les tests + .env config
- **Build image Playwright lent** (15-20 min) : npm install dans container lent + DNS Docker parfois flaky → consigne : eviter de rebuild sauf necessite
- **Decision juriste vs messaging exhaustif** : 1 aller-retour user. Lecon : valider les decisions strategiques AVANT de produire la documentation associee
- **CDCT v1.5 dans `files(2)/`** : path encombrant (parentheses), pas accessible par certains tools. Lecon : eviter parentheses dans paths repo

### Action pour le prochain sprint (final V1)

1. **D10 priorise** : refondre les helpers Playwright (login partage + fixtures + testids stricts) avant fix de tests un par un
2. **Pas de feature creep** : tenir le scope MVP strict ; toute idee nouvelle → backlog V1.1
3. **Smoke prod en parallel du dev** : preparer le serveur Dedibox AVANT vendredi pour eviter le stress de derniere minute
4. **Banniere rebrand visible** : verifier que les couleurs Florian sont accessibles (contraste WCAG AA minimum) avant la demo jeudi
5. **Commit + push frequent** : 1 commit toutes les 1-2h sur le sprint final pour limiter le risque de perte sur crash machine
6. **Backups serveur testes** : ne pas juste "configurer" — restaurer un dump dans un container test pour valider la chaine

---

## 13. Risques residuels (sprint final V1)

| Risque | Probabilite | Impact | Mitigation prevue |
|--------|-------------|--------|---------------------|
| Rebrand assets Florian incompatibles avec Tailwind/shadcn | Moyenne | Eleve (decale tout) | Mer aprem : valider la lecture des assets, demander Florian de fournir aussi tokens si possible |
| Bug majeur decouvert en smoke prod vendredi 17h | Moyenne | Tres eleve | Smoke staging jeudi soir + plan B "rollback rapide" sur staging |
| Dedibox indisponible / commande en retard | Faible | Tres eleve | Plan B = bascule sur Scaleway Instance DEV1-L (38€) deja chiffree |
| Stephane refuse de signer CGU (mal redigees) | Faible | Tres eleve | Florian a deja briefe Stephane ; tester la formulation en avance |
| Test E2E flaky bloquent CI | Moyenne | Moyen | OK pour deploy si tests verts en local + smoke prod OK |
| Conflit RGPD pendant la 1ere semaine d'usage | Tres faible | Tres eleve | AuditLog en place, CGU acceptee horodatee, monitoring actif |
| Florian decide de pivot scope vendredi matin | Faible | Eleve | Si demande raisonnable : accept ; sinon : "rendezvous V1.1 lundi" |
| Performance degradee sur Dedibox (overprovision) | Tres faible | Faible | Le serveur est large (32GB / 4C / SSD RAID) → marge confortable |

---

## 14. Annexes — references projet

- **Documents fondateurs** :
  - `docs/CDCF-post-POC-vers-V1-2026-05-20.md` (CDCF integral)
  - `docs/CDCT-2026-05-22.md` (CDCT v2.0)
  - `docs/architecture/data-model.md` (MCD)
  - `docs/architecture/mct.md` (MCT)
  - `docs/uc/` (34 UCs)
- **ADRs** :
  - 0001 Fork commercial
  - 0002 Retrait CHIRURGIEN + noteMedecin
  - 0003 Pas de bascule HDS + mitigation 4 leviers
- **Conformite** :
  - `docs/legal/CGU-clause-HDS-non-medical.md`
  - `docs/legal/MESSAGING-IN-APP-NON-HDS.md`
  - `docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md`
- **Sprint en cours** :
  - `docs/STATUS-D13-2026-05-22.md`
  - `docs/agile/methodologie-agile-V1-2026-05-26.md` (ce document)

---

*Document agile cree le 2026-05-26 dans le cadre du sprint final V1. A maj pendant le sprint (kanban + adaptation log) et en retro vendredi soir post-deploy.*
