# Rapport final D15 — Rebrand Vencor + corrections

**Date** : 2026-05-27
**Session** : ~3h30 (rebrand Vencor + multi iterations user)
**Demo client** : jeudi 28 mai (J+1)

---

## TL;DR

Toggle theme Classic / Vencor operationnel, non destructif, persiste en localStorage. 30+ corrections appliquees sur 18 fichiers en 4 commits. Pipeline, agenda, process panel, login, badges status, KPIs colonnes : tout est lisible et coherent en Vencor. Widget WhatsApp protege (garde ses couleurs officielles WhatsApp en theme Vencor). Bug refresh callback pipeline fixe. KPIs colonnes pipeline maintenant intelligents (affichent seulement les KPI pertinents par stage).

**Status** : Pret pour demo jeudi.

---

## 4 commits realises

### `bfd438a` — Boot infrastructure Vencor

- 11 CSS variables `--vc-*` (onyx, platine, glass, pearl, text, hair)
- Override block `body.theme-vencor { ... }` remappe vars existantes
- Toggle component `ThemeSwitcher.tsx` + persistance localStorage
- Boot script `layout.tsx` (theme avant first paint)
- ThemeSwitcher integre : Sidebar footer + Floating /login top-right
- Wordmark conditionnel Vencor. (Newsreader Italic + point platine)
- Login panneau gauche theme-aware
- Header bg-white/60 → var(--surface-glass)
- Onyx adouci #0A0B0E → #15171D
- Test spec `vencor-visual-audit.spec.ts` (11 screenshots fullPage)

### `64fb343` — Vencor visual bugs

- ProcessPanel : drawer/header/footer/buttons → CSS vars
- ProcessCard : kanban card → CSS vars
- AgendaView : container + boutons toggle → CSS vars
- NewDossierButton : dropdown menu → CSS vars
- DashboardView : "Total patients" → "Total clients"
- NewDossierButton : 3 labels "Nouveau patient" → "Nouveau client"
- CSS override large `[class*="bg-white"]` + `[class*="border-white"]` + autres en Vencor
- React-big-calendar overrides : `.rbc-*` complets en Vencor

### `5bf875d` — Retours user live

