# ADR-0004 — Multi-praticien reporte en V1 (1 chirurgien / tenant au MVP)

**Date** : 22 avril 2026
**Statut** : Accepte

---

## Contexte

Le CDCT v1.5 §4 liste 19 tables dont aucune ne modelise explicitement un "praticien" distinct de `User`. Le seed `donnees-configuration-seed.md` §6 recense pourtant 8 praticiens pour le cabinet Delobaux (1 chirurgien principal + 3 remplacants + 4 praticiennes soins).

La feature **F47** (CDCF §8.2) "Multi-praticien + gestion fine des roles" est marquee V1.

L'utilisateur a confirme pendant l'INT : "pas des le depart mais en v1 oui il faudra permettre d'ajouter des chir".

---

## Decision

**Au MVP, un tenant = un chirurgien.**

Le role CHIRURGIEN est porte par un `User` avec `role = CHIRURGIEN`. Si plusieurs `User` ont ce role dans un tenant, tous ont acces a l'agenda et peuvent cocher des interventions — sans distinction dans les tables metier.

**En V1**, une nouvelle table `Practitioner` (ou un champ `practitionerId` sur les tables pertinentes) sera ajoutee. Pas de preparation au MVP pour eviter la sur-ingenierie (Mantra IA-16).

---

## Raisonnement

1. **YAGNI** : la demo du 24 avril concerne un seul cabinet avec un chirurgien principal (Dr Delobaux). Prevoir le multi-praticien au MVP ralentit sans apporter de valeur pour la demo.
2. **Schema evolution facile** : ajouter une table `Practitioner` en V1 et une FK nullable `practitionerId` sur `Process`, `DevisIntervention`, etc. est une migration non-breaking.
3. **Role CHIRURGIEN suffit** : toutes les actions du chirurgien (consultation, devis tech, cocher isDone) passent par `req.user.role === 'CHIRURGIEN'`. Pas besoin de distinguer les chirurgiens entre eux au MVP.

---

## Consequences

### Positives
- Schema plus simple au MVP (19 tables vs ~22)
- Routes plus simples (pas besoin de filtrer par practitionerId)
- Seed plus leger

### Negatives
- Migration V1 touchera plusieurs tables (`Process`, `DevisIntervention`, `Devis`, potentiellement `Intervention`)
- Les donnees MVP n'auront pas de `practitionerId` — il faudra un backfill au default chirurgien du tenant

### Mitigation de la dette

Pour limiter la casse V1 :
- Les routes d'agenda (`GET /api/agenda`) renvoient des events sans filtrage par praticien au MVP. En V1, on ajoutera un `?practitionerId=` optionnel.
- Les devis listent le "chirurgien" comme champ texte dans le PDF (au lieu d'une FK). En V1, le champ devient une FK avec resolution.

---

## Ce qui est **explicitement non fait** au MVP

- Table `Practitioner`
- Champ `practitionerId` sur `Process`, `DevisIntervention`
- Gestion des remplacants
- Agenda par praticien
- Calcul de CA par praticien
- Primes par praticien (ceci est un sujet paye distinct, cf. seed §8)

---

## Alternatives rejetees

- **Preparer le schema V1 des le MVP** (table `Practitioner` vide + FK nullable) : ajoute de la complexite sans benefice pour la demo. Viole Mantra IA-16 (ne pas anticiper des features non demandees).

---

*Reference : CDCF v2.0 F47, donnees-configuration-seed.md §6. INT utilisateur Q4.*
