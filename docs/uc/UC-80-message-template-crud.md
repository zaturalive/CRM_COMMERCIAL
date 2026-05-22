# UC-80 : CRUD templates de messages

**Domaine** : Templates / Admin
**Acteur primaire** : ADMIN (config), tous roles (envoi)
**Niveau** : User goal
**Stories liees** : `EP09-S04`
**Statut** : Implemente

## Scenario nominal — Create

1. Admin va sur `/config/message-templates`
2. Click "+ Nouveau template"
3. Saisit : name, kind (MAIL/SMS_WHATSAPP/VIDEO), subject (si MAIL), body, mediaUrl (si VIDEO)
4. POST `/api/message-templates` body Zod-validated
5. UI rafraichit la liste

## Postcondition

- BDD : 1 `MessageTemplate` insert
- UI : carte template visible avec preview

## Regles metier

- **RM1** : Variables supportees dans body/subject : `{{client.firstName}}`, `{{client.lastName}}`, `{{prestation.name}}`, `{{cabinet.name}}`, `{{user.firstName}}`
- **RM2** : Soft-delete via `isActive=false` (preserve bindings interventions)
- **RM3** : Placeholders UI rappellent "Contenu commercial uniquement — pas de donnee medicale" (P3 Pattern A)

## Tests E2E

- `apps/frontend/tests/e2e/templates.spec.ts`

## Notes techniques

- **Route** : `/api/message-templates` (GET / POST / PATCH / DELETE)
- **Composant** : `MessageTemplatesAdmin.tsx`

---

*UC-80 stub.*
