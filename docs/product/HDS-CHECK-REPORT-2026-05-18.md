# Rapport HDS-Check des stories — 2026-05-18

> Audit produit par le skill byan-hds-check (cf .claude/skills/byan-hds-check/SKILL.md)
> Periode actuelle : NON-HDS (cf. ADR-0008 du repo source crm-chirurgien)
>
> **MAJ 2026-05-18 apres ADR-0002** : suppression du role CHIRURGIEN + suppression du
> concept noteMedecin/notePraticien. Les annotations "rename chirurgien -> praticien"
> dans la version initiale du rapport sont **obsoletes** — il faut lire desormais
> "retirer la reference au role CHIRURGIEN, le COMMERCIAL fait l'action". Voir
> [ADR-0002](../architecture/decisions/0002-suppression-role-chirurgien-et-notes.md)
> pour le detail.

## Synthese globale (mise a jour ADR-0002)

| Verdict | Compte initial | Compte apres ADR-0002 |
|---------|----------------|----------------------|
| OK | 10 | 10 (inchange) |
| OK avec rename | 28 | 27 — la mention "chirurgien -> praticien" devient "retrait reference role CHIRURGIEN" |
| SUSPECT | 8 | 8 (inchange) |
| BLOCKED | 4 | 5 — EP04-S05 reste BLOCKED mais voit sa partie noteMedecin retiree de la story (au lieu d'une simple reformulation contractuelle) |
| Total | 50 | 50 |

NB : les annotations HDS-CHECK individuelles inserees dans chaque story restent celles
de la passe initiale. Une seconde passe de l'agent byan-hds-check sera lancee par la
prochaine instance Claude pour repasser sur chaque story avec les nouvelles regles
ADR-0002. Voir `docs/ACTIONS-IMMEDIATES-2026-05-18.md` §3.

## Stories OK

- EP01-S01 : Multi-tenant + authentification JWT
- EP01-S02 : Design system liquid glass + CSS vars
- EP03-S03 : Panneau devis dans la fiche client
- EP06-S03 : Badge documents X/Y + integration vue d'ensemble
- EP07-S03 : Barre progression paiement (stage Op programmee)
- EP09-S01 : Schema follow-up sub-pipeline
- EP09-S07 : Retrait section parallele FOLLOWUP du pipeline + lien vers /follow-up
- EP11-S01 : Schema TrackingEvent + endpoint stub
- EP12-S01 : Pipeline DnD optimistic update
- EP12-S03 : DocumentsTab optimistic mutations (no full reload)

## Stories OK avec rename (patient -> client, intervention chirurgicale -> prestation, chirurgien -> praticien, consultation -> rendez-vous, etc.)

- EP01-S03 : Sidebar role-aware + switcher demo — mots a renommer : chirurgien
- EP01-S04 : CopyButton transversal — mots a renommer : patient, intervention
- EP02-S01 : CRUD Cliniques + grille tarifaire — mots a renommer : verifier que anesthesie reste strictement frais logistique
- EP02-S02 : CRUD Options clinique catalogue — mots a renommer : patient
- EP02-S03 : CRUD Interventions catalogue — mots a renommer : intervention, intervention chirurgicale, chirurgical, patient ; categories CHIRURGIE/MED_ESTH/SOIN a renommer en libelles commerciaux
- EP02-S04 : CRUD Frais supp par intervention — mots a renommer : intervention
- EP03-S01 : CRUD Fiche Client + liste + recherche — mots a renommer : patient (residuel dans le corps)
- EP03-S02 : Page Fiche Client dediee — mots a renommer : chirurgien, intervention ; clarifier le champ "intensite" en intensite commerciale
- EP04-S01 : Pipeline 5 colonnes avec CA par colonne — mots a renommer : patient, consultation, Op programmee
- EP04-S02 : Sections paralleles Non qualifie + Follow-up — mots a renommer : patient
- EP04-S03 : ProcessCard + badges — mots a renommer : patient, consultation, intervention
- EP04-S04 : Process Panel 720px + fil d'Ariane + sorties secondaires — mots a renommer : patient, chir/chirurgien, consultation ; tab Notes a traiter via EP04-S05
- EP04-S06 : Archivage automatique des process effectues — mots a renommer : intervention
- EP05-S01 : Devis + DevisIntervention + snapshot a la creation — mots a renommer : chirurgien, intervention
- EP05-S03 : Devis commercial (3 cols clinique/date/heure) — mots a renommer : intervention
- EP05-S04 : Sejours + mode hospitalisation + reconcileStays — mots a renommer : intervention (hospitalisation et ambulatoire restent en contexte logistique)
- EP05-S05 : Options contextuelles clinique + anti-doublon — mots a renommer : intervention
- EP05-S06 : Options a la volee + calcul temps reel — mots a renommer : intervention, chirurgien
- EP05-S07 : PDF Puppeteer + Copier texte + Envoyer grise + signature simulee — mots a renommer : patient, chirurgien, intervention
- EP07-S01 : Agenda vue projetee (consultations + operations) — mots a renommer : chirurgien, consultations, operations
- EP07-S02 : EventSheet + cocher intervention done + reprogrammation — mots a renommer : chirurgien, patient, intervention, Operation
- EP08-S01 : Dashboard 4 KPIs + chart CA — mots a renommer : patients, chirurgien, Consults
- EP08-S02 : Previsionnel operations + CA en attente Follow-up — mots a renommer : patient, intervention, operations
- EP09-S02 : Page /follow-up dediee avec kanban sub-pipeline — mots a renommer : patient, chirurgien (si lecture maintenue)
- EP09-S05 : Binding intervention -> MessageTemplate — mots a renommer : patient, intervention, mammoplastie (exemple seed a remplacer)
- EP10-S03 : UI association template <-> intervention + DocumentLabel — mots a renommer : intervention (depend des stories amont)
- EP11-S02 : Badge engagement sur fiche client + carte process — mots a renommer : patient
- EP12-S02 : DevisBuilder optimistic recompute — mots a renommer : clinique (residuel logistique)

## Stories SUSPECT (a clarifier avec user avant impl)

- EP06-S01 : Checklist documents + statuts + auto-ajout — pourquoi suspect : le hook syncProcessDocuments consomme les labels seed de EP02-S05 (medicaux). Tant que les labels ne sont pas reformules, la checklist propage la donnee Art. 9. Cf. cas limite §7.3 du skill.
- EP06-S02 : Upload + preview + telechargement documents — pourquoi suspect : cas limite §7.3 du skill, story upload generique sans filtre semantique. Risque que l'user telecharge photo avant/apres, CRO, ordonnance. Mitigation : restreindre les usages, clause contractuelle, formation user.
- EP09-S03 : Notes par etape + log de qualifications — pourquoi suspect : texte libre du commercial a chaque transition de sub-stage (cas limite §7.5 du skill, equivalent qualificationReason). Risque que le commercial saisisse "client souffre de X". Mitigation : guideline UI + clause + audit.
- EP09-S04 : Catalogue MessageTemplate (mail/video) — pourquoi suspect : le body des templates est libre. Risque que l'admin y mette du contenu medical. Exemple "Relance J+3 mammoplastie" a remplacer. Variables exposees a auditer.
- EP09-S06 : UI envoi manuel message + video — pourquoi suspect : le snapshot du body rendu (avec customizations) est persiste dans MessageSendLog. Meme risque que EP09-S03 / EP09-S04 au moment de l'envoi.
- EP10-S01 : Schema DocumentTemplate + bindings — pourquoi suspect : la story mentionne "lettres pre-op, ordonnances, formulaires" comme cibles. Le schema autorise du contenu HTML/PDF libre. A restreindre au strictement commercial.
- EP10-S02 : CRUD DocumentTemplate (parametrage) — pourquoi suspect : meme raison que EP10-S01, l'admin peut uploader un PDF medical ou ecrire un HTML medical. Liste de variables exposees a auditer (eviter d'exposer des champs medicaux).
- EP10-S04 : Envoi manuel template sur un process — pourquoi suspect : le rendu du template peut produire un PDF medical persistable via "Generer et attacher" -> ProcessDocument.fileUrl. Risque heritée des stories amont.

