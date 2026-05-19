import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { PipelineView } from "@/components/pipeline/PipelineView";

/**
 * Pipeline — accessible a tous les roles authentifies (ADMIN + COMMERCIAL).
 * ADR-0002 : role CHIRURGIEN retire dans le CRM Commercial.
 */
export default async function PipelinePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PipelineView />;
}
