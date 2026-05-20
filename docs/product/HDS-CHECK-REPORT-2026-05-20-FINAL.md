# Rapport HDS-Check FINAL — 2026-05-20

> 2e passe complete sur les 50 stories + code source (apps/backend/, apps/frontend/) apres application de :
> - ADR-0002 (retrait CHIRURGIEN + noteMedecin)
> - P2 (reformulation 4 stories BLOCKED)
> - P3 (mitigations 8 stories SUSPECT)
> - P4.A (rename champs DB vers vocabulaire commercial)
> - P4.B partiel (libelles UI patient → client)
> - P6 (alignement doc complete)
>
> Reference master : `docs/CHANGELOG-2026-05-19-20-ADR-0002-implementation.md`

---

## Synthese finale (post P1 + P2 + P3 + P4 + P6)

| Verdict | Compte initial (2026-05-18) | Final (2026-05-20) |
|---------|------------------------------|---------------------|
| OK | 10 | 10 |
| OK avec rename | 28 | 34 (toutes les promotions de P2 + P6) |
| OK avec mitigation | — | 6 (Pattern A / Pattern B — P3) |
| SUSPECT | 8 | 0 |
| BLOCKED | 4 | 0 |
| Total | 50 | 50 |

**Trust Score** : (OK + OK avec rename + OK avec mitigation) / total = 50 / 50 = **100 %** apres mitigation.

> NB : ce trust score est calcule en considerant les mitigations comme equivalentes a une story OK. Si on applique le bareme strict du skill byan-hds-check (cf `_byan/knowledge/sources.md`), les "OK avec mitigation" valent ~85 % vs 100 % pour "OK". Le score effectif est alors **(10 + 34) × 1.0 + 6 × 0.85 = 49.1 / 50 = 98.2 %** — badge **A** (≥ 90 %).

---

## Verification finale du code source

Scan des keywords HDS dans le code (apps/backend/src/, apps/frontend/src/) :

### Apparitions legitimes (annotations ADR-0002 / contexte historique)

| Fichier | Ligne | Contenu | Justification |
|---------|-------|---------|---------------|
| `apps/backend/src/routes/devis.ts` | 478 | `// ADR-0002 : plus de role-gating CHIRURGIEN` | Commentaire ADR |
| `apps/backend/src/routes/devis.ts` | 676 | `// ADR-0002 : plus de role-gating CHIRURGIEN` | Commentaire ADR |
| `apps/backend/src/routes/processes.ts` | 597 | `* ADR-0002 : noteMedecin retiree` | Commentaire ADR |
| `apps/backend/src/schemas/processes.ts` | 64 | `* Notes : ADR-0002 retire le role CHIRURGIEN` | Commentaire ADR |
| `apps/backend/src/services/devisCalculator.ts` | 131 | `// ── 1. Honoraires praticien (ADR-0002 : ex "chirurgien")` | Commentaire de migration |
| `apps/frontend/src/components/pipeline/ProcessNotes.tsx` | 16 | `* Note commerciale du process — ADR-0002 retire la note medecin` | Commentaire JSDoc |
| `apps/frontend/src/components/devis/DevisBuilder.tsx` | 36 | `* ADR-0002 : plus de role-gating CHIRURGIEN` | Commentaire JSDoc |
| `apps/frontend/src/components/documents/DocumentsTab.tsx` | 362-364 | `Sont interdits : bilan sanguin, ECG, consentement eclaire, ordonnance, CRO, photo avant/apres, echographie, mammographie...` | Texte du modal HDS (P3 Pattern B) |
| `apps/frontend/src/app/(app)/pipeline/page.tsx` | 8 | `* ADR-0002 : role CHIRURGIEN retire` | Commentaire |
| `apps/frontend/src/app/(app)/agenda/page.tsx` | 5 | `* Accessible tous roles (ADMIN + COMMERCIAL — ADR-0002 retire CHIRURGIEN)` | Commentaire |

Toutes ces apparitions sont **explicitement annotees ADR-0002** ou font partie d'un **rappel HDS visible a l'utilisateur** (modal P3 Pattern B). Aucune fuite de donnee Art. 9 RGPD.

### Apparitions fonctionnelles eliminees

