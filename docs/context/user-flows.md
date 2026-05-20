# Parcours utilisateurs — Synthese

> 8 parcours documentes. Versions detaillees dans `files(2)/glossaire-userflows-v3.md` Annexe B.
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire le role CHIRURGIEN. Les parcours initialement portes par le chirurgien (B.2 agenda, B.6 ouverture agenda, B.3 devis technique) sont desormais executes par le COMMERCIAL. Les references "chirurgien" / "consultation chirurgicale" dans le corps du document sont des survivances de la version source — a remplacer mentalement par "praticien" (libre) ou "COMMERCIAL" selon le contexte. Reformulation complete prevue en P4 Sprint vocabulaire.

---

## Vue d'ensemble

| Parcours | Acteur | Duree moyenne | Sections CRM touchees |
|---|---|---|---|
| B.1 | Commercial | 10-15 min (appel) | Pipeline, Fiche Client, Process Panel |
| B.2 | Chirurgien | 5 min (dans CRM, consult a cote) | Agenda, Process Panel, Devis |
| B.3 | Commercial | 15-20 min (avec patient) | Process Panel, DevisBuilder |
| B.4 | Commercial | Quotidien (documents) | Process Panel, Documents |
| B.5 | Admin | 1-2h (initial) | Parametrage |
| B.6 | Chirurgien | 5-10 min / jour | Agenda, EventSheet |
| B.7 | Commercial | Ponctuel (recherche) | Fiche Client |
| B.8 | Transverse | Continu | Process Panel + fil d'Ariane |

---

## B.1 — Commercial : Nouveau contact entrant

**Trigger** : patient appelle / message / formulaire.

```
1. Creation fiche client (si inexistant) + Process
2. Ouverture Process Panel : fil d'Ariane sur "Contact"
3. Coche interventions souhaitees → CA potentiel affiche
4. Qualification (qualifie/non + raison + intensite)
5. Saisie date consultation (champ visible, obligatoire pour CONTACT → CONSULTATION)
6. Envoi lien paiement consultation (externe au CRM au MVP)
7. Patient paie → commercial bascule vers CONSULTATION via fil d'Ariane
```

**Result** : patient programme, consultation visible dans l'agenda du chirurgien.

---

## B.2 — Chirurgien : Consultation + devis technique

**Trigger** : chirurgien ouvre son agenda le matin.

```
1. Voit consultations du jour (code couleur : bleu = paye, gris = non paye)
2. Clic sur consultation → EventSheet + bouton "Ouvrir fiche process"
3. Process Panel : fil d'Ariane sur "Consultation"
4. Onglet Vue d'ensemble :
   - Voit les interventions DEJA cochees par le commercial
   - Modifie (prix, duree), ajoute, supprime selon besoin
   - PAS DE CLINIQUE a cette etape
5. Onglet Devis → creer devis technique :
   - Interventions pre-remplies
   - Frais supp auto-ajoutes (editables)
   - Pas de prix affiche au patient
6. Onglet Notes → note medicale (invisible pour commercial)
7. Transition auto → POST_CONSULT quand devis technique rempli
```

**Result** : devis technique pret, commercial peut enchainer.

---

## B.3 — Commercial : Devis commercial + closing

**Trigger** : chirurgien a termine, Process en POST_CONSULT.

```
1. Commercial ouvre Process Panel → fil d'Ariane sur "Post-consult"
2. Onglet Devis → voit le devis technique du chirurgien
3. Remplit la partie commerciale, par intervention :
   - Col 1 : Dropdown Clinique
   - Col 2 : Date picker
   - Col 3 : Time picker (HH:MM)
4. Au choix clinique : options catalogue contextuelles apparaissent
5. Section Sejour(s) auto :
   - Toggle Ambulatoire / Nuit(s)
   - Stepper nuits (min 1, max 30)
6. Anti-doublon : meme clinique + meme jour → badge "Frais mutualises"
7. Coche options catalogue + ajoute options a la volee
8. Prix final calcule en temps reel
9. Telechargement PDF (bouton actif)
10. Bouton "Envoyer" grise avec badge V1 (tooltip)
11. Bouton "Copier le devis complet en texte" pour envoi mail

Si acceptation :
  - Signature electronique simulee
  - Lien acompte (action manuelle MVP)
  - Fil d'Ariane → CONFIRMEE

Si hesitation :
  - Sortie "Follow-up" → dialog raison obligatoire
  - Sequences relances programmees en V1
```

