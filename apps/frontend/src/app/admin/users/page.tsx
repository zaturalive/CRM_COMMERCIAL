import Link from "next/link";

/**
 * Section Utilisateurs du Back Office — EP17-S03.
 *
 * La gestion des comptes est CROSS-TENANT et bornee a un cabinet : elle vit sous
 * /admin/cabinets/:id/utilisateurs (AC6), accessible depuis la liste des
 * cabinets. Cette page d'entree oriente l'editeur vers le choix d'un cabinet.
 */
export default function AdminUsersPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Utilisateurs</h2>
      <p className="text-sm text-slate-400">
        La gestion des comptes se fait par cabinet. Choisissez un cabinet pour
        creer, desactiver ou reinitialiser ses utilisateurs.
      </p>
      <Link
        href="/admin/tenants"
        className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
      >
        Voir les cabinets
      </Link>
    </div>
  );
}