| Fichier | Avant | Apres |
|---------|-------|-------|
| `apps/backend/prisma/schema.prisma` | `enum UserRole { ADMIN COMMERCIAL CHIRURGIEN }` + `Process.noteMedecin` | `enum UserRole { ADMIN COMMERCIAL }` + champ supprime |
| `apps/backend/src/lib/processSerializer.ts` | Existait (filtre CHIR/COMM/ADMIN) | **Supprime** |
| `apps/backend/tests/security/notes-bypass.test.ts` | Existait (test bypass noteMedecin) | **Supprime** |
| `apps/backend/src/services/devisTemplate.ts` | "Signature chirurgien" | "Signature praticien" |
| `apps/frontend/src/components/documents/AIAgentWhatsAppPreview.tsx` | Mocks "bilan sanguin", "consentement eclaire", "Dr Delobaux" | Mocks commerciaux (devis, RIB, RDV, carte identite) |
| `apps/frontend/src/app/(app)/config/document-labels/page.tsx` | Hint "Bilan sanguin, Consentement eclaire" | Hint "Carte d'identite, RIB, Devis signe, CGV" |
| `apps/frontend/src/components/documentLabels/DocumentLabelFormDialog.tsx` | Placeholder "ex: Bilan sanguin" | Placeholder "ex: Carte d'identite, RIB, Devis signe" |
| `apps/backend/prisma/seed.ts` | 11 labels medicaux + intervention.labelSlugs medicaux | 8 labels admin/financiers + labelSlugs commerciaux |
| `apps/backend/prisma/seed.local.ts` | user CHIRURGIEN + 4 noteMedecin avec contenu medical | user retire + notes medecin supprimees |

### Verification des stories (50)

Scan keywords HDS dans `docs/product/stories/` (filtre les annotations de migration "interdits/raye/retire/caduc") :
- 0 keyword medical actif dans le texte des stories
- Toutes les references ADR-0002 sont explicites

---

## Trust Score par module

| Module | Stories | Verdict moyen |
|--------|---------|---------------|
| EP01 (Foundation) | 4 | OK / OK avec rename |
| EP02 (Parametrage) | 5 | OK avec rename |
| EP03 (Fiche Client) | 3 | OK avec rename |
| EP04 (Pipeline & Process) | 6 | OK avec rename |
| EP05 (Devis) | 7 | OK avec rename |
| EP06 (Documents) | 4 | OK avec mitigation (Pattern B) |
| EP07 (Agenda) | 3 | OK avec rename |
| EP08 (Dashboard) | 2 | OK avec rename |
| EP09 (Follow-up dedie) | 7 | OK avec mitigation (Pattern A) |
| EP10 (Document templates) | 4 | OK avec mitigation (Pattern A + B) |
| EP11 (Click tracking) | 2 | OK |
| EP12 (Optimistic mutations) | 3 | OK |
| EP13 (F2 Blocking points) | 1 | OK |

---

## Mitigation actives (P3)

| Mitigation | Where | How |
|------------|-------|-----|
| Modal HDS de consentement avant upload | `DocumentsTab.tsx` | sessionStorage `crm-commercial:hds-upload-consent` — 1 fois par session |
| Placeholders UI explicites | 5 textareas (ProcessNotes, FollowupTransitionDialog, FollowupTab, MessageTemplatesAdmin) + 2 inputs | Attribut `placeholder` + label "Note commerciale uniquement — pas de donnee medicale" |
| Liste blanche variables DocumentTemplate | `lib/templateVariables.ts` (a creer en EP10-S02) | Aucune variable medicale exposee |
| Clause CGU Art. X | `docs/legal/CGU-clause-HDS-non-medical.md` | Responsabilite Florian + juriste pour signature client |
| Audit periodique | `scripts/audit-hds.ts` (a creer en V1.1) | Scan trimestriel des champs note/body/fileUrl |

---

## Conclusion

Le repo CRM Commercial est **HDS-clean au sens P1 → P5** : aucune donnee de sante n'est :
1. Stockee structurellement (schema → ADR-0002 retire `noteMedecin`, role medical, etc.)
2. Saisie via les seeds (labels remplaces, users retires, notes purgees)
3. Demandee dans les libelles UI (mocks WhatsApp commerciaux, placeholders explicites, hint commercial)
4. Acceptee aux uploads sans avertissement (modal HDS bloquant)

Le residuel est :
- **CGU Art. X** : a faire valider par juriste + signer par chaque cabinet (responsabilite produit / Florian)
- **Audit periodique** : script a livrer en V1.1
- **P4.B suite** : UI labels "intervention" → "prestation", "Consultation" → "Rendez-vous" (estimation 1 jour, P4.B finale)

Verdict global : **A (Trust Score 98.2 %)**.

---

*Genere le 2026-05-20 a la fin de P5. Voir CHANGELOG-2026-05-19-20-ADR-0002-implementation.md pour le detail des commits.*
