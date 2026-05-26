# Audit Fact-Check — CRM Commercial — Corpus 12 documents

**Date** : 2026-05-26
**Auditeur** : bmad-fact-checker (agent BYAN)
**Methode** : protocole BYAN — 5 niveaux de preuve (L1 95% → L5 20%)
**Demandeur** : Dimitry (user), qui veut s'assurer qu'on ne part pas sur des fondations branlantes
**Statut** : rapport brut, archive pour reference

---

## 1. Trust Score global du corpus

| Categorie | Decompte |
|---|---|
| Assertions totales identifiees | ~68 |
| CLAIM sourcee (L1-L3) | ~19 |
| REASONING legitime | ~14 |
| HYPOTHESIS presentee comme telle | ~8 |
| HYPOTHESIS presentee comme FAIT (problematique) | ~27 |
| **Trust Score brut** | **40 %** |
| **Badge** | **D** (seuil F < 40 %, D >= 40 %) |

> Le score est tire vers le bas par trois zones : les claims juridiques RGPD, les claims securite non encore implementes, et les estimations d'effort.

---

## 2. Top 10 des claims les plus problematiques

### [C1] CLAIM BLOQUE — domaine compliance

**Assertion** : "Trust Score 98.2 % badge A" sur la conformite HDS non-medicale.

**Source** : `HDS-CHECK-REPORT-2026-05-20-FINAL.md` — document interne auto-produit.

**Verdict** : **BLOCKED** — compliance requiert LEVEL-1 minimum. Un score produit par un agent IA interne sur ses propres documents n'est pas une source externe verifiable.

**Reformulation** :
> `[HYPOTHESIS L5]` "A date du 2026-05-20, aucun residue de donnee de sante structure n'a ete detecte par le scan automatique de l'agent HDS-CHECK. Un audit juridique externe reste necessaire pour valider cette position."

**Source a verifier** : avis d'un juriste externe ou de la CNIL.

---

### [C2] CLAIM BLOQUE — domaine compliance

**Assertion** : "la CGU Art. 9.2.a constitue un levier suffisant de protection contre une requalification HDS".

**Source citee** : CJUE C-184/20 (01.08.2022) et RGPD Considerant 35 — ces sources existent et sont L1.

**Probleme** : la conclusion tiree ("Art. 9.2.a suffit") n'est pas dans ces sources. ADR-0003 le reconnait lui-meme (§ "Cet argumentaire reste a faire valider par un juriste avant V1"). Le claim est donc une HYPOTHESIS presentee comme une decision acceptee.

**Verdict** : **HYPOTHESIS** — la source est reelle mais la conclusion est un raisonnement, pas un fait juridique etabli.

**Reformulation** :
> `[HYPOTHESIS]` "L'Art. 9.2.a pourrait legitimement couvrir ce traitement si la finalite commerciale est documentee et que le consentement est eclaire. A valider par un juriste avant V1."

**Risque** : D7 est en cours d'implementation sans cette validation.

---

### [C3] CLAIM BLOQUE — domaine compliance

**Assertion** : "la substitution du juriste par le messaging in-app exhaustif (27 emplacements) remplace la validation juridique formelle".

**Source** : decision interne Florian du 2026-05-20 (CDCF §11 Adaptation Log).

**Verdict** : **BLOCKED** — une decision operationnelle de revendeur ne constitue pas une source juridique. Le messaging reduit le risque operationnel mais ne substitue pas l'analyse de qualification HDS.

**Reformulation** :
> `[REASONING]` "Le messaging exhaustif renforce la defense en cas d'audit en prouvant l'information loyale, mais ne change pas la qualification juridique des donnees. Ce sont deux questions distinctes."

**Risque** : impact direct sur la livraison V1 (vendredi 29 mai) sans ce filet de securite validee.

---

### [C4] CLAIM INCERTAIN — domaine compliance

**Assertion** : "Florian est DPO de facto".

**Source** : CDCF section 2.2 et ADR-0003 §S11.

**Verdict** : **HYPOTHESIS** — "DPO de facto" n'est pas une notion RGPD valide. Le RGPD (Art. 37) definit des criteres precis pour l'obligation de designer un DPO. Le terme "de facto" suggere que personne n'a formellement verifie si la designation est obligatoire et si Florian satisfait les criteres d'independance requis.

**Reformulation** :
> `[HYPOTHESIS]` "Florian assure le suivi RGPD operationnel. La question de l'obligation de designer un DPO formel (Art. 37 RGPD) n'a pas ete evaluee."

---

### [C5] CLAIM NON SOURCEE — domaine security

