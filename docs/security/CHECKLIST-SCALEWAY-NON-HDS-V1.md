# Checklist securite — Hebergement Scaleway non-HDS (V1)

> **Statut** : a executer avant la mise en prod V1.
> **Reference** : `docs/architecture/decisions/0003-pas-de-bascule-hds-immediate-mitigation-cgu-securite.md`
> **Responsable** : Dimitry (dev) + ops Scaleway + Florian (DPO de facto)

---

## P0 — Bloquant prod (a faire avant le premier client)

### S1 — TLS 1.3 obligatoire + HSTS preload
- [ ] Traefik configure avec `tls.options.minVersion: VersionTLS13`
- [ ] HSTS preload header avec `max-age=63072000; includeSubDomains; preload`
- [ ] Soumission au [HSTS preload list](https://hstspreload.org/)
- [ ] Test : SSL Labs grade A+ minimum
- [ ] Test : `curl -I https://crm-commercial.<domaine>/` montre `Strict-Transport-Security`

### S2 — Chiffrement at rest
- [ ] Postgres : activation `pgcrypto` sur les colonnes sensibles (`Client.email`, `Client.phone`, `noteCommerciale`)
- [ ] OU : volume Scaleway chiffre cote infra (LUKS dm-crypt si self-hosted, transparent si managed)
- [ ] Test : `psql` + verifier que les colonnes encrypted ne sont pas lisibles en plain text dans `pg_dump`
- [ ] Documenter les cles de chiffrement (KMS Scaleway recommande)

### S4 — Audit logs immutables
- [ ] Middleware express qui log toute mutation API (POST/PATCH/DELETE) dans une table `AuditLog`
- [ ] `AuditLog` : `id, userId, tenantId, method, path, body_hash, ip, userAgent, occurredAt` — pas de delete dur (append-only)
- [ ] Retention 5 ans minimum (obligation comptable)
- [ ] Export periodique vers stockage immuable (S3 Object Lock ou equivalent)
- [ ] Test : POST sur une route mutation → entree dans AuditLog visible

### S8 — Backup quotidien chiffre
- [ ] Cron quotidien `pg_dump` + chiffrement GPG ou age + upload S3 Scaleway
- [ ] Retention 30j minimum (rotation)
- [ ] Test mensuel de restauration sur env de test
- [ ] Documenter la procedure de restoration (RTO < 4h, RPO < 24h)

### S10 — Pentest externe
- [ ] Choisir un prestataire (estimation : 2-3k EUR pour pentest applicatif)
- [ ] Scope : auth, API, upload, RBAC, injection
- [ ] Resoudre les findings P0 / P1 avant la mise en prod
- [ ] Refaire un pentest annuel

### S11 — Registre des traitements RGPD
- [ ] Etablir le registre (Art. 30 RGPD) — responsable : Florian
- [ ] Lister les finalites, bases legales, categories de donnees, destinataires, durees de conservation
- [ ] Conserver une copie a disposition de la CNIL

### S12 — Process notification violation < 72h
- [ ] Procedure documentee : qui notifie qui ?
- [ ] Template d'email notification CNIL (Art. 33)
- [ ] Template d'email notification clients (Art. 34 — si risque eleve)
- [ ] Drill annuel : simulation de violation + verification du timing

---

## P1 — Important (avant 6 mois de prod)

### S3 — Authentification renforcee (2FA)
- [ ] 2FA obligatoire ADMIN (TOTP via Google Authenticator / 1Password)
- [ ] 2FA optionnel COMMERCIAL (recommande mais pas force)
- [ ] Recovery codes (10 codes one-shot)
- [ ] Documenter le process de recuperation (perte de telephone)

### S5 — Retention sessions JWT
- [ ] JWT court terme (8h) + refresh token long terme (30j)
- [ ] Revocation server-side via table `RevokedToken` (logout, suspect activity)
- [ ] Test : un JWT expire renvoie 401 ; un refresh token valide donne un nouveau JWT

### S9 — Scan vulnerabilites dependances
- [ ] `npm audit --omit=dev --audit-level=high` integre en CI
- [ ] GitHub Dependabot active sur le repo
- [ ] Mise a jour mensuelle des deps (PR auto)
- [ ] Snyk ou equivalent (optionnel — gratuit pour solo dev)

### S13 — Droits RGPD : acces, portabilite, suppression
- [ ] Route `GET /api/me/export` : export JSON de toutes les donnees du user authentifie
- [ ] Route `DELETE /api/me` : suppression / anonymisation complete (cascade Client, Process, Devis, Documents, MessageSendLog)
- [ ] Page UI dans `/account/privacy` : telechargement export + bouton suppression compte
- [ ] Anonymisation : remplacer `firstName/lastName/phone/email` par "ANONYMISE", garder le reste pour stats

---

## P2 — Bonus (premiere annee)

### Monitoring + alerting
- [ ] Grafana + Loki + Promtail (deja en place sur la machine dev)
- [ ] Dashboards : RPS, latence, error rate, login failures, JWT issued
- [ ] Alertes : > 5 login failures meme IP en 1min, > 100 5xx en 5min, espace disque > 80%, certificat TLS < 30j
- [ ] Notification Slack ou email

### WAF (Web Application Firewall)
- [ ] ModSecurity en frontal Traefik (deja en place sur la machine dev — `modsecurity` containers)
- [ ] OWASP Core Rule Set
- [ ] Rate limiting par IP + par tenant

### Audit IAM
- [ ] Revoir les permissions chaque trimestre (qui a acces a quoi ?)
- [ ] Principe du moindre privilege : pas d'admin par defaut
- [ ] Logs d'acces SSH au serveur (`auth.log` centralise vers Loki)

---

## Scaleway non-HDS — config recommandee

### Infra
- [ ] VPS dedie (pas instance Lite mutualisee) en region Paris (FR-PAR-2)
- [ ] OS : Debian 12 LTS hardened
- [ ] Firewall Scaleway : whitelist IPs admin pour SSH, ports 80/443 ouverts au public
- [ ] SSH : cles uniquement (`PasswordAuthentication no`), port custom (eviter 22)
- [ ] Updates automatiques : `unattended-upgrades` pour les patchs securite

### Postgres
- [ ] Option A : Postgres managed Scaleway (Multi-AZ, backups auto, monitoring inclus) — recommande
- [ ] Option B : Self-hosted avec replication maitre/replica
- [ ] Connexion : SSL obligatoire (`sslmode=require`)
- [ ] Pas d'acces externe (binding sur reseau prive Scaleway uniquement)
- [ ] Comptes : `postgres` (admin) + `crm_app` (RW limited) + `crm_readonly` (lecture pour monitoring)

### Stockage uploads
- [ ] S3 Scaleway Object Storage en region Paris
- [ ] Bucket prive (no public ACL)
- [ ] Pre-signed URLs avec TTL 5min pour download
- [ ] Lifecycle policy : suppression apres 5 ans (alignement obligation comptable)

### Logs
- [ ] Pas de logs verbeux contenant des donnees client (sanitize `firstName, lastName, phone, email, body` avant log)
- [ ] Logs structures JSON
- [ ] Centralisation Loki ou Scaleway Cockpit
- [ ] Retention 90j en chaud, 5 ans en froid (S3 archive)

---

## Validation finale

Pour declarer "V1 prod ready", tous les P0 doivent etre **coches**. Les P1 ont 6 mois de delai. Le pentest externe est un gate dur : si le rapport revele un find P0, la mise en prod est repoussee jusqu'a remediation.

Florian fait office de DPO pour le moment. Si > 250 employes ou traitement a grande echelle, designer un DPO formel (Art. 37 RGPD).

---

*Document genere le 2026-05-20 dans le cadre de l'ADR-0003. Maintenance : revue trimestrielle.*
