import { describe, expect, it } from "vitest";
import { applyMove } from "./movePipelineProcess";
import type { PipelineProcess, PipelineResponse } from "@/types/processes";

function makeProcess(id: string, stage: PipelineProcess["stage"], estimatedAmount = 1000): PipelineProcess {
  return {
    id,
    stage,
    clientId: `client-${id}`,
    client: { id: `client-${id}`, firstName: "Test", lastName: id, phone: "0", email: null },
    isQualified: true,
    qualificationIntensity: 5,
    qualificationReason: null,
    nonQualifieReason: null,
    followupReason: null,
    followupReasonDetail: null,
    followupSubStage: null,
    followupSubStageEnteredAt: null,
    daysInSubStage: null,
    dateRendezVous: null,
    budget: null,
    noteCommerciale: null,
    isArchived: false,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    interventions: [],
    devis: [],
    estimatedAmount,
    signedAmount: 0,
    documentsTotal: 0,
    documentsReceived: 0,
    engagementCount: 0,
    engagementLastAt: null,
    paymentSummary: null,
    nextStageReady: false,
  };
}

function makeData(): PipelineResponse {
  return {
    columns: [
      { stage: "CONTACT", processes: [makeProcess("p1", "CONTACT", 5000), makeProcess("p2", "CONTACT", 3000)], stats: { count: 2, caPotentiel: 8000, caConfirme: 0, caEnAttente: 0 } },
      { stage: "CONSULTATION", processes: [], stats: { count: 0, caPotentiel: 0, caConfirme: 0, caEnAttente: 0 } },
      { stage: "POST_CONSULT", processes: [], stats: { count: 0, caPotentiel: 0, caConfirme: 0, caEnAttente: 0 } },
      { stage: "CONFIRMEE", processes: [], stats: { count: 0, caPotentiel: 0, caConfirme: 0, caEnAttente: 0 } },
      { stage: "OP_PROGRAMMEE", processes: [], stats: { count: 0, caPotentiel: 0, caConfirme: 0, caEnAttente: 0 } },
    ],
    sections: {
      NON_QUALIFIE: { processes: [], stats: { count: 0, caPotentiel: 0, caConfirme: 0, caEnAttente: 0 } },
    },
    followupCount: 0,
    followupCaEnAttente: 0,
    totalActive: 2,
  };
}

describe("applyMove", () => {
  it("retourne data inchange si fromStage === toStage", () => {
    const data = makeData();
    const result = applyMove({ data, processId: "p1", fromStage: "CONTACT", toStage: "CONTACT" });
    expect(result).toBe(data);
  });

  it("retourne data inchange si process introuvable", () => {
    const data = makeData();
    const result = applyMove({ data, processId: "p99", fromStage: "CONTACT", toStage: "CONSULTATION" });
    expect(result).toBe(data);
  });

  it("deplace un process entre 2 colonnes pipeline et recalcule les stats", () => {
    const data = makeData();
    const result = applyMove({ data, processId: "p1", fromStage: "CONTACT", toStage: "CONSULTATION" });

    const contact = result.columns.find((c) => c.stage === "CONTACT")!;
    const consult = result.columns.find((c) => c.stage === "CONSULTATION")!;
    expect(contact.processes.map((p) => p.id)).toEqual(["p2"]);
    expect(contact.stats.count).toBe(1);
    expect(contact.stats.caPotentiel).toBe(3000);
    expect(consult.processes.map((p) => p.id)).toEqual(["p1"]);
    expect(consult.stats.count).toBe(1);
    expect(consult.stats.caPotentiel).toBe(5000);
    expect(consult.processes[0].stage).toBe("CONSULTATION");
  });

  it("retire le process de NON_QUALIFIE vers une colonne pipeline", () => {
    // EP09-S07 : section FOLLOWUP retiree du pipeline. Test reformule pour
    // valider le path NON_QUALIFIE → pipeline column.
    const dataWithNonQual: ReturnType<typeof makeData> = {
      ...makeData(),
      sections: {
        NON_QUALIFIE: {
          processes: [makeProcess("p4", "NON_QUALIFIE", 4000)],
          stats: { count: 1, caPotentiel: 4000, caConfirme: 0, caEnAttente: 0 },
        },
      },
    };

    const result = applyMove({ data: dataWithNonQual, processId: "p4", fromStage: "NON_QUALIFIE", toStage: "CONTACT" });

    expect(result.sections.NON_QUALIFIE.processes).toHaveLength(0);
    expect(result.sections.NON_QUALIFIE.stats.count).toBe(0);
    const contact = result.columns.find((c) => c.stage === "CONTACT")!;
    expect(contact.processes.map((p) => p.id)).toContain("p4");
    expect(contact.processes.find((p) => p.id === "p4")?.stage).toBe("CONTACT");
  });

  it("retire le process des colonnes/sections sans le re-ajouter pour stage terminal", () => {
    const data = makeData();
    const result = applyMove({
      data,
      processId: "p1",
      fromStage: "CONTACT",
      toStage: "EFFECTUEE",
    });
    const contact = result.columns.find((c) => c.stage === "CONTACT")!;
    expect(contact.processes.map((p) => p.id)).toEqual(["p2"]);
    expect(result.columns.every((c) => !c.processes.some((p) => p.id === "p1"))).toBe(true);
    expect(result.sections.NON_QUALIFIE.processes.some((p) => p.id === "p1")).toBe(false);
  });

  it("ne mute pas l'objet data initial", () => {
    const data = makeData();
    const before = JSON.stringify(data);
    applyMove({ data, processId: "p1", fromStage: "CONTACT", toStage: "CONSULTATION" });
    expect(JSON.stringify(data)).toBe(before);
  });
});