## Stories BLOCKED (a reformuler ou reporter en HDS)

- EP02-S05 : Document Labels + picker d'association — donnees Art. 9 detectees : Bilan sanguin, ECG, Consentement eclaire, "documents pre-operatoires" (seed §11). Action recommandee : remplacer le seed medical par des labels commerciaux uniquement (carte vitale, mutuelle, RIB, justificatif d'identite), ou reporter le seed medical en bascule HDS (ADR-0003 a venir).

- EP04-S05 : Notes commerciale + medicale avec droits role-based — donnees Art. 9 detectees : note medicale, noteMedecin, confidentiel medical. Cas canonique du skill §7.4 + exemple §9. **Decision ADR-0002 (2026-05-18)** : la partie medicale de la story est retiree purement et simplement (pas de notePraticien avec contractualisation). Le scope residuel de la story est reduit a la note commerciale (champ noteCommerciale) + retrait de la reference au role CHIRURGIEN puisque ce role est retire de la plateforme. Story implementable apres reformulation.

- EP05-S02 : Devis technique (UI chirurgien) — donnees Art. 9 detectees : la formulation "focusser sur l'acte medical" requalifie la prestation en acte medical. Action recommandee : reformuler "focusser sur la partie technique de la prestation" + renommer chirurgien -> praticien. Apres reformulation, story implementable.

