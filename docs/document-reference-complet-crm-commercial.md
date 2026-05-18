# CRM Commercial Esthétique — Document de Référence Complet

**Version :** 3.0 — 16 mai 2026  
**Auteur :** Dimitry (développeur freelance)  
**Objet :** Document auto-suffisant consolidant l'intégralité du contexte projet, des décisions prises, des analyses juridiques, du contrat de sous-traitance, et des spécifications techniques. Destiné à servir de source unique de vérité pour toute personne ou IA travaillant sur le projet.

---

# PARTIE A — CONTEXTE ET HISTORIQUE DU PROJET

## A.1 Qu'est-ce que ce projet

Un logiciel de type CRM (Customer Relationship Management) spécialisé pour les cabinets de prestations esthétiques. L'outil gère le pipeline commercial (prospects → clients → prestations effectuées), l'établissement de devis en deux temps (technique + commercial), l'agenda, le paramétrage des prestations et cliniques, le suivi documentaire, et un tableau de bord de chiffre d'affaires.

Le produit a été initialement conçu et spécifié en collaboration entre Dimitry (développeur) et Florian (porteur commercial / product owner), avec le cabinet « Konfidentiel » du Dr. Alexis Delobaux comme client pilote.

## A.2 Parties prenantes actuelles

| Personne | Rôle | Statut |
|----------|------|--------|
| **Dimitry** | Développeur freelance (micro-entrepreneur). A conçu l'architecture, rédigé les specs, développé le POC/MVP. | Prestataire sous-traitant |
| **Florian** | Product owner initial. A défini les besoins métier, validé les specs, fourni le feedback chirurgien. | Client initial — rôle en évolution |
| **Entreprise mexicaine** (nom à compléter) | Nouveau client qui reprend le projet. Emploie Dimitry comme sous-traitant freelance. Un commercial et un profil technique ont participé aux réunions. | Client contractuel — éditeur et exploitant du logiciel |
| **Yan** | Mentor de Dimitry. A conseillé sur le cadre contractuel (obligation de moyen, gestion du backlog, signature, communication). | Conseiller, pas partie au contrat |

## A.3 Chronologie des décisions majeures

| Date | Décision | Source |
|------|----------|--------|
| Avant mai 2026 | Conception et développement du MVP : 18 tables, pipeline 5 colonnes, devis 2 temps, agenda, multi-tenant, Docker Compose. | Travail Dimitry + Florian |
| ~10 mai 2026 | Florian veut tester le CRM en local chez des chirurgiens (sur un PC, pas en ligne) pour éviter les coûts HDS. | Appel Florian |
| 14 mai 2026 | Analyse juridique complète : le local contourne l'HDS mais pas le RGPD. Contre-analyse : zones grises nombreuses (rôle du commercial, photos, conservation 20 ans). | Recherche Dimitry + Claude |
| 14 mai 2026 | Découverte que le PaaS HDS coûte 80-500 €/mois (pas 60 000 €). L'écart avec le local est de ~240 €/3 mois. | Recherche prix Scaleway/OVH |
| 15 mai 2026 | Réunion avec l'entreprise mexicaine. Décision : recadrer le CRM comme **outil commercial pur, pas outil de santé**. Retirer toutes les données de santé du périmètre. Mettre en ligne sur un hébergement standard. Phase 2 : ajout HDS quand le produit est validé. | Réunion Dimitry + commercial + technique |
| 15 mai 2026 | Travail avec Yan (mentor). Cadrage contractuel : obligation de moyen, estimations (pas deadlines), clause de carence client, backlog avec pricing, email comme canal officiel, signature avec tampon d'entreprise. | Session Dimitry + Yan |

## A.4 Décision actuelle : outil commercial en ligne, pas outil de santé

**Le CRM est un outil de gestion commerciale.** Il traite exclusivement des données personnelles génériques (nom, prénom, email, téléphone) et des données commerciales (catalogue de prestations, tarifs, devis, planning, pipeline). Il ne traite aucune donnée sensible au sens de l'Art. 9 du RGPD : pas de notes médicales, pas de photos corporelles, pas d'antécédents médicaux, pas de prescriptions, pas de comptes-rendus, pas de diagnostics.

Dans toute la documentation Phase 1, le vocabulaire est 100% commercial : on parle de « prestations » (pas « interventions chirurgicales »), de « clients » (pas « patients »), de « rendez-vous » (pas « consultations médicales »), de « cabinet » (pas « installation de chirurgie esthétique »).

