# Handoff — Vencor Brand Identity

## Overview

This is the **brand identity system for Vencor**, a B2B SaaS platform that connects aesthetic surgeons (the "clients") with the consultants who help them grow their practice. Three personas use the app: **Manager** (oversees the agency), **Consultant** (runs missions), **Client** (the surgeon, tracks growth).

The audience is **aesthetic surgeons** — image-conscious, taste-conscious, high-value clientele. The brand has to feel **premium without shouting, trustworthy without feeling sterile, and modern without dating**.

The system was validated through a designer-led exploration covering three directions, six accent palettes, multiple logo concepts, and ten typographic candidates. What's documented below is the final committed identity.

---

## About the Design Files

The HTML/JSX files in this bundle are **design references** — high-fidelity prototypes built to validate the brand's look and feel. They are **not production code**. Your job is to recreate them in the target codebase's existing environment (React/Vue/Next.js/SwiftUI/whatever is in use) following its established patterns, conventions, and component libraries. If no codebase exists yet, pick the most appropriate framework for a premium SaaS dashboard product (Next.js + Tailwind, React + CSS Modules, etc.) and implement there.

## Fidelity

**High-fidelity.** Every color, font, weight, size, letter-spacing, border-radius, and shadow value below is final. Implement pixel-perfect.

---

## The system in one paragraph

Dark Apple-grade premium. Warm onyx background, glass surfaces with backdrop-blur, cool platinum accent (`#B5BFC7`), pearl white for italic moments. Wordmark in **Newsreader Italic** (Production Type, via Google Fonts); UI body in **SF Pro Display** via the Apple system stack. Generous whitespace, hairline borders, 24px card radii, photographic placeholders for skin/light/material imagery. Voice is restrained, editorial, French-led. No emoji. No medical iconography.

---

## Design Tokens

### Colors

| Token | Hex / Value | Usage |
|---|---|---|
| `--vc-onyx` | `#0A0B0E` | Primary background |
| `--vc-onyx-soft` | `#0F1015` | Secondary surface |
| `--vc-glass` | `rgba(255,255,255,0.04)` | Glass card background (always pair with `backdrop-filter: blur(40px)`) |
| `--vc-glass-hi` | `rgba(255,255,255,0.07)` | Hovered glass surface |
| `--vc-platine` | `#B5BFC7` | Single brand accent — buttons, active states, links, period in wordmark, glow source |
| `--vc-pearl` | `#E8ECF0` | Color for italic accent words ("maîtrisé", "tout est en ordre") |
| `--vc-text` | `#F0F2F5` | Primary text on dark |
| `--vc-text-dim` | `rgba(240,242,245,0.60)` | Secondary text |
| `--vc-text-faint` | `rgba(240,242,245,0.38)` | Labels, captions, meta |
| `--vc-hair` | `rgba(240,242,245,0.10)` | Hairline borders |
| `--vc-hair-strong` | `rgba(240,242,245,0.18)` | Stronger hairlines (focus, divider) |

**Critical rule:** Platine is the only accent. No warm gold. No rose. No green. No blue. If you find yourself wanting another color, use a different value of platine or pearl instead.

### Typography

**Two families. No exceptions.**

