# Audit Compliance Peer Review — CRM Commercial

**Date** : 2026-05-26
**Auditeur** : bmad-compliance (agent BYAN — officier de conformite)
**Methode** : audit contre les 64 mantras BYAN + regles fact-check + hygiene securite/RGPD
**Demandeur** : Dimitry (user)
**Statut** : peer review independant

---

## 1. Verdict global : **CHANGES**

Les artefacts sont solides sur les fondamentaux :
- Zero emoji (Mantra IA-23 OK sur 12 fichiers)
- Zero secret en clair
- ADR-0001 / 0002 / 0003 coherents entre eux
- MCD / MCT / UC se referencent mutuellement
- ADR-0002 rigoureusement applique : `noteMedecin` et `CHIRURGIEN` n'apparaissent que sous forme de references "retire par ADR-0002"

**MAIS** plusieurs incoherences factuelles, claims non sourcees en domaine compliance, et un Sprint Planning sous-estime justifient des corrections **avant** la mise en prod du 29 mai.

**Aucun blocker securite strict**, mais le 1er must_fix est juridique et touche la promesse RGPD.

**Score mantras estime** : **78%** (bon mais perfectible)

---

## 2. Top 5 MUST_FIX (bloquants — ne pas avancer en prod sans correction)

### MF1 — Compliance : claims niveau LEVEL-2 minimum requis, plusieurs claims en LEVEL-5

**Probleme** : `MESSAGING-IN-APP-NON-HDS.md:18` affirme "la CNIL accepte generalement la preuve d'information loyale et exhaustive comme defense" sans source CNIL primaire. ADR-0003:21 cite "Positions de la CNIL (FAQ + ateliers)" en CLAIM L2 mais n'inclut aucune URL ni reference verifiable.

**Regle violee** : domaine `compliance` = seuil LEVEL-1 minimum (texte reglementaire). Sous le seuil = BLOCKED.

**Fix** : soit citer textuellement le Considerant 32 RGPD + Art. 7 sur l'information loyale, soit retirer l'affirmation et la requalifier `[HYPOTHESIS]` explicitement.

---

### MF2 — ADR-0003 "validation juriste TODO" mais argumentaire deja utilise

**Probleme** : ADR-0003:71 dit "Cet argumentaire reste a faire valider par un juriste avant V1. Voir P5+ TODO." Or le sprint final V1 livre vendredi 29 mai. Aucune story sprint backlog (section 8) ne mentionne cette validation. La decision "messaging exhaustif au lieu de juriste" (CGU-clause-HDS:6 "Responsable redaction juridique : Florian + juriste") **transfere le risque sur Florian** sans qu'il l'ait signe.

**Fix** : soit ajouter un item P0 "Florian acte par ecrit le risque assume" dans le sprint, soit retirer la mention "juriste" du CGU pour ne pas creer de fausse promesse.

---

### MF3 — Sprint Planning : capacite sous-estimee, marge negative probable

**Probleme** : `methodologie-agile:315` annonce "16h pour MUST" (D14 4h + D5 5h + D6 4h + D7 2h + D11 1h). Or :

- **D6** inclut provision Dedibox + reinstall Debian + hardening + Traefik + Let's Encrypt + Loki/Promtail/Grafana + backups S3 chiffres (8 sous-taches lignes 275-281). Estimer 4h pour un hardening dedibox from scratch est irrealiste pour un developpeur seul. Benchmark raisonnable : **8-12h**.
- **D5** inclut TLS local + pgcrypto sur 2 colonnes + table AuditLog + middleware Express + 2FA TOTP + Refresh JWT + RevokedToken. 5h est une sous-estimation : la 2FA TOTP setup + recovery codes seul = 3-4h.
- **D11** a "1h" pour deploy Docker + DNS + migration + seed + smoke complet est sous-evalue.

**Probable budget reel : 28-35h**, soit depassement du budget 14-18h.

**Fix** : soit reporter un MUST (D14 rebrand pourrait etre simplifie), soit **assumer un decalage a lundi 1er juin** pour la prod reelle (et laisser jeudi 28 = demo uniquement).

---

### MF4 — Incoherence ports : ADR-0001 dit 3300/4100, CDCT dit 3301/4100

**Probleme** : ADR-0001:22 "Decale en ports (3300/4100 vs 3200/4000)" mais CDCT:71 dit "Next.js, port 3301 host". L'agile:474 mentionne "Port 3300 conflit avec autofront_ai sur la machine dev : decouvert tard, fix en passant a 3301".