**Stratégie en 2 phases :**

Phase 1 (maintenant) : outil commercial en ligne, hébergement cloud standard, données génériques uniquement. Tester chez quelques clients.

Phase 2 (quand le produit est validé avec des clients payants) : migration vers PaaS HDS (Scaleway ou OVHcloud, 200-500 €/mois), ajout des colonnes/features santé (notes médicales, photos, antécédents), mise en conformité RGPD santé. Argument commercial : « vous êtes dans une zone réglementée, nous on a un outil conforme HDS ».

---

# PARTIE B — SPLIT FONCTIONNALITÉS ET DONNÉES

## B.1 Ce qui RESTE en Phase 1 (outil commercial)

Les 18 tables du modèle de données actuel sont toutes conservées. Elles contiennent exclusivement des données commerciales, financières, logistiques et de planning.

| Table | Colonnes principales | Justification commerciale |
|-------|---------------------|--------------------------|
| Tenant | id, name, subdomain, config | Multi-tenant technique |
| User | id, tenantId, email, password, role, name | Authentification technique |
| Client | id, tenantId, nom, prenom, telephone, email, adresse, sourceAcquisition, lienDoctolib, createdAt | Fiche contact CRM classique |
| Process | id, tenantId, clientId, stage, qualification, budget, sourceDetail, consultationDate, createdAt, isArchived, archivedAt | Pipeline d'opportunités commerciales |
| ProcessIntervention | id, processId, interventionId, dateIntervention | Lien opportunité-prestation |
| Intervention | id, tenantId, name, category, durationMinutes, priceHonoraires, marginCoefficient, isActive | Catalogue de prestations tarifées |
| InterventionFee | id, interventionId, label, defaultPrice, defaultQuantity, order, isActive | Frais additionnels par prestation |
| Clinique | id, tenantId, name, address, phone | Lieu de prestation |
| CliniqueTarif | id, cliniqueId, bloc, anesthesie, hospitalisation, ambulatoire | Grille tarifaire lieu |
| CliniqueOption | id, cliniqueId, label, price, category | Options tarifaires lieu |
| Devis | id, tenantId, processId, status, reference, totalAmount, createdAt | Devis commercial |
| DevisIntervention | id, devisId, interventionId, cliniqueId, dateIntervention, priceHonoraires, isDone, doneAt | Ligne de devis |
| DevisInterventionFee | id, devisInterventionId, interventionFeeId, label, price, quantity, isIncluded, order | Frais sur ligne de devis |
| DevisOption | id, devisId, cliniqueOptionId, label, price, quantity | Option catalogue sur devis |
| DevisCustomOption | id, devisId, label, price, quantity, order | Option libre sur devis |
| DevisStay | id, devisId, cliniqueId, date, mode, nightCount | Séjour planifié |
| DocumentTemplate | id, tenantId, interventionId, name, description | Template document administratif |
| ProcessDocument | id, processId, documentTemplateId, status | Suivi documentaire |

**Features conservées :** Pipeline complète (5 colonnes + follow-up + non qualifié), fiche client (contact), process (opportunité), devis 2 temps avec calcul auto, frais supplémentaires, séjours ambu/nuit, options à la volée, règle anti-doublon, agenda (vue projetée), paramétrage lieux + catalogue, gestion documentaire administrative, dashboard CA, génération PDF, archivage auto, fonctionnalité copier, multi-tenant.

**Enums conservés :** ProcessStage (CONTACT, CONSULTATION, POST_CONSULT, CONFIRMEE, OP_PROGRAMMEE, EFFECTUEE, NON_QUALIFIE, FOLLOWUP, ANNULEE), FollowupReason, DocumentStatus, DevisStatus, HospitalisationMode, UserRole (ADMIN, COMMERCIAL, CHIRURGIEN), SourceAcquisition.

## B.2 Ce qu'on RETIRE (reporté Phase 2 — nécessitera HDS)

