# UC-41 : Uploader un document (avec modal HDS de consentement)

**Domaine** : Documents / Conformite HDS
**Acteur primaire** : COMMERCIAL, ADMIN
**Acteur secondaire** : Systeme (multer + filesystem local OU Google Drive en V1.1)
**Niveau** : User goal
**Stories liees** : `EP06-S02` (Upload + preview + telechargement)
**Statut** : Implemente (P3 ajoute modal HDS + ADR-0002)

---

## Precondition

- L'utilisateur est authentifie (ADMIN ou COMMERCIAL)
- Un `ProcessDocument` existe avec `status=EN_ATTENTE` (ou statuts permettant l'upload)
- Le fichier source est sur le poste de l'utilisateur, format : `image/jpeg`, `image/png`, ou `application/pdf`
- Taille fichier <= 10 MB
- Le tenant a accepte les CGU (UC-03, V1)

## Declencheur

L'utilisateur clique sur l'icone "Upload" (Lucide Upload) sur la ligne d'un `ProcessDocument` dans l'onglet "Documents" du `ProcessPanel`.

## Scenario nominal (happy path)

1. L'utilisateur ouvre l'onglet "Documents" d'un process
2. La checklist affiche les `ProcessDocument` requis (label + statut + actions)
3. L'utilisateur clique sur le bouton Upload (Lucide Upload) d'un document `EN_ATTENTE`
4. Le `<input type="file">` cache s'ouvre, le user selectionne un fichier
5. Le frontend appelle `handleUploadRequest(doc, file)` :
   - Verifie `sessionStorage.getItem("crm-commercial:hds-upload-consent")` (cle UPLOAD_CONSENT_KEY)
   - **Si consent absent** : le fichier est stocke dans `pendingUpload`, la modal HDS s'ouvre (cf etape 6)
   - **Si consent present** : passe directement a l'etape 10 (uploadFile)
6. La modal "Avant d'uploader ce document" s'affiche avec :
   - Titre : `Hds.uploadModalTitle` (i18n)
   - Description : `Hds.uploadModalIntro` — explique : pas de document medical, uniquement administratif/financier
   - Encadre amber : `Hds.uploadModalForbidden` — liste des interdits (bilan sanguin, ECG, consentement eclaire, ordonnance, CRO, photo avant/apres, echographie, mammographie, tout doc Art. 9 RGPD)
   - Bouton "Annuler" (ferme la modal, oublie le fichier)
   - Bouton "Je confirme et j'upload" (`Hds.uploadModalConfirm`)
7. L'utilisateur lit + clique "Je confirme et j'upload"
8. Le frontend execute `confirmConsentAndUpload()` :
   - `sessionStorage.setItem("crm-commercial:hds-upload-consent", "true")` — le consent est sticky pour le reste de la session
   - Recupere le fichier de `pendingUpload`
   - Vide `pendingUpload`
9. Le frontend lance `uploadFile(doc, file)` (optimistic update : `status=RECU`, `fileUrl="pending-upload"`)
10. Le frontend appelle `POST /api/processes/:id/documents/:dId/upload` (multipart, header Authorization Bearer JWT)
11. Le backend (multer + handler) :
    - Verifie auth + tenant isolation (le `ProcessDocument` appartient au tenant courant)
    - Verifie le MIME (`image/jpeg`, `image/png`, `application/pdf`)
    - Verifie la taille <= 10 MB
    - Rejette tout nom contenant `..` ou `/` (anti path-traversal)
    - Genere un UUID pour le filename : `{uuid}.{ext}`
    - Stocke le fichier dans `uploads/{tenantId}/{processId}/{uuid}.{ext}` (chemin local Scaleway au MVP, Google Drive en V1.1)
    - Met a jour `ProcessDocument.fileUrl = "{tenantId}/{processId}/{uuid}.{ext}"`, `status=RECU`, `receivedAt=now()`
    - Retourne 200 + le `ProcessDocument` updated
12. Le frontend confirme l'optimistic + toast "Fichier televerse"
13. Le badge de progression documents (`DocumentProgressBadge`) est rafraichi

## Alternatives

- **A1** : L'utilisateur a deja confirme dans la session → pas de modal, upload direct
- **A2** : L'utilisateur clique sur Upload pour remplacer un fichier existant (`fileUrl != null`) → meme flow, mais le fichier precedent reste sur le disque (pas de cleanup automatique au MVP)
- **A3** : Format non supporte (MIME) → message error inline, le `<input>` est reset

## Exceptions

- **E1** : Fichier > 10 MB → backend renvoie 413 → toast "Fichier trop lourd (max 10 MB)" + revert optimistic
- **E2** : MIME non autorise (.exe, .docx, .zip...) → backend renvoie 400 → toast + revert
- **E3** : Path traversal tente (`../../etc/passwd.pdf`) → backend renvoie 400 → log securite + revert
- **E4** : Cross-tenant (le `dId` n'appartient pas au tenant) → 404
- **E5** : Backend down / network error → toast "Erreur reseau" + revert
- **E6** : Auth expiree pendant l'upload → 401 → redirect /login + sauvegarde URL
- **E7** : Espace disque plein cote serveur → 500 → toast + alerte ops (monitoring)
- **E8** : User refuse la modal HDS → fermeture, `pendingUpload` vide, aucun upload, aucun consent stocke

## Postcondition

- **Etat BDD** :
  - `ProcessDocument.fileUrl` mise a jour avec le chemin
  - `ProcessDocument.status = "RECU"`
  - `ProcessDocument.receivedAt = now()`
  - V1 : 1 entree `AuditLog` (action="document.uploaded", details)
- **Etat filesystem** :
  - Nouveau fichier dans `uploads/{tenantId}/{processId}/{uuid}.{ext}` (V1) OU dans Google Drive (V1.1)
- **Etat UI** :
  - Document affiche maintenant Eye (preview) + Download
  - Badge progression rafraichi
  - SessionStorage `crm-commercial:hds-upload-consent = "true"` jusqu'a la fin de session navigateur

## Regles metier

- **RM1** : Le modal HDS s'affiche **une fois par session**, pas a chaque upload
- **RM2** : L'absence de consent → upload bloque cote frontend (defense en profondeur)
- **RM3** : Le consent est stocke en `sessionStorage` (pas localStorage) → reset a chaque nouveau onglet/fermeture navigateur
- **RM4** : Les formats acceptes sont restreints : JPEG, PNG, PDF uniquement (defense par MIME)
- **RM5** : Taille max 10 MB (defense contre DoS de stockage)
- **RM6** : Anti path-traversal cote backend (defense en profondeur)
- **RM7** : Stockage local au MVP, bascule Google Drive en V1.1 (cf ADR-0003 + UC-46)
- **RM8** : Audit log immutable des uploads (V1, AuditLog table)

## Tests E2E

- `apps/frontend/tests/e2e/documents.spec.ts` (a etendre pour le modal HDS) — scenarios :
  - Premier upload de la session → modal affiche → confirme → upload OK
  - Deuxieme upload meme session → pas de modal → upload direct
  - User refuse modal → fichier non uploade
  - Tentative upload .exe → erreur 400 + toast
- `apps/backend/tests/security/documents.test.ts` — backend :
  - Upload > 10 MB → 413
  - Upload .exe → 400
  - Path traversal → 400
  - Cross-tenant → 404

## Notes techniques

- **Routes API** :
  - `POST /api/processes/:id/documents/:dId/upload` (multipart, multer middleware)
  - `GET /api/processes/:id/documents/:dId/preview` (inline)
  - `GET /api/processes/:id/documents/:dId/download` (attachment)
- **Composants front** :
  - `apps/frontend/src/components/documents/DocumentsTab.tsx` :
    - `handleUploadRequest(doc, file)` — gate de consentement
    - `confirmConsentAndUpload()` — set consent + upload
    - `uploadFile(doc, file)` — optimistic + POST
    - `<Dialog>` HDS avec messages i18n (`Hds.*` keys)
  - `<UploadButton />` — input file hidden + label
- **i18n** : modal traduit FR + EN (cle `Hds.uploadModalTitle`, `Hds.uploadModalIntro`, `Hds.uploadModalForbidden`, `Hds.uploadModalConfirm`)
- **Constante** : `UPLOAD_CONSENT_KEY = "crm-commercial:hds-upload-consent"` (sessionStorage)
- **Lib** : `multer` cote backend (deja installe)
- **Stockage** : `path.join(UPLOADS_DIR, tenantId, processId, uuid + ext)` — `UPLOADS_DIR = /app/uploads` dans le container
- **Permissions** : ADMIN + COMMERCIAL

## Conformite RGPD

- Voir `docs/legal/CGU-clause-HDS-non-medical.md` Art. X (interdiction donnees Art. 9)
- Voir `docs/legal/MESSAGING-IN-APP-NON-HDS.md` — emplacement U1 (modal HDS)
- Voir ADR-0003 — strategie globale non-HDS

---

*UC-41 cree le 2026-05-22. Modal HDS livre en P3 (ADR-0002). Maintenance : a maj quand on bascule sur Google Drive (V1.1, UC-46).*
