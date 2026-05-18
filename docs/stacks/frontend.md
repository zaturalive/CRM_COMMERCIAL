# Stack — Frontend (Next.js 15)

> Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + CSS variables.
> Source design : `files(2)/spec-design-figma-v1_3.md`.

---

## 1. Structure du projet

```
apps/frontend/
├── src/
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # Root layout + providers (NextAuth, ThemeProvider)
│   │   ├── page.tsx                # Redirect /dashboard
│   │   ├── login/page.tsx
│   │   ├── (app)/                  # group route avec auth guard
│   │   │   ├── layout.tsx          # Layout sidebar + header
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── pipeline/page.tsx
│   │   │   ├── clients/page.tsx
│   │   │   ├── clients/[id]/page.tsx
│   │   │   ├── agenda/page.tsx
│   │   │   ├── devis/[id]/page.tsx
│   │   │   └── config/
│   │   │       ├── layout.tsx      # Guard ADMIN
│   │   │       ├── cliniques/page.tsx
│   │   │       ├── interventions/page.tsx
│   │   │       └── document-labels/page.tsx
│   │   └── api/auth/[...nextauth]/route.ts  # NextAuth handler
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (Button, Card, Badge, etc.)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # role-aware, Paramétrage masqué hors ADMIN
│   │   │   ├── Header.tsx
│   │   │   └── RoleSwitcher.tsx    # demo only
│   │   ├── pipeline/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── ProcessCard.tsx
│   │   │   └── QualifFilters.tsx
│   │   ├── process/
│   │   │   ├── ProcessPanel.tsx    # 720px sheet
│   │   │   ├── ProcessStepper.tsx  # fil d'Ariane 5 etapes + 2 sorties
│   │   │   ├── StageContextBanner.tsx
│   │   │   └── tabs/
│   │   │       ├── OverviewTab.tsx
│   │   │       ├── NotesTab.tsx
│   │   │       ├── DocumentsTab.tsx
│   │   │       └── DevisTab.tsx
│   │   ├── devis/
│   │   │   ├── DevisBuilder.tsx
│   │   │   ├── TechniqueSection.tsx
│   │   │   ├── CommercialSection.tsx
│   │   │   ├── DevisStayCard.tsx
│   │   │   ├── ClinicContextualOptions.tsx
│   │   │   ├── CustomOptionRow.tsx
│   │   │   └── DevisTotalSticky.tsx
│   │   ├── agenda/
│   │   │   ├── CalendarView.tsx
│   │   │   ├── EventBlock.tsx
│   │   │   └── EventSheet.tsx
│   │   ├── documents/
│   │   │   ├── DocumentChecklist.tsx
│   │   │   ├── DocumentRow.tsx
│   │   │   ├── DocumentPreview.tsx
│   │   │   └── AIAgentWhatsAppPreview.tsx  # grisé, V1
│   │   ├── client/
│   │   │   ├── ClientProfilePage.tsx
│   │   │   └── ClientProcessHistoryItem.tsx
│   │   └── shared/
│   │       ├── CopyButton.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── PaymentProgressBar.tsx
│   │       ├── DocumentProgressBadge.tsx
│   │       ├── TimeInput.tsx
│   │       └── ToastProvider.tsx
│   ├── lib/
│   │   ├── api.ts                  # fetcher avec JWT + gestion 401 → logout
│   │   ├── auth.ts                 # config NextAuth
│   │   ├── utils.ts                # cn(), formatCurrency, formatDate
│   │   └── hooks/                  # useProcess, useDevis, useAgenda
│   ├── types/                      # types metier (peut pointer vers packages/shared)
│   └── styles/
│       └── globals.css             # CSS variables + Tailwind directives
├── public/
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 2. Routing

| Route | Role requis | Composants cles |
|---|---|---|
| `/login` | public | `LoginForm` |
| `/dashboard` | tous | `KpiCards`, `CaChart`, `PrevisionnelList` |
| `/pipeline` | ADMIN + COMMERCIAL | `KanbanBoard` 5 col + 2 sections, ouverture `ProcessPanel` |
| `/clients` | tous | `ClientsTable` + recherche |
| `/clients/[id]` | tous | `ClientProfilePage` |
| `/agenda` | tous (chirurgien = principal) | `CalendarView` + `EventSheet` |
| `/devis/[id]` | tous | `DevisBuilder` |
| `/config/cliniques` | ADMIN exclusif | `CliniqueForm`, `TarifGrid` |
| `/config/interventions` | ADMIN exclusif | `InterventionList`, `DocumentLabelPicker` |
| `/config/document-labels` | ADMIN exclusif | `DocumentLabelCRUD` |

**Guards** :
- `/(app)/layout.tsx` : redirect `/login` si non authentifie
- `/(app)/config/layout.tsx` : redirect `/dashboard` si role ≠ ADMIN
- `/(app)/pipeline/page.tsx` : redirect `/dashboard` si role CHIRURGIEN

Le `ProcessPanel` n'est **pas une route URL**. C'est un sheet overlay ouvert via `?process=<id>` en query param pour partage.

---

## 3. State management

Approche pragmatique au MVP :
- **Server Components** par defaut pour les pages list/detail (pipeline, clients, agenda)
- **Client Components** (`"use client"`) pour les composants interactifs (DevisBuilder, ProcessPanel, forms)
- **React Query (tanstack/react-query)** pour cache + mutations cote client
- **Zustand** pour 2 states transverses :
  - `roleSwitcher` (demo only, persisté localStorage)
  - `processPanelOpen` (UI state, quel process est ouvert)

Pas de Redux. Pas de Context API transverse au MVP.

---

## 4. Design system — application des tokens

### 4.1 CSS variables (src/styles/globals.css)

Source exacte : `spec-design-figma-v1_3.md` §1.7.

```css
:root {
  --accent: #6C63FF;
  --accent-light: #EDE9FE;
  --accent-lighter: #F5F3FF;
  --sidebar-bg: #1A1A2E;
  --sidebar-hover: #252540;
  --surface: #FFFFFF;
  --surface-glass: rgba(255, 255, 255, 0.72);
  --surface-glass-border: rgba(255, 255, 255, 0.8);
  --page-bg: linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 50%, #F9FAFB 100%);
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #3B82F6;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
  --shadow-md: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-lg: 0 16px 40px rgba(0,0,0,0.12);
  --blur: blur(20px);
}
```

**Regle invariante** : pas de couleur hardcodee dans les composants. Utiliser `var(--accent)` plutot que `#6C63FF` en dur. Raison : tweaks live via CSS vars (Source : spec-design-figma-v1_3.md §1.1 "Tweaks via CSS variables").