| Donnée / Feature | Statut Phase 1 |
|-------------------|---------------|
| Notes médicales de consultation (texte libre du chirurgien) | RETIRÉ — pas de colonne en BDD |
| Photos avant/après | RETIRÉ — pas de stockage |
| Antécédents médicaux | RETIRÉ — pas de colonne en BDD |
| Prescriptions / ordonnances | RETIRÉ |
| Comptes-rendus opératoires | RETIRÉ |
| Module Conformité & DPO (registre Art 30, AIPD wizard, droits patients, journaux) | RETIRÉ |
| Consentement patient au stockage informatique | RETIRÉ |
| Chiffrement applicatif renforcé (pgcrypto) | REPORTÉ — pas nécessaire pour des données commerciales standard |
| Audit trail détaillé (qui a vu quelle fiche) | REPORTÉ — bonne pratique mais pas obligatoire sans données Art. 9 |

## B.3 Le nom des prestations : position adoptée

La table `Intervention` contient le nom de la prestation (ex : « Rhinoplastie », « Liposuccion »). Dans le contexte Phase 1, c'est une ligne de catalogue commercial nécessaire à l'établissement du devis, comme n'importe quel catalogue de produits/services dans un CRM. Le CRM ne stocke aucune information sur l'état de santé du client. Le nom de la prestation est une donnée commerciale.

---

# PARTIE C — ARCHITECTURE ET STACK TECHNIQUE

## C.1 Stack

| Couche | Technologie |
|--------|------------|
| Frontend | Next.js 15 App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Auth | NextAuth / Auth.js v5 |
| Calendrier | react-big-calendar |
| Drag & Drop | @dnd-kit/core |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| BDD | PostgreSQL 16 |
| Validation | Zod |
| PDF | Puppeteer |
| Conteneurs | Docker + Docker Compose (3 services : front port 3000, back port 3001, PostgreSQL) |
| Proxy | Nginx (routage sous-domaines multi-tenant) |

## C.2 Architecture

Frontend et backend sont physiquement séparés, chacun avec son propre `package.json`, communiquant via API REST pure (JSON). Ce n'est pas un monolithe Next.js.

Multi-tenant via sous-domaines : chaque cabinet = un sous-domaine. Header `X-Tenant-Subdomain` pour l'isolation. La table `Client` a un `tenantId` pour garantir qu'un même patient physique peut avoir des enregistrements séparés par cabinet.

Format de réponse API : `{ success: true, data: {...} }` ou `{ success: false, error: 'message' }`.

Auth : JWT côté backend, NextAuth côté frontend. Rôles : ADMIN, COMMERCIAL, CHIRURGIEN.

## C.3 Modèle de données

18 tables. Relations principales :
```
Tenant (1) ──< (N) User, Client, Clinique, Intervention, Process
Client (1) ──< (N) Process
Process (1) ──< (N) ProcessIntervention, Devis, ProcessDocument
Intervention (1) ──< (N) ProcessIntervention, DevisIntervention, DocumentTemplate, InterventionFee
Clinique (1) ──< (N) CliniqueTarif, CliniqueOption, DevisStay
Devis (1) ──< (N) DevisIntervention, DevisOption, DevisCustomOption, DevisStay
DevisIntervention (1) ──< (N) DevisInterventionFee
```

L'agenda n'a pas sa propre table. Il est dérivé par projection de `Process.consultationDate` et de `DevisStay.date`.

## C.4 Hébergement Phase 1

Cloud standard (pas HDS). Le choix exact de l'hébergeur n'est pas encore arrêté. Toute offre cloud classique (Scaleway, OVH, DigitalOcean, Vercel + PaaS PostgreSQL) convient pour la Phase 1 puisqu'on ne traite pas de données de santé.

Déploiement : Docker Compose sur une instance cloud, avec Nginx en reverse proxy pour le routage multi-tenant par sous-domaine. HTTPS via Let's Encrypt.

## C.5 Sécurité de base (Phase 1, RGPD standard)

Même sans données de santé, le RGPD standard s'applique aux données personnelles (nom, email, téléphone). Mesures implémentées :

- Authentification sécurisée (bcrypt, sessions sécurisées, HTTPS)
- Séparation des rôles (commercial ≠ chirurgien ≠ admin)
- Variables d'environnement pour les secrets (hors du code, hors du repo Git)
- HTTPS obligatoire (TLS 1.3)
- Mot de passe fort imposé

---

# PARTIE D — ANALYSES JURIDIQUES (RÉSUMÉ)

## D.1 Contexte des analyses

