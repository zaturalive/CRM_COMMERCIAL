#!/usr/bin/env bash
# ============================================================================
# prod-boot-smoke.sh — non-regression du BOOT de l'image PROD backend (R1-build)
#
# POURQUOI ce test existe (audit AUDIT-PREPROD-2026-06-02 C1, CRITICAL) :
# l'image de production ne demarre pas. Le stage `dev` (celui qui tourne en
# local via tsx + bind-mount) masque le defaut, mais un `node dist/index.js`
# reel plante au chargement du module devisLoader.js sur
# `require("@crm/shared/devis/computeTotal")` :
#   - `packages/shared/package.json` exports `default` pointe sur du .ts brut
#     (./src/devis/computeTotal.ts) que `node` ne sait pas charger ;
#   - le stage `deps` du Dockerfile ne copie jamais `packages/shared`, donc le
#     workspace @crm/shared n'est meme pas lie/installe dans node_modules.
# Reproduction live (2026-06-02, dans le conteneur dev) :
#   node -e "require('@crm/shared/devis/computeTotal')"
#   -> SyntaxError: Unexpected token 'export'
#
# POURQUOI un script hote (et pas un test vitest) : vitest tourne DANS le
# conteneur backend, qui n'a pas acces au daemon Docker. Or ce test doit
# justement `docker build --target prod` PUIS `docker run node dist/index.js`.
# C'est donc le smoke test CI reclame par l'audit (section 5, reco C1 #4) :
# "ne plus shipper une image qui ne demarre pas".
#
# Contrat (ce que le script asserte) :
#   1. l'image prod se BUILD   (docker build --target prod) ;
#   2. `node dist/index.js` BOOTE sans crash de chargement de module ;
#   3. le boot atteint le log "Backend started" (preuve que app.listen a tourne).
#
# ETAT ATTENDU AUJOURD'HUI : ROUGE.
#   - soit le build echoue, soit le run plante sur le module @crm/shared.
#   - ce script DOIT donc sortir en code != 0 tant que R1-build n'est pas livre.
# ETAT ATTENDU APRES FIX R1 : VERT (build OK + "Backend started" + pas de crash).
#
# Boot deterministe : l'env ci-dessous est volontairement minimal-mais-valide
# (env.ts parse process.env au chargement ; on lui donne de quoi passer pour
# que le SEUL mode d'echec possible avant "Backend started" soit le crash de
# module). Prisma se connecte en lazy (premiere requete), donc app.listen
# reussit sans base joignable : on n'a pas besoin d'un Postgres pour ce test.
# ============================================================================

set -uo pipefail

# Racine du repo, quel que soit le cwd d'appel (le contexte de build est la racine).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

IMAGE_TAG="crm-backend:ci"
CONTAINER_NAME="crm-backend-bootsmoke-$$"
DOCKERFILE="apps/backend/Dockerfile"

# Signatures d'echec a detecter dans les logs du conteneur. On reste sur des
# patterns precis et sources (messages reels reproduits le 2026-06-02), pas sur
# des absolus vagues : on ne dit pas "ca marche toujours", on cherche le crash
# documente.
CRASH_PATTERNS='Cannot find module|@crm/shared|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|Unexpected token .export|MODULE_NOT_FOUND'
BOOT_OK_PATTERN='Backend started'

log()  { printf '\n[prod-boot-smoke] %s\n' "$*"; }
fail() { log "RESULT: FAIL — $*"; cleanup; exit 1; }
pass() { log "RESULT: PASS — $*"; cleanup; exit 0; }

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ─── Etape 1 : build du stage prod ──────────────────────────────────────────
log "build: docker build --target prod -f $DOCKERFILE -t $IMAGE_TAG ."
if ! docker build --target prod -f "$DOCKERFILE" -t "$IMAGE_TAG" . ; then
  fail "le stage prod ne BUILD pas (cf. audit C1 — packaging @crm/shared / prisma)."
fi

# ─── Etape 2 : run `node dist/index.js` et capture du boot ──────────────────
# Env minimal-mais-valide pour franchir env.ts (zod) sans dependre d'un secret
# reel. Cles factices : ce test ne chiffre rien, il ne fait que booter le process.
DUMMY_AT_REST_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"

log "run: node dist/index.js (CMD par defaut de l'image)"
docker run -d --name "$CONTAINER_NAME" \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL="postgresql://smoke:smoke@127.0.0.1:5432/smoke" \
  -e JWT_SECRET="smoke-test-jwt-secret-at-least-32-characters-long" \
  -e FRONTEND_URL="http://localhost:3000" \
  -e AT_REST_KEY="$DUMMY_AT_REST_KEY" \
  -e EMAIL_SEARCH_KEY="smoke-test-email-search-key-at-least-32-chars" \
  "$IMAGE_TAG" >/dev/null 2>&1 || fail "docker run n'a pas pu demarrer le conteneur."

# Laisse au process le temps soit de booter, soit de crasher au require().
# Boucle d'attente courte : on s'arrete des qu'on a une preuve (boot OK,
# crash, ou conteneur mort), sinon on coupe a la limite.
DEADLINE=$((SECONDS + 30))
OUTCOME="timeout"
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  LOGS="$(docker logs "$CONTAINER_NAME" 2>&1)"

  if printf '%s' "$LOGS" | grep -Eq "$CRASH_PATTERNS"; then
    OUTCOME="crash"; break
  fi
  if printf '%s' "$LOGS" | grep -Eq "$BOOT_OK_PATTERN"; then
    OUTCOME="boot_ok"; break
  fi
  # Conteneur sorti sans avoir logge le boot -> echec (crash silencieux/env).
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null)" = "false" ]; then
    OUTCOME="exited"; break
  fi
  sleep 1
done

LOGS="$(docker logs "$CONTAINER_NAME" 2>&1)"
log "----- logs conteneur -----"
printf '%s\n' "$LOGS"
log "--------------------------"

case "$OUTCOME" in
  crash)
    fail "BOOT CRASH detecte (regression C1 : require @crm/shared / module manquant)."
    ;;
  exited)
    EXIT_CODE="$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || echo '?')"
    fail "le conteneur est sorti avant 'Backend started' (exit=$EXIT_CODE)."
    ;;
  boot_ok)
    pass "l'image prod boote : 'Backend started' present, aucun crash de module."
    ;;
  *)
    fail "timeout : ni 'Backend started' ni crash detecte en 30s."
    ;;
esac