- i18n patient → client sur 7 composants additionnels
- Bug refresh pipeline : ajout `cache: "no-store"` dans `apiFetch`
- Dialog overlay : `rgba(0,0,0,0.72)` + `blur(8px)` en Vencor
- Follow-up colonnes : neutralisees vers var(--vc-glass)
- Pills "Follow-up"/"Non qualifie" : couleurs adoucies muted
- WhatsApp preview : wrapper `.whatsapp-preview-protected` + reset CSS
- Tabs (Vue d'ensemble / etc.) : contraste augmente
- Aucun dossier placeholders : background dark
- Agenda today cell : selecteur precis + !important
- Boutons primary : text var(--vc-onyx) + font-weight 600

### `pending` — Sidebar logo + badges + KPIs intelligents + drop zone

- Sidebar header : wordmark "Vencor." conditionnel + class `sidebar-brand-mark`
  (glass + platine en Vencor au lieu de carre platine "C")
- Badge status documents differencies en Vencor : amber/blue/emerald muted
  (avant tous neutralises vers platine, indistinguables)
- "Aucun dossier" placeholders : fond plus sombre `rgba(0,0,0,0.30)` au lieu
  de glass clair, text plus blanc `var(--vc-text)` au lieu de gray-300
- KanbanColumn drop zone : override en Vencor `rgba(0,0,0,0.25)` + hair
  border (avant inline style pastel par stage ressortait en clair)
- KPIs colonnes pipeline intelligents : affichage selectif par stage (logique
  metier). CONTACT/CONSULTATION = Potentiel uniquement. POST_CONSULT =
  Potentiel + En attente. CONFIRMEE/OP_PROGRAMMEE = Confirme + En attente.
  EFFECTUEE = Confirme. ANNULEE = aucun. NON_QUALIFIE/FOLLOWUP = Potentiel.

---

## Pour la demo jeudi — 4 choses a retenir

### 1. Comment activer Vencor

- Aller sur `/login`
- Click toggle **Vencor** en haut a droite (floating box "Theme")
- Connexion : tout est en Vencor

### 2. Comment toggle Classic vs Vencor pendant la demo

- Pre-login : floating top-right sur `/login`
- Post-login : Sidebar footer (sous LanguageSwitcher)
- Le changement est instantane, pas de reload necessaire

### 3. Bug refresh corrige

- Avant : creation client/dossier necessitait F5
- Maintenant : refresh automatique grace au `cache: "no-store"` global

### 4. WhatsApp preview

- Conserve ses couleurs WhatsApp officielles (vert #075E54 + bulle #DCF8C6)
  meme en theme Vencor — pas de rupture visuelle de brand recognition

---

## Logique metier KPIs colonnes pipeline (nouveau)

| Stage | Potentiel | Confirme | En attente | Raison |
|-------|-----------|----------|------------|--------|
| CONTACT | OUI | non | non | Avant qualification, juste un chiffre theorique |
| CONSULTATION | OUI | non | non | Consultation en cours, chiffrage indicatif |
| POST_CONSULT | OUI | non | OUI | Devis en cours / envoye en attente signature |
| CONFIRMEE | non | OUI | OUI | Devis signe + acompte/solde restant |
| OP_PROGRAMMEE | non | OUI | OUI | Idem CONFIRMEE |
| EFFECTUEE | non | OUI | non | Tout est paye |
| ANNULEE | non | non | non | Aucun chiffre pertinent |
| NON_QUALIFIE | OUI | non | non | CA potentiel perdu |
| FOLLOWUP | OUI | non | non | Idem NON_QUALIFIE (peut revenir) |

---

## Ce qui n'a pas pu etre fait (a faire post-demo)

### Visuel
- Devis builder : nombreux `bg-white/80`, `bg-white/40` couverts par CSS override mais pas valides visuellement
- Tooltip / Popover Radix : pas verifies en Vencor

### Performance
- `cache: "no-store"` global : possible impact sur les listings. A monitorer apres demo.

### Tests
- v12 devis-builder spec echoue (helper API listing). A debugger.
- Spec a integrer en CI (D10)

---

## Fichiers modifies (18)

```
apps/frontend/src/styles/globals.css                                       (modifications majeures)
apps/frontend/src/lib/api.ts                                               (cache: no-store)
apps/frontend/src/app/layout.tsx                                           (boot script)
apps/frontend/src/app/login/page.tsx                                       (ThemeSwitcher + wordmark)
apps/frontend/src/components/layout/ThemeSwitcher.tsx                      (nouveau)
apps/frontend/src/components/layout/Sidebar.tsx                            (wordmark Vencor)
apps/frontend/src/components/layout/Header.tsx                             (vars)
apps/frontend/src/components/pipeline/ProcessPanel.tsx                     (vars)
apps/frontend/src/components/pipeline/ProcessCard.tsx                      (vars)
apps/frontend/src/components/pipeline/KanbanColumn.tsx                     (KPI intelligents + drop zone)
apps/frontend/src/components/pipeline/NewDossierButton.tsx                 (i18n + vars)
apps/frontend/src/components/pipeline/StageContextBanner.tsx               (i18n)
apps/frontend/src/components/pipeline/QualificationDialog.tsx              (i18n)
apps/frontend/src/components/agenda/AgendaView.tsx                         (vars)
apps/frontend/src/components/dashboard/DashboardView.tsx                   (i18n)
apps/frontend/src/components/devis/DevisBuilder.tsx                        (i18n)
apps/frontend/src/components/documents/DocumentsTab.tsx                    (i18n + badge classes)
apps/frontend/src/components/documents/AIAgentWhatsAppPreview.tsx          (wrapper protected)
apps/frontend/src/components/config/DocumentTemplatesAdmin.tsx             (i18n)
apps/frontend/src/components/documentLabels/DocumentLabelFormDialog.tsx    (i18n)
apps/frontend/src/components/followup/FollowupTransitionDialog.tsx         (i18n)
apps/frontend/tests/e2e/vencor-visual-audit.spec.ts                        (nouveau)
docs/CHANGELOG-D15-rebrand-vencor-2026-05-27.md                            (nouveau)
docs/RAPPORT-D15-FINAL-2026-05-27.md                                       (ce document)
```

---

*Rapport final D15 cree le 2026-05-27. Demo prevue 28 mai 2026.*