Avant la décision de recadrer en outil commercial, une analyse juridique approfondie a été menée sur la faisabilité du déploiement local vs en ligne, la conformité RGPD, l'obligation HDS, et le rôle du commercial. Les analyses complètes sont dans des documents séparés. Voici la synthèse.

## D.2 Résumé de l'analyse v1 (déploiement local)

- Le déploiement local (sur un PC du cabinet) contourne l'obligation de certification HDS si le professionnel gère son propre SI — confirmé par l'ANS (esante.gouv.fr).
- Le RGPD s'applique quand même en local (même hors ligne).
- Le chiffrement des données en ligne ne dispense ni du RGPD ni de l'HDS. Des données chiffrées restent des données personnelles (Conseil d'État, 13 février 2026, n°498628).
- La CNIL a sanctionné Cegedim Santé à 800 000 € pour avoir confondu pseudonymisation et anonymisation (2024).

## D.3 Résumé de la contre-analyse

- Un cabinet de chirurgie esthétique n'est pas un « établissement de santé » au sens strict du CSP — l'exemption HDS pourrait ne pas s'appliquer (zone grise).
- Le coordinateur commercial qui voit le type d'intervention (rhinoplastie, etc.) accède potentiellement à des données de santé — la CNIL interdit l'accès du personnel administratif aux données médicales.
- La sécurité d'un PC local est très insuffisante pour des données ultra-sensibles (photos avant/après, chirurgies).
- Un test avec de vrais patients crée une obligation de conservation de 20 ans (Art. R.1112-7 CSP).
- Les photos avant/après nécessitent un consentement spécifique distinct du consentement au soin.

## D.4 Résumé du comparatif coûts

| Option | Coût initial | Coût mensuel | Délai | Risque |
|--------|-------------|-------------|-------|--------|
| Certification HDS de l'éditeur | 61 000-151 000 € | 21 000-59 000 €/an | 9-18 mois | Nul |
| PaaS HDS (Scaleway/OVH) | 500-1 500 € | 80-500 €/mois | 2-3 semaines | Faible |
| Full local | 630-1 300 € | 0 € (coûts cachés) | 1-2 jours | Modéré |
| **Outil commercial sans données de santé (choix actuel)** | **~0 €** | **Hébergement standard** | **Immédiat** | **Faible** |

## D.5 Pourquoi le recadrage en « outil commercial » change tout

En retirant les données de santé du périmètre (notes médicales, photos, antécédents), le CRM sort potentiellement du champ de l'Art. L.1111-8 CSP (obligation HDS) et de l'Art. 9 RGPD (données sensibles). Il ne reste que le RGPD standard pour les données personnelles génériques — les mêmes obligations que n'importe quel CRM du marché (HubSpot, Pipedrive, Salesforce).

La zone grise restante : est-ce que le nom de la prestation (« rhinoplastie ») associé au nom du client constitue une donnée de santé ? C'est la question à trancher avec un avocat spécialisé. L'argument défensif : c'est un catalogue commercial de prestations, pas un dossier médical.

---

# PARTIE E — CADRE CONTRACTUEL

## E.1 Positionnement de Dimitry

Dimitry est un prestataire freelance sous-traitant (micro-entrepreneur) qui réalise une prestation de développement pour le compte de l'entreprise mexicaine. Il livre du code source et de la documentation. Il cède les droits de propriété intellectuelle. Il n'est ni éditeur, ni exploitant, ni hébergeur. Après livraison, cession et période de garantie, le client assume l'intégralité de la responsabilité.

## E.2 Principes contractuels (définis avec Yan)

**Obligation de moyen :** Dimitry s'engage à mettre en œuvre ses compétences, pas à garantir un résultat spécifique. Les durées sont des estimations, pas des deadlines.

**Clause de carence client :** Si le client met plus de 5 jours ouvrés à répondre à une question bloquante ou à valider un livrable, le calendrier glisse d'autant automatiquement.

**Communication officielle :** L'email fait foi (Art. 1366 Code Civil). Les SMS sont recevables comme preuve complémentaire. Les messages WhatsApp/Slack/Discord n'ont pas de valeur contractuelle tant qu'ils ne sont pas confirmés par email. Toute instruction, validation ou décision engageante doit être confirmée par email.

**Backlog avec pricing :** Le périmètre est défini par le CDC (Annexe 1). Tout ajout hors périmètre est documenté dans un backlog horodaté, estimé, tarifé, et validé par email avant que le dev commence. Pas de validation email = pas de dev.

