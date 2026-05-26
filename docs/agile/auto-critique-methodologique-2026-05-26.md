# Auto-critique methodologique — CRM Commercial

**Date** : 2026-05-26 (mardi)
**Auteur** : Dimitry (Claude en pair)
**Trigger** : user signale qu'on part trop vite en besogne et qu'on ne met pas assez en place les methodes apprises
**Statut** : honest take, pas un rapport de victoire

> Ce document complete le fact-check BYAN (`docs/agile/audit-fact-check-2026-05-26.md`) et le compliance peer review (en cours). Il pose les questions methodologiques que les audits ne posent pas directement : zones d'ombre, biais cognitifs, ce qu'on aurait du faire AVANT, trajectoire si on ne corrige rien.

---

## 1. Questions inconfortables que la methodo agile ne pose pas

### 1.1. On a code AVANT de definir la methode

**Constat** :
- Le POC initial a ete code en mars-avril 2026 (crm-chirurgien)
- Le fork commercial date du 16 mai 2026
- La methodologie agile structuree (ce document) date du 26 mai 2026
- => **on a code 2 mois avant de formaliser le besoin avec rigueur agile**

**Risque** : ce qu'on appelle "MVP V1" est en realite la **rationalisation a posteriori** d'un code deja construit. Les user stories US01-US10 ne sont pas l'origine du code, elles sont la **description** du code existant. Ca s'appelle du **rear-mirror agile** — agile cosmetique, pas reel.

**Indicateurs concrets de cette derive** :
- Les 50 stories `docs/product/stories/EPxx-Syy.md` ont ete ecrites APRES le code (sinon EP04 stories serait pas si exhaustif sur les sub-stages follow-up qui ont emerge en cours de route)
- ADR-0002 (retrait CHIRURGIEN) date du 19 mai — apres 2 mois de code avec ce role, decouverte tardive d'une derive HDS
- Le test e2e `seed-p-07 = Marine Dupont en CONFIRMEE` couple a un seed precis : ca trahit un code qui a evolue par accretion plutot que par design

**Ce qu'on ne peut plus changer** : on ne va pas re-coder le projet pour le re-deriver agile. Mais on peut etre HONNETE sur le fait que ce qu'on appelle "methode agile" est un cadre de **gouvernance** plus qu'un cadre de **conception** dans ce projet.

### 1.2. Pas de PRODUCT OWNER cote Florian

**Constat** : Florian est appele "client" et "commanditaire" dans le doc agile. Mais en pratique :
- Il n'a pas signe de PRD formel
- Il n'a pas valide le scope ligne par ligne
- Il a un brief verbal du 18 mai et des emails sporadiques
- Il n'a pas de retro a la fin de chaque sprint

**Risque** : si vendredi 29 mai il dit "ah mais c'est pas ce que je voulais", on n'a aucune trace ecrite contradictoire de ce qu'il voulait.

**Action corrective realiste** :
- Envoyer le doc agile (`methodologie-agile-V1-2026-05-26.md`) a Florian pour validation explicite **avant** le sprint final
- Lui faire valider sections 1, 2, 7 (MVP scope) et 13 (risques) avec un retour ecrit ("OK Florian — 26 mai")
- Sans ce retour, on AVANCE quand meme (pas le temps) mais on **documente** qu'il n'a pas valide formellement

### 1.3. Pas d'USER RESEARCH avec Julie / Stephane

**Constat** : les personas Julie (commerciale) et Stephane (chirurgien admin) sont **fictifs**. Je les ai composes a partir de patterns generiques du secteur, pas d'entretien reel.

**Risque** : on optimise pour des utilisateurs imaginaires. Le 30 mai, Julie reelle peut dire "votre kanban c'est trop de clicks, je preferais l'Excel".

**Indicateurs** :
- US03 "creer un dossier en 2 clicks" : 2 clicks reel ou ressenti ?
- US07 agenda drag-drop : Julie utilise un agenda papier ? Doctolib ? Google Calendar ? On ne sait pas.
- US05 modal HDS : on assume qu'elle lit le texte. Elle le lit ?

**Action corrective** :
- Demander a Florian : peut-il organiser 1 appel de 30 min avec Julie reelle AVANT la mise en prod ?
- Sinon : assumer le risque et documenter en RISQUE explicite que les personas ne sont pas valides
- Plan B post-V1 : organiser une session d'observation a froid au cabinet semaine du 2 juin

