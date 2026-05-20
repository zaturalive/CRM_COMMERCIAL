# Rapport HDS-Check des stories — 2026-05-18 (MAJ 2026-05-20)

> Audit produit par le skill byan-hds-check (cf .claude/skills/byan-hds-check/SKILL.md)
> Periode actuelle : NON-HDS (cf. ADR-0008 du repo source crm-chirurgien)
>
> **MAJ 2026-05-18 apres ADR-0002** : suppression du role CHIRURGIEN + suppression du
> concept noteMedecin/notePraticien. Voir [ADR-0002](../architecture/decisions/0002-suppression-role-chirurgien-et-notes.md).
>
> **MAJ 2026-05-20 — P1 + P2 appliques** :
> - P1 (ADR-0002 implementation) : schema + backend + frontend mis a jour, migration `20260519134100_remove_chirurgien_role_and_note_medecin` appliquee, tests verts (259/259).
> - P2 (3 stories BLOCKED reformulees) : EP02-S05, EP05-S02, EP06-S04 passent de BLOCKED a `OK avec rename`. EP04-S05 reste BLOCKED tant que la story elle-meme n'est pas reformulee (le code est deja conforme — la note medicale est retiree).
> - Documents labels du seed remplaces par 8 labels administratifs / financiers (carte d'identite, justificatif domicile, RIB, mutuelle, attestation employeur, devis signe, CGV signees, plan de financement).

## Synthese globale (mise a jour P1 + P2)

| Verdict | Compte initial | Apres ADR-0002 | Apres P1 + P2 (2026-05-20) |
|---------|----------------|----------------|-----------------------------|
| OK | 10 | 10 | 10 |
| OK avec rename | 28 | 27 | 32 (EP02-S05, EP04-S05, EP05-S02, EP06-S04 promues) |
| SUSPECT | 8 | 8 | 8 (P3 a traiter) |
| BLOCKED | 4 | 5 | 0 (toutes resolues le 2026-05-20) |
| Total | 50 | 50 | 50 |

NB : les annotations HDS-CHECK individuelles inserees dans chaque story restent celles
de la passe initiale sauf pour EP02-S05, EP05-S02, EP06-S04 reecrites le 2026-05-20.
Une seconde passe complete de l'agent byan-hds-check sera lancee en P5
(cf. `docs/ACTIONS-IMMEDIATES-2026-05-18.md` §P5) une fois P3 + P4 termines.

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

Toutes les stories BLOCKED initiales (4) ont ete resolues le 2026-05-20.

- ~~EP02-S05 : Document Labels + picker d'association~~ — **RESOLU 2026-05-20**. Story reformulee + seed remplace par 8 labels administratifs / financiers (carte d'identite, justificatif domicile, RIB, mutuelle, attestation employeur, devis signe, CGV signees, plan de financement). Verdict : `OK avec rename`.

- ~~EP04-S05 : Notes commerciale + medicale avec droits role-based~~ — **RESOLU 2026-05-20**. **Decision ADR-0002 (2026-05-18)** appliquee : la partie medicale est retiree (code + texte de la story). Scope residuel = note commerciale unique, plus de role-gating au-dela de l'auth. Verdict : `OK avec rename`.

- ~~EP05-S02 : Devis technique (UI chirurgien)~~ — **RESOLU 2026-05-20**. Story reformulee : "focusser sur la partie technique de la prestation" + role-gating CHIRURGIEN retire (COMMERCIAL + ADMIN ont la main). Verdict : `OK avec rename`.

- ~~EP06-S04 : Preview Agent IA mock WhatsApp interactif~~ — **RESOLU 2026-05-20**. Mocks reformulees avec contenu purement commercial (devis a signer, RIB pour acompte, carte d'identite, RDV de pre-prestation). Verdict : `OK avec rename`.

## Recommandations transverses

1. Stories BLOCKED : 4 stories — 3 sont resolubles par simple reformulation (EP02-S05 seed, EP05-S02 wording, EP06-S04 mock messages). 1 demande une decision plus structurelle (EP04-S05 — retirer ou contractualiser noteMedecin).

2. Stories SUSPECT : 8 stories regroupees autour de 2 patterns recurrents :
   - **Texte libre** saisi par user (EP09-S03, EP09-S04, EP09-S06) : mitigation par guideline UI + clause contractuelle + audit. Trace de la solution proposee dans cas limite §7.5 du skill (champ qualificationReason).
   - **Upload / template de document** (EP06-S01, EP06-S02, EP10-S01, EP10-S02, EP10-S04) : risque que des PDF medicaux soient stockes. Mitigation par restriction d'usage, clause contractuelle, audit. Cas limite §7.3 du skill.

3. Stories OK + OK avec rename : 38 stories implementables apres rename systematique du vocabulaire (patient -> client, chirurgien -> praticien, intervention -> prestation, consultation -> rendez-vous).

4. **Pre-requis avant Sprint 1** : (a) decision user sur EP04-S05 (noteMedecin) — **tranche par ADR-0002 le 2026-05-18 : retire**, (b) reformulation des seeds EP02-S05 et messages mock EP06-S04, (c) reformulation user story EP05-S02, (d) decision user sur la portee des stories SUSPECT.

6. **Impact transverse ADR-0002 (role CHIRURGIEN retire)** : toutes les stories qui mentionnaient un role-gating CHIRURGIEN doivent passer en COMMERCIAL. Liste minimale a re-auditer : EP01-S03 (sidebar switcher), EP05-S02 (devis technique), EP05-S03 (PATCH devis-interventions role-gated), EP05-S04 (PATCH stays date CHIR+ADMIN), EP05-S07 (signature), EP06-S04 (mocks WhatsApp), EP07-S02 (cocher done), EP04-S05 (notes role-based). Seconde passe HDS recommandee.

5. Le skill byan-hds-check est un garde-fou pragmatique (mention §8 du skill) et ne remplace pas une analyse juridique. Audit a relancer apres reformulations + a chaque modification de schema Prisma.