**Signature :** Signature manuscrite sur papier (la plus forte), ou signature électronique avancée (DocuSign, Yousign), ou signature manuscrite scannée avec pièce d'identité. Si l'entreprise signe : tampon avec numéro d'immatriculation (RFC au Mexique), nom et qualité du signataire, vérification du pouvoir de signature.

**Nature des données :** Le contrat stipule explicitement que le logiciel traite des données commerciales génériques, pas de données de santé. Si le client décide d'y stocker des données de santé, c'est sous sa responsabilité et à ses frais (HDS, AIPD, DPO).

**Devoir de conseil documenté :** Le document de split Phase 1 / Phase 2 (Annexe 4) + les analyses juridiques prouvent que Dimitry a alerté le client sur les obligations réglementaires. C'est la protection principale en cas de litige.

**Cession conditionnée au paiement :** Tant que le client n'a pas intégralement payé, les droits de propriété intellectuelle restent chez Dimitry.

**Droit applicable :** Droit français. Juridiction française (tribunaux de Nice ou autre ville à définir). Point non-négociable pour protéger Dimitry contre un litige devant une juridiction mexicaine.

## E.3 Contrat de prestation de services (modèle complet)

### CONTRAT DE PRESTATION DE SERVICES INFORMATIQUES ET DE CESSION DE DROITS DE PROPRIÉTÉ INTELLECTUELLE

**Entre les soussignés :**

**Le Prestataire :**
[Prénom NOM], micro-entrepreneur, SIRET : [à compléter], domicilié à [adresse], email : [email officiel]
Ci-après désigné « le Prestataire »

**Le Client :**
[Raison sociale], société de droit [mexicain/autre], immatriculée sous le numéro [RFC / numéro registre], ayant son siège social à [adresse], représentée par [nom], en qualité de [titre], dûment habilité(e)
Ci-après désigné « le Client »

---

**Article 1 — Objet**

Le Prestataire s'engage à réaliser pour le compte du Client une prestation de développement d'un logiciel de type CRM destiné à la gestion commerciale de cabinets de prestations esthétiques, conformément au cahier des charges annexé (Annexe 1).

Le logiciel est un outil de gestion commerciale. Il traite exclusivement des données personnelles génériques (nom, prénom, coordonnées) et des données commerciales (prestations, tarifs, devis, planning). Le logiciel ne traite aucune donnée sensible au sens de l'Art. 9 du RGPD, et notamment aucune donnée de santé, aucune donnée biométrique, et aucune photographie à caractère médical.

Le Prestataire intervient en qualité de sous-traitant technique indépendant. Il n'est en aucun cas l'éditeur, l'exploitant, l'hébergeur ou le responsable de la commercialisation du logiciel.

**Article 2 — Nature de l'obligation**

La prestation est réalisée dans le cadre d'une obligation de moyen. Les durées et calendriers communiqués sont des estimations de bonne foi, susceptibles de révision en fonction de la complexité, des modifications de périmètre, et du respect par le Client de ses propres obligations.

**Article 3 — Livrables**

a) Code source complet (frontend + backend), repository Git
b) Schéma de base de données (Prisma schema + migrations SQL)
c) Documentation technique de déploiement
d) Documentation fonctionnelle du CRM commercial
e) Données de configuration et de démonstration (seed data)
f) Document de split Phase 1 (commercial) / Phase 2 (données sensibles)

**Article 4 — Recette et délais de réponse**

4.1. Le Client dispose de [10] jours ouvrés pour vérifier chaque livrable et notifier l'acceptation ou les réserves motivées. L'absence de réponse vaut acceptation tacite.

4.2. Clause de carence client : pour toute question bloquante ou demande de validation, le Client dispose de [5] jours ouvrés pour répondre. Passé ce délai, le calendrier est automatiquement décalé d'une durée égale au retard.

**Article 5 — Périmètre et backlog**

5.1. Le périmètre est défini par le CDC (Annexe 1). Toute demande hors périmètre est une évolution soumise à estimation et validation.

5.2. Un backlog partagé (Annexe 3) enregistre chaque évolution avec date, description, estimation, prix, statut.

5.3. Le Prestataire ne commence une évolution qu'après validation écrite par email. En l'absence de validation, l'évolution n'est pas due.

5.4. Les évolutions sont facturées au TJM défini à l'Article 6.

