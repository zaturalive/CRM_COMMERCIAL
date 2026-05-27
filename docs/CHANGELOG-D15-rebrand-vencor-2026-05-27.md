# CHANGELOG D15 — Rebrand Vencor + fixes UI/UX

**Date** : 2026-05-27 (mercredi, jour J-1 demo)
**Auteur** : Dimitry + Claude
**Contexte** : integration du brand "Vencor" (florian_tool/) fourni par Florian + corrections visuelles iterees depuis les screenshots Playwright + retours user en live.
**Demo client** : jeudi 28 mai (J+1)

---

## 1. Strategie generale

**Approche non-destructive** : aucune refonte structurelle des composants. Tout passe par :
- CSS variables Vencor (`--vc-*`) dans `apps/frontend/src/styles/globals.css`
- Block d'override `body.theme-vencor { ... }` qui remappe les variables existantes (`--accent`, `--surface`, `--page-bg`, etc.) sur les tokens Vencor
- Toggle UI (`ThemeSwitcher`) qui ajoute/retire la class `theme-vencor` sur `<body>` + persiste en `localStorage` (cle `crm-commercial:theme`)
- Script inline dans `layout.tsx` pour appliquer le theme avant first paint (evite le flash classic → vencor)

**Resultat** : 2 themes coexistent (Classic + Vencor), togglable a chaud, sans necessite de re-build ou de redeploy.

---

## 2. Changements detailles par batch

### Batch 1 — Boot infrastructure Vencor (commit `bfd438a`)

| Fichier | Changement |
|---------|-----------|
| `apps/frontend/src/styles/globals.css` | Ajout block tokens Vencor `--vc-onyx`, `--vc-platine`, `--vc-glass`, `--vc-text`, `--vc-hair`, etc. + block `body.theme-vencor` qui override `--accent`, `--surface`, `--page-bg`, `--text-primary`, `--border`, `--blur` vers les tokens Vencor |
| `apps/frontend/src/styles/globals.css` | Import Google Fonts `Newsreader` + `Inter Tight` |
| `apps/frontend/src/styles/globals.css` | Classe utility `.vc-wordmark` (Newsreader Italic + point platine) avec variantes `--xl/--md/--sm` |
| `apps/frontend/src/styles/globals.css` | Classe utility `.login-brand-panel` theme-aware (gradient classic vs radial-glow Vencor) |
| `apps/frontend/src/components/layout/ThemeSwitcher.tsx` | Nouveau component : toggle Classic / Vencor, persistance localStorage, applique class `theme-vencor` sur body via useEffect |
| `apps/frontend/src/components/layout/Sidebar.tsx` | Integration du `ThemeSwitcher` dans le footer (sous `LanguageSwitcher`) |
| `apps/frontend/src/app/layout.tsx` | Boot script inline `<script>` qui lit localStorage et applique class theme-vencor avant first paint |
| `apps/frontend/src/app/login/page.tsx` | Floating `ThemeSwitcher` top-right (accessible avant connexion) + wordmark conditionnel "Vencor." vs "CRM Commercial" |
| `apps/frontend/src/components/layout/Header.tsx` | `bg-white/60` → `bg-[color:var(--surface-glass)]`, hover `bg-white/80` → `bg-[color:var(--surface-glass)]` |
| `apps/frontend/tests/e2e/vencor-visual-audit.spec.ts` | Nouveau spec Playwright : 11+ screenshots fullPage en theme Vencor pour audit visuel (login, dashboard commercial/admin, pipeline, process panel, agenda, clients, config cliniques/interventions, settings, follow-up, devis-builder) |

### Batch 2 — Adoucissement couleurs + fix audit UX (commit `bfd438a`)

