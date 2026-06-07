# Cahier des Charges Fonctionnel — CRM Commercial — Post-POC vers V1

**Version** : 1.0 — 2026-05-20
**Auteur** : Dimitry (developpeur freelance)
**Destinataire** : Florian (revendeur / distributeur)
**Statut** : Draft pour validation
**Deadline livraison engageante** : vendredi 29 mai 2026

---

## Information document

| Champ | Valeur |
|-------|--------|
| Version | 1.0 |
| Date | 2026-05-20 |
| Auteur | Dimitry |
| Destinataire principal | Florian |
| Destinataire secondaire | Cabinets clients (via Florian) |
| Historique | v1.0 initial post-meeting roadmap |
| Documents lies | ADR-0001 (fork), ADR-0002 (retrait CHIRURGIEN/noteMedecin), ADR-0003 (strategie non-HDS), CGU `docs/legal/CGU-clause-HDS-non-medical.md`, Checklist securite `docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md` |

---

## 1. Resume executif

Le CRM Commercial est un fork commercial non-HDS du projet `CRM_chirurgien`. Apres un POC livre, ce document fixe :

1. **Scope deadline 29 mai 2026** : 11 livrables fermes (D1 a D11) couvrant securisation site + serveur, CGU integree, statistiques tenant, migration donnees externes, deploiement production.
2. **Backlog post-deadline V1** : 2 chantiers urgents (connecteur Google Drive, IA WhatsApp) + features V1 estimees en jour-homme.
3. **Backlog V2 non-estimable** : features identifiees sans date ferme.

Le projet reste en **periode non-HDS** : aucune donnee de sante n'est stockee structurellement. La protection juridique repose sur trois leviers (ADR-0003) : retrait des champs/roles medicaux du modele de donnees, CGU avec consentement commercial explicite (Art. 9.2.a RGPD), securisation renforcee de l'hebergement Scaleway.

**Relation contractuelle** : Dimitry (editeur) ↔ Florian (revendeur). Florian gere la relation commerciale avec les cabinets clients finaux. Dimitry n'a pas de contact direct avec les utilisateurs finaux (chirurgiens, commerciaux des cabinets).

---

## 2. Contexte projet

### 2.1. Historique

- **2026-04 a 2026-05-16** : developpement du POC sur le repo `CRM_chirurgien` (HDS-ready). Livraison demo 24 avril 2026.
- **2026-05-15** : decision de creer un fork commercial non-HDS pour distribution rapide sans certification HDS.
- **2026-05-18** : fork effectif (commit `8c68cfb` du repo source). Creation du repo `CRM_commercial`.
- **2026-05-18 a 2026-05-20** : ADR-0002 + implementation P0-P7 (retrait CHIRURGIEN / noteMedecin, refactor vocabulaire commercial, CGU, securite, doc alignment).
- **2026-05-20** : meeting roadmap avec Florian → ce document.
- **2026-05-29** : deadline livraison V1 (engagement ferme).

### 2.2. Roles et responsabilites

| Acteur | Role | Responsabilites |
|--------|------|-----------------|
| **Dimitry** | Editeur / dev | Developpement, hebergement, securite technique, livrables documentaires (ce CDCF) |
| **Florian** | Revendeur / distributeur / DPO de facto | Relation cabinets, validation juridique (juriste a mandater), facturation cabinets, support N1 |
| **Cabinets clients** | Utilisateurs finaux | Onboarding, acceptance CGU, gestion de leur tenant (clients, devis, documents) |
| **Personnes concernees** | Clients finaux des cabinets | Beneficiaires des droits RGPD (acces, anonymisation, suppression) |

### 2.3. Architecture relationnelle

```
                  Editeur (Dimitry)
                       |
                       | contrat de licence / SaaS
                       v
                  Florian (revendeur)
                       |
                       | contrat de revente
                       v
                Cabinets clients (N tenants)
                       |
                       | prestation esthetique
                       v
                Clients finaux (personnes concernees RGPD)
```

### 2.4. POC livre — etat actuel (post P0-P7)

**Stack technique** (figee, voir `docs/stacks/`) :
- Frontend : Next.js 15 + TypeScript + Tailwind + shadcn/ui + NextAuth v5
- Backend : Node.js 20 + Express + Prisma + Zod + JWT + Puppeteer
- BDD : PostgreSQL 16
- Tests : Vitest + Supertest + Playwright
- Infra dev : Docker Compose

**Fonctionnalites POC operationnelles** :
- Multi-tenant (isolation par `tenantId` FK)
- Authentification JWT + NextAuth (roles ADMIN + COMMERCIAL — ADR-0002 retire CHIRURGIEN)
- Pipeline 5 stages : CONTACT → CONSULTATION → POST_CONSULT → CONFIRMEE → OP_PROGRAMMEE → EFFECTUEE, + sections paralleles NON_QUALIFIE et FOLLOWUP (sub-pipeline J0-ABANDON)
- Fiche client + Process Panel (4 onglets : Vue / Notes / Documents / Devis)
- Devis 2 temps (technique + commercial) + snapshots prix
- Documents : checklist auto + upload + preview + download + modal HDS de consentement (P3 Pattern B)
- Agenda projete (consultations + operations derivees du devis)
- Dashboard 4 KPIs + chart CA + previsionnel
- Follow-up dedie (kanban sub-pipeline + notes + qualifications)
- Catalogue de messages (templates mail / SMS-WhatsApp / video) + envoi manuel mock demo
- Catalogue de documents PDF templates (en partie — story EP10 a finaliser)
- Click tracking events (engagement client)

