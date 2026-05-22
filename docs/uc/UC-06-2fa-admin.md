# UC-06 : 2FA TOTP admin

**Domaine** : Auth / Securite
**Acteur primaire** : ADMIN
**Niveau** : User goal
**Stories liees** : nouvelle (D5 deadline checklist S3)
**Statut** : **Deadline D5**

## Scenario nominal — setup initial

1. ADMIN se connecte avec email + password (UC-01)
2. Si `User.totpSecret == null`, le systeme affiche un assistant 2FA :
   - QR code (otpauth URL)
   - Champ "Saisir le code a 6 chiffres"
3. ADMIN scanne le QR code avec Google Authenticator / 1Password
4. ADMIN saisit le code TOTP
5. Backend valide le TOTP (lib `otplib`) + stocke `User.totpSecret` (chiffre at rest)
6. Backend genere 10 recovery codes one-shot (`User.recoveryCodes` hashed)
7. UI affiche les recovery codes a sauvegarder (a usage unique)
8. Login confirme

## Scenario nominal — login subsequent

1. ADMIN saisit email + password → 200 + `step: "totp_required"`
2. UI affiche le champ TOTP
3. ADMIN saisit le code TOTP courant
4. Backend valide → JWT genere
5. Redirect `/dashboard`

## Alternatives

- **A1** : Code TOTP perdu → ADMIN saisit un recovery code → JWT genere + recovery code invalide
- **A2** : Tous les recovery codes consommes → procedure reset 2FA via support (V1)

## Exceptions

- **E1** : Code TOTP invalide → 401 + retry (max 3 / 5 min, sinon 429)
- **E2** : Recovery code deja utilise → 401

## Postcondition

- BDD : `User.totpSecret`, `User.recoveryCodes` (hashed)
- Session : JWT signe avec flag `mfaVerified: true`
- AuditLog : 2 entrees (setup + login)

## Regles metier

- **RM1** : 2FA obligatoire ADMIN, optionnel COMMERCIAL (configurable par tenant V1.1)
- **RM2** : Recovery codes one-shot (hashed bcrypt, comparaison constant-time)
- **RM3** : `totpSecret` chiffre at rest (pgcrypto pgp_sym_encrypt)
- **RM4** : Validation TOTP : `otplib.authenticator.verify({ token, secret })` (TOTP RFC 6238, 30s window)

## Tests

- `apps/backend/tests/security/2fa.test.ts` (a creer en D5) — scenarios :
  - Setup : QR genere, code valide, recovery codes affiches
  - Login : password OK + TOTP OK → JWT
  - Login : password OK + TOTP invalide → 401
  - Recovery code : un seul usage, puis 401

## Notes techniques

- **Lib** : `otplib` (npm) — pas de dep lourde
- **Routes** :
  - `POST /api/auth/2fa/setup` (genere secret + QR)
  - `POST /api/auth/2fa/verify` (verifie TOTP, complete login)
  - `POST /api/auth/2fa/recovery` (recovery code)
- **Migration Prisma** :
  - `User.totpSecret: String?` (chiffre)
  - `User.recoveryCodes: String[]` (array hashed)
  - `User.mfaEnabled: Boolean @default(false)`
- **Frontend** : nouvelle page `/login/2fa` (a creer en D5)

---

*UC-06 a implementer en D5 (securite site, deadline 29 mai).*