| Token | Avant | Apres | Raison |
|-------|-------|-------|--------|
| `--vc-onyx` | `#0A0B0E` | `#15171D` | Trop noir pur, donnait l'effet "ecran eteint" |
| `--vc-onyx-soft` | `#0F1015` | `#1B1D24` | Idem adoucissement |
| `--vc-text-dim` | alpha `0.60` | `0.65` | Lisibilite WCAG sur secondary text |
| `--vc-hair` | alpha `0.10` | `0.12` | Hairlines trop invisibles |
| `--vc-glass` | alpha `0.04` | `0.05` | Idem |

### Batch 3 — Fix Vencor visual bugs (commit `64fb343`)

Apres run Playwright initial, audit des 11 screenshots Vencor → identification de 5 composants qui ne suivaient pas le theme :

| Composant | Fix |
|-----------|-----|
| `ProcessPanel.tsx` | Drawer `bg-white/95` → `bg-[color:var(--surface)]`. Header `bg-white/60` → `bg-[color:var(--surface-glass)]`. Footer `bg-white/70` → `bg-[color:var(--surface-glass)]`. Stage transition buttons `bg-white/80 hover:bg-white` → vars. Close button `hover:bg-white/80` → var. |
| `ProcessCard.tsx` | Kanban card `bg-white/75 border-white/80` → `bg-[color:var(--surface)] border-[color:var(--border)]`. Archive button hover `hover:bg-white/80` → var. |
| `AgendaView.tsx` | Container calendar `bg-white/80 border-white/60` → vars. Toggle vue (Jour/Semaine/Mois) `bg-white/60 hover:bg-white` → `bg-[color:var(--surface-glass)] hover:bg-[color:var(--accent-light)] hover:text-[color:var(--text-primary)]` |
| `NewDossierButton.tsx` | Dropdown menu `bg-white` → `bg-[color:var(--surface)]`. Hover items `hover:bg-gray-50` → `hover:bg-[color:var(--accent-light)]`. |
| `DashboardView.tsx` | Label KPI `"Total patients"` → `"Total clients"` (residu rename P4.B 2026-05-20) |
| `vencor-visual-audit.spec.ts` | v10 path `/settings` (404) → `/config/cabinet`. Ajout v12 screenshot DevisBuilder en theme Vencor. |

**CSS globals.css overrides ajoutes (Batch 3)** :

```css
body.theme-vencor [class*="bg-white"] {
  background-color: var(--vc-glass) !important;
}
body.theme-vencor [class*="border-white"] {
  border-color: var(--vc-hair) !important;
}
body.theme-vencor [class*="hover:bg-white"]:hover {
  background-color: var(--vc-glass-hi) !important;
}
body.theme-vencor [class*="text-gray-"],
body.theme-vencor [class*="text-text-primary"] {
  color: var(--vc-text) !important;
}
body.theme-vencor [class*="bg-gray-50"],
body.theme-vencor [class*="bg-gray-100"],
body.theme-vencor [class*="bg-gray-200"] {
  background-color: var(--vc-glass) !important;
}
body.theme-vencor [class*="bg-red-100"],
body.theme-vencor [class*="bg-amber-100"] {
  background-color: rgba(181, 191, 199, 0.12) !important;
  color: var(--vc-pearl) !important;
}
```

Plus override react-big-calendar pour theme Vencor : `.rbc-calendar`, `.rbc-month-view`, `.rbc-time-view`, `.rbc-day-bg`, `.rbc-header`, `.rbc-today`, `.rbc-off-range-bg`, `.rbc-event`, `.rbc-toolbar button`, `.rbc-current-time-indicator` → toutes les couleurs en var(--vc-*).

### Batch 4 — Retours user en live (commit en cours)

Apres test live du user, identification de 8 problemes supplementaires (screenshots fournis par user) :