- EP06-S04 : Preview Agent IA mock WhatsApp interactif — donnees Art. 9 detectees : les messages mock pre-remplis citent explicitement "bilan sanguin" et "consentement eclaire". Action recommandee : reformuler les messages mock avec un contenu purement commercial (devis a signer, RDV a confirmer, RIB a fournir, justificatif d'identite). Apres reformulation, story implementable.

## Recommandations transverses

1. Stories BLOCKED : 4 stories — 3 sont resolubles par simple reformulation (EP02-S05 seed, EP05-S02 wording, EP06-S04 mock messages). 1 demande une decision plus structurelle (EP04-S05 — retirer ou contractualiser noteMedecin).

2. Stories SUSPECT : 8 stories regroupees autour de 2 patterns recurrents :
   - **Texte libre** saisi par user (EP09-S03, EP09-S04, EP09-S06) : mitigation par guideline UI + clause contractuelle + audit. Trace de la solution proposee dans cas limite §7.5 du skill (champ qualificationReason).
   - **Upload / template de document** (EP06-S01, EP06-S02, EP10-S01, EP10-S02, EP10-S04) : risque que des PDF medicaux soient stockes. Mitigation par restriction d'usage, clause contractuelle, audit. Cas limite §7.3 du skill.

3. Stories OK + OK avec rename : 38 stories implementables apres rename systematique du vocabulaire (patient -> client, chirurgien -> praticien, intervention -> prestation, consultation -> rendez-vous).

4. **Pre-requis avant Sprint 1** : (a) decision user sur EP04-S05 (noteMedecin) — **tranche par ADR-0002 le 2026-05-18 : retire**, (b) reformulation des seeds EP02-S05 et messages mock EP06-S04, (c) reformulation user story EP05-S02, (d) decision user sur la portee des stories SUSPECT.

6. **Impact transverse ADR-0002 (role CHIRURGIEN retire)** : toutes les stories qui mentionnaient un role-gating CHIRURGIEN doivent passer en COMMERCIAL. Liste minimale a re-auditer : EP01-S03 (sidebar switcher), EP05-S02 (devis technique), EP05-S03 (PATCH devis-interventions role-gated), EP05-S04 (PATCH stays date CHIR+ADMIN), EP05-S07 (signature), EP06-S04 (mocks WhatsApp), EP07-S02 (cocher done), EP04-S05 (notes role-based). Seconde passe HDS recommandee.

5. Le skill byan-hds-check est un garde-fou pragmatique (mention §8 du skill) et ne remplace pas une analyse juridique. Audit a relancer apres reformulations + a chaque modification de schema Prisma.
