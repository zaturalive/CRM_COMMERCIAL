import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";
import { requireJWT } from "./middleware/requireJWT";
import { requireTenant } from "./middleware/requireTenant";
import { requireEditor } from "./middleware/requireEditor";
import { auditLog } from "./middleware/auditLog";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import demoRoutes from "./routes/demo";
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
 * Construit l'app Express sans ecouter — utilise par index.ts (prod) et les tests Supertest.
 */
export function buildApp(): Express {
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
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // requetes same-origin / server-to-server
        if (origin === allowedOrigin) return callback(null, true);
        if (domainRegex && domainRegex.test(origin)) return callback(null, true);
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

  // Routes auth (public + /me protege)
  app.use("/api/auth", authRoutes);

  // Routes demo — activees hors prod OU si DEMO_MODE=true en prod.
  // Utile pour garder une demo vitrine sur Scaleway sans passer toute
  // l'instance en NODE_ENV=development.
  const demoEnabled = env.NODE_ENV !== "production" || env.DEMO_MODE;
  if (demoEnabled) {
    app.use("/api/demo", demoRoutes);
    logger.warn(
      `Demo routes enabled (/api/demo/*). NODE_ENV=${env.NODE_ENV} DEMO_MODE=${env.DEMO_MODE}.`,
    );
  }

  // EP17-S01 — Back Office editeur. Monte AVANT le guard tenant global :
  // ces routes utilisent requireJWT + requireEditor (pas requireTenant), car
  // l'editeur n'a pas de contexte tenant (ADR-0009 D1). Le placer ici evite que
  // le requireTenant global ci-dessous rejette le jeton editeur en 401 avant
  // d'atteindre requireEditor.
  // EP14-S04 / ADR-0009 D3 : l'audit est monte sur la chaine admin apres
  // requireJWT + requireEditor (req.editor peuple), avant le router admin.
  app.use("/api/admin", requireJWT, requireEditor, auditLog, adminRoutes);

  // Routes protegees (JWT + tenant isolation)
  app.use("/api", requireJWT, requireTenant);

  // EP14-S04 / ADR-0009 D3 : middleware d'audit global, monte apres requireJWT
  // + requireTenant (req.user / req.editor deja peuples) et avant la declaration
  // des routers tenant, de sorte qu'il couvre toutes les routes mutantes /api/*.
  app.use("/api", auditLog);

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
