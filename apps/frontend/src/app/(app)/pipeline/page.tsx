import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { PipelineView } from "@/components/pipeline/PipelineView";

/**
 * Pipeline — accessible a tous les roles authentifies.
 *
 * Decision user le 24 avril 2026 : le chirurgien doit pouvoir consulter
 * la pipeline complete (utile pour ouvrir un process depuis l'agenda,
 * ou comprendre le contexte commercial d'un operation). Les droits
 * specifiques (edition notes commerciales, champs clinique/date reserves
 * COMMERCIAL) restent appliques au niveau des composants.
 */
export default async function PipelinePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PipelineView />;
}