| # | Probleme signale | Fix applique |
|---|-----------------|---------------|
| 1 | Bouton "Nouveau patient", "Patient existant", "Cree le patient", "Envoyer au patient" — residus terminologie | `StageContextBanner.tsx` 2 messages, `QualificationDialog.tsx` description, `FollowupTransitionDialog.tsx` description, `DocumentLabelFormDialog.tsx` 2 labels, `DocumentsTab.tsx` 2 boutons/titres, `DevisBuilder.tsx` 1 label, `DocumentTemplatesAdmin.tsx` 1 description, `NewDossierButton.tsx` 3 labels (deja fix commit precedent) |
| 2 | Dialog overlay pas assez sombre/flou en theme Vencor | CSS override `body.theme-vencor [data-state="open"][class*="bg-black"]` → `rgba(0,0,0,0.72)` + `backdrop-filter: blur(8px)` |
| 3 | Follow-up colonnes couleurs hardcoded (vert/beige/marron par sub-stage) — illisibles en Vencor | CSS override `body.theme-vencor [data-followup-substage]` → `var(--vc-glass)` + border `var(--vc-hair)` |
| 4 | Pills "Follow-up" / "Non qualifie" illisibles | CSS override `body.theme-vencor [class*="bg-amber-50"]` → amber semi-transparent + text amber-300, idem `bg-red-50` → red semi-transparent + text red-300 |
| 5 | WhatsApp preview (AIAgentWhatsAppPreview) perd son aspect WhatsApp en Vencor | Wrapper `.whatsapp-preview-protected` ajoute + CSS reset des overrides Vencor a l'interieur de ce wrapper (preserve bg-white + texte sombre + couleur bot vert WhatsApp `#DCF8C6`) |
| 6 | Tabs "Vue d'ensemble / Notes / Documents / Devis" se fondent | CSS override `body.theme-vencor [role="tablist"] button` → `color: var(--vc-text-dim)` + active state `color: var(--vc-text)` + `border-color: var(--vc-platine)` |
| 7 | "Aucun dossier" placeholders fonds clairs (bg-emerald-50/blue-50/etc.) | CSS override `body.theme-vencor [class*="bg-emerald-50"]`, `bg-blue-50`, `bg-purple-50`, `bg-violet-50`, `bg-indigo-50` → `var(--vc-glass)` + text dim |
| 8 | Agenda : cellule today blanche pure | Selecteur plus precis et !important : `body.theme-vencor .rbc-day-bg.rbc-today`, `td.rbc-today`, `.rbc-month-view .rbc-row-bg .rbc-day-bg.rbc-today` → `rgba(181,191,199,0.12)`. Plus reset des `.rbc-day-bg` non-today en transparent + borders `var(--vc-hair)` |

### Batch 5 — Bug callback refresh pipeline (signale par user)

**Probleme** : creation d'un client depuis la pipeline ne refresh pas l'UI → user doit F5 pour voir le nouveau dossier.

**Diagnostic** : le code de `PipelineView.tsx > handleClientCreated` appelle bien `loadPipeline({ silent: true })` apres le POST process. Le handler de `ClientFormDialog.tsx > onSuccess` est correct. Le code semble OK en theorie.

**Hypothese probable** : Next.js mettait en cache la response du GET `/api/pipeline` (via Data Cache ou Router Cache), donc le re-fetch apres mutation retournait le snapshot pre-mutation.

**Fix applique** : ajout `cache: "no-store"` dans le `fetch()` du helper `apiFetch` (`apps/frontend/src/lib/api.ts`) → toutes les requetes API contournent maintenant le cache Next.js. Force la lecture fraiche cote backend a chaque appel.

**Effet attendu** : creation d'un client/dossier/devis depuis la pipeline → refresh automatique sans F5.

**Note pour la suite** : si performance impacte (re-fetch a chaque GET), envisager une strategie SWR (stale-while-revalidate) avec `swr` ou `tanstack-query` pour avoir le best of both worlds (cache + revalidation post-mutation).

---

## 3. Fichiers modifies (recap)

