/**
 * F8 — Auto-advance d'un process au stage suivant.
 *
 * A appeler apres toute mutation qui peut faire passer un process pret au
 * stage suivant : PATCH process (consultation date / isQualified), PATCH
 * devis (intervention/signature/acompte), PATCH document (status). Si le
 * tenant a `autoAdvanceProcesses=true` et que `canTransitionTo(nextStage)`
 * retourne ok=true, on avance silencieusement.
 *
 * Idempotent : si le process est deja au max ou hors pipeline, ne fait rien.
 *
 * Volontairement decouple du middleware HTTP — on prend basePrisma et le
 * processId, on fait nos checks. Si une regression d'isolation arrive, le
 * caller doit avoir verifie l'appartenance du process au tenant avant.
 */
import { basePrisma } from "./prisma";
import {
  PIPELINE_STAGE_ORDER,
  computeNextStageReady,
  type PipelineStage,
} from "./processTransitions";

/**
 * Tente d'avancer le process au stage suivant si :
 *   1. Le tenant a autoAdvanceProcesses=true
 *   2. canTransitionTo(nextStage) ok=true
 *
 * Retourne le nouveau stage si avance, null sinon.
 */
export async function tryAutoAdvance(processId: string): Promise<string | null> {
  const process = await basePrisma.process.findUnique({
    where: { id: processId },
    include: {
      devis: {
        select: {
          firstSignedAt: true,
          acomptePaidAt: true,
          _count: { select: { devisInterventions: true } },
        },
      },
      documents: { select: { status: true } },
    },
  });
  if (!process) return null;

  const tenant = await basePrisma.tenant.findUnique({
    where: { id: process.tenantId },
    select: { autoAdvanceProcesses: true },
  });
  if (!tenant?.autoAdvanceProcesses) return null;

  const idx = PIPELINE_STAGE_ORDER.indexOf(process.stage as PipelineStage);
  if (idx < 0 || idx >= PIPELINE_STAGE_ORDER.length - 1) return null;
  const nextStage = PIPELINE_STAGE_ORDER[idx + 1];

  const ready = computeNextStageReady({
    stage: process.stage,
    isQualified: process.isQualified,
    consultationDate: process.consultationDate,
    devis: process.devis.map((d) => ({
      firstSignedAt: d.firstSignedAt,
      acomptePaidAt: d.acomptePaidAt,
      _count: d._count,
    })),
    documents: process.documents,
  });
  if (!ready) return null;

  await basePrisma.process.update({
    where: { id: processId },
    data: { stage: nextStage },
  });
  return nextStage;
}
