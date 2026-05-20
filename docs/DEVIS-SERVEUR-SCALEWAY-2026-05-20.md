# Devis serveur Scaleway — CRM Commercial — 5 cabinets / 3 mois initiaux

**Version** : 1.0 — 2026-05-20
**Auteur** : Dimitry
**Destinataire** : Florian
**Periode couverte** : juin 2026 → aout 2026 (3 mois initiaux, renouvelable mensuellement)

---

## 1. Benchmark — consommation actuelle (dev local)

Mesure realisee sur la machine de dev (`docker stats`), workload : seed 2 tenants + 30 process + 4 devis + 87 documents (seed.local.ts), 0 user actif simultane.

| Conteneur | CPU au repos | RAM utilisee |
|-----------|--------------|--------------|
| crm-commercial-backend | 0.13 % | 153 MB |
| crm-commercial-frontend (dev hot-reload) | 0.00 % | 1.1 GB |
| crm-commercial-postgres | 0.00 % | 51 MB |
| **Total dev** | < 1 % | **~1.3 GB** |

Taille BDD : **10 MB** (seed + structure).

### 1.1. Projections production — 5 cabinets

Le mode prod va consommer moins que le dev (pas de hot-reload Next.js) mais plus avec un trafic reel :

| Composant | RAM prod estime | Justification |
|-----------|------------------|---------------|
| Frontend Next.js (next start) | 200-400 MB | Build optimise, pas de hot-reload |
| Backend Express + Prisma + Puppeteer | 400-600 MB | Connection pool + audit logs + PDF gen ponctuel |
| Postgres self-hosted | 500 MB - 1 GB | Pool buffer + shared_buffers tune pour ~5 cabinets |
| Traefik | 50-100 MB | Reverse proxy |
| Monitoring Loki / Promtail | 200-300 MB | Optionnel |
| Outil externe de Florian (estimation) | 300-500 MB | Conteneur partage meme network |
| Marge OS Debian + buffer pic | 500 MB - 1 GB | Updates, cron, backups |
| **Total estime** | **2.5 - 4 GB RAM** | |

| Composant | Storage estime |
|-----------|-----------------|
| BDD Postgres (5 cabinets × ~200 process moyens × ~100 KB metadata) | ~1-2 GB |
| Uploads documents (transition avant Drive) | 1-5 GB |
| Backups quotidiens chiffres (rotation 30j) | 5-15 GB |
| OS + apps + logs | 5 GB |
| **Total storage prevoir** | **30-50 GB minimum** |

Bandwidth estime : 10-30 GB egress / mois (utilisateurs cabinet + appels API Florian).

---

## 2. Options Scaleway (Region Paris FR-PAR-2)

Tarifs releves sur scaleway.com le 2026-05-20. Tous prix EN EUR HT par mois, hors taxes (TVA 20 %).

### Option A — Confort recommande : DEV1-L

| Composant | Description | Cout HT / mois |
|-----------|-------------|------|
| Compute Instance DEV1-L | 4 vCPU + 8 GB RAM + 80 GB local SSD + 400 Mbps | **30.66 EUR** |
| Object Storage Standard One Zone | ~5 GB initiaux | **0.04 EUR** |
| IP publique flexible | 1 IP statique | **0.99 EUR** |
| Bandwidth | 75 GB egress gratuit, conso estimee 10-30 GB | **0 EUR** |
| Snapshots backup | Sauvegarde locale chiffree, retention 30j sur S3 | inclus / 0.04 EUR |
| **Total HT mensuel** | | **31.73 EUR HT** |
| **Total TTC mensuel (TVA 20 %)** | | **38.08 EUR TTC** |
| **Cout 3 mois TTC** | | **114.23 EUR TTC** |

**Justification** :
- 4 vCPU = confort pour Puppeteer (generation PDF devis, ponctuelle mais CPU-intensive)
- 8 GB RAM = marge confortable (estim 2.5-4 GB max, buffer 100 %)
- 80 GB SSD local = couvre BDD + uploads + backups locaux
- 400 Mbps bandwidth = largement suffisant

### Option B — Plus de marge : PRO2-XXS

| Composant | Cout HT / mois |
|-----------|------|
| Compute Instance PRO2-XXS | 2 vCPU + 8 GB RAM + storage block dedie | **40.15 EUR** |
| Block Storage 50 GB | 0.0998 EUR/GB → 5 EUR | **5.00 EUR** |
| Object Storage Standard One Zone | ~5 GB | **0.04 EUR** |
| IP publique | | **0.99 EUR** |
| **Total HT** | | **46.18 EUR HT** |
| **Total TTC** | | **55.42 EUR TTC** |
| **Cout 3 mois TTC** | | **166.25 EUR TTC** |

**Justification** : Block storage dedie = meilleure resilience (snapshot independant du VPS). RAM 8 GB identique a DEV1-L mais 2 vCPU au lieu de 4.