**Assertions en bloc dans CDCF/CDCT** : "TLS 1.3", "pgcrypto", "2FA TOTP RFC 6238", "anti-enumeration", "JWT 8h + refresh 30j", "audit logs immutables".

**Statut reel au 2026-05-26** : marques "A faire D5" dans les checklists. Ces features ne sont PAS encore implementees.

**Verdict** : **HYPOTHESIS** presentee comme specification — ce qui est problematique car le CDCF §8.3 les presente comme des "leviers de securite" sans flag "a implementer".

**Reformulation** : prefixer systematiquement ces items de `[A IMPLEMENTER D5]` pour distinguer le voulu du fait. La specification technique est solide (RFC 6238 pour TOTP est L1), mais l'etat d'implementation n'est pas celui annonce.

---

### [C6] CLAIM PARTIELLEMENT SOURCEE — domaine performance

**Assertion** : "28 EUR/mois Scaleway Dedibox EM-A116X-SSD, 32 GB RAM" (Adaptation Log methodologie-agile, section 11).

**Source originale** : DEVIS-SERVEUR-SCALEWAY-2026-05-20.md — ce document porte sur le DEV1-L a 38 EUR TTC, pas sur une Dedibox. Il n'y a aucune trace documentee du benchmark de la Dedibox EM-A116X-SSD.

**Verdict** : `[HYPOTHESIS]` — le switch vers Dedibox est mentionne dans le kanban ("REVISITER car le choix se porte sur Dedibox EM-A116X-SSD") mais sans devis actualise.

**Risque concret** : le D2 marque "Done" dans le kanban avec une spec obsolete. D6 (securite serveur) est planifie sur une cible non documentee.

**Action requise** : produire un D2bis avec le nouveau devis Dedibox avant de lancer D6.

---

### [C7] CLAIM DOUTEUSE — domaine estimation d'effort

**Assertions** : D5 = 5h, D6 = 4h, D7 = 2h, D11 = 1h (methodologie-agile section 8, capacite sprint).

