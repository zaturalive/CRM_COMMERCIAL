# Retour commercial — feedback utilisateur reel

**Date** : 2026-05-27 (mercredi soir)
**Source** : commercial(e) cabinet (relais via Florian / Dimitry)
**Statut** : capture initiale — la commerciale doit encore envoyer une fiche KPI
**Importance** : retour utilisateur CRITIQUE qui structure le backlog V1.1 et V2

> "On ne se substitue pas a Doctolib, on complete cote commercial."
> — Positionnement officiel valide par le commercial du cabinet.

---

## 1. Positionnement (a graver dans la pierre)

| Outil | Role | Nous |
|-------|------|------|
| **Qualimed** | DPI medical (donnees patient medicales, HDS) | **Pas notre scope** |
| **Doctolib** | Agenda medical + RDV patient | **On complete**, on remplace pas |
| **Google Calendar** | Agenda perso du praticien / cabinet | **A synchroniser** |
| **CRM Commercial (nous)** | Pipeline commercial + devis + suivi paiement + relances | **Notre coeur** |

**Implications metier** :
- Toute donnee medicale reste dans Qualimed (cf ADR-0003 non-HDS)
- Doctolib + Qualimed sont deja synchros (cote client) — on n'a rien a y faire
- On synchronise UNIQUEMENT avec Google Calendar pour les creneaux

---

## 2. Demandes par module

### 2.1 Fiche client dans la pipeline

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Ajouter date de naissance** | HAUTE | XS (~1h) | Beaucoup d'homonymes en pratique |
| KPI fiche (a venir) | A definir | - | Commercial envoie une fiche detaillee |

### 2.2 Devis — refonte UX critique

