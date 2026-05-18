import { DevisBuilder } from "@/components/devis/DevisBuilder";

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="px-6 py-6">
      <DevisBuilder devisId={id} />
    </div>
  );
}
