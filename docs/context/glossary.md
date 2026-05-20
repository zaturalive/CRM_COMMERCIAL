# Glossaire metier

> Reference rapide des termes. Le glossaire complet est dans `files(2)/glossaire-userflows-v3.md`.
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire le role CHIRURGIEN et la notion noteMedecin. Le COMMERCIAL prend le relais sur l'agenda, le devis technique et le toggle isDone des prestations. Le switcher de role ne propose plus que ADMIN / COMMERCIAL.

---

## Termes domaines

| Terme | Definition courte |
|---|---|
| **Cabinet** | Structure d'exercice = un tenant dans le CRM |
| **Clinique** | Etablissement ou se deroulent les prestations. Un praticien opere dans plusieurs cliniques |
| **Fiche Client** | Donnees pereennes du patient. Page dediee `/clients/[id]` |
| **Process** | Parcours d'un patient pour une prestation donnee. Carte dans la pipeline |
| **Pipeline** | Vue Kanban : 5 colonnes sequentielles + 2 sections paralleles |
| **Process Panel** | Panneau lateral 720px ouvert au clic sur une carte. 4 tabs (Vue / Notes / Documents / Devis) |
| **Fil d'Ariane process** | Stepper horizontal 5 etapes dans le Process Panel + 2 sorties secondaires |
| **Bandeau contextuel** | Ligne coloree sous le fil d'Ariane, message d'action prioritaire par stage |
| **Qualification** | Attribut du Process : qualifie/non qualifie + raison + intensite 1-10 |
| **Intervention** | Acte chirurgical ou esthetique specifique (abdo, lipo, botox...) |
| **Devis technique** | 1re partie remplie par le COMMERCIAL (ex-chirurgien dans le repo source) : prestations + duree + frais supp. **Pas de clinique** |
| **Devis commercial** | 2e partie remplie par le commercial : clinique + date + heure + sejour + options |
| **Heure d'intervention** | Champ `timeIntervention` sur `DevisIntervention`, HH:MM |
| **Frais supplementaire (intervention)** | Cout annexe lie a une intervention (implants, kit, consommables). Catalogue admin |
| **Sejour** | Couple unique (clinique + date) sur un devis. Porte le mode d'hospitalisation |
| **Mode hospitalisation** | Choix exclusif Ambulatoire / Nuit(s). Ambulatoire par defaut |
| **Option a la volee** | Option ajoutee directement au devis (label + prix + quantite libre) |
| **Option contextuelle clinique** | Les options catalogue proposees dependent de la clinique choisie |
| **Anti-doublon (frais clinique)** | Plusieurs interventions meme clinique + meme jour → frais mutualises, sejour unique |
| **Document label** | Etiquette de document creee en parametrage, associable a des interventions |
| **Auto-ajout documents** | Selection d'une intervention dans le devis → ProcessDocument crees depuis les labels |
| **Acompte** | Versement initial du patient. Regle Ordre des Medecins : versement effectif 15 jours apres |
| **Solde** | Montant restant apres acompte. A regler avant l'operation |
| **Badge documents X/Y** | Indicateur visuel : jaune si incomplet, vert si tous recus. Stage Confirmee |
| **Barre progression paiement** | Indicateur visuel du solde. Stage Op programmee |
| **Signature differee (V1)** | Seconde signature J+15 apres la premiere (reflexion legale). Pas au MVP |
| **Agent IA (V1)** | Secretaire virtuel WhatsApp qui collecte les documents. **Preview grisee au MVP** |
| **Preview Agent IA** | Mock WhatsApp interactif en bas de l'onglet Documents (V1 reel plus tard) |
| **Coordinateur / Commercial** | Personne en charge du suivi commercial (qualification, devis, relances) |
| **Seed** | Donnees pre-remplies pour la demo (2 cliniques, 20 interventions, 15 clients, 8 process) |
| **Multi-tenant** | Une instance, plusieurs cabinets isoles par sous-domaine |
| **Switcher de role** | Dropdown dans la sidebar footer pour basculer Admin / Commercial (demo, ADR-0002) |

---

## Enums techniques

Voir [data-model.md §3](../architecture/data-model.md) pour les valeurs exactes.

- `UserRole` — ADMIN / COMMERCIAL (ADR-0002 retire la valeur CHIRURGIEN dans le fork commercial)
- `ProcessStage` — CONTACT → CONSULTATION → POST_CONSULT → CONFIRMEE → OP_PROGRAMMEE → EFFECTUEE, + NON_QUALIFIE / FOLLOWUP / ANNULEE
- `DocumentStatus` — EN_ATTENTE / RECU / VALIDE
- `DevisStatus` — BROUILLON / TECHNIQUE_REMPLI / COMMERCIAL_REMPLI / ENVOYE / SIGNE / REFUSE
- `HospitalisationMode` — AMBULATOIRE / NUIT
- `FollowupReason` — TEMPS / ARGENT / HESITATION / AUTRE
- `SourceAcquisition` — BOUCHE_A_OREILLE / INSTAGRAM / TIKTOK / SITE_WEB / DOCTOLIB / RECOMMANDATION / AUTRE

---

## Acronymes

- **CRM** — Customer Relationship Management
- **MCD** — Modele Conceptuel de Donnees (Merise)
- **MCT** — Modele Conceptuel de Traitements (Merise)
- **CDCF** — Cahier des Charges Fonctionnel
- **CDCT** — Cahier des Charges Technique
- **MVP** — Minimum Viable Product
- **RGPD** — Reglement General sur la Protection des Donnees
- **HDS** — Hebergeur de Donnees de Sante (certification francaise)
- **ADR** — Architecture Decision Record
- **RBAC** — Role-Based Access Control
- **BBL** — Brazilian Butt Lift
- **GHM** — Groupes Homogenes de Malades (facturation CPAM)

---

## Glossaire complet

Pour le glossaire exhaustif (~ 40 termes avec definitions longues), voir :
- `files(2)/glossaire-userflows-v3.md` — Annexe A

Ce fichier-ci est un index rapide pour consultation quotidienne.

---

*Reference : files(2)/glossaire-userflows-v3.md. Derniere mise a jour : 22 avril 2026.*