**Article 6 — Prix et paiement**

6.1. Prix de la prestation initiale : [montant] € HT, incluant la cession de droits (Art. 7).

6.2. TJM pour les évolutions : [montant] € HT / jour.

6.3. Paiement : 30% à la signature, 40% à la livraison du lot principal, 30% à la recette définitive.

6.4. Délai de paiement : 30 jours. Pénalités de retard : 3× taux d'intérêt légal + indemnité forfaitaire 40 € (Art. L.441-10 Code de Commerce).

6.5. En cas de retard supérieur à 15 jours, le Prestataire peut suspendre la prestation.

**Article 7 — Cession de propriété intellectuelle**

7.1. Cession exclusive, conformément aux Art. L.131-3 et suivants du CPI : droits de reproduction, représentation, adaptation, modification, commercialisation.

7.2. Territoire : monde entier. Durée : toute la durée de protection légale. Usages : tous.

7.3. Rémunération incluse dans le prix (Art. 6.1).

7.4. Savoir-faire résiduel : le Prestataire conserve le droit d'utiliser ses techniques et méthodes générales, sans reproduire le code spécifique.

7.5. La cession est conditionnée au paiement intégral. Tant que le prix n'est pas réglé, les droits restent au Prestataire.

**Article 8 — Responsabilité et données**

8.1. Garantie de conformité : 3 mois après recette définitive. Correction des anomalies bloquantes résultant d'un défaut de développement.

8.2. Après la garantie, le Prestataire est déchargé. Le Client assume maintenance, hébergement, exploitation, conformité réglementaire.

8.3. Le Client s'engage à ne pas utiliser le logiciel pour des données sensibles (Art. 9 RGPD) sans les mesures de conformité requises (HDS, AIPD, DPO), sous sa seule responsabilité.

8.4. Devoir de conseil : le Prestataire a informé le Client des obligations réglementaires (RGPD Art. 9, HDS Art. L.1111-8 CSP). L'Annexe 4 formalise cette mise en garde. Le Client reconnaît en avoir été informé.

8.5. Responsabilité plafonnée au montant total perçu.

8.6. Exclusion des dommages indirects.

**Article 9 — Communications**

9.1. Email = canal officiel (Prestataire : [email], Client : [email]). SMS = secondaire. Messagerie instantanée = informel.

9.2. Toute décision engageante doit être confirmée par email. Les instructions non confirmées par email n'engagent pas les parties.

**Article 10 — Statut du Prestataire**

Indépendant. Pas de lien de subordination. Pas salarié, pas mandataire. Pas éditeur du logiciel (LCEN). Le Client assume seul la qualité d'éditeur.

**Article 11 — Confidentialité**

Confidentialité réciproque. Durée : 3 ans après fin du contrat.

**Article 12 — Données personnelles**

Le Prestataire n'accède à aucune donnée personnelle de clients finaux. Développement exclusivement avec des données fictives. Si accès exceptionnel nécessaire : DPA Art. 28 à signer préalablement.

**Article 13 — Droit applicable**

Droit français. Résolution amiable (30 jours). Tribunaux compétents de [Nice].

**Article 14 — Dispositions diverses**

Intégralité de l'accord. Incessibilité sans accord. Divisibilité des clauses. Modifications par avenant écrit signé.

---

Fait en deux exemplaires originaux, le [date]

Le Prestataire : _________________________ (Nom, signature)

