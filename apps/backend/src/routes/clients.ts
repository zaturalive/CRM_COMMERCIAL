import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { createClientSchema, updateClientSchema } from "../schemas/clients";
import { emailSearchHashFor } from "../lib/crypto/atRest";

// EP14-S05 / ADR-0009 D4a : email et phone sont chiffres at-rest (blob v1: non
// deterministe), donc plus aucun `contains` ne peut porter dessus. Detection
// d'un email complet pour rerouter la recherche vers l'egalite via emailSearchHash.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = Router();

/**
 * Charge un client du tenant courant. 404 sinon.
 */
async function loadOwnedClient(req: Request, id: string) {
  const client = await req.prisma!.client.findUnique({ where: { id } });
  if (!client) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return client;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * GET /api/clients
 * Query params :
 *   - q=<string>          : search sur firstName/lastName/phone/email
 *   - limit=<int>         : pagination (defaut 50)
 *   - offset=<int>        : pagination (defaut 0)
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset || "0"), 10) || 0;

    // EP14-S05 / ADR-0009 D4a point 3 : email et phone etant chiffres at-rest,
    // le `contains` (sous-chaine) sur ces colonnes ne ressort plus rien (il
    // porterait sur le blob chiffre, pas sur le clair). On conserve la recherche
    // sous-chaine sur firstName/lastName, et on reroute la recherche email vers
    // l'egalite indexee via emailSearchHash quand `q` est un email complet. La
    // recherche phone par sous-chaine n'est pas tenue post-chiffrement (perimetre
    // socle, Mantra #37) ; un phone complet identique pourrait etre route de la
    // meme facon par une story dediee si requis.
    const searchClauses: Record<string, unknown>[] = q
      ? [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
        ]
      : [];
    if (q && EMAIL_PATTERN.test(q)) {
      searchClauses.push({ emailSearchHash: emailSearchHashFor(q) });
    }
    const where = q ? { OR: searchClauses } : {};

    const [data, total] = await Promise.all([
      req.prisma!.client.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: limit,
        skip: offset,
        include: {
          _count: { select: { processes: true } },
        },
      }),
      req.prisma!.client.count({ where }),
    ]);

    res.json({ success: true, data, meta: { total, limit, offset } });
  })
);

/**
 * GET /api/clients/:id — detail + stats (process actifs, devis signes, intensite moyenne, CA total)
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClient(req, req.params.id);

    const client = await req.prisma!.client.findUnique({
      where: { id: req.params.id },
      include: {
        processes: {
          include: {
            devis: { select: { id: true, firstSignedAt: true, totalCached: true } },
            _count: { select: { documents: true, devis: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!client) return res.status(404).json({ success: false, error: "Not found" });

    // Stats derivees
    const activeProcesses = client.processes.filter((p) => !p.isArchived);
    const allDevis = client.processes.flatMap((p) => p.devis);
    const signedDevis = allDevis.filter((d) => d.firstSignedAt !== null);
    const caTotal = signedDevis.reduce((sum, d) => sum + (d.totalCached ?? 0), 0);
    const intensities = client.processes
      .map((p) => p.qualificationIntensity)
      .filter((x): x is number => x !== null);
    const avgIntensity =
      intensities.length > 0
        ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
        : null;

    res.json({
      success: true,
      data: {
        ...client,
        stats: {
          activeProcessesCount: activeProcesses.length,
          totalProcessesCount: client.processes.length,
          signedDevisCount: signedDevis.length,
          caTotal, // centimes
          avgIntensity,
        },
      },
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createClientSchema.parse(req.body);
    // tenantId injecte par Prisma extended client en runtime ; on le passe
    // aussi explicitement pour que `npm run build` (tsc strict) accepte.
    const created = await req.prisma!.client.create({
      data: {
        tenantId: req.user!.tenantId,
        ...body,
        email: body.email ?? null,
        city: body.city ?? null,
        address: body.address ?? null,
        source: body.source ?? null,
        doctolibUrl: body.doctolibUrl ?? null,
      },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClient(req, req.params.id);
    const body = updateClientSchema.parse(req.body);
    const updated = await req.prisma!.client.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClient(req, req.params.id);

    // Fail si process actif (non archive)
    const activeCount = await req.prisma!.process.count({
      where: { clientId: req.params.id, isArchived: false },
    });
    if (activeCount > 0) {
      return res.status(409).json({
        success: false,
        error: `Client a ${activeCount} process actif(s), suppression bloquee`,
      });
    }

    await req.prisma!.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ─── Sous-ressources dediees ────────────────────────────────────────────────

/** GET /api/clients/:id/processes — historique des process du client */
router.get(
  "/:id/processes",
  asyncHandler(async (req, res) => {
    await loadOwnedClient(req, req.params.id);
    const processes = await req.prisma!.process.findMany({
      where: { clientId: req.params.id },
      orderBy: { createdAt: "desc" },
      include: {
        processInterventions: {
          include: { intervention: { select: { id: true, name: true } } },
        },
        devis: { select: { id: true, firstSignedAt: true, totalCached: true, status: true } },
        _count: { select: { documents: true } },
      },
    });

    const enriched = processes.map((p) => {
      const receivedDocs = 0; // TODO EP06 — compter les documents "RECU" ou "VALIDE"
      const totalDocs = p._count.documents;
      const lastDevis = p.devis[p.devis.length - 1];
      return {
        id: p.id,
        stage: p.stage,
        dateRendezVous: p.dateRendezVous,
        isArchived: p.isArchived,
        archivedAt: p.archivedAt,
        createdAt: p.createdAt,
        interventions: p.processInterventions.map((pi) => pi.intervention.name),
        badges: {
          documentsReceived: receivedDocs,
          documentsTotal: totalDocs,
          acomptePaid: lastDevis?.firstSignedAt ? true : false,
        },
      };
    });

    res.json({ success: true, data: enriched });
  })
);

/** GET /api/clients/:id/devis — liste devis du client, groupes signes/non-signes */
router.get(
  "/:id/devis",
  asyncHandler(async (req, res) => {
    await loadOwnedClient(req, req.params.id);
    const allDevis = await req.prisma!.devis.findMany({
      where: { process: { clientId: req.params.id } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        firstSignedAt: true,
        totalCached: true,
        createdAt: true,
        processId: true,
      },
    });
    const signed = allDevis.filter((d) => d.firstSignedAt !== null);
    const unsigned = allDevis.filter((d) => d.firstSignedAt === null);
    res.json({ success: true, data: { signed, unsigned } });
  })
);

export default router;