### 4.2 Tailwind config

Mapping des CSS vars vers les utilities Tailwind :

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    }
  }
}
```

### 4.3 Composants liquid glass

Classe utilitaire reutilisable :

```tsx
// src/components/shared/GlassCard.tsx
export function GlassCard({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div
      className={cn("backdrop-blur-[20px] border border-white/80 rounded-lg shadow-md", className)}
      style={{ background: "var(--surface-glass)" }}
    >
      {children}
    </div>
  );
}
```

Sidebar reste **opaque** (pas de glass) pour contraste — cf. §1.1 du design spec.

---

## 5. Icones — Lucide uniquement

Pas d'emoji dans les composants (Mantra IA-23). Mapping des remplacements :

| Emoji a remplacer | Icone Lucide |
|---|---|
| 📅 | `Calendar` |
| 📍 | `MapPin` |
| 🕐 | `Clock` |
| ⚠️ | `AlertTriangle` |
| 👁️ | `Eye` |
| ✅ | `Check` |
| ❌ | `X` ou `XCircle` |
| 🗑️ | `Trash2` |
| 📋 | `Clipboard` |
| 📄 | `FileText` |

Regle de coding : `import { Calendar, MapPin, Clock } from 'lucide-react'` en haut de chaque composant qui en utilise. Stroke 1.5-2px, tailles 14/16/18/20/24px.

---

## 6. Auth (NextAuth v5)

### 6.1 Config

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(creds) {
        const res = await fetch(`${process.env.BACKEND_URL}/api/auth/login`, {
          method: "POST",
          body: JSON.stringify(creds),
          headers: { "Content-Type": "application/json" }
        });
        if (!res.ok) return null;
        const { data } = await res.json();
        return { id: data.userId, email: data.email, tenantId: data.tenantId, role: data.role, jwt: data.jwt };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.jwt = user.jwt;
      }
      return token;
    },
    async session({ session, token }) {
      session.tenantId = token.tenantId as string;
      session.role = token.role as string;
      session.jwt = token.jwt as string;
      return session;
    }
  }
});
```