> "Actuellement elle a tout pre-rempli, fait juste 2 clicks pendant le RDV. Elle veut pouvoir remplir en avance."

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Pre-remplissage en avance** (template de devis ?) | HAUTE | M | Brouillon avant RDV, finalisation rapide pendant |
| **Vue PDF en live** (preview pendant l'edition) | HAUTE | M | Voir le rendu sans avoir a generer / telecharger |
| **Reductions** (champ dedie, pas via frais negatif) | HAUTE | S | Actuellement elle bricole avec des frais negatifs = perte d'info |
| **Previsionnel PDF du devis** | HAUTE | S | Snapshot PDF avant signature pour envoi prealable |
| **Devis trop complique** (trop de champs) | HAUTE | L | Audit UX complet du DevisBuilder |

**Approche proposee post-V1** : creer un mode "draft / brouillon" pre-rempli a partir d'un template, avec un wizard simplifie en 3 etapes (Prestation → Sejour → Resume PDF).

### 2.3 Signature mail

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Outil de signature mail soit bien** (formulation floue) | A clarifier | M | A demander : signature electronique du PDF ? Signature visuelle dans l'email ? Format DocuSign ? |

### 2.4 Follow-up templates par jour

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Configurer templates par sub-stage** (J+1 / J+3 / J+7 quels templates envoyer) | HAUTE | M | Mapping sub-stage → template auto |

### 2.5 Agenda

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Lien visio dans les events** (Zoom / Google Meet) | HAUTE | S | Champ `meetingUrl` sur Process / Event |
| **Sync Google Calendar bidirectionnelle** | HAUTE | XL | Voir details ci-dessous |

**Details sync Google Calendar** :
- Recuperer le Google Calendar du cabinet
- Identifier les creneaux libres (pas d'event Google existant)
- Pouvoir creer nos events CRM dans ces creneaux libres uniquement
- Recuperer aussi les events Google qu'on n'a pas dans le CRM (perso, autres clients, etc.) pour ne pas en planifier au meme creneau
- OAuth Google + token de refresh
- Webhook ou polling pour rester synchro

**Estim** : 3-5 jours de dev (OAuth + sync model + webhook + UI conflict).

### 2.6 Suivi de paiement — CRITIQUE

> "Pour acompte faut aussi savoir si c'est paye car actuellement c'est que pour paiement total et pour acompte il faut aussi avoir un lien de paiement."

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Acompte paye / pas paye** (statut booleen + montant) | HAUTE | XS | Champ `acomptePaidAt` existe deja, exposer dans l'UI |
| **Lien de paiement pour acompte** | HAUTE | M | Lien magique pour client : page de paiement secure |
| **Connexion outil de paiement** (Stripe / GoCardless / Klarna) | HAUTE | XL | Au moins UN doit etre supporte |

**Approche proposee** :
- Stripe Checkout en premier (le plus simple, large couverture France)
- Webhook `/api/payments/stripe-webhook` pour update auto du statut
- Lien magique `https://app/pay/<token>` qui redirige vers Stripe Checkout
- Multi-provider via interface (V1.2 : ajouter Klarna + GoCardless)

### 2.7 V1.1 / V2 — IA agents

> "Si j'ai une IA qui va chercher des reponses, va contacter les clients et tout je suis trop content"

| Demande | Priorite | Effort | Note |
|---------|----------|--------|------|
| **Agent IA WhatsApp** (deja prevu PD2) | MEDIUM | XL | Stack Anthropic + WhatsApp Business API |
| Agent IA Q&A interne | LOW | L | Indexation docs + RAG sur prestations / process |
| Agent IA proactive (relances automatiques) | LOW | XL | Cron + decision IA quand relancer / comment |

---

## 3. Priorisation pour V1.1 (post-demo, mi-juin)

### Quick wins (1-2 jours cumules)

1. **Date de naissance** sur fiche client (~1h) — DEMANDE COMMERCIAL
2. **Acompte paye/pas paye** dans UI (~30 min) — champ deja en BDD
3. **Champ reduction sur devis** (~2h) — refactor calcul total
4. **Lien visio sur Process / Event** (~2h) — champ texte + UI

**Total** : ~6h. Peut etre fait jeudi-vendredi en parallel du smoke + securite.

### Chantiers V1.1 (1-3 semaines)

5. **Vue PDF live du devis** (~1 jour) — render React PDF en iframe a cote de l'editeur
6. **Configurable templates follow-up par sub-stage** (~1 jour) — table de mapping
7. **Stripe Checkout + webhook acompte** (~3 jours) — premiere integration paiement
8. **Refonte UX devis** (mode brouillon + wizard 3 etapes) (~2-3 jours)

**Total V1.1 (sans Google Cal)** : ~8-10 jours dev.

### Chantiers V1.2 (mois +1)

9. **Sync Google Calendar bidirectionnelle** (~3-5 jours) — OAuth + sync + conflit creneaux
10. **Templates messages multi-provider** (~2 jours) — pour preparer WhatsApp ulterieur
11. **Agent IA WhatsApp V1** (~2 semaines) — apres Stripe (priorite paiement)

---

## 4. Decisions a prendre

### Avant la demo jeudi 28 mai

| Decision | Recommandation |
|----------|----------------|
| Inclure la date de naissance avant la demo ? | OUI si user a 1h dispo (~30 min migration Prisma + 30 min UI ClientFormDialog) |
| Inclure le champ reduction devis ? | NON, reporter V1.1 (impact calcul total, risque de regression) |
| Communiquer V1.1 deja prevu au commercial pendant la demo | OUI, dire "ces 8-10 chantiers sont en V1.1 mi-juin" pour gerer attentes |

### Apres reception de la fiche KPI commercial

| Decision | Note |
|----------|------|
| Re-prioriser le backlog selon les KPI | A faire des reception |
| Identifier les KPI qu'on peut deja calculer | Probablement la majorite (CA, conversion, time-to-sign, etc.) |
| Identifier les KPI manquants (donnees a tracker) | Ajout de fields BDD si besoin |

### Strategie paiement

| Provider | Pour quoi | Effort |
|----------|-----------|--------|
| Stripe | Carte bancaire (90% des cas France) | M (3 jours) |
| GoCardless | Prelevement SEPA (alternative cheaper) | M (3 jours) |
| Klarna | Paiement en plusieurs fois (very V1.2+) | L (5-7 jours) |

**Recommandation** : commencer par Stripe Checkout (interface hostee, peu de PCI-DSS a gerer), puis Klarna si la commerciale insiste.

---

## 5. Questions a poser au commercial

> A inclure dans le prochain appel ou dans la fiche KPI.

1. **Devis trop complique** : quels sont les 5 champs les plus critiques ? Lesquels sont rarement modifies ?
2. **Pre-remplissage** : a partir de quoi pre-rempli ? Un template par prestation ? Un template par praticien ?
3. **Signature mail** : c'est la signature electronique (legalement valide) ou juste un "logo + nom" en bas du mail ?
4. **Templates J+1 / J+3 / J+7** : combien de templates par jour ? Differents selon stage du process ?
5. **Lien visio** : on l'attache au RDV (Process.dateRendezVous) ou a la prestation (DevisIntervention.datePrestation) ?
6. **Stripe ou autre** : preference du cabinet ? Ils ont deja un compte marchand ?
7. **Acompte montant** : fixe par cabinet ou variable par client ?
8. **Google Calendar** : 1 calendar par praticien ? Ou 1 calendar partage ?

---

## 6. Mapping vers backlog technique existant

| Demande commercial | Story / UC existant | Action |
|--------------------|---------------------|--------|
| Date de naissance | nouveau | Creer UC client field birthdate |
| Reduction devis | UC-30 / DevisBuilder | Ajouter champ `discount` sur Devis |
| Vue PDF live | UC-37 Devis PDF | Etendre avec mode preview iframe |
| Acompte paye + lien paiement | UC-36 Devis payment | Etendre avec Stripe integration |
| Lien visio agenda | UC-50 / UC-51 EventSheet | Ajouter `meetingUrl` |
| Sync Google Calendar | nouveau | Creer UC-94 GoogleCalendarSync |
| Templates par sub-stage | UC-80 MessageTemplate CRUD | Etendre avec mapping sub-stage |
| Outil paiement | nouveau | Creer UC-95 StripeCheckout |
| IA WhatsApp | PD2 backlog | Deja prevu V1.1+ |

---

## 7. Resume executive

**Ce qui ressort** :

1. La commerciale est globalement satisfaite du pipeline, agenda et follow-up actuels
2. Le **devis** est le point de friction le plus eleve (trop de champs + pas de preview PDF)
3. Le **paiement** est le **manque fonctionnel critique** (Stripe Checkout + lien paiement acompte = MUST V1.1)
4. La **sync Google Calendar** est le **wow factor** attendu (gros effet WOW si bien fait, mais 3-5 jours dev)
5. L'**IA** est le rêve V2 (pas critique pour V1.1)
6. Le positionnement "on complete Doctolib, on remplace pas" est CLAIR et coherent avec notre ADR-0003 non-HDS

**Recommandation post-demo jeudi** :
- V1.1 (juin) : Stripe + reduction devis + PDF live + date naissance + lien visio
- V1.2 (juillet) : Google Calendar + templates configurables par sub-stage
- V2 (sep+) : IA WhatsApp + agents proactifs

---

*Document de capture cree le 2026-05-27. A enrichir avec la fiche KPI a venir + reponses aux 8 questions §5.*
