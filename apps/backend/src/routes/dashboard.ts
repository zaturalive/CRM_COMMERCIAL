import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { basePrisma } from "../lib/prisma";
import {
  buildKpis,
  buildCaSeries,
  buildPrevisionnel,
  buildCaEnAttente,
} from "../services/dashboardService";

const router = Router();

const periodSchema = z.enum(["week", "month", "year"]);

router.get(
  "/kpis",
  asyncHandler(async (req, res) => {
    const data = await buildKpis(basePrisma, req.user!.tenantId);
    res.json({ success: true, data });
  })
);

router.get(
  "/ca",
  asyncHandler(async (req, res) => {
    const period = periodSchema.parse(req.query.period ?? "month");
    const data = await buildCaSeries(basePrisma, req.user!.tenantId, period);
    res.json({ success: true, data });
  })
);

router.get(
  "/previsionnel",
  asyncHandler(async (req, res) => {
    const data = await buildPrevisionnel(basePrisma, req.user!.tenantId);
    res.json({ success: true, data });
  })
);

router.get(
  "/ca-en-attente",
  asyncHandler(async (req, res) => {
    const data = await buildCaEnAttente(basePrisma, req.user!.tenantId);
    res.json({ success: true, data });
  })
);

export default router;
