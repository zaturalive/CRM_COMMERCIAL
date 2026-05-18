import type { PrismaClient } from "@prisma/client";
import { basePrisma } from "../lib/prisma";

/**
 * Synchronise la checklist ProcessDocument d'un process avec les
 * InterventionDocumentLabel de ses interventions actives (via ProcessIntervention
 * puis DevisIntervention).
 *
 * Invariants (EP06-S01) :
 *   - Idempotent : 2 appels consecutifs ne creent pas de doublons (anti-collision
 *     sur le couple { processId, documentLabelId }).
 *   - Non destructif : les ProcessDocument existants sont preserves
 *     (statut, fichier, notes).
 *   - Les documents orphelins (label supprime ou intervention retiree) ne sont
 *     pas supprimes automatiquement — seul l'utilisateur peut supprimer (ils
 *     gardent fileUrl donc la purge serait destructive).
 *   - Isolation tenant : le service ne fait AUCUN filtre tenantId ; il doit
 *     etre appele uniquement apres verification de l'ownership du process
 *     (loadOwnedProcess). Il utilise basePrisma pour pouvoir ecrire sur
 *     ProcessDocument (non tenant-bound dans l'extended client).
 */
export async function syncProcessDocuments(
  processId: string,
  prisma: PrismaClient = basePrisma
): Promise<{ created: number }> {
  // Source de verite des labels requis : l'union des InterventionDocumentLabel
  // de chaque intervention presente sur le process via ProcessIntervention.
  // On prend aussi les DevisIntervention actives (devis non REFUSE) pour couvrir
  // les cas ou le commercial ajoute une intervention directement sur un devis.
  const processInterventions = await prisma.processIntervention.findMany({
    where: { processId },
    include: {
      intervention: {
        include: {
          interventionDocumentLabels: {
            include: { documentLabel: true },
          },
        },
      },
    },
  });

  const devisInterventions = await prisma.devisIntervention.findMany({
    where: { devis: { processId, status: { not: "REFUSE" } } },
    include: {
      intervention: {
        include: {
          interventionDocumentLabels: {
            include: { documentLabel: true },
          },
        },
      },
    },
  });

  // Map label id → nom pour snapshot du name (stable meme si DocumentLabel
  // renomme apres).
  const labelsById = new Map<string, { id: string; name: string }>();
  for (const pi of processInterventions) {
    for (const idl of pi.intervention.interventionDocumentLabels) {
      labelsById.set(idl.documentLabel.id, {
        id: idl.documentLabel.id,
        name: idl.documentLabel.name,
      });
    }
  }
  for (const di of devisInterventions) {
    for (const idl of di.intervention.interventionDocumentLabels) {
      labelsById.set(idl.documentLabel.id, {
        id: idl.documentLabel.id,
        name: idl.documentLabel.name,
      });
    }
  }

  if (labelsById.size === 0) {
    return { created: 0 };
  }

  // Deja presents sur le process : on ne touche pas.
  const existing = await prisma.processDocument.findMany({
    where: {
      processId,
      documentLabelId: { in: Array.from(labelsById.keys()) },
    },
    select: { documentLabelId: true },
  });
  const existingLabelIds = new Set(
    existing.map((e) => e.documentLabelId).filter((id): id is string => id !== null)
  );

  const toCreate = Array.from(labelsById.values()).filter(
    (l) => !existingLabelIds.has(l.id)
  );

  if (toCreate.length === 0) {
    return { created: 0 };
  }

  await prisma.processDocument.createMany({
    data: toCreate.map((l) => ({
      processId,
      documentLabelId: l.id,
      name: l.name,
      status: "EN_ATTENTE" as const,
    })),
  });

  return { created: toCreate.length };
}