**Result** : patient close avec date d'op, ou en follow-up.

---

## B.4 — Commercial : Post-confirmation (docs + solde)

**Trigger** : Process en CONFIRMEE, acompte paye.

```
1. Process Panel → fil d'Ariane sur "Confirmee"
2. Vue d'ensemble : badge documents X/Y visible (ex : 3/6)
3. Onglet Documents : checklist auto-remplie depuis les labels des interventions
4. Upload fichier sur chaque ligne, avance statut EN_ATTENTE → RECU → VALIDE
5. Prevue/telechargement depuis le Process Panel
6. Preview Agent IA grisee en bas (interactive, reponses mock)
7. Tous docs recus + dates fixees → fil d'Ariane → OP_PROGRAMMEE
8. Vue d'ensemble : barre progression paiement affichee
9. Warning visuel si J-X < 15 et solde < 100%
10. Chirurgien coche interventions effectuees (agenda)
11. Toutes cochees + solde 100% → archivage auto → EFFECTUEE
```

**Result** : operation effectuee ou annulee, pipeline propre.

---

## B.5 — Admin : Parametrage initial

**Trigger** : installation CRM pour un nouveau cabinet.

```
1. Connexion sous-domaine cabinet (login en ADMIN)
   → Sidebar affiche le module Parametrage (seul role qui le voit)

2. Onglet Cliniques :
   - Creer chaque clinique (nom, adresse, telephone)
   - Grille tarifaire par tranche horaire
   - Frais ambulatoire + hospitalisation par nuit
   - Options catalogue par clinique (VASER, chambre VIP, etc.)

3. Onglet Interventions :
   - CRUD du catalogue
   - Sous-section "Frais supplementaires" par intervention
   - Sous-section "Documents a demander" :
     • Choisir un document label existant
     • OU creer un nouveau label a la volee

4. Onglet Document Labels (global) :
   - Vue d'ensemble CRUD de tous les labels

5. Verification multi-roles :
   - Switch COMMERCIAL → Parametrage disparait
   - (Le switch CHIRURGIEN du repo source n'existe plus — ADR-0002)
   - Retour ADMIN → reapparait

6. Donnees seed de test (8 process fictifs)
```

**Result** : CRM pret a etre utilise par commercial et chirurgien.
**Duree** : 1-2h pour un parametrage initial complet.

---

## B.6 — Chirurgien : Utilisation agenda

**Trigger** : chirurgien ouvre l'agenda en debut de journee.

```
1. Vue Semaine par defaut, events derives de :
   - Process.consultationDate (consultations)
   - DevisStay.date (operations)
2. Code couleur instantane :
   - Bleu : consult payee
   - Gris : consult non payee
   - Rouge : op sans acompte
   - Amber : op solde partiel (J-X)
   - Emerald : op solde 100% prete
   - Grise barree : op effectuee
3. Clic event → EventSheet 480px slide-in :
   - Patient + date + clinique + mode hospit
   - Interventions du sejour (ordonnees par timeIntervention v2.0)
   - Etat paiement + docs X/Y
   - Boutons Copier
4. Apres op : retour agenda, coche interventions effectuees
5. Pour op fractionnee : ne cocher que ce qui est fait ce jour
6. Toutes cochees + solde 100% → archivage auto, event grise barre
7. Reprogrammation : drag event ou date picker dans EventSheet
   → Cascade sur consultationDate ou DevisStay.date
```

**Result** : chirurgien n'ouvre rarement la pipeline. L'agenda suffit.
**Duree quotidienne dans l'agenda** : 5-10 min.

---

## B.7 — Commercial : Consulter une Fiche Client

**Trigger** : recherche historique d'un patient recurrent.

