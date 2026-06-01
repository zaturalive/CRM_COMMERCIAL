/**
 * Section Acces support du Back Office — coquille EP17-S01. L'observation bornee
 * d'un tenant (jeton d'impersonation, ADR-0009 D2) est livree par EP17-S04.
 */
export default function AdminSupportPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Acces support</h2>
      <p className="text-sm text-slate-400">
        Observation bornee d&apos;un tenant. Section branchee sur EP17-S04.
      </p>
    </div>
  );
}