**Conformite HDS** (Trust Score 98.2 %, badge A — voir `docs/product/HDS-CHECK-REPORT-2026-05-20-FINAL.md`) :
- Aucune donnee de sante stockee structurellement
- Modal de consentement HDS avant chaque upload (Pattern B)
- Placeholders UI explicites sur tous les textes libres (Pattern A)
- 8 labels documents administratifs et financiers (carte d'identite, RIB, devis signe, CGV, mutuelle, etc.) — plus aucun label medical
- CGU Art. X + Y + Z redigee, a faire valider par juriste

**Tests** : 259/259 verts (29 unit/integration + 230 securite).

**Commits POC livres** : 12 commits sur la branche `main` (voir `git log --oneline`).

---

## 3. Scope DEADLINE 29 mai 2026

**Periode de travail** : mer 20 mai → ven 29 mai (9 jours civils, 7 jours ouvres + week-end optionnel).

**Modele de suivi** : daily check-in entre Dimitry et Florian. Pas de pre-recette formelle (Florian fait confiance + lit ce CDCF + suit l'avancement).

### 3.1. Liste des 11 livrables fermes

| ID | Item | Estim | Priorite | Dependance |
|----|------|-------|----------|------------|
| **D1** | Cahier des charges fonctionnel (ce document) livre a Florian | 1 j | P0 | — |
| **D2** | Devis serveur Scaleway (benchmark + reco) | 0.5 j | P0 | — |
| **D3** | Facture Claude 200 EUR ce mois (admin) | 0.1 j | P0 | — |
| **D4** | Acces nom de domaine recu de Florian | 0 j | P0 | Florian fournit |
| **D5** | Securisation site (P0 checklist V1) | 2 j | P0 | — |
| **D6** | Securisation serveur Scaleway | 1 j | P0 | D2 valide |
| **D7** | Onboarding cabinet + acceptance CGU integree app | 0.5 j | P0 | CGU validee juriste |
| **D8** | Endpoints stats internes (reseau Docker partage) | 0.5 j | P0 | — |
| **D9** | Script migration externe (CSV → BDD) | 0.5 j + N j imprevu | P1 | — |
| **D10** | Tests E2E + smoke complet | 1 j | P0 | D5/D7/D8 done |
| **D11** | Deploy production Scaleway + DNS + smoke prod | 1 j | P0 | D4, D6, D10 done |
| **D12** | i18n MVP fr/en (next-intl + 30 chaines critiques) | 1 j | P0 | — |

**Total estime : 9.1 jours + buffer 0.5 j → 9.6 jours (D12 ajoute apres meeting).**

### 3.2. Detail de chaque livrable

#### D1 — Cahier des charges fonctionnel (ce document)

**Objectif** : fournir a Florian un document complet pour cadrer la relation avec les cabinets clients (perimetre, engagements, dependances, roadmap).

**Contenu** : ce document (10-15 pages structurees en 8 sections + annexes).

**Critere d'acceptance** : Florian a lu, valide, transmet aux cabinets si necessaire.

#### D2 — Devis serveur Scaleway

**Objectif** : determiner la configuration serveur Scaleway + son cout mensuel pour heberger 5 cabinets pendant les 3 premiers mois.

**Methode** : benchmark de la consommation actuelle du stack (CPU, RAM, storage, bandwidth) + dimensionnement raisonnable.

**Resultat attendu** : 1 page avec SKU recommande Scaleway + estimation chiffree (cible 20-50 EUR/mois). Cas d'usage actuels : 5 cabinets × ~50-100 process actifs chacun = ~500 processes + ~200 devis + ~1500 documents (chiffre cible V1).

**Reco preliminaire** (a affiner) :
- VPS Scaleway DEV1-L ou PRO2-XS (2-4 vCPU, 8-16 GB RAM)
- Postgres managed Scaleway Database Essential (1 vCPU, 2 GB) ou self-hosted
- Object Storage S3 Scaleway (1-5 GB initial, croissance lineaire)
- Bandwidth : inclus 200-500 GB/mois
- Total estime : ~30-60 EUR/mois TTC

Devis final livre apres benchmark effectif.

#### D3 — Facture Claude 200 EUR

**Objectif** : facturer a Florian le cout de la licence Claude API pour ce mois (200 EUR).

**Action** : Dimitry genere la facture + envoie a Florian.

#### D4 — Acces nom de domaine

**Objectif** : Florian fournit a Dimitry l'acces (registrar + DNS) au nom de domaine sur lequel le CRM sera deploye.

**Action** : Florian envoie les acces. Dimitry verifie qu'il peut creer les enregistrements DNS A/AAAA/CAA + sous-domaines.

#### D5 — Securisation site (P0 checklist V1)

**Objectif** : implementer les mesures de securite P0 de la checklist `docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md`.

**Scope** :
- **TLS 1.3 obligatoire + HSTS preload** (frontend + backend behind Traefik)
- **Chiffrement at rest** : pgcrypto sur colonnes sensibles (`Client.email`, `Client.phone`, `noteCommerciale`, `MessageSendLog.body`)
- **Audit logs immutables** : nouvelle table `AuditLog (id, userId, tenantId, method, path, body_hash, ip, userAgent, occurredAt)`. Middleware express log toute mutation API. Append-only (pas de DELETE). Retention 5 ans (obligation comptable).
- **2FA admin (TOTP)** : QR code Google Authenticator, recovery codes
- **Refresh token JWT** : JWT court (8h) + refresh long (30j). Revocation server-side via table `RevokedToken`.
- **Rate limiting** (deja en place — verification + ajustement)
- **Helmet + CSP** (deja en place — verification + durcissement)

**Tests** : `npm run test:security` doit passer (230 tests + nouveaux).

#### D6 — Securisation serveur Scaleway

**Objectif** : provisionner et hardener le serveur Scaleway de production.

**Scope** :
- VPS Scaleway DEV1-L (ou equivalent) en region Paris (FR-PAR-2)
- OS Debian 12 LTS hardened
- SSH : cles uniquement, port custom, fail2ban
- Firewall Scaleway : whitelist IPs admin pour SSH, 80/443 publics
- Traefik 3.x avec TLS 1.3 + ciphers durcis
- Postgres managed Scaleway (option A) OU self-hosted avec replication (option B)
- Object Storage S3 Scaleway (bucket prive, pre-signed URLs)
- Backups chiffres quotidiens → S3 (retention 30j)
- `unattended-upgrades` pour les patchs securite
- Monitoring : Prometheus + Grafana + Loki (deja installe sur la machine dev, a porter sur le serveur)

**Tests** : `curl -I https://crm-commercial.<domaine>/` → 200, HSTS present, TLS 1.3, SSL Labs grade A+ minimum.

#### D7 — Onboarding cabinet + acceptance CGU integree

**Objectif** : integrer dans l'app une page d'onboarding ou chaque nouveau cabinet accepte les CGU (Art. X + Y + Z) avant utilisation.

**Scope** :
- Migration Prisma : ajout `Tenant.cguAcceptedAt: DateTime?` + `Tenant.cguVersion: String?`
- Page UI `/onboarding/cgu` qui affiche le texte complet (Art. X + Y + Z)
- Checkbox + signature electronique (saisie nom + date)
- POST `/api/tenant/accept-cgu` → met a jour `cguAcceptedAt` et `cguVersion = "1.0-2026-05-20"`
- Middleware : si `cguAcceptedAt` null pour un tenant → redirect `/onboarding/cgu` (sauf admin et sauf endpoints internes)
- Page admin `/admin/cgu-history` : Florian voit la liste des cabinets et leur statut CGU

**Dependance dure** : la CGU doit etre **validee par un juriste** avant le 27 mai pour pouvoir etre integree dans l'app le 28-29 mai. **Bloquant**.

#### D8 — Endpoints stats internes (reseau Docker)

**Objectif** : exposer des endpoints HTTP permettant a l'outil externe de Florian (sur le meme reseau Docker) de pull les statistiques par tenant.

**Scope** :
- Reseau Docker partage : ajout du conteneur `crm-commercial-backend` au network `florian-tools-network` (a creer)
- Middleware express `requireInternalNetwork` qui rejette les requetes venant de l'exterieur (filtrage par IP Docker)
- Endpoint `GET /api/internal/tenant/:tenantId/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Reponse JSON :
  ```json
  {
    "tenantId": "uuid",
    "period": { "from": "...", "to": "..." },
    "ca": 1500000,
    "caConfirme": 1000000,
    "caEnAttente": 500000,
    "conversion": 0.42,
    "nbPrestations": 24,
    "nbClients": 18,
    "nbDevisSignes": 12,
    "computedAt": "2026-05-29T10:00:00Z"
  }
  ```
- Endpoint `GET /api/internal/tenant/:tenantId/conversion-funnel?from&to` (bonus si temps)
- Reuse des services existants `dashboardService.ts`

**Tests** : 3 tests integration (happy path, tenant inexistant, IP externe → 403).

#### D9 — Script migration externe

**Objectif** : permettre l'import one-shot de donnees existantes (clients, devis...) d'un cabinet vers son tenant CRM lors de l'onboarding.

**Scope** :
- Script tsx `prisma/migrate-external.ts`
- Usage : `npm run migrate:external -- --tenant=<slug> --file=<path.csv> --table=clients --dry-run`
- Format CSV par defaut, mapping configurable via JSON :
  ```json
  {
    "table": "Client",
    "columns": {
      "firstName": "Prenom",
      "lastName": "Nom",
      "phone": "Telephone",
      "email": "Email",
      "city": "Ville",
      "source": "Source"
    }
  }
  ```
- Validation Zod avant insertion
- `--dry-run` : valide le mapping, n'insere pas
- Rapport ecran : N lignes lues, N inserees, N skippees, N erreurs (avec liste)
- Logging dans `_byan-output/migrations/<timestamp>.log`

**Note importante** : duree imprevisible car depend du format/nettoyage des donnees source. Si les donnees ne sont pas formatees, prevoir 1-2 jours de nettoyage manuel ou de scripts dedies.

#### D10 — Tests E2E + smoke complet

**Objectif** : valider que toutes les fonctionnalites livrees marchent ensemble avant deploy prod.

**Scope** :
- Re-run de toutes les suites Vitest (unit + integration + security) : 259/259 attendus
- Run Playwright E2E : suite existante + 3-4 nouveaux scenarios :
  - Onboarding cabinet + acceptance CGU
  - Endpoint stats internes (mock interne)
  - Migration externe (dry-run d'un CSV de test)
  - 2FA admin login
- Smoke test manuel : 1 cabinet test end-to-end (login → create process → devis → upload doc → mark signed → archive)
- Fix des regressions decouvertes

**Critere d'acceptance** : 100 % tests verts + 0 regression sur smoke manuel.

#### D11 — Deploy production Scaleway + DNS + smoke prod

**Objectif** : mettre le CRM en ligne sur le domaine de Florian et faire un dernier smoke en prod.

**Scope** :
- `docker-compose.prod.yml` finalise (env prod, Traefik, secrets via Scaleway Secret Manager ou .env.prod chiffre)
- DNS pointe vers le VPS Scaleway
- `docker compose -f docker-compose.prod.yml up -d`
- Verification : TLS, HSTS, headers, login admin demo, login commercial demo
- Backup manuel post-deploy (snapshot DB + S3 baseline)
- Monitoring : verifier que Grafana voit le serveur, logs Loki coulent

**Critere d'acceptance** : `https://crm-commercial.<domaine>/` repond, login admin OK, 1 cabinet test peut creer un client et un devis sans erreur.

#### D12 — i18n MVP fr/en (next-intl + 30 chaines critiques)

**Objectif** : preparer l'app pour servir des clients francophones et anglophones, avec une infra i18n complete et les chaines les plus visibles deja traduites.

**Scope** :
- Lib : `next-intl@4.12` en mode "without i18n routing" (locale via cookie, pas dans l'URL)
- Locales supportees : `fr` (defaut) + `en`
- Fichiers messages : `apps/frontend/messages/fr.json` + `messages/en.json` avec ~30 cles critiques (Common, Login, Sidebar, ProcessPanel, ProcessStage, Hds)
- Configuration : `src/i18n/{routing,request,setLocale}.ts`
- Composant `<LanguageSwitcher />` dans le footer Sidebar (boutons FR / EN)
- Server action `setLocale()` qui ecrit le cookie + revalidate
- `NextIntlClientProvider` integre dans `app/layout.tsx`
- Composants refactores : `Sidebar.tsx` (navigation + appellation + non-HDS notice), `Header.tsx` (search + logout), `login/page.tsx` (titre + labels + features), `DocumentsTab.tsx` (modal HDS)

**Hors scope (post-deadline, V1.1)** : PDF devis traduit, emails traduits, messages d'erreur Zod traduits, ~150 autres chaines composants a traduire au fil de l'eau.

**Critere d'acceptance** : login marche en FR et EN, sidebar bilingue, switcher fonctionnel.

### 3.3. Risques deadline

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Validation juriste CGU retardee (> 27 mai) | Moyenne | Bloque D7 | Florian active le juriste IMMEDIATEMENT le 21 mai |
| Acces nom de domaine retarde (> 27 mai) | Faible | Bloque D11 | Florian fournit le 21-22 mai au plus tard |
| D9 migration externe plus longue que prevu | Moyenne | +1 a +2 jours | Si > 1 jour, on reporte D9 en post-deadline avec accord Florian |
| Bug majeur decouvert pendant D10 | Moyenne | Decale D11 | Buffer 0.5 j integre + sam-dim disponibles si besoin |
| Pentest externe (S10 checklist) | Bloquante prod stricte | Reporte la prod | On accepte la prod sans pentest pour la deadline, pentest dans les 4 semaines suivantes |

### 3.4. Commitments mutuels deadline

**Dimitry s'engage a** :
- Livrer les 11 items D1-D11 le 29 mai 2026 a 23:59 CET
- Faire un daily check-in (Slack ou email court ~15 min)
- Etre disponible pour clarification dans la journee
- Documenter chaque livrable

**Florian s'engage a** :
- Fournir l'acces nom de domaine au plus tard le 22 mai
- Mandater le juriste pour validation CGU au plus tard le 21 mai
- Valider les daily check-ins sous 24h
- Recetter le deploy prod le 29 mai (1-2h de session)
- Payer la facture Claude 200 EUR sous 7 jours

---

## 4. Backlog POST-DEADLINE (V1 estimable)

### 4.1. Drive Google connecteur (PD1) — 4-5 jours

**Objectif** : remplacer le stockage local des documents et devis PDF par une integration Google Drive en mode visualisation read-only.

**Justification** : la strategie ADR-0003 prevoit que les fichiers ne restent pas chez nous a terme. Le drive permet une visualisation read-only sans telechargement chez nous → renforce la conformite non-HDS.

**Scope** :
- OAuth2 par tenant : flow d'autorisation Google + stockage refresh token chiffre dans `Tenant.driveTokens`
- Interface `DriveAdapter` extensible (Google / OneDrive / Dropbox)
- Implementation `GoogleDriveAdapter` :
  - `listFiles(folderId)` : liste les fichiers
  - `getFileMetadata(fileId)` : metadata (taille, MIME, date)
  - `getFileStream(fileId)` : flux pour preview (pas de cache)
  - `uploadFile(folderId, name, buffer)` : upload (devis PDF)
- Migration : `ProcessDocument.fileUrl` accepte deux formes : `local:{path}` (legacy) et `gdrive:{fileId}` (V1)
- UI : bouton "Connecter Google Drive" dans `/config/cabinet` (admin tenant)
- Strategie de migration : les fichiers locaux existants restent locaux ; les nouveaux uploads vont sur drive

**Risques** :
- OAuth2 par tenant = gestion des refresh tokens, scopes Google API, quotas
- Cabinet qui revoque l'acces Google → comment on previent le commercial ?

**Tests** : test integration avec un compte Google de test, mocks pour CI.

### 4.2. IA WhatsApp demande documents (PD2) — 5-7 jours

**Objectif** : declencher automatiquement des messages WhatsApp aux clients finaux pour collecter les documents manquants (carte ID, RIB, devis signe...), via une IA qui s'adapte au contexte.

**Scope** :
- Integration WhatsApp Business Cloud API (Meta) : compte business pour Florian, token API stocke en config
- Service `whatsappService.ts` : envoi de messages template approves par Meta
- Service `aiAgentService.ts` : appel Claude API (ou GPT) pour generer le message contextualise a partir des `DocumentTemplate` definis (EP10)
- Cron / scheduler : detecte les `ProcessDocument` en `EN_ATTENTE` depuis > 48h → declenche un message
- UI : timeline des messages envoyes par le bot (vue admin tenant)
- Mode demo (deja en place — EP06-S04) : passe en mode reel en V1 quand WhatsApp Business est actif

**Dependances** :
- WhatsApp Business Cloud API : creation compte + verification Meta (~2-3 semaines administrativement, donc demarrer le process MAINTENANT)
- Claude API : deja en place (facture 200 EUR/mois)

**Risques** :
- Approval Meta des templates WhatsApp : ~1-2 semaines
- Cout par message : ~0.04 USD par conversation initiee. A budgeter.
- Anti-spam : limiter le nombre de relances par client

### 4.3. Refactor maintainability (PD3) — 2-3 jours

**Objectif** : nettoyer le code pour faciliter les futures evolutions et permettre l'arrivee de nouveaux developpeurs (Florian envisage de recruter).

**Scope** :
- Renommer le fichier `ConsultationDateDialog.tsx` → `RdvDateDialog.tsx` (incoherence depuis P4.B)
- Renommer les composants `Patient*` restants → `Client*` (UI labels apres P4)
- Eliminer les commentaires obsoletes pointant vers le repo source
- Eliminer les TODO en errance (audit du codebase)
- Documenter les hooks complexes (`syncProcessDocuments`, `reconcileStays`, `tryAutoAdvance`)
- Standardiser les patterns d'error handling
- Verifier la coverage des tests (Vitest c8) et combler les trous critiques

### 4.4. Autres features V1 — a estimer ensemble

| Feature | Estim JH (tentative) | Notes |
|---------|---------------------|-------|
| Multi-praticien (1 cabinet, N praticiens) | 3-4 j | Schema deja partiellement pret (cf. ADR-0004) |
| Notifications in-app (toast au-dela des actions) | 2 j | Notifications systeme : devis signe, document recu, OP imminente |
| Multi-langue UI (FR + EN minimum) | 3 j | i18next + traduction des labels |
| Templates de messages avances (variables conditionnelles) | 2 j | `{{if intervention.duration > 120}}...{{endif}}` |
| Page admin Florian (gestion multi-tenants) | 3-4 j | Activation/desactivation cabinet, stats globales, facturation |
| Mode "demo public" (URL partageable pour prospects) | 2 j | Sandbox isolee, donnees fake auto-generees |
| Connecteur Doctolib (read-only, V1.1) | 5-7 j | API Doctolib pour synchroniser les RDV |
| Module facturation electronique (V1.2) | 6-8 j | Factur-X / Chorus Pro |
| Module signature electronique avancee (V1.2) | 4-5 j | Yousign / DocuSign integration |

**Total estimable V1 : ~30-40 jours-homme** sur les features ci-dessus. A prioriser ensemble apres la deadline.

---

### 4.5. Retour commercial (cabinet pilote) — brief 2026-05-27

> Source : commercial(e) du cabinet, relais Florian. Document complet :
> `docs/product/RETOUR-COMMERCIAL-2026-05-27.md`. **Positionnement valide** :
> on complete Doctolib + Qualimed cote commercial, on remplace pas.

#### V1.1 (juin 2026) — priorite haute, post-deadline 29 mai

| Demande commercial | Priorite | Estim JH | Notes |
|--------------------|----------|----------|-------|
| **Date de naissance** sur fiche client | HAUTE | 0.5 j | Beaucoup d'homonymes en pratique. Quick win. |
| **Acompte paye / pas paye** dans UI | HAUTE | 0.5 j | Champ `acomptePaidAt` existe deja, exposer dans badges UI |
| **Lien visio** dans agenda (Process / Event) | HAUTE | 0.5 j | Champ `meetingUrl` simple texte |
| **Champ reduction sur devis** (au lieu de frais negatif) | HAUTE | 1 j | **LIVRE 2026-06-05** : `Devis.discount` + `discountType` AMOUNT/PERCENT (plafonnee 100 %), ligne remise dans le PDF (EP16-S02) |
| **Vue PDF live du devis** (preview iframe en edition) | HAUTE | 1 j | **LIVRE** : `DevisPreview` (rendu HTML/React leger, sans Puppeteer) en split-pane du DevisBuilder, total via `/total` (EP16-S03) |
| **Previsionnel PDF du devis** | HAUTE | 0.5 j | Snapshot PDF avant signature pour envoi prealable |
| **Lien paiement acompte** (Stripe Checkout) | HAUTE | 3 j | Lien magique `/pay/<token>` + webhook update status |
| **Templates auto par sub-stage** follow-up (J+1, J+3, J+7) | HAUTE | 1 j | Mapping sub-stage to template + envoi auto |
| **Refonte UX devis** (mode brouillon + wizard 3 etapes) | HAUTE | 2-3 j | Pre-remplissage avance, simplification champs |

**Total V1.1 (sans Google Cal) : ~10-12 jours-homme.**

#### V1.2 (juillet 2026)

| Demande commercial | Priorite | Estim JH | Notes |
|--------------------|----------|----------|-------|
| **Sync Google Calendar** bidirectionnelle | HAUTE | 4-5 j | OAuth Google + creneaux libres + import events tiers + webhook |
| **Multi-provider paiement** (GoCardless SEPA + Klarna) | MEDIUM | 4-5 j | Apres Stripe, ajout SEPA et BNPL |
| **Signature electronique avancee** (DocuSign / Yousign) | MEDIUM | 4-5 j | Cf §4.4 ligne dediee |

#### V2 — agents IA (deja prevu PD2 + complement)

| Demande commercial | Priorite | Estim JH | Notes |
|--------------------|----------|----------|-------|
| **IA WhatsApp** (deja prevu §4.2 PD2) | HAUTE V2 | 5-7 j | Stack Anthropic + WhatsApp Business API |
| Agent IA Q&A interne (RAG sur prestations + process) | MEDIUM V2 | 5 j | "Va chercher des reponses" |
| Agent IA proactif (relances automatiques selon heuristiques) | MEDIUM V2 | 7-10 j | "Contacter les clients" + cron + decision IA |

#### Hors scope explicite (positionnement)

| Demande exclue | Raison |
|----------------|--------|
| Qualimed (DPI medical) | HDS, hors notre scope (ADR-0003) |
| Doctolib synchro full | On complete, on remplace pas. Eventuellement read-only V1.2 (§4.4) |
| Donnees medicales patient | ADR-0002 + ADR-0003 = interdiction structurelle |

#### Questions ouvertes a poser au commercial (cf §5 du retour)

1. Quels sont les 5 champs devis les plus critiques (vs rarement modifies) ?
2. Pre-remplissage : a partir de quoi (template par prestation ? par praticien ?)
3. Signature mail : electronique legale ou juste visuelle ?
4. Templates par J+1/J+3/J+7 : combien par jour ? Differents selon stage ?
5. Lien visio : sur RDV (Process.dateRendezVous) ou prestation (DevisIntervention) ?
6. Stripe ou GoCardless en premier ? Compte marchand existant ?
7. Acompte montant : fixe par cabinet ou variable par client ?
8. Google Calendar : 1 par praticien ou 1 partage cabinet ?

---

## 5. Backlog V2 (non-estimable / sans date)

Features identifiees mais non estimees a ce stade. Elles seront cadrees apres retour terrain V1.

- Reporting avance (cohorts, funnels, attribution)
- API publique pour integrations tierces (Zapier, Make)
- Application mobile (Capacitor ou native)
- IA copilote in-app pour commercial (suggestions de relances, scoring leads)
- Module abonnement / paiement recurrent
- Marketplace de templates de messages (entre cabinets, opt-in)
- Module recrutement (suivi des candidats commerciaux pour un cabinet)
- Module formation (LMS interne pour onboarding commerciaux d'un cabinet)
- Module RGPD avance (auto-anonymisation > 5 ans, registre integre)
- Reconnaissance optique de documents (OCR pour rip a partir d'une photo carte ID)

Ces features dependent du **product-market fit** observe sur les 5 premiers cabinets clients.

---

## 6. Architecture technique (synthese)

### 6.1. Stack

| Couche | Choix | Justification |
|--------|-------|---------------|
| Frontend | Next.js 15 App Router + TypeScript | SSR + RSC, types stricts |
| UI | Tailwind + shadcn/ui + Lucide | Design tokens via CSS vars, pas d'emoji |
| Backend | Express + TypeScript + Prisma | REST pur, JSON, decouple du front |
| BDD | PostgreSQL 16 | Multi-tenant par `tenantId` FK |
| Auth | NextAuth v5 (front) + JWT (API) + 2FA TOTP admin | Refresh token V1 |
| PDF | Puppeteer | HTML → PDF, deja en place |
| Tests | Vitest + Supertest + Playwright | 259/259 verts |
| Drive | Google Drive (V1) | OAuth2 par tenant |
| IA | Claude API (Anthropic) | Generation de messages contextualises |
| Infra | Docker Compose + Traefik + Scaleway | TLS, monitoring, backups |

### 6.2. Multi-tenant

Isolation par `tenantId` FK sur chaque table (sauf catalogues globaux). Prisma extended client injecte automatiquement le filtre `tenantId` du JWT.

### 6.3. Securite (ref ADR-0003 + checklist)

- TLS 1.3 obligatoire + HSTS preload
- Chiffrement at rest (pgcrypto sur colonnes sensibles)
- Audit logs immutables 5 ans
- 2FA TOTP admin obligatoire
- Refresh tokens server-side revocables
- Rate limiting + Helmet + CSP stricte
- Modal HDS de consentement avant upload
- Backup chiffre quotidien + tests de restauration mensuels

### 6.4. Modele de donnees (synthese)

- 27 tables au total (POC complet)
- Enums : `UserRole (ADMIN, COMMERCIAL)`, `ProcessStage (9 valeurs)`, `DevisStatus (6)`, `DocumentStatus (3)`, etc.
- Tables principales : `Tenant`, `User`, `Client`, `Process`, `Intervention` (catalogue), `Devis`, `DevisIntervention`, `DevisStay`, `ProcessDocument`, `MessageTemplate`, `MessageSendLog`, `DocumentTemplate`, `TrackingEvent`, `BlockingPointTag`, `ProcessBlockingPoint`, `FollowupStepLog`

Voir `docs/architecture/data-model.md` pour le detail.

---

## 7. Hebergement & operations

### 7.1. Production

- **Hebergeur** : Scaleway (France, region FR-PAR-2)
- **Certification** : non-HDS (ADR-0003)
- **VPS** : DEV1-L ou PRO2-XS (a confirmer benchmark D2)
- **Postgres** : managed Scaleway Database Essential
- **Object Storage** : S3 Scaleway (uploads documents en V1 — basculera vers Google Drive en V1.1)
- **Reverse proxy** : Traefik 3.x avec TLS 1.3
- **Backups** : quotidien chiffre vers S3, retention 30 jours, tests de restauration mensuels

### 7.2. Procedures operationnelles

| Procedure | Frequence | Responsable | Documentation |
|-----------|-----------|-------------|---------------|
| Restore d'urgence | Sur incident | Dimitry | `docs/operations/restore-procedure.md` (a creer en V1) |
| Test de restauration | Mensuel | Dimitry | Idem |
| Mise a jour OS | Auto (`unattended-upgrades`) | Auto | Logs centralises Loki |
| Mise a jour deps | Mensuel | Dimitry | Dependabot + revue manuelle |
| Pentest externe | Annuel | Dimitry + prestataire | Rapport stocke |
| Audit RGPD | Trimestriel | Florian (DPO) | Registre Art. 30 |
| Verification CGU active | Onboarding | Auto (middleware) | Logs |

### 7.3. Monitoring

Stack Grafana + Loki + Promtail (deja en place sur la machine de dev).

Dashboards :
- RPS, latence p50/p95/p99, error rate
- Logins success / fail
- JWT issued / refreshed / revoked
- Uploads count, taille moyenne
- Devis crees / signes par tenant

Alertes :
- > 5 login failures meme IP en 1 min
- > 100 5xx en 5 min
- Espace disque > 80 %
- Certificat TLS < 30 j
- Backup quotidien failed

### 7.4. Communication client (cabinets) en cas d'incident

- Notification email (template) sous 4h apres detection
- Page status publique `https://status.<domaine>` (si V1)
- Post-mortem dans les 7 jours pour incidents > P1

---

## 8. Conformite RGPD

### 8.1. Resume strategique (ADR-0003)

- Pas de bascule HDS immediate
- Mitigation par 3 leviers : retrait des donnees structurelles de sante (ADR-0002), CGU avec consentement explicite Art. 9.2.a, securite renforcee
- Re-evaluation trimestrielle de la position (bascule HDS conditionnelle)

### 8.2. CGU (3 articles cles)

Voir `docs/legal/CGU-clause-HDS-non-medical.md` :

- **Article X** : interdiction stricte de stockage de donnees Art. 9 RGPD (bilans, ordonnances, CRO, photos cliniques, etc.)
- **Article Y** : consentement commercial explicite (Art. 9.2.a) — service esthetique a finalite commerciale, hebergement non-HDS, listing des donnees traitees
- **Article Z** : droits des personnes concernees (anonymisation, suppression, portabilite) + obligation d'information du cabinet via facture/devis

### 8.3. Droits des personnes concernees — outils techniques (V1)

- `GET /api/clients/:id/export` : export JSON
- `POST /api/clients/:id/anonymize` : anonymisation (firstName/lastName/phone/email → "ANONYMISE", garde le reste)
- `DELETE /api/clients/:id` : suppression cascade (avec exception conservation 5 ans Art. L.123-22 Code Commerce pour les devis signes)

### 8.4. Mention obligatoire dans la facture cabinet → client

Voir Article Z.2 de la CGU. Le cabinet client (= utilisateur final du CRM) doit obligatoirement inserer une mention dans la facture/devis de son propre client (= personne concernee) :

> "Vos donnees personnelles sont traitees par [Nom du Cabinet] et hebergees dans un CRM commercial non-HDS. Vous disposez d'un droit d'acces, de rectification, d'opposition, d'effacement et a l'anonymisation. Pour exercer ces droits, contactez [contact RGPD du Cabinet]. Si vous souhaitez beneficier de notre prestation sans apparaitre dans notre outil de gestion, indiquez-le nous avant le debut de la relation commerciale."

### 8.5. Registre des traitements (Art. 30 RGPD)

A tenir par Florian (DPO de facto pour le moment). Voir `docs/architecture/decisions/0003-pas-de-bascule-hds-immediate-mitigation-cgu-securite.md` pour le detail.

### 8.6. Procedure de notification de violation (Art. 33/34)

Process documente dans la checklist securite (S12). Notification CNIL < 72h en cas de violation suspectee, notification clients < 7 jours en cas de risque eleve.

---

## 9. Livrable & engagement

### 9.1. Tarif serveur (D2 — preliminaire)

| Composant | Reference Scaleway | Cout mensuel TTC | Justification |
|-----------|---------------------|------------------|---------------|
| VPS DEV1-L | 4 vCPU, 8 GB RAM, 80 GB SSD | ~9 EUR | Suffisant 5 cabinets POC, scale horizontal si besoin |
| Postgres Essential | 1 vCPU, 2 GB RAM, 50 GB | ~21 EUR | Multi-AZ + backups auto inclus |
| Object Storage Standard | 100 GB initiaux | ~2 EUR | Documents + backups |
| Bandwidth | Inclus 500 GB | 0 EUR | Sortie internet usuelle |
| Reservations IP | 1 IP publique | ~1 EUR | DNS A record stable |
| **Total estime** | | **~33 EUR/mois TTC** | Avant remise eventuelle annuelle |

Devis final apres benchmark precis (livre D2 separement).

### 9.2. Modele commercial Editeur ↔ Florian ↔ Cabinets

- **Editeur (Dimitry)** facture Florian au mois (a definir : forfait + cout serveur refacture ? % du CA cabinets ?)
- **Florian** facture les cabinets selon son propre modele
- **Cabinets** sont les utilisateurs finaux

A definir formellement dans un contrat de licence/sous-traitance separe. Ce CDCF n'est pas un contrat.

### 9.3. SLA proposes (a discuter)

| Indicateur | Engagement |
|------------|------------|
| Uptime | 99 % mensuel (= ~7h30 d'indisponibilite max/mois) |
| Temps de reponse incident P0 | < 4h ouvres |
| Temps de reponse incident P1 | < 24h ouvres |
| RPO (perte de donnees max) | 24h (backup quotidien) |
| RTO (temps de restauration) | 4h |

A formaliser dans le contrat.

---

## 10. Annexes

### 10.1. Documents lies

- `README.md` (racine) — quick start
- `docs/README.md` — index documentation
- `docs/architecture/decisions/0001-fork-depuis-crm-chirurgien.md` — ADR fork
- `docs/architecture/decisions/0002-suppression-role-chirurgien-et-notes.md` — ADR pivot
- `docs/architecture/decisions/0003-pas-de-bascule-hds-immediate-mitigation-cgu-securite.md` — ADR strategie HDS
- `docs/legal/CGU-clause-HDS-non-medical.md` — texte CGU complet (Art. X + Y + Z)
- `docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md` — checklist securite V1
- `docs/CHANGELOG-2026-05-19-20-ADR-0002-implementation.md` — historique implementation P0-P7
- `docs/product/HDS-CHECK-REPORT-2026-05-20-FINAL.md` — rapport final HDS-CHECK (badge A)
- `docs/architecture/data-model.md` — schema BDD complet (27 tables)
- `docs/architecture/overview.md` — vue d'ensemble architecture
- `docs/stacks/backend.md`, `frontend.md`, `database.md`, `infra.md` — details par couche

### 10.2. Glossaire (extrait)

| Terme | Definition |
|-------|------------|
| **Cabinet** | Structure d'exercice = un tenant dans le CRM |
| **Client** | Beneficiaire d'une prestation esthetique (personne concernee RGPD) |
| **Process** | Parcours commercial d'un client pour une prestation donnee |
| **Prestation** | Service esthetique propose au catalogue du cabinet |
| **Devis** | Document commercial decrivant la prestation et son cout |
| **Rendez-vous** | Date a laquelle le client rencontre le praticien (ex-consultation) |
| **HDS** | Hebergeur de Donnees de Sante (certification francaise) |
| **Tenant** | Espace isole d'un cabinet dans le CRM multi-tenant |

Voir `docs/context/glossary.md` pour le glossaire complet.

### 10.3. Historique versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 2026-05-20 | Dimitry | Version initiale post-meeting roadmap Florian |
| 1.1 | 2026-06-05 | Dimitry | Note de livraison prod `vencor-crm.com` : refonte PDF devis commercial + rebrand Vencor + couleur d'accent configurable par cabinet (`settings.legal.accentColor`) + mentions legales preremplies (EP16-S01) ; champ remise (EP16-S02, §4.5) ; apercu live du devis (EP16-S03) ; "Marquer signe" reversible (`/api/devis/:id/unsign`) ; messages de transition pipeline humains + bouton "Renseigner →" ; compteur receivedDocs reel ; Back Office gestion cross-tenant des catalogues de cliniques (copier/deplacer/supprimer, garde `409 CLINIQUE_IN_USE`) ; batterie de conformite securite par-endpoint auto-decouverte (EP14-S08). |

---

## 11. Validation

**Document soumis a Florian pour relecture et validation.**

Date de validation cible : 22 mai 2026.

Une fois valide, ce document devient la **reference contractuelle** pour la deadline du 29 mai et le backlog V1.

---

*Ce document est genere par Dimitry (developpeur freelance) dans le cadre du projet CRM Commercial. Il est destine a Florian (revendeur / distributeur) et aux cabinets clients par son intermediaire. Reproduction et diffusion soumises a accord prealable.*
