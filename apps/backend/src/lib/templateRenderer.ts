/**
 * Substitution de variables dans un template (EP09-S04, EP10-S02).
 *
 * Pattern simple `{{path.to.field}}` → lookup dans un context plat.
 * Pas de moteur de templating lourd (Handlebars, etc.) — KISS.
 *
 * Variables connues exposees par TEMPLATE_VARIABLES (ci-dessous).
 * Une variable inconnue reste litterale (`{{unknown}}` non substituee) — utile
 * pour le debug et evite de masquer silencieusement une mauvaise variable.
 */

export const TEMPLATE_VARIABLES = [
  "patient.firstName",
  "patient.lastName",
  "patient.phone",
  "patient.email",
  "patient.city",
  "intervention.name",
  "intervention.duration",
  "cabinet.name",
  "cabinet.slug",
  "process.consultationDate",
  "process.budget",
  "devis.reference",
  "devis.totalCached",
  "user.firstName",
  "user.lastName",
  "today",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateContext = Record<string, string | number | null | undefined>;

/**
 * Substitue les `{{variable}}` dans `text` par les valeurs du contexte.
 * Une variable absente du contexte reste litterale.
 */
export function renderText(text: string, ctx: TemplateContext): string {
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (match, path: string) => {
    const v = ctx[path];
    if (v === undefined || v === null) return match;
    return String(v);
  });
}

/**
 * Construit le contexte de rendu pour un process+template.
 * Utilise par les routes qui rendent un template (send-message, render PDF).
 */
export interface RenderContextSources {
  process: {
    consultationDate: Date | null;
    budget: number | null;
    client: {
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      city: string | null;
    };
    processInterventions: Array<{
      intervention: { name: string; duration: number };
    }>;
    devis?: Array<{ reference: string; totalCached: number | null }>;
  };
  tenant: { name: string; slug: string };
  user: { firstName: string; lastName: string };
}

export function buildContext(sources: RenderContextSources): TemplateContext {
  const { process, tenant, user } = sources;
  const interv0 = process.processInterventions[0]?.intervention;
  const devis0 = process.devis?.[0];
  return {
    "patient.firstName": process.client.firstName,
    "patient.lastName": process.client.lastName,
    "patient.phone": process.client.phone,
    "patient.email": process.client.email ?? "",
    "patient.city": process.client.city ?? "",
    "intervention.name": interv0?.name ?? "",
    "intervention.duration": interv0?.duration ?? "",
    "cabinet.name": tenant.name,
    "cabinet.slug": tenant.slug,
    "process.consultationDate": process.consultationDate
      ? process.consultationDate.toLocaleDateString("fr-FR")
      : "",
    "process.budget": process.budget ?? "",
    "devis.reference": devis0?.reference ?? "",
    "devis.totalCached":
      devis0?.totalCached !== null && devis0?.totalCached !== undefined
        ? (devis0.totalCached / 100).toFixed(2)
        : "",
    "user.firstName": user.firstName,
    "user.lastName": user.lastName,
    today: new Date().toLocaleDateString("fr-FR"),
  };
}
