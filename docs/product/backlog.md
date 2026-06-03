# Backlog — Priorisation et sprint map

> Priorisation MoSCoW + organisation en sprints. MVP a livrer le **24 avril 2026** (repo source).
> Pour un solo dev, les sprints sont plutot des "batches" de features coherentes.
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire le role CHIRURGIEN et la noteMedecin. Les scenarios qui mentionnent "Switch chirurgien" / "note medicale" / "(chirurgien)" sont a interpreter comme COMMERCIAL dans le fork commercial. Voir ACTIONS-IMMEDIATES-2026-05-18.md pour le plan P0/P1/P2/P3/P4/P5.

---

## 1. Vue strategique — 48h jusqu'a la demo

La demo du 24 avril est **un scenario** (cf. MVP v4 §5). Priorite : que le scenario deroule sans bug. Tout ce qui n'est pas dans le scenario peut etre partiellement implementer ou mocke.

### Scenario demo (rappel)

1. Login admin → parametrer 1 clinique + 2-3 interventions + frais + doc labels
2. Switch commercial → creer fiche + process + cocher interventions + date consult
3. Clic fil d'Ariane → Consultation
4. ~~Switch chirurgien → ouvrir agenda + remplir devis technique + note medicale~~ — **adapte ADR-0002** : COMMERCIAL ouvre l'agenda + remplit devis technique (plus de note medicale)
5. Switch commercial → devis commercial (clinique + date + heure + options contextuelles + option a la volee)
6. Voir anti-doublon → Copier texte → PDF → Envoyer grise
7. Simuler signature + acompte → Confirmee
8. Documents : marquer recus + preview + badge X/Y + preview IA mock
9. Tous docs recus + dates → Op programmee + barre progression paiement
10. ~~Switch chirurgien~~ → COMMERCIAL coche interventions done → archivage auto (ADR-0002)
11. Fiche Client → historique + devis signes/non
12. Dashboard mis a jour

Tout ce qui n'est **pas** dans ce scenario = **nice to have** au MVP.

---

## 2. Priorisation MoSCoW

### Must have (scenario demo)

| # | Story | Epic | Critique pour demo |
|---|---|---|---|
| EP01-S01 | Multi-tenant + auth JWT | Foundation | Sans auth, pas de login |
| EP01-S02 | Design system liquid glass | Foundation | Look & feel |
| EP01-S03 | Sidebar role-aware + switcher demo | Foundation | Scenario multi-roles |
| EP02-S01 | CRUD Cliniques + tarifs | Parametrage | Etape 1 scenario |
| EP02-S03 | CRUD Interventions | Parametrage | Etape 1 scenario |
| EP02-S04 | CRUD Frais supp | Parametrage | Etape 1 scenario |
| EP02-S05 | Document Labels + picker | Parametrage | Etape 1 scenario |
| EP03-S01 | CRUD Fiche Client | Fiche Client | Etape 2 scenario |
| EP03-S02 | Page Fiche Client dediee | Fiche Client | Etape 11 scenario |
| EP03-S03 | Panneau devis dans fiche client | Fiche Client | Etape 11 scenario (devis signes/non signes) |
| EP04-S01 | Pipeline 5 colonnes + CA | Pipeline | Etape 2-6 scenario |
| EP04-S02 | Non qualifie + Follow-up | Pipeline | Etape scenario (reference) |
| EP04-S03 | ProcessCard + badges | Pipeline | Visuel pipeline |
| EP04-S04 | Process Panel + fil d'Ariane | Pipeline | Etape 2-10 scenario |
| EP05-S01 | Devis + DevisIntervention + snapshot | Devis | Etape 4 scenario |
| EP05-S02 | Devis technique (UI partie technique — ex chirurgien, ADR-0002) | Devis | Etape 4 scenario |
| EP05-S03 | Devis commercial (3 cols + heure) | Devis | Etape 5 scenario |
| EP05-S04 | Sejours + reconcileStays | Devis | Etape 5 scenario |
| EP05-S05 | Options contextuelles + anti-doublon | Devis | Etape 5-6 scenario |
| EP05-S06 | Options a la volee + calcul temps reel | Devis | Etape 5-6 scenario |
| EP05-S07 | PDF + Copier texte + Envoyer grise | Devis | Etape 6 scenario |
| EP06-S01 | Checklist documents + statuts | Documents | Etape 8 scenario |
| EP06-S02 | Upload + preview + telechargement | Documents | Etape 8 scenario |
| EP06-S03 | Badge X/Y | Documents | Etape 8 scenario |
| EP06-S04 | Preview Agent IA mock | Documents | Etape 8 scenario |
| EP07-S01 | Agenda vue projetee | Agenda | Etape 4 + 10 scenario |
| EP07-S02 | EventSheet + cocher done + archivage | Agenda | Etape 10 scenario |
| EP07-S03 | Barre progression paiement | Agenda | Etape 9 scenario |
| EP08-S01 | 4 KPIs + toggle CA | Dashboard | Etape 12 scenario |

