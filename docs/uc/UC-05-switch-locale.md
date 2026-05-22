# UC-05 : Switch langue (FR ↔ EN)

**Domaine** : i18n
**Acteur primaire** : Tous (ADMIN, COMMERCIAL)
**Acteur secondaire** : Systeme (next-intl + cookie storage)
**Niveau** : User goal
**Stories liees** : nouvelle (D12 livre)
**Statut** : **Implemente (D12)**

---

## Precondition

- L'utilisateur est authentifie (sauf sur `/login` ou le selector est aussi accessible — V1)
- L'app est servie par Next.js 15 avec `next-intl@4.12` configure en mode "without i18n routing"

## Declencheur

L'utilisateur clique sur l'un des boutons du `<LanguageSwitcher />` situe dans le footer de la Sidebar (FR ou EN).

## Scenario nominal (happy path)

1. L'utilisateur est connecte, la Sidebar est montee avec la locale courante (defaut FR si pas de cookie)
2. Le `<LanguageSwitcher />` affiche 2 boutons : `FR` et `EN`. Le bouton de la locale courante est `disabled`
3. L'utilisateur clique sur `EN`
4. Le bouton passe en etat `pending` (opacite 50%, disabled)
5. Le frontend appelle la server action `setLocale("en")` (file `src/i18n/setLocale.ts`)
6. La server action :
   - Valide que la locale est dans la liste (`fr`, `en`)
   - Ecrit le cookie HttpOnly `crm-commercial-locale=en` (path=/, sameSite=lax, maxAge=1an, secure en prod)
   - Appelle `revalidatePath("/", "layout")` pour forcer la re-render du root layout
7. Le navigateur re-fetch la page avec le nouveau cookie
8. Le `getRequestConfig` cote serveur lit le cookie `crm-commercial-locale` et resolve les messages `messages/en.json`
9. Le `NextIntlClientProvider` propage la locale aux composants client
10. Toute la UI bascule en anglais sans rechargement explicite (server components re-rendered)
11. La sidebar affiche maintenant : Dashboard, Pipeline, Follow-up, Clients, Agenda, Settings (vs equivalents FR)
12. Le `<html lang="en">` est mis a jour (a11y + SEO)

## Alternatives

- **A1** : L'utilisateur clique sur la locale courante (FR alors qu'il est en FR) → no-op, le bouton est `disabled`
- **A2** : L'utilisateur n'a pas encore de cookie → fallback sur defaut FR
- **A3** : Locale du cookie corrompue (valeur inattendue) → fallback sur defaut FR

## Exceptions

- **E1** : La server action echoue (erreur serveur) → le bouton sort de `pending` mais la locale ne change pas. Pas de toast (UX silencieuse)
- **E2** : Cookie blocked par le navigateur (mode prive strict) → fallback systematique sur FR, le switch ne persiste pas entre sessions
- **E3** : Une cle de traduction manque dans `messages/en.json` → next-intl affiche la cle entre crochets `[Sidebar.dashboard]` (mode dev) ou fallback FR (mode prod via `getMessageFallback`)

## Postcondition

- **Etat client** :
  - Cookie `crm-commercial-locale` = `en` (ou `fr`)
- **Etat UI** :
  - Toutes les chaines traduites (~30 cles couvertes en D12, le reste fallback FR)
  - `<html lang>` mis a jour
  - Le bouton `EN` est maintenant `disabled` (locale courante)
  - Le bouton `FR` redevient `enabled`

## Regles metier

- **RM1** : La locale est par utilisateur, persistee dans son cookie (pas dans la BDD au MVP)
- **RM2** : Defaut FR si pas de cookie ou cookie invalide
- **RM3** : Mode "without i18n routing" : les URLs sont identiques quelle que soit la locale (pas de `/fr/login` vs `/en/login`)
- **RM4** : Les fichiers `messages/{fr,en}.json` ont la meme structure de cles — toute cle manquante en EN tombe sur la valeur FR (fallback configure dans `getRequestConfig`)
- **RM5** : Le PDF devis (Puppeteer template) n'est PAS traduit au MVP — locale FR uniquement. Bascule en V1.1.
- **RM6** : Les emails envoyes par le systeme (V1) seront dans la locale du destinataire (a definir : locale du cabinet ou locale de l'editeur ?)

## Tests E2E

- `apps/frontend/tests/e2e/i18n.spec.ts` (a creer en D10) — scenarios :
  - Click sur EN → la sidebar affiche "Dashboard" en anglais (deja le cas en FR — chaine identique)
  - Click sur EN → le titre de la page login devient "Sign in"
  - Refresh → la locale est persistee (lecture cookie au mount)
  - Pas de cookie → fallback FR

## Notes techniques

- **Lib** : `next-intl@4.12` (mode "without i18n routing")
- **Fichiers config** :
  - `apps/frontend/src/i18n/routing.ts` — liste locales (`fr`, `en`)
  - `apps/frontend/src/i18n/request.ts` — `getRequestConfig` lit le cookie
  - `apps/frontend/src/i18n/setLocale.ts` — server action write cookie + revalidate
  - `apps/frontend/next.config.js` — plugin `createNextIntlPlugin`
- **Composants front** :
  - `apps/frontend/src/components/layout/LanguageSwitcher.tsx`
  - `apps/frontend/src/app/layout.tsx` — `NextIntlClientProvider` wrap
- **Fichiers messages** :
  - `apps/frontend/messages/fr.json` (~30 cles critiques)
  - `apps/frontend/messages/en.json` (idem)
- **Cookie** :
  - Nom : `crm-commercial-locale`
  - Type : HttpOnly, SameSite=Lax, Secure en prod, MaxAge 1 an
- **Permissions** : aucune (tous les utilisateurs authentifies, et meme `/login` public)

---

*UC-05 cree le 2026-05-22. Implemente en D12. Maintenance : a etendre quand de nouvelles cles sont traduites (PDF, emails, messages d'erreur Zod en V1.1).*
