/**
 * Outil CLI de chiffrement at-rest — inspection / manutention manuelle.
 *
 * POURQUOI : les champs chiffres at-rest (Client.email/phone, Process.noteCommerciale,
 * User/PlatformAdmin.totpSecret) sont stockes en blob "v1:..." illisible en SQL brut.
 * Cet outil permet, AVEC la cle (AT_REST_KEY / EMAIL_SEARCH_KEY de l'env courant), de :
 *   - decrypt : blob "v1:..." -> clair         (inspecter une valeur en base)
 *   - encrypt : clair        -> blob "v1:..."  (generer la valeur a ecrire si modif SQL)
 *   - hash    : clair        -> HMAC recherche (ex: recalculer un emailSearchHash)
 *
 * L'outil ne touche NI la DB NI le JWT : il stube les variables d'env non-crypto
 * requises par config/env et n'exige QUE AT_REST_KEY + EMAIL_SEARCH_KEY (les vraies cles).
 *
 * USAGE (DEV / local, en fournissant les cles — l'env dev passe par Docker, pas un .env) :
 *   AT_REST_KEY=... EMAIL_SEARCH_KEY=... npm run db:decrypt -- 'v1:....'
 *   AT_REST_KEY=... EMAIL_SEARCH_KEY=... npm run db:encrypt -- 'Jean Dupont'
 *
 * USAGE (PROD, cle du conteneur — l'image ne contient pas ce .ts, on passe par le dist) :
 *   sudo docker exec crm-commercial-backend node -e \
 *     'console.log(require("./dist/lib/crypto/atRest").decryptField(process.argv[1]))' 'v1:....'
 *
 * RAPPEL maintenance : ne JAMAIS "tout dechiffrer puis re-chiffrer". Pour modifier des
 * donnees, un script Prisma (findMany -> update) chiffre/dechiffre a la volee, ligne par
 * ligne, SANS downtime. Cet outil ne sert qu'a l'inspection ponctuelle / generer un blob.
 */

// Stubs des variables d'env non-crypto AVANT le chargement de config/env (import
// dynamique plus bas) : l'outil n'a besoin que des cles de chiffrement, pas de la DB,
// du JWT ni de l'URL front. AT_REST_KEY / EMAIL_SEARCH_KEY NE sont PAS stubes : ce sont
// les vraies cles, a fournir au lancement (sinon config/env leve "Required").
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.JWT_SECRET ??= "stub-jwt-secret-not-used-by-this-crypto-cli-tool";
process.env.FRONTEND_URL ??= "http://localhost:3000";

async function main(): Promise<void> {
  // Import dynamique : garantit que les stubs ci-dessus sont poses AVANT que
  // config/env (charge transitivement par atRest) ne valide process.env.
  const { encryptField, decryptField, isEncrypted, searchHash } = await import(
    "../src/lib/crypto/atRest"
  );

  const [, , cmd, ...rest] = process.argv;
  const value = rest.join(" ");

  function usage(): never {
    console.error("Usage : npm run db:<decrypt|encrypt|hash> -- '<valeur>'");
    console.error("  decrypt  'v1:...'  -> clair");
    console.error("  encrypt  'clair'   -> blob v1:...");
    console.error("  hash     'clair'   -> HMAC de recherche (emailSearchHash)");
    console.error("  (fournir AT_REST_KEY et EMAIL_SEARCH_KEY dans l'env)");
    process.exit(1);
  }

  if (!cmd || !value) usage();

  if (cmd === "decrypt") {
    if (!isEncrypted(value)) {
      console.error(
        "Pas un blob chiffre (prefixe v1: absent) — la valeur est deja en clair ?",
      );
      process.exit(2);
    }
    console.log(decryptField(value));
  } else if (cmd === "encrypt") {
    console.log(encryptField(value));
  } else if (cmd === "hash") {
    console.log(searchHash(value));
  } else {
    usage();
  }
}

main().catch((e) => {
  console.error("Erreur :", (e as Error).message);
  process.exit(3);
});
