import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";
import { requireJWT } from "./middleware/requireJWT";
import { requireTenant } from "./middleware/requireTenant";
import { requireEditor } from "./middleware/requireEditor";
import { requireCguAccepted } from "./middleware/requireCguAccepted";
import { require2faEnrolled } from "./middleware/require2faEnrolled";
import { requireEditor2faEnrolled } from "./middleware/requireEditor2faEnrolled";
import { auditLog } from "./middleware/auditLog";
import { createAuthRouter } from "./routes/auth";
import type { EmailSender } from "./lib/email/EmailSender";
import { createEmailSender } from "./lib/email/createEmailSender";
import adminRoutes from "./routes/admin";
import { createAdminLoginRouter } from "./routes/adminLogin";
import { createAdminTwoFactorRouter } from "./routes/adminTwoFactor";
import { createUsersRouter } from "./routes/users";
import meRoutes from "./routes/me";
import demoRoutes from "./routes/demo";
import tenantRoutes from "./routes/tenant";
import tenantPublicRoutes from "./routes/tenantPublic";
import cliniquesRoutes from "./routes/cliniques";
import interventionsRoutes from "./routes/interventions";
import documentLabelsRoutes from "./routes/documentLabels";
import clientsRoutes from "./routes/clients";
import pipelineRoutes from "./routes/pipeline";
import processesRoutes from "./routes/processes";
import devisRoutes from "./routes/devis";
import documentsRoutes from "./routes/documents";
import agendaRoutes from "./routes/agenda";
import settingsRoutes from "./routes/settings";
import dashboardRoutes from "./routes/dashboard";
import followupRoutes from "./routes/followup";
import messageTemplatesRoutes from "./routes/messageTemplates";
import documentTemplatesRoutes from "./routes/documentTemplates";
import trackingEventsRoutes from "./routes/trackingEvents";
import {
  blockingPointTagsRouter,
  processBlockingPointsRouter,
} from "./routes/blockingPoints";

/**
 * Options de construction de l'app.
 *
 * EP15-S03 / ADR-0009 D7 : emailSender est injectable (port branchable). Par
 * defaut, NoopEmailSender (aucun envoi reel) ; les tests injectent un
 * enregistreur, et la prod branchera SMTP/Brevo quand l'email sera active.
 */
export interface BuildAppOptions {
  emailSender?: EmailSender;
}

/**
 * Construit l'app Express sans ecouter — utilise par index.ts (prod) et les tests Supertest.
 */