### 6.2 Fetcher API avec JWT

```typescript
// src/lib/api.ts
import { getSession } from "next-auth/react";

export async function apiFetch(path: string, init?: RequestInit) {
  const session = await getSession();
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      Authorization: session?.jwt ? `Bearer ${session.jwt}` : "",
    }
  });
  if (res.status === 401) {
    await signOut({ callbackUrl: "/login" });
    throw new Error("Unauthorized");
  }
  return res.json();
}
```

---

## 7. Composants critiques

### 7.1 ProcessPanel (le plus important)

- Sheet 720px (shadcn `Sheet`)
- Header : nom patient + ref + `ProcessStepper`
- Tabs (Vue / Notes / Documents / Devis) via shadcn `Tabs`
- Footer : actions rapides
- Gestion des etats : ouverture via URL `?process=<id>`, fermeture via backdrop ou bouton X
- **Point accent sur tab** selon stage (utiliser un pseudo-element)

### 7.2 ProcessStepper

- 5 cercles cliquables + connecteurs horizontaux
- Etat visuel : passee (emerald + Check), active (accent + shadow), future (gris outline)
- 2 sorties secondaires sous la ligne de base
- Dialog de confirmation si transition invalide (erreur 422 du back)

### 7.3 DevisBuilder

- 2 sections : Technique (border-left bleue) + Commerciale (border-left violette)
- **Pre-remplissage auto** : au mount, charger les ProcessIntervention du process et creer les DevisIntervention
- Calcul temps reel : chaque `onChange` appelle `GET /api/devis/:id/total` (debounced 300ms)
- Sticky : `DevisTotalSticky` en bas-droite pendant scroll

### 7.4 CalendarView (agenda)

- `react-big-calendar` avec vue Semaine par defaut
- Events derives de `GET /api/agenda?from&to`
- Drag & drop via react-big-calendar natif
- `EventBlock` custom avec 7 variants (voir `spec-design-figma-v1_3.md` §1.4)

---

## 8. Formulaires

- **React Hook Form** + **Zod resolver** (memes schemas que le backend → `packages/shared`)
- Affichage erreurs inline
- Disabled state pendant submit
- Toasts de success/error via shadcn `Sonner`

Exemple :

```tsx
const schema = z.object({
  firstName: z.string().min(1, "Prenom requis"),
  phone: z.string().regex(/^0[1-9]\d{8}$/, "Numero francais invalide"),
  email: z.string().email().optional()
});

const form = useForm({ resolver: zodResolver(schema) });
```

---

## 9. Performance

Cibles MVP modestes :
- LCP < 2.5s sur pipeline (charge 20-50 process)
- FID < 100ms sur interactions principales
- Pas de skeleton loaders obligatoires, mais preserve-les pour le pipeline (qui charge en mode SSR)

Optimisations :
- Server Components pour list views (pipeline, clients)
- `dynamic import` pour `ProcessPanel`, `DevisBuilder`, `CalendarView` (gros composants)
- React Query avec `staleTime: 30s` sur les listes

---

## 10. Accessibilite MVP

Minimum vital :
- Contrastes WCAG AA sur les textes (verifier avec devtools)
- Navigation clavier sur les boutons et forms (shadcn le fait)
- `aria-label` sur les icones sans texte (boutons CopyButton, Trash2, Eye)
- Focus visibles (ne pas override `:focus-visible` par defaut de shadcn)

Pas d'audit axe-core bloquant au MVP.

---

*Reference : spec-design-figma-v1_3.md, pro-mvp-24-avril-v4.md §6. Derniere mise a jour : 22 avril 2026.*