**Consequence** : ADR-0001 n'est plus a jour, il devrait etre amende ou un ADR-0004 (du repo commercial) doit acter le port 3301. Sinon, contradiction Mantra #34 cross-validation.

**Fix** : amender ADR-0001 OU creer ADR-0004 "port frontend 3300 -> 3301 (conflit autofront_ai)".

---

### MF5 — Incoherence hosting : Dedibox vs DEV1-L non resolved entre CDCT et methodologie agile

**Probleme** : CDCT:449 dit prod = "Scaleway DEV1-L", agile:200 dit prod = "Scaleway Dedibox EM-A116X-SSD". L'agile:339 note D2 "REVISITER car le choix se porte sur Dedibox" mais le CDCT, document reference technique cite par tous les UC, n'a pas ete mis a jour.

**Risque** : le nouveau dev qui lit le CDCT provisionne le mauvais serveur.

**Fix** : aligner CDCT §7.1 sur Dedibox ou produire ADR-0004/0005 du repo commercial qui acte le switch.

---

## 3. Top 10 SHOULD_FIX (corrigibles, non bloquants)

### SF1 — Incoherence zones a risque CGU vs Messaging

CGU-clause-HDS-non-medical.md:14 mentionne "6 zones a risque" mais la liste en montre 6, et le MCT/MCD listent aussi `qualificationReason`, `nonQualifieReason`, `followupReasonDetail` comme champs texte libre (cf MESSAGING:S6-S8).

**Coherence a retablir** : sont-ce 6 ou 9+ zones ?

### SF2 — Mesure de succes US01 non-testable

`methodologie-agile:97` US01 dit "Au moins 5 process crees + 3 devis signes pendant la 1ere semaine d'usage reel" comme mesure de succes — c'est un objectif **non-testable** a J+5 (un seul cabinet pilote, comportement utilisateur non maitrise).

**Reformuler en DoD test-driven** : "L'app permet de creer process+devis sans erreur" (testable E2E).

### SF3 — Definition of Done flou

Definition of Done (§8 methodologie-agile) point 5 : "Les tests E2E principaux passent en CI". Or methodologie-agile:472 rappelle "8 specs E2E cassees apres renames".

**DoD doit preciser** : quels tests verts sont requis (auth + smoke prod) plutot que "principaux" (flou).

### SF4 — Pentest S10 promis mais pas planifie

Checklist Securite S10 "Pentest externe avant V1 prod" est P0 mais n'apparait dans aucun sprint backlog. Soit reclassifier en P1 (post-prod), soit ajouter au sprint et accepter le decalage.

**Etat actuel** : promesse non tenable vendredi.

### SF5 — UC-03 contradiction signatoryName

UC-03 RM4 "signatoryName doit etre saisi (pas pre-rempli de force)" contredit le scenario nominal etape 4 "Champ libre Nom complet du signataire (pre-rempli avec User.firstName + lastName)".

**A trancher** : pre-rempli OK ou exigence ressaisie ?

### SF6 — UC-41 incoherence storage S3 vs filesystem local

UC-41:50 "Genere un UUID pour le filename" mais le storage S3 Scaleway (Checklist Securite:120) n'est pas mentionne dans le UC. Si MVP = filesystem local et V1.1 = Drive, alors S3 mentionne dans la checklist devrait etre soit V1, soit retire de la roadmap V1.

### SF7 — Trust But Verify : S6/S7 "deja en place" sans preuve

Mantra IA-1 "Trust But Verify" : CDCT:212 et MESSAGING:38 marquent S6/S7/S1-S5 comme "deja en place" — sans reference test/commit/PR.

**Demande de verification** : preciser commit hash ou test E2E qui le prouve.

### SF8 — Cross-validation : autoAdvanceProcesses pas dans data-model

Mantra #34 Cross-Validation : `MCT.md:91` op-30 dit "tenant.autoAdvanceProcesses == true" mais aucune trace de `autoAdvanceProcesses` dans le CDCT enums (§2.1) ni dans la mention `Tenant.settings` (CDCT:423).

**A verifier** : la colonne existe-t-elle dans data-model.md ?

### SF9 — Ockham : 4 leviers cumulatifs pour 5 cabinets / 3 mois

Mantra #37 Ockham : ADR-0003 introduit 4 leviers cumulatifs, mais en MVP V1 (5 cabinets, 3 mois) la defense "exhaustivite 27 emplacements" + audit log + chiffrement at rest + S3 chiffre + 2FA + pentest est-elle proportionnee ? Le risque CNIL sur 5 cabinets pendant 3 mois est tres faible.