export function buildApp(options: BuildAppOptions = {}): Express {
  const emailSender = options.emailSender ?? createEmailSender();
  const app = express();

  // SEC-04 : helmet pose les headers securite (X-Content-Type-Options, HSTS,
  // X-Frame-Options, Referrer-Policy, etc.) et retire X-Powered-By. Mount en
  // premier pour couvrir toutes les reponses, y compris /api/health et les 404.
  app.use(helmet());

  // CORS multi-tenant : en prod on a potentiellement plusieurs cabinets
  // (delobaux.crm-chirurgie.a3n.fr, xyz.crm-chirurgie.a3n.fr, etc.) qui
  // tapent tous le meme backend. On accepte FRONTEND_URL exact (dev) ET
  // les sous-domaines de DOMAIN (prod). Meme origin = relatif → pas de
  // prevol CORS mais on reste explicite pour les cas fetch cross-origin.
  const allowedOrigin = env.FRONTEND_URL;
  const domainRegex = process.env.DOMAIN
    ? new RegExp(`^https:\\/\\/[a-z0-9-]+\\.${process.env.DOMAIN.replace(/\./g, "\\.")}$`)
    : null;
  // EP14-S03 : en developpement, le frontend peut etre servi sur un sous-domaine
  // tenant en .localhost (ex http://demo.vencor-crm.localhost:3301, RFC 6761 6.3,
  // loopback). Origines autorisees hors production uniquement.
  const devSubdomainRegex =
    env.NODE_ENV !== "production"
      ? /^http:\/\/([a-z0-9-]+\.)?vencor-crm\.localhost(:\d+)?$/
      : null;
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // requetes same-origin / server-to-server
        if (origin === allowedOrigin) return callback(null, true);
        if (domainRegex && domainRegex.test(origin)) return callback(null, true);
        if (devSubdomainRegex && devSubdomainRegex.test(origin)) return callback(null, true);
        return callback(new Error("CORS: origin non autorise"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));

  // Healthcheck public
  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV,
      },
    });
  });

  // Routes auth (public + /me protege). EP15-S03 / D7 : l'EmailSender est injecte
  // dans le router (forgot-password l'utilise) ; NoopEmailSender par defaut.
  app.use("/api/auth", createAuthRouter(emailSender));

  // EP14-S03 — lookup public du nom de cabinet pour l'affichage au login (resolu
  // depuis le sous-domaine). PUBLIC : monte AVANT le requireJWT global ci-dessous,
  // car l'utilisateur n'est pas encore authentifie a ce stade. Read-only,
  // anti-enumeration (404 identique pour inexistant et suspendu). N'ouvre aucune
  // surface d'autorite : l'isolation reste portee par le JWT + Prisma $extends.
  app.use("/api/tenant", tenantPublicRoutes);

  // Routes demo — EP15-S05 / ADR-0009 : NODE_ENV=production est un plancher dur.
  // La surface de demo (/api/demo/switch-role re-signe un JWT avec le role
  // demande, donc permet une elevation de role) ne doit JAMAIS etre montee en
  // production, meme si DEMO_MODE=true est positionne par erreur sur l'instance.
  // POURQUOI ne plus lire DEMO_MODE ici : l'ancienne porte `|| env.DEMO_MODE`
  // re-ouvrait /api/demo en prod sur une simple variable d'env, ce qui faisait
  // de la coupure une hypothese de config plutot qu'une garantie. Hors prod
  // (development, test) la surface reste montee pour la demo locale.
  const demoEnabled = env.NODE_ENV !== "production";
  if (demoEnabled) {
    app.use("/api/demo", demoRoutes);
    logger.warn(
      `Demo routes enabled (/api/demo/*). NODE_ENV=${env.NODE_ENV} DEMO_MODE=${env.DEMO_MODE}.`,
    );
  }

  // EP17 (completion) — login editeur plateforme. PUBLIC : monte AVANT la chaine
  // /api/admin gardee (requireJWT + requireEditor) ci-dessous, car l'editeur n'a
  // pas encore de jeton a ce stade. POST /api/admin/login uniquement ; toutes les
  // autres routes /api/admin/* restent gardees. Le router login porte son propre
  // rate-limit (loginLimiter), miroir du login user.
  app.use("/api/admin", createAdminLoginRouter(emailSender));

  // EP14-S01 (extension editeur) — 2FA editeur. PUBLIC pour les routes de login
  // etape 2 (/api/admin/2fa/login/*, identite via pendingToken) ; les routes de
  // SETUP (/setup, /confirm, /status, /disable, /email/*) portent requireJWT +
  // requireEditor en interne. Monte AVANT la chaine gardee + le gate 2FA ci-dessous,
  // pour que l'enrolement reste accessible a un editeur non encore enrole (anti
  // chicken-and-egg) et que le challenge de login soit public.
  app.use("/api/admin/2fa", createAdminTwoFactorRouter(emailSender));

  // EP17-S01 — Back Office editeur. Monte AVANT le guard tenant global :
  // ces routes utilisent requireJWT + requireEditor (pas requireTenant), car
  // l'editeur n'a pas de contexte tenant (ADR-0009 D1). Le placer ici evite que
  // le requireTenant global ci-dessous rejette le jeton editeur en 401 avant
  // d'atteindre requireEditor.
  // EP14-S04 / ADR-0009 D3 : l'audit est monte sur la chaine admin apres
  // requireJWT + requireEditor (req.editor peuple), avant le router admin.
  // EP14-S01 (extension editeur) / AC7 : gate 2FA obligatoire editeur, insere
  // APRES requireEditor (req.editor peuple) et AVANT le router admin. Un editeur
  // sans second facteur est refuse (403 2FA_SETUP_REQUIRED) sur tout le Back
  // Office. Les routes login + /api/admin/2fa/* sont montees avant cette chaine.
  app.use("/api/admin", requireJWT, requireEditor, requireEditor2faEnrolled, auditLog, adminRoutes);

  // Routes protegees (JWT + tenant isolation)
  app.use("/api", requireJWT, requireTenant);

  // EP14-S04 / ADR-0009 D3 : middleware d'audit global, monte apres requireJWT
  // + requireTenant (req.user / req.editor deja peuples) et avant la declaration
  // des routers tenant, de sorte qu'il couvre toutes les routes mutantes /api/*.
  app.use("/api", auditLog);

  // EP14-S01 / AC7 — gate 2FA obligatoire pour l'ADMIN (couche post-login
  // requirements, garde back). Montee APRES requireTenant (req.user.userId peuple)
  // + audit, et AVANT le gate CGU : securite du compte d'abord, consentement legal
  // ensuite (meme ordre que change-password -> CGU dans postLoginRequirements).
  // Tant qu'un ADMIN n'a pas enrole TOTP ou email OTP, toute route metier est
  // refusee en 403 (code 2FA_SETUP_REQUIRED) ; le front redirige vers /account/2fa.
  // Les endpoints d'enrolement (/api/auth/2fa/*) sont montes avant cette chaine.
  app.use("/api", require2faEnrolled);

  // EP14-S02 / ADR-0009 D5 — gate CGU (couche post-login requirements, garde
  // back). Montee APRES requireTenant (req.user.tenantId peuple) et APRES l'audit
  // (un refus 403 reste trace). Tant que le tenant n'a pas accepte la version
  // courante des CGU, toute route tenant nominale est refusee en 403 (le front
  // redirige vers /onboarding/cgu). La route d'acceptation /api/tenant/accept-cgu
  // est exemptee par le middleware lui-meme (sinon boucle) ; /api/auth/* est deja
  // monte avant cette chaine.
  app.use("/api", requireCguAccepted);

  // EP14-S02 — cabinet courant (self-service intra-tenant) : POST
  // /api/tenant/accept-cgu. Monte apres requireTenant (req.user.tenantId) ; la
  // route d'acceptation est exemptee de la gate CGU ci-dessus.
  app.use("/api/tenant", tenantRoutes);

  // EP15-S02 — gestion des comptes users intra-cabinet par l'ADMIN. Tenant-scope
  // (requireRole(["ADMIN"]) + req.prisma), distinct du Back Office editeur
  // cross-tenant (/api/admin/*). Monte apres le requireTenant global, donc
  // req.prisma est deja le client tenant-scope (isolation 404 cross-tenant).
  app.use("/api/users", createUsersRouter(emailSender));

  // EP14-S06 — self-service RGPD du compte courant (GET /api/me/export, DELETE
  // /api/me). Tenant-scope (req.prisma), agit uniquement sur req.user.userId.
  // Monte apres requireTenant global + audit : l'export (GET sensible) et la
  // suppression (DELETE) sont traces automatiquement (ADR-0009 D3).
  app.use("/api/me", meRoutes);

  // EP02
  app.use("/api/cliniques", cliniquesRoutes);
  app.use("/api/interventions", interventionsRoutes);
  app.use("/api/document-labels", documentLabelsRoutes);

  // EP03
  app.use("/api/clients", clientsRoutes);

  // EP04
  app.use("/api/pipeline", pipelineRoutes);
  app.use("/api/processes", processesRoutes);

  // F2 (2026-04-29) — points de blocage CRUD : tags par cabinet + instances par process
  app.use("/api/blocking-point-tags", blockingPointTagsRouter);
  app.use("/api/processes/:processId/blocking-points", processBlockingPointsRouter);

  // EP09 — page follow-up dediee + sub-pipeline J0/J1/J3/J7/J14/J30/ABANDON
  app.use("/api/follow-up", followupRoutes);
  app.use("/api/message-templates", messageTemplatesRoutes);

  // EP10 — templates PDF documents
  app.use("/api/document-templates", documentTemplatesRoutes);

  // EP11 — tracking events demo (CRUD scope clients + processes + delete by id)
  app.use("/api/tracking-events", trackingEventsRoutes);

  // EP11 — endpoint redirection prepare (V1, retourne 501 au MVP)
  app.get("/api/track/redirect/:trackingId", (_req, res) => {
    res.status(501).json({
      success: false,
      error: "Tracking redirection non active en mode demo (V1)",
      code: "NOT_IMPLEMENTED",
    });
  });

  // EP05
  app.use("/api/devis", devisRoutes);

  // EP06 — documents sont nested sous /api/processes/:id/documents
  app.use("/api/processes/:id/documents", documentsRoutes);

  // EP07 — agenda (events derives de consultations + DevisStay)
  app.use("/api/agenda", agendaRoutes);

  // Settings cabinet (ex: acompte par defaut)
  app.use("/api/settings", settingsRoutes);

  // EP08 — dashboard (kpis, ca, previsionnel, follow-up)
  app.use("/api/dashboard", dashboardRoutes);

  app.use(errorHandler);

  return app;
}