**Trade-off** : moins de CPU mais block storage independant = meilleur pour le scaling futur. **Non recommande** pour le scope 5 cabinets initiaux.

### Option C — Frugal : PLAY2-NANO

| Composant | Cout HT / mois |
|-----------|------|
| Compute Instance PLAY2-NANO | 2 vCPU + 4 GB RAM + 80 GB local SSD + 200 Mbps | **19.71 EUR** |
| Object Storage | ~5 GB | **0.04 EUR** |
| IP publique | | **0.99 EUR** |
| **Total HT** | | **20.74 EUR HT** |
| **Total TTC** | | **24.89 EUR TTC** |
| **Cout 3 mois TTC** | | **74.66 EUR TTC** |

**Justification** : minimum viable. Marche pour 5 cabinets a faible trafic, mais risque OOM si pic ou si l'outil de Florian consomme beaucoup.

**Trade-off** : moins de marge si croissance imprevue → upgrade DEV1-L mid-period si besoin (Scaleway supporte le hot resize).

---

## 3. Recommandation

**Option A — DEV1-L a 38 EUR TTC / mois.**

Justification :
1. **Pile dans la fourchette communiquee a Florian (20-50 EUR)** : 38 EUR TTC = milieu de cible.
2. **Marge confort 100 %** : si la consommation reelle s'avere ~4 GB, on a encore 4 GB de buffer pour pic / outil Florian / monitoring.
3. **4 vCPU** = pas de degradation lors d'un pic concurrent (5 commerciaux qui generent un PDF simultanement, par ex.).
4. **80 GB SSD local** = BDD + uploads + backups sans souci pour 12-18 mois de croissance.
5. **Hot resize Scaleway** : on peut upgrader vers DEV1-XL (46.57 EUR HT) ou PRO2-XS (80.30 EUR HT) sans migration en cas de croissance plus forte que prevu.

**Cas de bascule** :
- > 8 cabinets actifs : evaluer PRO2-XS (4 vCPU / 16 GB)
- > 20 cabinets : decoupler Postgres en managed Database Essential + maintenir DEV1-L pour le compute

---

## 4. Cout total Editeur pour 3 mois initiaux

| Mois | VPS | Storage | IP | Total TTC |
|------|-----|---------|-----|-----------|
| Juin 2026 | 36.79 | 1.20 | 1.19 | **39.18 EUR TTC** |
| Juillet 2026 | 36.79 | 1.20 | 1.19 | **39.18 EUR TTC** |
| Aout 2026 | 36.79 | 1.20 | 1.19 | **39.18 EUR TTC** |
| **Total 3 mois** | | | | **~117.54 EUR TTC** |

**Refacturation aux cabinets via Florian** : a definir dans le contrat de licence. Suggestion : 8-10 EUR / cabinet / mois → 5 cabinets × 9 EUR × 3 mois = **135 EUR TTC** facture aux cabinets, marge Editeur ~17 EUR sur le serveur (couvre electricite operations).

---

## 5. Contenu du serveur

Stack qui tournera sur le VPS :

- **Conteneurs CRM Commercial** : `crm-commercial-backend`, `crm-commercial-frontend`, `crm-commercial-postgres`
- **Outil externe Florian** : conteneur(s) fourni(s) par Florian, deploye sur le meme network Docker pour acces aux endpoints `/api/internal/*`
- **Traefik** : reverse proxy TLS
- **Monitoring** (optionnel) : Grafana + Loki + Promtail si besoin

Network Docker partage `florian-tools-network` ou equivalent.

---

## 6. Engagements operationnels (cf. CDCF section 7)

- Uptime cible : 99 % mensuel
- RPO (perte de donnees max) : 24h
- RTO (temps de restauration) : 4h
- Backups quotidiens chiffres vers S3 Scaleway
- Tests mensuels de restauration
- Monitoring 24/7 avec alertes email/Slack

---

## 7. Conditions

- **Validite du devis** : 30 jours (jusqu'au 2026-06-19)
- **Renouvellement** : mensuel automatique, facturation a M+1
- **Cloture / migration** : preavis 30 jours pour cessation. Backups remis en clair sur demande.
- **Modification des SKU** : ajustement possible apres validation conjointe Florian + Editeur

---

## 8. Validation

| Action | Acteur | Echeance |
|--------|--------|----------|
| Validation du devis (Option A ou autre) | Florian | 22 mai 2026 |
| Creation du compte Scaleway au nom de [Editeur ou Florian, a definir] | Dimitry ou Florian | 23 mai 2026 |
| Provisionnement VPS + DNS + Postgres | Dimitry | 25-26 mai 2026 (D6) |
| Deploy CRM en production | Dimitry | 28-29 mai 2026 (D11) |

---

*Devis genere par Dimitry dans le cadre du CDCF Post-POC vers V1.*
