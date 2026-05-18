# ADR-0003 — DevisStay persiste en base (pas calcule front)

**Date** : 22 avril 2026
**Statut** : Accepte (contre l'intuition initiale utilisateur)

---

## Contexte

Pendant l'INT, la question Z3/Q8 a ete posee : `DevisStay` est-il une **table persistee** ou un **calcul front-only** derive des `DevisIntervention` ?

Les specs elles-memes se contredisent partiellement :
- **CDCT §4.3** liste `DevisStay` comme une table avec champs `id`, `devisId`, `cliniqueId`, `date`, `mode`, `nightCount`
- **CDCT §7.1** decrit une fonction `reconcileStays(devisId)` qui **cree** et **supprime** des `DevisStay` en BDD
- **CDCT §6.5** mentionne "pas de modification de schema necessaire au MVP — la logique d'affichage suffit" — mais cette phrase parle specifiquement de la **mutualisation des options**, pas du sejour lui-meme
- **CDCF §4.3 Agenda** : un event d'operation = un `DevisStay`. Implique que `DevisStay.date` est lu depuis la BDD par l'agenda.

L'utilisateur a initialement penche vers un calcul front-only, en arguant que le sejour tend a etre derivable des `DevisIntervention` et des dates associees. BYAN a challenge (Mantra IA-1 Trust But Verify).

---

## Decision

**`DevisStay` est persiste dans une table dediee**, comme decrit au CDCT §4.3 et §7.1.

Relations :
- `DevisStay.devisId` → `Devis`
- `DevisStay.cliniqueId` → `Clinique`
- `DevisStay.date` stocke en DATE
- `DevisStay.mode` (AMBULATOIRE | NUIT), `DevisStay.nightCount` (1-30)
- Contrainte `UNIQUE(devisId, cliniqueId, date)`

Le hook `reconcileStays(devisId)` est appele apres chaque modification d'une `DevisIntervention` qui change `cliniqueId` ou `dateIntervention` :
1. Lister les couples uniques `(cliniqueId, dateIntervention)` des DevisIntervention
2. Pour chaque couple manquant dans `DevisStay`, creer avec `mode=AMBULATOIRE, nightCount=1` par defaut
3. Pour chaque `DevisStay` existant sans couple correspondant, supprimer

---

## Raisonnement

### Pourquoi persister malgre l'intuition de calcul front

1. **Attributs propres au sejour**, pas derivables :
   - `mode` (AMBU vs NUIT) : choix commercial, pas deduit du reste
   - `nightCount` : saisi par commercial, pas calcule
   - Si on ne persiste pas, le commercial perd ces valeurs a chaque rechargement de page

2. **Agenda depend de DevisStay** :
   - `GET /api/agenda` doit retourner un event par `DevisStay.date` (CDCF §4.3)
   - Si calcul front, l'agenda devrait recalculer tous les devis de tous les tenants, chaque fois — couteux et risque

3. **Reprogrammation** :
   - `PATCH /api/devis-stays/:id/date` (CDCT §5.9) change la date d'un sejour
   - Cascade : toutes les `DevisIntervention` du sejour prennent la nouvelle date
   - Cette operation atomique est triviale avec une table dediee, complexe sans

4. **Coherence avec l'architecture** : les autres snapshots (`DevisIntervention`, `DevisInterventionFee`, `DevisOption`) sont tous persistes. La coherence du modele pousse a faire pareil pour `DevisStay`.

### Pourquoi le CDCT §6.5 n'est PAS en contradiction

La phrase "pas de modification de schema necessaire au MVP" au §6.5 parle exclusivement de l'**anti-doublon des options catalogue** (`DevisOption`), pas du sejour. Elle explique que la mutualisation des options se fait par groupage cote front/API via une cle `stayKey = cliniqueId-YYYY-MM-DD`, sans necessiter une table `DevisStayOption` intermediaire. Le sejour reste persiste.

---

## Consequences

### Positives
- Agenda performant : une seule requete sur `DevisStay` pour lister les events op
- Reprogrammation atomique via cascade sur le sejour
- Mode hospitalisation et nightCount persistes (pas de perte au refresh)

### Negatives
- Une table de plus (19 vs 18) — compensee par la simplicite de l'agenda
- Besoin d'un hook `reconcileStays()` fiable (code dans le CDCT §7.1, a transcrire directement)

---

## Question ouverte pour le user

Si malgre tout tu veux aller vers un calcul front-only, il faudra :
- Retirer la table `DevisStay` du schema Prisma
- Stocker `mode` et `nightCount` ailleurs (sur `DevisIntervention` ? sur `Devis` avec un tableau JSONB ?)
- Refactorer `GET /api/agenda` pour reconstruire les events a la volee

**Recommandation BYAN** : garder la table, faire la V1 avec, voir si ca pose probleme. YAGNI au sens inverse : pas de raison de simplifier un modele qui fonctionne dans les specs.

---

*Reference : CDCT v1.5 §4.3, §6.5, §7.1. CDCF v2.0 §4.3.*