**Total Must have** : 29 stories.

### Should have (confort demo — important mais sautable si time serre)

| # | Story | Epic | Note |
|---|---|---|---|
| EP01-S04 | CopyButton transversal | Foundation | Scenario mentionne mais le remplir a la main marche |
| EP02-S02 | Options clinique catalogue | Parametrage | Admin peut preconfigurer sans l'UI CRUD complete au MVP |
| EP04-S05 | Notes commerciale + medicale | Pipeline | Textarea suffit, droits differencies peuvent etre mocked |
| EP04-S06 | Archivage automatique | Pipeline | Manuel si critique, auto si temps |
| EP08-S02 | Previsionnel + CA en attente | Dashboard | Les 4 KPIs du dashboard suffisent pour demo |

### Could have (bonus si temps)

- Filtres qualification + intensite dans pipeline
- Drag & drop cartes pipeline (le fil d'Ariane suffit au demo)
- States loading polished

### Won't have au MVP

- Tout V1 : Stripe, Yousign, WhatsApp, Agent IA reel, HDS, RGPD complet
- Multi-praticien
- i18n
- Edition visuelle des templates PDF

---

## 3. Sprint map — 48h

Vu que c'est un solo dev avec 48h pour 28 stories must have, il faut une organisation **deterministe** par batch de stories **paralleles quand possible** mais sequentielles sur les dependances.

### Sprint 0 — Setup (2h max)

- Scaffold monorepo (`apps/frontend`, `apps/backend`, `packages/shared`)
- Docker Compose lance
- Next.js 15 + Express bootstrap
- Prisma init + schema base + migrations
- Seed minimal (1 tenant + 3 users)

### Sprint 1 — Foundation + Auth (4h)

- EP01-S01 (multi-tenant + auth JWT)
- EP01-S02 (design system tokens)
- EP01-S03 (sidebar role-aware + switcher)

A la fin : login fonctionnel, sidebar adaptative, page dashboard vide.

### Sprint 2 — Parametrage (6h)

- EP02-S01 (Cliniques)
- EP02-S03 (Interventions)
- EP02-S04 (Frais supp)
- EP02-S05 (Document Labels + picker)
- EP02-S02 (Options clinique, should have mais lie a EP05-S05)

A la fin : Admin peut configurer tout ce qu'il faut pour le scenario.

### Sprint 3 — Client + Pipeline base (6h)

- EP03-S01 (CRUD Fiche Client)
- EP04-S01 (Pipeline 5 cols)
- EP04-S03 (ProcessCard)
- EP04-S04 (Process Panel + fil d'Ariane) — le plus gros morceau
- EP04-S02 (Non qualifie + Follow-up)

A la fin : pipeline navigable, Process Panel ouvre, fil d'Ariane deplace les stages.

### Sprint 4 — Devis (8h)

- EP05-S01 (Devis + DevisIntervention + snapshot)
- EP05-S02 (Devis technique UI)
- EP05-S03 (Devis commercial UI)
- EP05-S04 (Sejours + reconcileStays)
- EP05-S05 (Options contextuelles + anti-doublon)
- EP05-S06 (Options a la volee + calcul temps reel)
- EP05-S07 (PDF + Copier texte + Envoyer grise)

Le plus complexe. A faire d'une traite pour eviter les retours arrieres.

### Sprint 5 — Documents + Agenda + Fiche Client dediee (6h)

- EP06-S01 (Checklist + statuts)
- EP06-S02 (Upload + preview + download)
- EP06-S03 (Badge X/Y)
- EP06-S04 (Preview Agent IA mock)
- EP07-S01 (Agenda vue projetee)
- EP07-S02 (EventSheet + cocher done)
- EP07-S03 (Barre progression paiement)
- EP03-S02 (Page Fiche Client dediee)

### Sprint 6 — Dashboard + polish (4h)

- EP08-S01 (KPIs + CA)
- EP04-S05 (Notes) — should have
- EP04-S06 (Archivage auto) — should have
- EP03-S03 (Panneau devis fiche)
- Bug fixes + tests securite minimum

### Sprint 7 — Seed complet + preparation demo (2h)

- Remplir la DB avec le seed complet (20 interventions, 8 process, 5 devis)
- Tester le scenario de bout en bout
- Ajustements CSS / micro-UX

**Total estime** : 38 heures de dev pur. Sur 48h reelles (pauses, bugs imprevus), ca tient serre.

---

## 4. Risques et mitigation

| Risque | Probabilite | Impact | Mitigation |
|---|---|---|---|
| DevisBuilder trop complexe | Elevee | Critique | Commencer sprint 4 tot, prototyper sur papier avant de coder |
| Anti-doublon options + calcul temps reel | Moyenne | Eleve | Reprendre le code du proto JSX (`Devis.jsx`) comme reference |
| Multi-tenant bug d'isolation | Faible | Critique | Tester des le sprint 1 avec 2 tenants seed |
| Puppeteer PDF rendu casse | Moyenne | Moyen | Fallback : PDF template simple sans photo |
| Time budget 48h depasse | Elevee | Moyen | Couper should-have d'abord, puis features non-scenario |

---

## 5. Definition of Done (DoD) par story

Pour un solo dev MVP, DoD minimal mais ferme :

- [ ] Code ecrit et pousse
- [ ] Test unit si regle metier (hooks, calculs, transitions)
- [ ] Test securite si route authentifiee (voir ADR-0005)
- [ ] Testing manuel : golden path fonctionne
- [ ] Pas de warning TypeScript
- [ ] Pas de `console.log` oublie
- [ ] Pas d'emoji dans le code (Mantra IA-23)
- [ ] Commit sous format `type: description` (feat, fix, chore, docs, refactor, test)

Pas de code review puisque solo dev. Pas de changelog per story (le CHANGELOG git suffit).

---

## 6. Apres le 24 avril

Une fois la demo passee, debrief avec Florian :
- Features validees → route V1
- Features a revoir → backlog de reprise
- Feedback UX → ajustements avant prod Scaleway

Puis plan V1 (8-10 semaines) :
- Sprint V1.1 : Stripe + Signatures J+15 + Yousign (4 semaines)
- Sprint V1.2 : Agent IA WhatsApp reel (2 semaines)
- Sprint V1 prod : HDS + RGPD + Instagram/Mail + templates + audit logs (4 semaines)

---

*Reference : CDCF v2.0 §12 phasage, MVP v4 §5 scenario demo. Derniere mise a jour : 22 avril 2026.*

---

## 7. Carnet d'idees (features proposees post-MVP)

Liste vivante d'ameliorations decidees apres le 22 avril mais **non
livrees dans le MVP**. Reprise a la planification V1.

### Vue d'ensemble V1+

| # | Feature | Cible | Theme |
|---|---|---|---|
| 7.1 | Facturation (FACT-YYYY-NNNN) | V1.1 | Comptabilite |
| 7.2 | Agent IA alertes relance intelligentes | V1.2 | IA / WhatsApp |
| 7.3 | Stripe integration (lien paiement + webhook) | V1.1 | Paiements |
| 7.4 | Audit logs + RGPD (art. 15/17, HDS) | V1 prod | Securite / Compliance |
| 7.5 | 2FA ADMIN (TOTP) | V1 prod | Securite |
| 7.6 | Multi-tenant physique (sous-domaines par cabinet) | V1+ | Infrastructure |
| 7.7 | Onboarding tutoriel + setup wizard nouveaux cabinets | V1+ | UX (sur branche `feature/onboarding_tutoriel_setup_wizard`) |

### 7.1. Facturation (V1.1)
**Demande** : generer des factures (distinctes des devis) pour la
comptabilite. Champs : reference FACT-YYYY-NNNN auto, date d'emission,
detail des versements recus, TVA si applicable, mentions legales.
Export PDF + envoi email.

**Scope V1.1** : CRUD facture lie a un Devis signe. Snapshot des
paiements. Templates Puppeteer.

### 7.2. Agent IA — alertes de relance intelligentes (V1.2)
**Demande** : quand le patient envoie un message WhatsApp promettant
une action future (ex: "j'apporte mon bilan sanguin dans 2 jours"),
l'Agent IA cree automatiquement une alerte de relance planifiee.
Exemple : message patient "je ferai l'anesthesiste vendredi" →
alerte programmee pour le vendredi matin 8h.

**Scope V1.2** :
- Parser les messages patients via Claude API pour extraire les
  engagements temporels (regex + LLM fallback)
- Stockage en table `ScheduledAlert { processId, dueAt, kind,
  content, status: PENDING|SENT|CANCELLED }`
- UI : page "Alertes a venir" (role COMM) qui liste les alertes
  programmees avec possibilite de modifier / annuler
- Notification cabinet le matin (email ou push)
- Interaction avec le WhatsApp bot pour relancer automatiquement
  le patient en messagerie

**Dependances** : Agent IA WhatsApp reel (V1.2 sprint), ajout de
Claude API cote backend.

### 7.3. Stripe integration (V1.1)
Deja prevu CDCF §12. Permet de :
- Envoyer un lien de paiement au patient (acompte ou solde)
- Webhook Stripe → marque automatiquement acomptePaidAt /
  soldePaidAmount sans saisie manuelle
- UI reste identique cote commercial (progression paiement), mais
  la saisie manuelle devient un fallback plutot que le mode par
  defaut.

### 7.4. Audit logs et RGPD (V1 prod)
Deja dans CDCF §12. Important pour la medical/chirurgie :
- Tracer qui lit / modifie chaque dossier patient
- Export des donnees patient a la demande (RGPD art. 15)
- Suppression sur demande (RGPD art. 17)
- HDS (hebergement donnees sante) compliance

### 7.5. 2FA ADMIN (V1 prod)
Obligatoire pour comptes ADMIN en environnement sante. TOTP via
Google Authenticator / Authy. Optionnel pour COMM/CHIR mais
recommande.

### 7.6. Multi-tenant physique (sous-domaines par cabinet)
Le MVP utilise un single-domain (`crm-chirurgie.a3n.fr`) et determine le
tenant via la session NextAuth (slug saisi au login). Pour V1+, ajouter :
- Un sous-domaine par cabinet (`delobaux.crm-chirurgie.a3n.fr`,
  `xyz.crm-chirurgie.a3n.fr`...) pour le branding et la perception
  d'isolation client.
- Detection auto du tenant depuis le hostname (plus besoin de saisir
  le slug au login).
- Onboarding cabinet : creation du tenant + DNS + redeploy automatise.

Backend deja tenant-aware (extended Prisma client + `tenantId` dans le
JWT) -> travail uniquement infra (Traefik HostRegexp ou liste explicite
+ DNS wildcard ou records par cabinet) et UI login (drop du champ
tenantSlug). Landing page (`apps/landing/`) deja codee pour ca, a
reactiver le jour de la bascule.

---

## 8. Sprint deploiement Scaleway (22-26 avril 2026)

12 commits de fixes prod entre la fin du MVP et la mise en service
demo + delobaux. Historique pour memoire projet (et eviter de
re-tomber dans les memes pieges).

| Hash | Categorie | Description |
|---|---|---|
| `36ea342` | Build TS | `tenantId` explicite dans les 5 `create()` TENANT_BOUND (Prisma extended client + tsc strict) |
| `9829147` | Build TS | Exclut `tests/` et `playwright.config.ts` du tsconfig Next |
| `494c4f7` | Build Docker | `.dockerignore` racine (le context est `..`, le sous-dockerignore etait ignore) |
| `48004cd` | Build Docker | Cree `apps/frontend/public/.gitkeep` (Dockerfile COPY echouait sur dossier inexistant) |
| `dbfa40f` | Frontend / Traefik | Standalone monorepo (`outputFileTracingRoot`) + landing healthcheck `127.0.0.1` + redirect HTTP→HTTPS |
| `22beb0f` | Domaine | Renommage `crm_chirurgien.a3n.fr` (underscore RFC-invalide) → `crm-chirurgie.a3n.fr` + pattern Traefik aligne sur Acquagest |
| `08a909c` | Traefik (deprecie) | `tls.domains[N]` pour pre-emission cert LE par tenant — supprime ensuite par le single-domain |
| `3e13b00` | NextAuth | Retire `NEXTAUTH_URL=` du compose quand env vide (crash `new URL("")` au boot) |
| `dd4df8a` | Traefik | Router `/api/auth/*` vers le frontend (NextAuth) au lieu d'Express |
| `084fb2b` | Build Frontend | `NEXT_PUBLIC_BACKEND_URL` passe au stage build via `ARG` (Next inline les vars au build, pas au runtime) |
| `ca590c5` | NextAuth + Seed | Logout `callbackUrl` absolu via `window.location.origin` + `load-fake-data.ts` autonome ciblant tenant `demo` |
| `4f9de07` | Architecture | Migration MVP single-domain : suppression service `landing`, frontend + backend en `Host(${DOMAIN})` seul, `NEXTAUTH_URL` fixe |
| `b0a325d` | UX login | Champ "Code cabinet" saisissable + URL `?cabinet=xyz` bookmarkable + `localStorage` pour memoriser |

**Lessons learned** :
- `NEXT_PUBLIC_*` sont **inlinees au build**, jamais lues au runtime. Toujours passer en `ARG` Docker.
- En multi-tenant avec NextAuth v4, `NEXTAUTH_URL` non defini cause des bugs subtils (fallback localhost). Mieux : single-domain avec URL fixe.
- Tirets dans les hostnames (`-`), jamais d'underscore (`_`) — RFC 1035, refus LE et browsers.
- Aligner les patterns Traefik sur l'existant du serveur partage (`Acquagest`) plutot que reinventer (`tls.certresolver` redondant si gere globalement).

---

## 9. Idees additionnelles (a challenger avant V1)

Liste a puces, ordre quelconque. A reprendre lors de la planif V1
pour decider lesquelles meritent une section 7.x detaillee.

- **Projet jumeau CRM Commercial (non-HDS pour l'instant)** (decision 15 mai 2026,
  formalisee 17 mai 2026) : un projet jumeau commercial sera cree en parallele
  de ce repo, sans donnees de sante pendant la periode non-HDS, avec vocabulaire
  100 % commercial (client / prestation / rendez-vous / praticien). Hebergement
  cloud standard (~10-50 €/mois) puis bascule PaaS HDS apres validation produit.
  Voir [ADR-0008](../architecture/decisions/0008-projets-paralleles-commercial-hds.md)
  et [projets-paralleles-commercial-hds.md](../architecture/projets-paralleles-commercial-hds.md)
  pour le detail des 14 taches dev + 4 taches contractuelles a amorcer.
- **Email globalement unique** : aujourd'hui contrainte `@@unique([tenantId, email])` permet le meme email dans 2 tenants. Passer a `@@unique([email])` permettrait de virer le champ "Code cabinet" du login (le backend deduit le tenant depuis l'email).
- **Renommer le prefixe API backend** : aujourd'hui `/api/*` partage entre Next (NextAuth) et Express. Contourne avec un router Traefik dedie. Plus propre : Express sur `/backend/*` ou `/express/*` -> suppression du conflit + suppression du router Traefik dedie `/api/auth`.
- **`load-fake-data.ts` parametrable** : aujourd'hui hardcode sur tenant `demo`. Ajouter arg CLI `--tenant=xyz` pour generer des fakes sur n'importe quel tenant prospect rapidement.
- **Documentation utilisateur** (Notion / GitBook) avec videos Loom 30-60s pour les features complexes : devis 2 temps, options anti-doublon, signature/acompte, pipeline drag&drop. Lie a 7.7.
- **Templates email** (Brevo / Resend / SES) pour : invitation user, reset password, alertes patient, factures envoyees. Pre-requis pour 7.4 + 7.7.
- **CI/CD GitHub Actions** : aujourd'hui deploiement = `ssh + git pull + docker build`. Workflow `push main → deploy auto` ou bouton manuel via `workflow_dispatch`. Eviterait les "j'ai oublie de rebuild".
- **Cleanup DNS Infomaniak** : les CNAME `demo.crm-chirurgie.a3n.fr` et `delobaux.crm-chirurgie.a3n.fr` ne servent plus depuis la migration single-domain. A supprimer pour pas garder de records orphelins.
- **Suppression du service `landing`** : code encore dans `apps/landing/` mais plus deploye. Soit virer, soit laisser commente/documente pour reactivation au moment de 7.6 (multi-tenant physique).
- **Backup automatique Postgres** : cron `pg_dump -Fc` -> S3 / Backblaze B2 / volume distant. Critique avant vraie prod.
- **Monitoring** : Sentry (frontend errors + backend exceptions) + Grafana / Uptime Kuma (disponibilite + temps reponse). 1/2 journee de setup.
- **Page "Mot de passe oublie"** : flow standard email -> token -> reset. Pre-requis pour livrer le projet a un vrai client.
- **Page "Changer mon mot de passe"** dans le profil user : aujourd'hui aucune UI cote utilisateur. Bloquant si le client doit changer le mdp `demo` initial.
- **Desactivation de `DEMO_MODE` en prod reelle** : le switcher de role (boutons ADMI/COMM) est visible en sidebar tant que `NEXT_PUBLIC_DEMO_MODE=true`. A passer a `false` en prod reelle. (ADR-0002 : le bouton CHIR n'existe plus dans le fork commercial.)
- **Cleanup prefixe `cabinet-` du tenant slug** : `cabinet-delobaux` -> `delobaux` (migration SQL + update seed). Plus simple a retenir / taper. Affecte juste l'UX login et l'email format.

---

## 10. Vague pre-prod (base avant prod) — 2026-06-01

> Cadree avec Dimitry le 2026-06-01. Objet : poser la **base** pour mettre l'app en prod
> chez un premier cabinet payant. **Ce n'est pas la V1** (Stripe, Yousign, WhatsApp/IA,
> sync Google Calendar restent V1.x). Detail + etat verifie du code : `ETAT-PRE-PROD-2026-06-01.md`.

**Perimetre : app uniquement.** L'infra/serveur (TLS edge, DNS, Traefik, SSH, firewall,
backup DB, monitoring) est portee par le FD `vencor-hardening-zero-trust` + le repo
`vencor-infra`, pas ici.

