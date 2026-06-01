"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, Loader2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

/**
 * EP15-S02 — Gestion des comptes users intra-cabinet par l'ADMIN.
 *
 * Scope = tenant courant (le backend /api/users filtre par tenantId via
 * l'extension Prisma ; un COMMERCIAL recoit 403). La page :
 *   - liste les users du cabinet (AC1),
 *   - cree un COMMERCIAL ou ADMIN avec mot de passe temporaire (AC2),
 *   - desactive / reactive un compte (AC3),
 *   - reinitialise le mot de passe (AC4, chemin degrade D7 : le tempPassword
 *     est affiche une fois a l'admin, pas d'email branche au demarrage).
 *
 * Le mot de passe temporaire ne transite qu'une fois (creation / reset) ; il
 * n'est jamais re-affichable. L'admin le transmet a l'interesse, qui le change
 * au 1er login (mustChangePassword, gate EP15-S04).
 */

type Role = "ADMIN" | "COMMERCIAL";

interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface CreatedUser {
  user: ManagedUser;
  tempPassword: string;
}

const EMPTY_FORM = {
  email: "",
  firstName: "",
  lastName: "",
  role: "COMMERCIAL" as Role,
};

export default function UsersManagementPage() {
  const { data: session } = useSession();
  const isAdmin = session?.role === "ADMIN";

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Id du user en cours de mutation (desactivation/reset) pour desactiver son bouton.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<ManagedUser[]>("/api/users");
    setLoading(false);
    if (res.success) {
      setUsers(res.data);
    } else {
      toast.error(res.error);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void load();
    } else {
      setLoading(false);
    }
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm text-text-secondary">
          La gestion des comptes est reservee aux administrateurs du cabinet.
        </p>
      </GlassCard>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.firstName || !form.lastName) {
      toast.error("Email, prenom et nom sont requis");
      return;
    }
    setSubmitting(true);
    const res = await apiFetch<CreatedUser>("/api/users", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.success) {
      // D7 : le mot de passe temporaire ne s'affiche qu'ici, une seule fois.
      toast.success(
        `Compte cree. Mot de passe temporaire (a transmettre) : ${res.data.tempPassword}`,
      );
      setForm(EMPTY_FORM);
      setDialogOpen(false);
      void load();
    } else {
      toast.error(res.error);
    }
  }

  async function handleToggleActive(user: ManagedUser) {
    setBusyId(user.id);
    const res = await apiFetch<ManagedUser>(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !user.active }),
    });
    setBusyId(null);
    if (res.success) {
      toast.success(user.active ? "Compte desactive" : "Compte reactive");
      void load();
    } else {
      // 409 : garde dernier admin (on ne peut pas desactiver le dernier ADMIN actif).
      toast.error(res.error);
    }
  }

  async function handleReset(user: ManagedUser) {
    setBusyId(user.id);
    const res = await apiFetch<{ tempPassword: string }>(
      `/api/users/${user.id}/reset-password`,
      { method: "POST" },
    );
    setBusyId(null);
    if (res.success) {
      toast.success(
        `Mot de passe reinitialise. Temporaire (a transmettre) : ${res.data.tempPassword}`,
      );
      void load();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4" data-testid="users-management">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-secondary">
          <Users size={18} strokeWidth={1.75} />
          <span className="text-sm">{users.length} compte(s)</span>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          data-testid="users-create-open"
        >
          <UserPlus size={16} />
          Nouveau compte
        </Button>
      </div>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-text-secondary">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (
          <Table data-testid="users-table">
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`users-row-${u.id}`}>
                  <TableCell className="font-medium text-text-primary">
                    {u.firstName} {u.lastName}
                  </TableCell>
                  <TableCell className="text-text-secondary">{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    <span
                      className={
                        u.active
                          ? "text-success"
                          : "text-text-secondary"
                      }
                    >
                      {u.active ? "Actif" : "Desactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => handleReset(u)}
                        data-testid={`users-reset-${u.id}`}
                      >
                        <KeyRound size={14} />
                        Reset MDP
                      </Button>
                      <Button
                        variant={u.active ? "outline" : "secondary"}
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => handleToggleActive(u)}
                        data-testid={`users-toggle-${u.id}`}
                      >
                        {u.active ? "Desactiver" : "Reactiver"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="p-6 text-center text-text-secondary"
                  >
                    Aucun compte.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </GlassCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="users-form-email"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="user-firstName">Prenom</Label>
                <Input
                  id="user-firstName"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  data-testid="users-form-firstName"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-lastName">Nom</Label>
                <Input
                  id="user-lastName"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  data-testid="users-form-lastName"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/80 px-3 text-sm text-text-primary"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Role })
                }
                data-testid="users-form-role"
              >
                <option value="COMMERCIAL">Commercial</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="users-form-submit"
              >
                {submitting && <Loader2 className="animate-spin" size={16} />}
                Creer le compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