```
1. /clients → liste + recherche par nom / telephone
2. Clic "Ouvrir" → navigation /clients/[id]
3. Page Fiche Client dediee :
   - Header : avatar + nom + infos copiables + CA total
   - 3 stats : process actifs, devis signes, intensite moyenne
   - Zone principale : historique chronologique des process
     • Chaque ligne cliquable = ouvre Process Panel
   - Colonne droite : panneau devis
     • Signes (badge vert) / Non signes (badge gris)
     • Clic → ouvre le devis
4. Actions possibles :
   - Relancer sur devis non signe
   - Ouvrir process specifique
   - Creer nouveau process (meme fiche, nouveau parcours)
```

**Result** : vision 360 d'un patient en une page.

---

## B.8 — Transverse : Fil d'Ariane process

**Contexte** : a tout moment, l'ouverture d'un Process Panel montre le fil d'Ariane en header.

```
Fil d'Ariane 5 etapes :
  Contact → Consultation → Post-consult → Confirmee → Op programmee
  • Passee : cercle emerald + Check, label normal
  • Active : cercle accent violet + shadow, label bold
  • Future : cercle gris outline, label gris

Sous la ligne de base, 2 sorties :
  • Follow-up (amber, icone Clock)
  • Non qualifie (rouge, icone XCircle)

Interactions :
  - Clic etape future → deplacement direct du process
    • Si transition valide : deplacement immediat
    • Si invalide : dialog explicite (ex : docs manquants) + bouton "Forcer"
  - Clic sortie Follow-up → dialog raison obligatoire
  - Clic sortie Non qualifie → dialog raison obligatoire

Sous le fil d'Ariane, bandeau contextuel colore indique l'action prioritaire :
  - Contact : "Cochez les interventions et qualifiez"
  - Consultation : "Le chirurgien examine et remplit le devis technique"
  - Post-consult : "Creez un devis commercial avec clinique et dates"
  - Confirmee : "Collectez les documents pre-operatoires"
  - Op programmee : "Suivez le paiement du solde avant l'operation"

Onglet prioritaire marque d'un point accent selon stage :
  - Contact → Vue d'ensemble
  - Consultation → Notes (chir) / Vue (comm)
  - Post-consult → Devis
  - Confirmee → Documents
  - Op programmee → Vue d'ensemble (barre paiement)
```

**Result** : l'utilisateur sait ou il en est et quoi faire ensuite.

---

## Synthese des droits transverses

Rappel des droits (source : CDCF §11, CDCT §8.2, MVP §8.3).

| Action | Commercial | Chirurgien | Admin |
|---|---|---|---|
| Creer fiche client | Principal | — | — |
| Ouvrir fiche client dediee | Oui | Oui | — |
| Creer Process | Principal | — | — |
| Cocher interventions (Contact) | Principal | — | — |
| Modifier interventions devis tech (Consult) | — | Oui | — |
| Saisir date consultation | Principal | — | — |
| Note commerciale | Ecriture | Invisible | — |
| Note medicale | Lecture | Ecriture | — |
| Devis technique (+ frais supp) | — | Principal | — |
| Devis commercial (clinique + date + heure + sejour + options) | Principal | — | — |
| Cliquer etape fil d'Ariane | Principal | — | — |
| Gerer documents pre-op | Principal | Visible | — |
| Prev / telecharger document | Oui | Oui | — |
| Utiliser "Envoyer" (V1) | Principal | — | — |
| Consulter agenda | Secondaire | Principal | — |
| Cocher intervention effectuee (agenda) | — | Oui | — |
| Reprogrammer op (drag agenda) | — | Oui | — |
| Barre progression paiement | Oui | Visible | — |
| Dashboard | Oui | Oui | — |
| Acces Parametrage (sidebar) | — | — | Exclusif |
| CRUD cliniques + interventions + doc labels + frais supp | — | — | Oui |
| Boutons Copier | Oui | Oui | Oui |

---

*Reference : files(2)/glossaire-userflows-v3.md Annexe B. Derniere mise a jour : 22 avril 2026.*