### Epics de la vague

| Epic | Stories | Theme |
|---|---|---|
| EP14 | S01 2FA, S02 CGU, S04 AuditLog (middleware global), S05 chiffrement at-rest, S06 RGPD self-service | Securite & conformite |
| EP15 | S01 (-> EP17-S02), S02 gestion users intra-cabinet, S03 reset mdp, S04 change mdp + force 1er login, S05 demo off | Provisioning & comptes |
| EP16 | S01 PDF devis utilisable, S02 remise | Devis commercial |
| EP17 | S01 socle BO + guard admin, S02 CRUD tenants, S03 users cross-tenant, ~~S04 acces support~~ (RETIREE 2026-06-03), S05 viewer logs | Back Office editeur |

### Priorisation

- **P0 (bloquant prod)** : EP17-S01 (socle BO) + EP17-S02 (CRUD tenants), EP15-S02..S05, EP14-S02 (CGU), EP16-S01 (PDF).
- **P1 (important)** : EP14-S01 (2FA), EP14-S04 (AuditLog), EP14-S05 (at-rest), EP14-S06 (RGPD), EP17-S03/S05 (EP17-S04 acces support RETIREE 2026-06-03), EP16-S02 (remise).
- **Non-code (Florian / DPO)** : registre traitements (checklist S11), procedure violation <72h (S12), pentest externe (S10).

### Items du §9 desormais storifies

- "Mot de passe oublie" -> EP15-S03
- "Changer mon mot de passe" -> EP15-S04
- "Desactivation de DEMO_MODE en prod reelle" -> EP15-S05
- 2FA ADMIN (§7.5) -> EP14-S01
- Audit logs + RGPD (§7.4) -> EP14-S04 + EP14-S06
- "Templates email" -> pre-requis de EP15-S03 (provider a choisir)

### Dependances bloquantes

- Validation juriste du texte CGU (EP14-S02)
- Choix d'un provider email Brevo / Resend / SES (EP15-S03, invitations EP15-S01/S02)
- Decision niveau editeur cross-tenant (EP15-S01)

### Reste explicitement hors vague

Backup DB + monitoring (infra) ; toute la V1 features (Stripe, Yousign, WhatsApp/IA,
sync Google Cal, refonte devis complete avec preview live + brouillon + wizard, date de
naissance, lien visio, no-show, degraissage UI icones copier).