Le Client : _________________________ (Nom, qualité, signature, tampon entreprise avec numéro d'immatriculation)

---

Annexe 1 — Cahier des charges fonctionnel
Annexe 2 — Liste des livrables détaillée
Annexe 3 — Backlog évolutif (document partagé horodaté)
Annexe 4 — Document de split Phase 1 / Phase 2 (devoir de conseil)

---

# PARTIE F — LISTE DE TÂCHES

## F.1 Tâches de développement (Dimitry)

| # | Tâche | Estimation |
|---|-------|-----------|
| 1 | Documenter le split features/données (tableau des 18 tables par colonne) | ~1/2 journée |
| 2 | Retirer les colonnes/features santé du schéma Prisma (branche `feature/hds-phase2` pour conservation) | ~1 journée |
| 3 | Nettoyer le frontend (écrans/composants santé) | ~1 journée |
| 4 | Nettoyer le backend (routes API santé) | ~1/2 journée |
| 5 | Tester l'appli complète sans les features santé | ~1 journée |
| 6 | Générer les seed data commerciales | ~1/2 journée |
| 7 | Spécification fonctionnelle du CRM commercial (vocabulaire 100% commercial) | ~1 journée |
| 8 | Schéma de BDD (Prisma schema + diagramme) | ~1/2 journée |
| 9 | Documentation technique de déploiement (README Docker) | ~1/2 journée |
| 10 | Document de split Phase 1 / Phase 2 formalisé | ~1/2 journée |
| 11 | Authentification sécurisée (bcrypt, HTTPS) | Déjà fait / ~2h |
| 12 | Séparation des rôles (commercial ≠ chirurgien ≠ admin) | ~1-2 jours |
| 13 | Variables d'environnement / secrets hors du code | ~2h |
| 14 | HTTPS obligatoire | Inclus dans le déploiement |

**Estimation totale : ~8-10 jours. Ce sont des estimations, pas des deadlines.**

## F.2 Tâches contractuelles et administratives

| # | Tâche | Qui | Estimation |
|---|-------|-----|-----------|
| 15 | Faire relire le contrat par un avocat | Dimitry | 300-500 € |
| 16 | Signer le contrat avec l'entreprise mexicaine | Dimitry + Client | 1 journée |
| 17 | Mettre en place le backlog partagé (Notion, Linear, ou tableur) | Dimitry | 1h |
| 18 | Définir les emails officiels contractuels | Dimitry + Client | 15 min |

---

# PARTIE G — VOCABULAIRE DE RÉFÉRENCE (Phase 1)

| Terme ancien (santé) | Terme Phase 1 (commercial) | Usage |
|---------------------|---------------------------|-------|
| Patient | **Client** | Partout dans l'app et la doc |
| Intervention chirurgicale | **Prestation** | Catalogue, devis, pipeline |
| Consultation médicale | **Rendez-vous** | Agenda, pipeline |
| Chirurgien | **Praticien** ou **responsable technique** | Rôle utilisateur |
| Installation de chirurgie esthétique | **Cabinet** | Multi-tenant |
| Données de santé | Hors périmètre Phase 1 | Ne pas mentionner |
| Dossier patient | **Fiche client** | Interface CRM |
| Acte médical | **Prestation** | Catalogue |

---

# PARTIE H — SOURCES JURIDIQUES PRINCIPALES

| Source | Référence | Utilisation |
|--------|-----------|------------|
| ANS / esante.gouv.fr | Certification HDS, exemption gestion propre SI | Analyse locale |
| CNIL | RGPD et professionnels de santé libéraux | Obligations RGPD |
| Conseil d'État, 13/02/2026, n°498628 | Pseudonymisation ≠ anonymisation | Chiffrement en ligne |
| CNIL, SAN-2024-013 | Sanction Cegedim Santé 800 000 € | Données pseudonymisées |
| CA Nîmes, 15/12/2022 | Nullité contrat éditeur sans HDS | Risque contractuel |
| Art. L.1111-8 CSP | Obligation HDS hébergement externalisé | Cadre légal |
| Art. L.6322-1 CSP | Installations de chirurgie esthétique ≠ établissements de santé | Zone grise |
| RGPD Art. 4, 9, 25, 28, 32, 35 | Protection des données | Cadre RGPD |
| Art. L.131-3 CPI | Cession de droits d'auteur | Contrat |
| Art. 1366 Code Civil | Force probante de l'écrit électronique | Communication |
| Scaleway, 23/04/2026 | Sélection hébergeur Health Data Hub | Contexte Phase 2 |

---

# PARTIE I — QUESTIONS NON RÉSOLUES (pour un avocat)

1. Le nom d'une prestation esthétique (« rhinoplastie ») associé au nom d'un client constitue-t-il une donnée de santé au sens de l'Art. 9 RGPD ?
2. Le coordinateur commercial peut-il voir le type de prestation ? Sous quelles conditions ?
3. En Phase 2, l'éditeur qui administre l'appli sur un PaaS HDS doit-il être lui-même certifié HDS (activité 5) ?
4. Une micro-entreprise suffit-elle comme structure juridique pour l'éditeur ?
5. Le contrat de sous-traitance avec cession de droits (Art. 7) protège-t-il suffisamment Dimitry en cas de contrôle CNIL sur l'outil exploité par le client ?
