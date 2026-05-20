# ADR-0003 — Pas de bascule HDS immediate : mitigation par CGU + securite + Scaleway non-HDS

**Date** : 2026-05-20
**Statut** : Accepte
**Decideur** : Dimitry (dev) + Florian (product owner)

---

## Contexte

Apres l'application de l'ADR-0002 (retrait CHIRURGIEN + noteMedecin) et P1-P5 (purge des donnees structurelles de sante), une question reste ouverte :

> Le simple fait qu'un client identifie (`Client.firstName, lastName, phone, email`) soit lie a une intervention specifique de la table `Intervention` (ex. "Liposuccion 360", "BBL", "Rhinoplastie") via `ProcessIntervention` ou `DevisIntervention` est-il une donnee de sante au sens Art. 9 RGPD ?

### Sources juridiques consultees

| Niveau | Source | Position |
|--------|--------|----------|
| CLAIM L1 | [RGPD Considerant 35](https://eur-lex.europa.eu/eli/reg/2016/679/oj) | Donnees de sante = "l'ensemble des donnees [...] qui revelent des informations sur l'etat de sante physique ou mentale passe, present **ou futur** de la personne concernee" |
| CLAIM L1 | [CJUE C-184/20, 01.08.2022](https://curia.europa.eu/juris/document/document.jsf?docid=263721) | Interpretation large : tout ce qui permet de **deduire** indirectement l'etat de sante est une donnee de sante |
| CLAIM L2 | Positions de la CNIL (FAQ + ateliers) | Le fait qu'une personne identifiee envisage une intervention chirurgicale specifique est generalement considere comme une donnee de sante |

### Risque identifie

Une lecture stricte du RGPD + position CJUE expose le repo a une qualification HDS :
- Table `Client` (PII : nom, prenom, telephone, email, ville)
- Table `Intervention` (catalogue : "Liposuccion 360", "Rhinoplastie", "Abdominoplastie", etc.)
- Jointure `ProcessIntervention` : revele qu'un client identifie a un projet chirurgical specifique futur
- `DevisIntervention`, `DevisStay` : confirment la date prevue de l'acte
- `ProcessDocument` : meme administratif, le contexte (carte d'identite stockee dans le dossier d'une lipo) trahit le motif medical

## Decision

**Pas de bascule HDS immediate.** Le projet reste sur un hebergement Scaleway non-HDS. La mitigation se fait par 3 mecaniques cumulatives :

1. **CGU renforcees + consentement explicite (Art. 9.2.a RGPD)** — voir clause Art. X + Art. Y dans `docs/legal/CGU-clause-HDS-non-medical.md`. Le client signe et coche une clause qui :
   - Reconnait que le service rendu par le cabinet (chirurgie esthetique) **n'est pas une prestation medicale au sens HDS** (acte de bien-etre, pas de finalite therapeutique)
   - Consent expressement (Art. 9.2.a) au traitement des donnees relatives a la prestation envisagee dans un CRM **commercial** non-HDS
   - Reconnait que le CRM ne stocke aucune donnee medicale au sens strict (anamnese, examen clinique, ordonnance, CRO, etc.) — ces donnees restent dans le dossier patient du praticien (hors-CRM)

2. **Securite renforcee** (cf. §5 ci-dessous)

3. **Hebergement Scaleway non-HDS** : VPS dedies en France, isolation reseau, chiffrement at rest, sauvegardes chiffrees.

## Risque residuel assume

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Audit CNIL qualifiant le repo HDS | Faible-Moyen | Eleve (amende + bascule HDS forcee) | CGU + consentement + audit logs |
| Action client (Art. 80 RGPD) suite a fuite | Faible | Eleve | Securite renforcee + audit logs |
| Compromission du serveur Scaleway | Moyen | Eleve (mais ratio risque commercial vs HDS) | Hardening + monitoring + backups chiffres |
| Reformulation de la position CJUE par la CNIL | Faible | Moyen | Veille juridique + reactivite (bascule HDS si oblig) |

**Florian accepte ces risques** dans le cadre de la phase MVP / V1. La bascule HDS sera evaluee a chaque revue strategique (trimestre).

## Strategie de defense en cas d'audit

Argumentaire prepare :
1. **Le CRM ne stocke aucune donnee de sante au sens medical strict** (pas d'anamnese, pas d'examen clinique, pas d'ordonnance, pas de CRO, pas de photo medicale, pas de prescription) — ces donnees restent dans le dossier patient du praticien tenu hors-CRM.
2. **Le lien client ↔ catalogue d'interventions** est une **demarche commerciale** (devis pour un service) et non un **dossier medical**. Le consentement Art. 9.2.a a ete donne explicitement.
3. **Aucune donnee n'est partagee avec un tiers** sans consentement.
4. **Le titulaire du dossier medical est et reste le praticien** ; le CRM ne se substitue pas a son obligation HDS.
5. **CGU explicites** signees par le client a l'onboarding.
6. **Audit logs disponibles** + retention legale 5 ans.

Cet argumentaire reste a faire valider par un juriste avant V1. Voir P5+ TODO.

## Consequences pratiques

### Schema / code

Aucun changement structurel par rapport a l'etat post-P5. Le modele actuel (Client + Intervention + ProcessIntervention) reste tel quel. Les renames vocabulaire commercial deja appliques (consultationDate → dateRendezVous, etc.) demeurent.

### CGU

Le fichier `docs/legal/CGU-clause-HDS-non-medical.md` est etendu par un nouvel article (Art. Y) capturant la decision ADR-0003 (consentement commercial explicite). Voir le fichier maj.

### Securite renforcee (a implementer en V1 — cf. §5)

| # | Mesure | Statut | Priorite |
|---|--------|--------|----------|
| S1 | TLS 1.3 obligatoire + HSTS preload | A faire | P0 |
| S2 | Chiffrement at rest (Postgres TDE ou pgcrypto sur colonnes sensibles) | A faire | P0 |
| S3 | Authentification renforcee : 2FA obligatoire pour ADMIN, optionnel COMMERCIAL | A faire | P1 |
| S4 | Audit logs immutables (chaque acces a un Process + chaque mutation devis/document) | A faire | P0 |
| S5 | Retention sessions JWT : 8h max + refresh token | A faire | P1 |
| S6 | Rate limiting par IP + par compte | Deja fait (cf. ADR-0005 §SEC-04 / SEC-05) | OK |
| S7 | Helmet + CSP stricte + X-Frame-Options | Deja fait | OK |
| S8 | Backup quotidien chiffre + retention 30j + tests de restauration mensuels | A faire | P0 |
| S9 | Scan vulnerabilites dependances (npm audit + Dependabot) | A faire | P1 |
| S10 | Pentest externe avant V1 prod | A faire | P0 avant prod |
| S11 | DPO / registre des traitements RGPD | A faire | P0 avant prod (responsabilite Florian) |
| S12 | Process de notification d'une violation < 72h (Art. 33) | A faire | P0 avant prod |
| S13 | RGPD : droit d'acces / portabilite / suppression — endpoints API dedies | A faire | P1 |

### Scaleway non-HDS — config recommandee

- VPS dedies (pas mutualise) en region Paris (FR-PAR-2)
- Postgres en mode "managed" Scaleway ou self-hosted avec replication
- Sauvegardes chiffrees vers S3 Scaleway (Object Storage) avec lifecycle policy 30j
- Pas de logs verbeux contenant des donnees client (sanitize avant logging)
- Traefik avec TLS 1.3 + ciphers durcis
- Firewall : whitelist IPs admin + bloquer SSH password (cles uniquement)
- Monitoring : alertes sur acces anormaux (Grafana + Loki + alerting)

## Conditions de re-evaluation (bascule HDS)

L'ADR-0003 sera re-evaluee si l'un des evenements suivants se produit :
- Notification de la CNIL (controle, sanction, demande d'avis)
- Action en justice d'un client ou d'un tiers
- Evolution legislative (loi LPM, nouveau guide ANSSI/CNIL sur HDS)
- Changement de scope produit : ajout de fonctionnalites medicales (anamnese, CRO, ordonnance numerique...)
- Atteinte d'un seuil de clients/cabinets (ex. > 10 cabinets) qui rend le risque pas-defendable
- Demande explicite d'un cabinet client pour la HDS

A chaque revue (trimestrielle minimum), Florian + Dimitry tranchent : maintien ADR-0003 OU bascule HDS planifiee.

## References

- [RGPD texte complet](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [Guide ANSSI Hebergement Donnees de Sante (HDS)](https://www.ssi.gouv.fr/)
- [Position CNIL : Donnees concernant la sante](https://www.cnil.fr/fr/definition/donnee-concernant-la-sante)
- ADR-0002 (retrait CHIRURGIEN + noteMedecin)
- ADR-0008 (du repo source crm-chirurgien) — fork commercial vs HDS
- `docs/legal/CGU-clause-HDS-non-medical.md` (etendu Art. Y)