**Display / wordmark / titles:** [Newsreader Italic](https://fonts.google.com/specimen/Newsreader)
- Google Font, free
- Use Italic weight 400 for wordmark + most display moments
- Use Italic weight 300 for very large hero (>60px) if you want it lighter
- `letter-spacing: -0.035em` at large sizes; tighten further (-0.045em) for huge displays >100px
- Optical size: use 72pt+ variants for display

**UI / body:** Apple system stack
```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Tight", "Inter", sans-serif;
```
- Weights: 300 (light hero copy), 400 (body), 500 (UI buttons/labels), 600 (emphasis)
- Letter-spacing: -0.02em at large sizes, 0 at body sizes
- Pair with Inter Tight as fallback for non-Apple devices (closer SF metrics than Inter)

**Monospace** (rarely — for IDs, dates, technical meta):
```css
font-family: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

### Type scale

| Use | Size | Weight | Letter-spacing | Family |
|---|---|---|---|---|
| Hero login | 96px | 300 | -0.045em | SF Pro |
| Dashboard greeting | 56px | 300 | -0.04em | SF Pro |
| Section title | 28px | 500 | -0.025em | SF Pro |
| Section title (italic accent) | 28px | 400 | -0.025em | Newsreader Italic |
| Card title | 22px | 500 | -0.025em | SF Pro |
| Body large | 15px | 400 | 0 | SF Pro |
| Body | 13px | 400 | 0 | SF Pro |
| Meta / label | 11px | 500 | 0.01em uppercase | SF Pro |
| Label · uppercase tracked | 10px | 500 | 1.5px tracking, uppercase | SF Pro |

### Spacing

8pt grid. Multiples of 8 unless otherwise noted.

| Token | Value |
|---|---|
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-6` | `24px` |
| `space-8` | `32px` |
| `space-12` | `48px` |
| `space-16` | `64px` |

### Border radius

| Use | Radius |
|---|---|
| Buttons, inputs, small chips | `10–12px` |
| Pills, badges | `100px` (fully rounded) |
| Cards, panels | `20–24px` |
| Large modals, hero cards | `24px` |
| App icon | `14px` |
| Favicon | `~18%` of size (e.g. 32px favicon → 6px radius) |

### Shadows

Use sparingly — the system relies on hairlines, not shadows.

| Use | Value |
|---|---|
| Floating glass card | `0 32px 80px rgba(0,0,0,0.5)` |
| Subtle elevation | `0 4px 16px rgba(10,11,14,0.18), inset 0 1px 0 rgba(255,255,255,0.08)` |
| Active state glow (platine) | `0 0 0 5px rgba(181,191,199,0.18), 0 0 20px rgba(181,191,199,0.4)` |

### Glass / backdrop-blur

The signature surface treatment. Use for cards, modals, navigation chrome.

```css
.glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(240, 242, 245, 0.10);
  border-radius: 24px;
}
```

### Photographic placeholders

The brand uses photographic imagery (skin, light, material) — never illustrated medical icons. Where final photos aren't ready, use these gradient placeholders:

```css
/* Midnight */
background: radial-gradient(at 60% 40%, #2A2D34 0%, #14171C 50%, #08090C 100%);

/* Candle (warm-cool steel) */
background: radial-gradient(at 30% 50%, #4A5560 0%, #1F242C 50%, #0A0B0E 100%);

/* Pearl (lighter) */
background: radial-gradient(at 50% 30%, #5A5E64 0%, #2A2D33 50%, #0F1014 100%);

/* Velvet (depth) */
background: radial-gradient(at 70% 50%, #3A3F47 0%, #181C22 60%, #08090C 100%);
```

Add a faint grain overlay and a soft top-left highlight (see `direction-obsidienne.jsx` `BPhoto` component for the exact technique).

---

## The wordmark

The **only** wordmark. Use exactly as specified.

**Spec:**
- Text: `Vencor.` (capital V, rest lowercase, **period required** in platine)
- Font: Newsreader, italic, weight 400
- Letter-spacing: `-0.035em` (tighten to `-0.045em` for sizes >100px)
- The period (`.`) is in `--vc-platine` (`#B5BFC7`)
- No separate icon mark — the wordmark is the logo
- For favicons / app icons: use the single italic `V` from Newsreader Italic, scaled down, no period

**HTML / JSX implementation:**
```jsx
<span style={{
  fontFamily: '"Newsreader", "Iowan Old Style", Georgia, serif',
  fontStyle: 'italic',
  fontWeight: 400,
  fontSize: 32,
  letterSpacing: '-0.035em',
  color: '#F0F2F5',
  display: 'inline-flex',
  alignItems: 'baseline',
}}>
  Vencor<span style={{ color: '#B5BFC7' }}>.</span>
</span>
```

**Sizes in use:**
- Hero login: 60–96px
- Dashboard nav: 18–22px
- Email signature: 14–16px
- Favicon (V only): 16/24/32/48px

---

## Voice

- **Restrained editorial French.** Short, declarative sentences. Italics for the one word that matters.
- **Vocabulary:** use *atelier*, *art*, *discernement*, *cultivé*, *maîtrisé*, *praticien*, *référent*. **Avoid** "patient" as a generic noun, "user", "dashboard" (use *tableau de bord*), and all medical jargon unless contextually required.
- **No emoji. Ever.**
- **No exclamation marks.**
- Tagline: **"L'intérêt patient, *maîtrisé*."** (with "maîtrisé" in Newsreader italic and platine color)
- Greetings: "Bonjour, Dr. Lefebvre." not "Hi Martin!"

---

## Screens / Views

The bundle contains the two key brand-defining screens, both rendering at full fidelity. Recreate these in the target codebase.

### Login screen
**File:** `direction-obsidienne.jsx` → `window.ObsidienneLogin`

**Layout:**
- Full-bleed photographic backdrop (use one of the placeholder gradients above, or final photography when available)
- Vertical gradient overlay top + bottom for legibility (rgba(10,11,12,0.7) top, transparent middle, rgba(10,11,12,0.85) bottom)
- Top bar: wordmark on left, version tag on right (mono font, faint)
- Middle, two columns:
  - **Left**: editorial copy
    - Tiny uppercase label "— Accès praticien" in platine
    - H1: 96px, weight 300, SF Pro, with `maîtrisé.` in Newsreader italic pearl color
    - Subtitle: 15px, dim text, max-width 460
  - **Right**: glass card with login form
    - Glass surface (see token), padded 36px/32px, radius 24px
    - Form: email + password inputs, then primary button
    - Inputs: `rgba(0,0,0,0.25)` background, hairline border, 12px radius, 14–16px padding
    - Button: pearl (`#F0F2F5`) bg, onyx text, 12px radius, weight 500
- Bottom bar: trust badges left (HDS · SOC 2 · RGPD), copyright right

### Client dashboard
**File:** `direction-obsidienne.jsx` → `window.ObsidienneDashboard`

**Layout:**
- Sticky top nav with backdrop-blur: wordmark left, tabs center, user avatar right
- Ambient warm glow (top-left, radial gradient, very subtle)
- Main content (48px padding):
  1. **Greeting** (no card): date in platine, 56px three-line greeting with italic accent on third line
  2. **Status glass card**: phase title + meta, full stepper (4 steps with done/active/pending states), platine glow on active step
  3. **Two-column grid**: photographic next-session card (left, 1.4fr) + glass consultant card (right, 1fr)
  4. **Journey glass card**: 4-column horizontal phase timeline with platine/pearl underlines per state
  5. **Documents grid**: 3 columns, simple file cards with placeholder thumbnails

**Critical interaction patterns:**
- Hover on cards: subtle border brightening, no transform
- Active stepper indicator: platine dot with double glow (see Shadows · Active state glow)
- All transitions: 0.2s ease for color, 0.3s ease for layout
- No emoji icons — use abstract dots, hairlines, or text instead

---

## State Management

This is identity/styling, not application logic. State management is implementation-defined by the target codebase. For the prototype demo data structure used in the source, see the `AppState` constant in `uploads_reference/vencor_prototype_v10.html`.

---

## Responsive

The prototype targets desktop primarily but should work down to mobile. Breakpoints used:
- Mobile: `≤ 768px` — stack everything, no two-column grids, padding reduced to 16–20px
- Tablet: `769–1024px` — softer two-column grids
- Desktop: `> 1024px` — full layouts as shown

---

## Files in this bundle

| File | Purpose |
|---|---|
| `README.md` | This document |
| `tokens.css` | Drop-in CSS custom properties — the system as CSS variables |
| `tailwind.config.example.js` | Optional Tailwind preset if using Tailwind |
| `Branding.html` | The full validated design canvas with intro, system, and applied screens. Open in browser for visual reference. |
| `direction-obsidienne.jsx` | The two main screens (`ObsidienneLogin`, `ObsidienneDashboard`) + tokens card (`ObsidienneTokens`). Read these for exact pixel values. |
| `design-canvas.jsx` | Supporting component for the canvas presentation. Not needed for production. |
| `branding-app.jsx` | The canvas composition. Not needed for production. |

---

## Assets

No image assets are included. Photography is **to be commissioned or sourced** by the client. Brief guidance for the photographer:

- Skin texture (close-up, soft natural light, no makeup product visible)
- Hands at work (precise, minimal, no overt medical instruments)
- Materials (linen, silk, marble, glass — luxury hotel / atelier mood)
- Light through curtains, candlelight, dawn — never harsh clinical lighting
- Color grade: warm shadows, cool highlights, low saturation, deep blacks

Until real photography is delivered, use the gradient placeholders documented above.

---

## What's not in scope here

This handoff covers identity + two screens (login, client dashboard). Not yet covered, in priority order:

1. Consultant view (sidebar with surgeon list, mission detail, roadmap, coaching sessions)
2. Manager view (tabs: missions table, consultants grid, KPIs, team management)
3. Email templates
4. Marketing / public site
5. Print materials (business card, letterhead)
6. Component-level kit (every button state, form state, modal pattern)

When the client is ready, request continuation of the design phase to cover these.

---

## Questions?

If anything is ambiguous, default to **restraint** — less color, less ornament, more whitespace, smaller hover deltas. When in doubt, look at Apple's marketing site (apple.com) or Augustinus Bader (augustinusbader.com) for reference.