### Composants
- `apps/frontend/src/components/layout/ThemeSwitcher.tsx` (nouveau)
- `apps/frontend/src/components/layout/Sidebar.tsx`
- `apps/frontend/src/components/layout/Header.tsx`
- `apps/frontend/src/components/pipeline/ProcessPanel.tsx`
- `apps/frontend/src/components/pipeline/ProcessCard.tsx`
- `apps/frontend/src/components/pipeline/NewDossierButton.tsx`
- `apps/frontend/src/components/pipeline/StageContextBanner.tsx`
- `apps/frontend/src/components/pipeline/QualificationDialog.tsx`
- `apps/frontend/src/components/agenda/AgendaView.tsx`
- `apps/frontend/src/components/dashboard/DashboardView.tsx`
- `apps/frontend/src/components/devis/DevisBuilder.tsx`
- `apps/frontend/src/components/documents/DocumentsTab.tsx`
- `apps/frontend/src/components/documents/AIAgentWhatsAppPreview.tsx`
- `apps/frontend/src/components/config/DocumentTemplatesAdmin.tsx`
- `apps/frontend/src/components/documentLabels/DocumentLabelFormDialog.tsx`
- `apps/frontend/src/components/followup/FollowupTransitionDialog.tsx`

### App
- `apps/frontend/src/app/layout.tsx`
- `apps/frontend/src/app/login/page.tsx`

### Styles
- `apps/frontend/src/styles/globals.css`

### Lib
- `apps/frontend/src/lib/api.ts`

### Tests
- `apps/frontend/tests/e2e/vencor-visual-audit.spec.ts` (nouveau)

### Assets (untracked)
- `florian_tool/` : assets brand fournis par Florian (README, starter.html, branding-app.jsx, design-canvas.jsx, direction-obsidienne.jsx, Branding.html)
- `starter.html` : exemple starter Vencor

---

## 4. Points encore non resolus

### Visuel
- DevisBuilder : nombreux `bg-white/80`, `bg-white/40`, `bg-white/95` hardcodes. Couverts par CSS override `[class*="bg-white"]` mais peuvent rester visuellement imparfaits sur certains inputs editables. A retester sur devis specifique en demo.
- Tooltip / Popover Radix : non testes en Vencor. Risque visuel si fond blanc hardcode.

### Comportemental
- Le cache-busting `cache: "no-store"` est applique globalement. Possible impact perf sur les listings (clients, interventions, etc.) qui se re-fetch plus souvent. A monitorer en prod.
- Le hot reload Next.js peut occasionnellement perdre la class `theme-vencor` sur le body apres un reload Fast Refresh. Solution : refresh manuel ou attendre stabilization.

### Documentation
- Pas encore ajoute le toggle de theme dans la documentation utilisateur (CDCF section "demo flow").
- Le `vencor-visual-audit.spec.ts` peut etre integre dans le CI (D10) pour catcher les regressions visuelles.

---

## 5. Commits associes

| Commit | Description |
|--------|-------------|
| `bfd438a` | feat: D15 rebrand Vencor — toggle theme Classic/Vencor non destructif |
| `64fb343` | fix: D15.1 Vencor visual bugs (ProcessPanel + Pipeline cards + Agenda + i18n residus) |
| (cur) | fix: D15.2 retours live user + bug refresh pipeline (callback API + cache:no-store) |

---

## 6. Pour la demo jeudi 28 mai

### Comment activer Vencor en live

1. Aller sur `/login`
2. Click sur le toggle `Vencor` en haut a droite (floating box "Theme")
3. Le theme s'active immediate + persiste en localStorage
4. Connexion + navigation : toutes les pages adoptent Vencor

### Comment toggle Classic vs Vencor pendant la demo

- Sidebar footer (post-login) : Classic / Vencor
- Pre-login : floating top-right sur /login

### Bon a savoir

- Le toggle est instantane (pas de reload)
- Le choix persiste apres logout/login
- En cas de bug Vencor (visuel), repasser en Classic pour comparer (et reporter)
- Les retours clients pendant la demo peuvent etre saisis dans un Google Doc partage

---

*Document genere le 2026-05-27 dans le cadre de l'iteration D15 rebrand Vencor.*