**Recommandation** : prioriser au sprint final D7 + audit log + chiffrement, reporter pentest et 2FA en S+4.

### SF10 — DPA / DPIA non documente

Pour un traitement de donnees client identifiables (meme non-HDS), un **contrat de sous-traitance (DPA Art. 28 RGPD)** entre Florian (responsable) et l'editeur (sous-traitant) est obligatoire. Aucune mention dans CGU-clause, CHECKLIST, ou ADR-0003.

**A ajouter en P0 ops**.

---

## 4. Comments / observations methodologiques

- **Coherence ADR-0001 → 0002 → 0003** : excellente. Chaque ADR ulterieur cite et respecte les precedents. ADR-0002 (retrait CHIRURGIEN/noteMedecin) est rigoureusement applique dans tous les UC verifies (UC-01/03/05/30/41) et dans MCT.
- **Mantra IA-23 Zero Emoji** : verifie sur 12 fichiers (incluant tous les UC audites) — score 100%, aucun emoji.
- **Securite hygiene** : aucun secret en clair, aucun token, aucune URL hardcoded sensible. ADR-0001:24 mentionne explicitement "Sterilise des secrets prod (placeholders dans `.env.prod`)" — bonne pratique.
- **Tracabilite Story → UC → MCT → Tables** : globalement bonne (ex: US04 → UC-30 → OP-30 → Devis+DevisIntervention+DevisInterventionFee). Quelques liens casses subsistent (US10 → UC-100 → OP-100 OK ; mais US07 → UC-50/UC-53, le drag-drop ne reference pas explicitement OP-53 reconcileStays).
- **Mantra IA-16 Challenge Before Confirm** : la section "Adaptation Log" (§11) montre que les decisions ont ete challenge'es et tracees. Tres bonne pratique.

---

## 5. Recommandation finale

**Ne pas livrer vendredi 29 mai en l'etat.**

Deux options :
1. **Reduire le scope MUST** : reporter rebrand D14 a lundi 1er juin et garder demo statique pour jeudi
2. **Accepter le decalage a lundi pour la prod**

Florian doit etre averti **par ecrit** du risque (MF2).
MF1 et MF4/MF5 peuvent etre corriges dans la journee sans impact planning.

---

## 6. JSON verdict structure

```json
{
  "verdict": "changes",
  "comments": [
    "ADR-0001/0002/0003 coherents et rigoureusement appliques dans UC + MCT (zero residu noteMedecin/CHIRURGIEN dans les artefacts vivants)",
    "Zero emoji confirme sur 12 fichiers audites, Mantra IA-23 OK",
    "Aucun secret en clair, aucune URL sensible hardcoded, hygiene securite OK",
    "Tracabilite Story->UC->MCT->Tables globalement bonne (Mantra #34)",
    "Section Adaptation Log demontre une bonne application du Mantra IA-16 Challenge Before Confirm",
    "MCD a bien AuditLog/RevokedToken/cguAcceptedAt en V1 (data-model.md ll. 627-682), MCT et UC s'alignent",
    "Score mantras estime 78% (bon mais perfectible)"
  ],
  "must_fix": [
    "MF1 - MESSAGING-IN-APP-NON-HDS.md:18 et ADR-0003:21 claim CNIL sans source primaire LEVEL-1 (compliance strict, BLOCKED sinon)",
    "MF2 - ADR-0003:71 validation juriste TODO mais argumentaire de defense deja utilise ; Florian doit acter le risque par ecrit avant prod",
    "MF3 - Sprint Planning section 8 sous-estime D5/D6/D11 (16h estimees vs 28-35h realistes), deadline 29 mai non tenable sans descope",
    "MF4 - Incoherence ports 3300 (ADR-0001) vs 3301 (CDCT, methodologie-agile), aligner ou produire ADR amendement",
    "MF5 - Incoherence hosting prod Dedibox (agile) vs Scaleway DEV1-L (CDCT:449), CDCT doit etre mis a jour"
  ],
  "score_mantras_percent": 78
}
```

REVIEW peer-audit-2026-05-26 : changes — 5 must_fix, 10 should_fix, score mantras 78%

---

*Rapport bmad-compliance — 2026-05-26. Archive pour reference. Synthese du verdict structure : verdict CHANGES (corrigible non-bloquant), 5 MUST_FIX a traiter avant prod, 10 SHOULD_FIX a planifier en V1.1.*