### 1.4. Pas de DPIA documente (RGPD Art. 35)

**Constat** : pour traiter des donnees personnelles a grande echelle dans un secteur sensible (sante esthetique), une **DPIA** (Data Protection Impact Assessment) est **obligatoire** ou **recommandee**.

- Nature des donnees : nom, prenom, telephone, email, adresse, prestations envisagees, paiements, photos potentielles (si Julie en met malgre l'interdiction)
- Volume : 5 cabinets × ~500 clients/an = 2500 personnes concernees an 1
- Risque : faible (commercial, pas medical) mais non nul

**Etat actuel** :
- ADR-0003 mentionne "registre traitements" comme TODO V1, sans DPIA
- Aucun document DPIA dans `docs/legal/`

**Risque** : si la CNIL audite suite a une plainte, premiere question : "Avez-vous fait une DPIA ?" Reponse : non. Sanction probable : injonction de la faire (pas amende, sauf negligence grossiere). Mais cote image, c'est mauvais.

**Action corrective** :
- Documenter une **DPIA simplifiée** AVANT prod (1 page max) : finalites, base legale, donnees, mesures de securite, risque residuel, mesures correctives
- Coller au modele CNIL : https://www.cnil.fr/fr/PIA-logiciel
- Decision a prendre : DPIA obligatoire ou non ? Si on stocke email + telephone + sante esthetique pour 2500 personnes, **probablement oui**

### 1.5. Pas de DPA (Data Processing Agreement) signe

**Constat** : qui est "responsable de traitement" RGPD ?
- Le cabinet (Stephane) decide des finalites
- Florian heberge / commercialise (sous-traitant ?)
- Dimitry developpe / opere (sous-traitant du sous-traitant ?)

**Risque** : sans DPA ecrit entre les 3 parties, chaque litige RGPD remonte au plus expose juridiquement = probablement Dimitry (qui a les acces admins).

**Action corrective** :
- Rediger un DPA template (1-2 pages) qui clarifie : cabinet = responsable, Florian = sous-traitant Niveau 1, Dimitry = sous-traitant Niveau 2
- Le faire signer avant le 1er cabinet en prod (donc avant vendredi 29 mai)
- Si pas le temps : documenter dans `docs/legal/DPA-TODO.md` avec deadline "avant 2eme cabinet"

### 1.6. Le sprint final est trop tendu, pas de marge

**Constat** :
- Charge MUST : 16h estimees
- Dispo : 14-18h
- Marge : 2-4h sur 18h = **11-22% de marge** seulement

**Realisme** :
- En dev experimente, 30% de marge minimum
- En dev avec contraintes externes (network, serveur a provisioner, demo client) : 50% de marge
- Ici on a **<25% de marge**

**Indicateurs probables de derive** :
- Si la commande Dedibox prend 6h au lieu de 1h (provisioning Scaleway)
- Si les assets brand Florian sont en Figma au lieu de CSS/HTML/JS (decouverte mercredi soir = panique)
- Si un bug majeur apparait pendant le smoke prod vendredi 18h
- Si Florian demande un changement de scope vendredi matin

**Action corrective** :
- **Acter que le 29 mai est un objectif, pas une garantie**
- Communiquer a Florian dans son email du 26 ou 27 mai : "le 29 mai j'ai 70% de probabilite de livrer en prod. Plan B = 1er juin si retard."
- Pre-positionner Plan B techniquement (Scaleway Instance DEV1-L commande dimanche soir si Dedibox tarde) : on prend la facture mais on a un backup

---

## 2. Biais cognitifs probables dans les artefacts D13/D14

### 2.1. Biais de confirmation

J'ai rationalise apres coup que les 14 tests E2E qui fail sont "des tests obsoletes" (selectors desynchronises). C'est probablement vrai a 70%. Mais **30% des fails pourraient revealer des bugs functional** que je n'ai pas verifies cas par cas.

**Action** : pour chaque test fail, classer en 2 colonnes :
- Bug du test (selector / port / seed) → fix le test
- Bug du code (regression apres rename / refactor) → fix le code

Tant qu'on n'a pas fait ce tri, on ne sait pas si le code marche.

### 2.2. Biais d'optimisme sur les estimations

J'ai mis :
- D14 rebrand : 4h
- D5 securite : 5h
- D6 serveur : 4h
- D7 CGU : 2h
- D11 deploy : 1h

**Probleme** : ces estimations sont des estimations **happy path**. Aucune ne prend en compte :
- Le debug imprevu (en general +50%)
- Les bugs decouverts pendant le smoke (souvent il y en a un)
- Le context-switching (entre dev / ops / docs)

**Reestimation realiste avec coefficient empirique 1.5x** :
- D14 : 6h
- D5 : 7.5h
- D6 : 6h
- D7 : 3h
- D11 : 1.5h
- **Total : 24h vs 14-18h dispo = -25% / -50% manquant**

### 2.3. Biais de granularite

Les User Stories US01-US10 sont **trop granulees** : US05 "upload doc avec modal HDS" et US04 "creer devis" ne sont pas du meme niveau de complexite. US04 = 2 jours, US05 = 1 heure.

**Bonne pratique** : utiliser des points de **Story Points** Fibonacci (1, 2, 3, 5, 8, 13) plutot que des heures. Quand on melange des US de complexite differente, on rate l'effort total.

**Action** : ajouter une colonne Story Points dans le backlog (§6) avant le prochain doc agile.

### 2.4. Biais d'autorite (jouer la carte expertise)

J'ai cite Trust Score 98.2% badge A, RGPD Art. 9.2.a, CJUE C-184/20, RFC 6238, ISO 27001. **C'est vrai dans le principe mais ca ne prouve rien**. Citer une norme != prouver qu'on la respecte.

**Action** : pour chaque norme citee, ajouter une PREUVE de respect (test, audit, document) au lieu de juste la mentionner.

---

## 3. Zones d'ombre que les audits BYAN ne couvriront pas

### 3.1. Le seed.local.ts contient des donnees non documentees

Le seed public (`seed.ts`) cree un tenant `cabinet-test` minimal. Le seed local (`seed.local.ts`, gitignored) cree :
- Cabinet Delobaux avec 15 clients, 10 process, 4 devis, 20 interventions, 2 cliniques, 8 labels
- Mots de passe en clair `demo` pour tous les users

**Probleme** :
- Personne d'autre que moi ne peut reproduire l'etat de mon environnement de dev
- Si je suis ecrase par un bus, le projet est mort
- Les tests E2E dependent du seed.local qui n'est pas commit

**Action** :
- Soit commit `seed.local.ts` mais avec donnees factices (pas Delobaux reel)
- Soit creer `seed.ci.ts` reproductible pour les tests E2E
- Soit documenter dans CLAUDE.md la procedure de bootstrap dev

### 3.2. Pas de plan B technique

Si Scaleway tombe vendredi : pas de plan B documente.
Si la base de donnees corrompt : pas de procedure de restore testee.
Si le DNS bug : pas de DR documente.

**Action** : ecrire `docs/operations/RUNBOOK-V1.md` avec :
- Procedure restore Postgres depuis backup S3
- Procedure switch DNS si CDN down
- Procedure rollback Docker compose
- Numero de telephone Florian + Dimitry pour escalade

### 3.3. Pas de monitoring / alerting

Le CDCT mentionne Loki + Grafana + Promtail. Mais **non installes** au 26 mai. Donc en prod le 30 mai au matin :
- Aucun alert si l'app crash
- Aucun monitoring du taux d'erreur
- Aucune visibilite si la commerciale Julie ne peut pas se logger un samedi

**Action minimum V1** : meme sans Grafana, installer **un cron simple `curl /api/health` toutes les 5 min + envoi mail si fail**. Ca prend 30 minutes et evite de decouvrir un downtime via Florian.

### 3.4. Pas de support utilisateur defini

Quand Julie a un bug a 14h le mardi 2 juin, elle appelle qui ?
- Florian ? (lui repond au cabinet, mais il sait quoi du bug ?)
- Dimitry direct ? (par quel canal ? mail ? whatsapp ?)
- Personne ? (elle laisse tomber → churn)

**Action** : decider et documenter le canal de support (WhatsApp Dimitry direct ? email a Florian qui forward ?) AVANT le 29 mai.

### 3.5. Pas de RGPD operationnel

Le CGU mentionne droit d'acces, rectification, anonymisation. Mais **aucun endpoint backend implemente**.

Si Marie (cliente) ecrit "donnez-moi mes donnees" le 5 juin :
- Pas de moyen automatique d'extraire
- Solution manuelle = Dimitry fait un dump Postgres a la main
- Risque : retard >1 mois = plainte CNIL

**Action minimum V1** : 1 script CLI `node bin/rgpd-export.js --clientId=xxx --tenantId=yyy > export.json` qui dump les donnees Client + Process + Devis + Documents. Pas d'UI, juste un script. 1h de dev.

---

## 4. Trajectoire si on ne corrige rien

**Scenario optimiste (probabilite 40%)** : on livre vendredi 29 mai, Julie utilise l'outil, pas d'incident, Florian content. On itere en V1.1.

**Scenario realiste (probabilite 40%)** : on livre samedi 30 mai apres bug fixing. Julie commence lundi 1er juin. 2-3 bugs reportes la 1ere semaine, on les fix. Pas de fuite donnee.

**Scenario pessimiste (probabilite 15%)** : retard 1-2 semaines. Florian patient car il a confiance. Mais demarre la pression a partir du 15 juin.

**Scenario catastrophe (probabilite 5%)** : incident securite la 1ere semaine (cle JWT leaked, ou bug d'isolation tenant), Florian retire la confiance, projet en pause indefinie.

**Action** : pour minimiser les scenarios pessimiste / catastrophe :
1. Faire le DPA (1h) + DPIA simplifiée (2h) cette semaine = -5% catastrophe
2. Faire monitoring cron health-check + alert mail (30 min) = -3% pessimiste
3. Faire script export RGPD (1h) = -2% catastrophe
4. **Decaler la prod a lundi 1er juin** (au lieu de vendredi 29 mai apres-midi) si on n'est pas pret jeudi soir = -10% pessimiste
5. Communiquer a Florian la marge incertaine (envoyer doc agile + recevoir validation ecrite) = -5% pessimiste

**Effort additionnel : ~5h** pour reduire le risque de 25%. Bon ROI.

---

## 5. Recommandations methodologiques pour la suite

### 5.1. Avant le sprint final

1. **Envoyer le doc agile a Florian** pour validation ecrite explicite (avant mercredi soir)
2. **Faire un pre-mortem** (30 min) : imaginer "on est le 7 juin et le projet est mort, quelle est la cause ?" — lister 5 causes plausibles et chacune a une mitigation
3. **Tester un restore Postgres** depuis un backup avant la prod (sanity check)
4. **Decider du canal de support** utilisateur

### 5.2. Pendant le sprint final

1. **Commit toutes les 1-2h** avec messages explicites
2. **Garder un journal d'execution** (`docs/operations/journal-sprint-final.md`) avec les bugs decouverts + decisions prises sur le tas
3. **NE PAS skip les tests** meme sous pression — un test rouge = un fail latent en prod
4. **Si on est en retard mercredi soir : decaler a lundi 1er** au lieu de bourrer jusqu'a vendredi 23h

### 5.3. Post sprint final (premiere semaine en prod)

1. **Retro formelle vendredi 5 juin** avec Florian + Dimitry + idealement Julie
2. **Lister les vrais bugs vs derives planning**
3. **Reestimer les V1.1** en story points (pas heures)
4. **Decider du go V2 ou consolidation V1.1**

### 5.4. Reglages methodologiques permanents

1. **Story Points Fibonacci** plutot que heures pour les estimations (calibrage progressif)
2. **Definition of Done verifiable** par check-list automatique (CI green + smoke prod + screenshot demo)
3. **Backlog grooming hebdomadaire** (30 min lundi matin)
4. **Demo formelle a Florian** chaque vendredi avec screenshare 15 min

---

## 6. Recommandation au user (Dimitry)

> Tu avais raison de poser la question. La methode agile qu'on a posee mardi est **honnete sur la trajectoire actuelle** mais elle ne corrige pas tout. Les 5 vrais risques :

1. **Pas de validation ecrite Florian** → envoyer le doc cette semaine
2. **Pas de DPIA + DPA** → 3h cette semaine pour eviter litige RGPD
3. **Estimation effort optimiste** → assumer que vendredi peut etre lundi
4. **Pas de monitoring V1** → 30 min de cron + mail
5. **Pas de plan B technique** → 1h de runbook documente

Total = **5-6h de travail** pour reduire les risques de 25% sans impacter la deadline. **Tres bon ROI**.

Le sprint final V1 peut se faire avec ces 5h en plus. Ce qu'on **ne peut pas** se permettre, c'est de les ignorer parce qu'on est presse.

---

*Auto-critique cree le 2026-05-26. A maj avec les rapports fact-check et compliance peer review une fois recus.*