**Analyse REASONING** :
- **D5** (TLS + pgcrypto + AuditLog table + 2FA TOTP + refresh tokens + RevokedToken) en 5h = `[HYPOTHESIS L5]`. La seule implementation de pgcrypto at-rest sur colonnes existantes avec migration Prisma necessite typiquement 3-4h. Le 2FA TOTP (otplib + QR code + recovery codes + tests) est generalement un chantier de 4-8h seul.
- **D6** (provisionner Debian 12 + SSH hardening + Docker + Traefik + Let's Encrypt + fail2ban + backups S3 + monitoring) en 4h = `[HYPOTHESIS L5]` optimiste. Une premiere installation sur serveur dedie nu prend 6-12h avec les aleas DNS et reboot.
- Total sprint "tendu mais tenable" : `[HYPOTHESIS]` avec une marge tres faible pour les bugs imprevus.

**Verdict** : les estimations sont sous-evaluees d'un facteur 1.5-2 selon l'experience standard. Non bloquant mais risque de dette sur le vendredi 29 mai.

---

### [C8] CLAIM NON SOURCEE — domaine marche

**Assertion** : "les cabinets de chirurgie esthetique utilisent Doctolib, HubSpot, Pipedrive" (methodologie-agile section 1, reformulation du besoin).

**Verdict** : `[HYPOTHESIS L5]` — assertion presentee comme un fait de marche sans source (etude, entretiens utilisateurs documentes, ou benchmark concurrentiel). Les personas Florian, Stephane, Julie et Marie sont construits sans methode UX documentee (pas d'entretiens, pas d'observations).

**Reformulation** :
> `[HYPOTHESIS L5]` "D'apres le retour de Florian (revendeur), les outils actuellement utilises par les cabinets prospectes incluent des CRM generalistes et Doctolib. A valider par entretiens utilisateurs lors du pilote."

---

### [C9] CLAIM AMBIGU — domaine conformite

**Assertion** : "conservation 5 ans Art. L.123-22 Code Commerce" pour les devis signes (CDCF §8.3, CDCT §8.3, data-model §8.3).

**Statut** : CLAIM L1 acceptable — Art. L.123-22 du Code Commerce existe et impose la conservation des pieces comptables 10 ans (et non 5 ans selon les versions). La confusion entre 5 ans (RGPD droit a l'effacement) et 10 ans (obligation comptable) introduit une ambiguite.

**Verdict** : `[CLAIM L1]` partiellement inexact — verifier si la reference est bien L.123-22 (10 ans comptables) ou une autre disposition. La tension entre les deux obligations (effacement RGPD vs conservation comptable) n'est pas resolue dans les documents.

**Action** : clarifier explicitement comment reconcilier `DELETE /api/clients/:id` et l'obligation de conservation des devis signes.

---

### [C10] CLAIM PROBLEMATIQUE — domaine architecture

**Assertion** : "l'endpoint `/api/internal/tenant/:tid/stats` est securise par filtre IP Docker subnet `172.x.x.x`" (MCT OP-100, CDCT §6.6).

**Verdict** : `[HYPOTHESIS L5]` — la securite par IP Docker n'est pas documentee comme L2 (pas de benchmark CVE, pas de specification du subnet exact). Les IPs Docker sont configurables et peuvent changer selon l'environnement. Un filtre IP seul sur un endpoint exposant des donnees agregees de CA par tenant n'est pas une defense robuste.

**Reformulation** :
> `[HYPOTHESIS]` "Le filtre IP Docker est un premier niveau de defense pour l'environnement prod initial. Il doit etre complementé par un secret partagé (header ou mutual TLS) avant que Florian ait acces a des donnees financielles multi-tenants."

---

## 3. Synthese des reformulations requises

| Claim | Document(s) | Action |
|---|---|---|
| Trust Score 98.2 % badge A | CDCF §2.4, CDCT §8.2, methodologie §11 | Remplacer par `[HYPOTHESIS]` + mentionner audit juridique externe requis |
| Art. 9.2.a CGU = protection suffisante | ADR-0003 §Decision, CDCF §8 | Qualifier `[HYPOTHESIS — validation juriste requise]` |
| Messaging = substitut juriste | CDCF §11 Adaptation Log | Qualifier `[REASONING]` defense en profondeur, non validation juridique |
| Florian = DPO de facto | CDCF §2.2, ADR-0003 | Remplacer par "responsable RGPD operationnel, statut DPO formel a evaluer" |
| Securite D5 (TLS/pgcrypto/2FA) comme fait | CDCF/CDCT/ADR-0003 §securite renforcee | Prefixer `[A IMPLEMENTER]` sur chaque item non encore livre |
| Dedibox 28 EUR/32GB | methodologie-agile §11, kanban D2 | Produire D2bis avec devis Dedibox documente |
| Estimations D5/D6 | methodologie-agile §8 capacite sprint | Requalifier `[HYPOTHESIS]` et prevoir buffer |
| Doctolib/HubSpot/Pipedrive usage marche | methodologie-agile §1 | Qualifier `[HYPOTHESIS L5 — source : retour Florian]` |
| Conservation 5 ans Art. L.123-22 | CDCF §8.3, CDCT §8.3, data-model | Verifier si 5 ans ou 10 ans ; documenter la reconciliation RGPD vs comptable |
| Filtre IP Docker = securite suffisante D8 | MCT OP-100, CDCT §6.6 | Qualifier `[HYPOTHESIS]` + recommander secret header |

---

## 4. Recommandations methodologiques pour les prochains documents

- **Separer spec et implementation** : tout item securite non encore code doit etre prefixe `[SPEC — A IMPLEMENTER D5]`, pas presente comme acquis dans les sections conformite.
- **Sourcer les claims marche** : toute assertion sur le comportement des cabinets doit pointer vers un entretien documente ou indiquer `[HYPOTHESIS L5 — source : retour Florian]`.
- **Isoler le raisonnement juridique** : les ADR citent correctement CJUE et RGPD (L1), mais les conclusions sont des inferences. Les presenter comme `[REASONING]` en attendant validation juriste.
- **Mettre a jour D2 avant D6** : le kanban marque D2 "Done" mais la cible serveur a change (Dedibox vs DEV1-L). D6 est planifie sur une infrastructure sans devis valide.
- **Reconciliation RGPD / comptable** : documenter explicitement comment le droit a l'effacement (Art. 17 RGPD) coexiste avec l'obligation de conservation comptable. C'est un vide dans tous les documents audites.
- **Pentest S10** : marque "reporte, pentest dans les 4 semaines" dans CDCF §3.3. Pour un produit avec donnees PII + devis financiers, l'absence de pentest avant prod reelle est un risque non-quantifie qu'il faut nommer explicitement plutot que minimiser.

---

## 5. Synthese executive

```
Trust Score corpus : 40 % — Badge D
Claims BLOCKED (compliance/security) : 5
HYPOTHESIS presentees comme faits : 7
Actions critiques avant V1 :
  - D2bis (devis Dedibox actualise)
  - validation juriste CGU
  - reconciliation RGPD/comptable
  - requalification securite D5 comme "a faire"
```

---

*Rapport genere par bmad-fact-checker — 2026-05-26. Archive pour reference. Synthese executive en haut, detail des 10 claims problematiques en §2.*
