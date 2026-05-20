"use client";

import { useEffect, useState, useCallback } from "react";
import {
  File as FileIcon,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  Send,
  Mail,
  MessageSquare,
  Video,
} from "lucide-react";
import { getSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { formatApiError } from "@/lib/formatApiError";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/Dialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { DocumentProgressBadge } from "./DocumentProgressBadge";
import { AIAgentWhatsAppPreview } from "./AIAgentWhatsAppPreview";
import {
  DOCUMENT_STATUS_LABELS,
  nextDocumentStatus,
  type DocumentStatus,
  type ProcessDocument,
} from "@/types/documents";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

interface DocumentsTabProps {
  processId: string;
  clientFirstName: string;
  onChanged: () => void;
}

/** ADR-0002 + P3 Pattern B : cle sessionStorage de consentement HDS upload. */
const UPLOAD_CONSENT_KEY = "crm-commercial:hds-upload-consent";

export function DocumentsTab({ processId, clientFirstName, onChanged }: DocumentsTabProps) {
  const tHds = useTranslations("Hds");
  const tCommon = useTranslations("Common");
  const [docs, setDocs] = useState<ProcessDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProcessDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ProcessDocument | null>(null);
  /**
   * ADR-0002 + P3 Pattern B : gate de consentement avant upload.
   * Le user doit confirmer qu'il n'uploade pas de document medical
   * (bilan, ordonnance, CRO, photo medicale). Consent persiste en
   * sessionStorage : une seule fois par session.
   */
  const [pendingUpload, setPendingUpload] = useState<{ doc: ProcessDocument; file: File } | null>(null);

  /**
   * Chargement de la liste documents.
   *
   * `silent=true` (default sur les re-fetches post-mutation) : ne touche pas
   * `loading`, donc le rendu conditionnel L167 ne masque plus la liste pendant
   * le refetch. Sans cette option, chaque action (upload, status bump, delete)
   * declenchait un Loader2 plein ecran qui faisait disparaitre la liste 1-2s.
   */
  const loadDocuments = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      const res = await apiFetch<ProcessDocument[]>(
        `/api/processes/${processId}/documents`
      );
      if (res.success) {
        setDocs(res.data);
      } else if (!silent) {
        toast.error(res.error);
        setDocs([]);
      } else {
        // En mode silent on garde l'optimistic local et on log le warning
        // serveur via toast court ; pas de wipe de l'UI.
        toast.error(res.error);
      }
      if (!silent) setLoading(false);
    },
    [processId]
  );

  useEffect(() => {
    void loadDocuments({ silent: false });
  }, [loadDocuments]);

  const received = docs?.filter((d) => d.status === "RECU" || d.status === "VALIDE").length ?? 0;
  const total = docs?.length ?? 0;

  /**
   * Optimistic status bump : on avance le statut localement avant le PATCH.
   * Si le PATCH echoue, on revient au statut precedent.
   */
  async function handleStatusBump(doc: ProcessDocument) {
    const next = nextDocumentStatus(doc.status);
    const previous = doc.status;
    setDocs((prev) =>
      prev?.map((d) => (d.id === doc.id ? { ...d, status: next } : d)) ?? null
    );
    const res = await apiFetch<ProcessDocument>(
      `/api/processes/${processId}/documents/${doc.id}`,
      { method: "PATCH", body: JSON.stringify({ status: next }) }
    );
    if (res.success) {
      onChanged();
      void loadDocuments({ silent: true });
    } else {
      // Revert
      setDocs((prev) =>
        prev?.map((d) => (d.id === doc.id ? { ...d, status: previous } : d)) ?? null
      );
      toast.error(res.error);
    }
  }

  /**
   * Optimistic delete : on retire la ligne localement avant le DELETE.
   * Si le DELETE echoue, on re-fetch pour restaurer l'etat serveur.
   */
  async function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    setDocs((prev) => prev?.filter((d) => d.id !== target.id) ?? null);
    setDeleting(null);
    const res = await apiFetch(
      `/api/processes/${processId}/documents/${target.id}`,
      { method: "DELETE" }
    );
    if (res.success) {
      toast.success("Document supprime");
      onChanged();
      void loadDocuments({ silent: true });
    } else {
      toast.error(res.error);
      // Restaurer via refetch (plus simple que de re-pusher l'item au bon index)
      void loadDocuments({ silent: true });
    }
  }

  /**
   * P3 Pattern B : intercepte la selection de fichier. Si le user n'a pas
   * encore donne son consentement HDS dans cette session, on stocke le
   * fichier en attente et on affiche le dialog. Sinon, upload direct.
   */
  function handleUploadRequest(doc: ProcessDocument, file: File) {
    const consent =
      typeof window !== "undefined" && sessionStorage.getItem(UPLOAD_CONSENT_KEY) === "true";
    if (consent) {
      void uploadFile(doc, file);
    } else {
      setPendingUpload({ doc, file });
    }
  }

  function confirmConsentAndUpload() {
    if (!pendingUpload) return;
    sessionStorage.setItem(UPLOAD_CONSENT_KEY, "true");
    const { doc, file } = pendingUpload;
    setPendingUpload(null);
    void uploadFile(doc, file);
  }

  /**
   * Optimistic upload : on bump le statut et marque fileUrl comme "pending"
   * pour faire apparaitre Eye/Download immediatement. Apres succes, refetch
   * silencieux pour recuperer le vrai fileUrl serveur.
   */
  async function uploadFile(doc: ProcessDocument, file: File) {
    const previousStatus = doc.status;
    const previousFileUrl = doc.fileUrl;
    setDocs((prev) =>
      prev?.map((d) =>
        d.id === doc.id
          ? { ...d, fileUrl: d.fileUrl ?? "pending-upload", status: "RECU" }
          : d
      ) ?? null
    );

    const form = new FormData();
    form.append("file", file);
    const session = await getSession();
    try {
      const res = await fetch(
        `${BACKEND}/api/processes/${processId}/documents/${doc.id}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.jwt ?? ""}` },
          body: form,
        }
      );
      if (res.status === 413) {
        toast.error("Fichier trop lourd (max 10 MB)");
        // Revert
        setDocs((prev) =>
          prev?.map((d) =>
            d.id === doc.id
              ? { ...d, fileUrl: previousFileUrl, status: previousStatus }
              : d
          ) ?? null
        );
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur upload" }));
        toast.error(err.error ?? "Erreur upload");
        // Revert
        setDocs((prev) =>
          prev?.map((d) =>
            d.id === doc.id
              ? { ...d, fileUrl: previousFileUrl, status: previousStatus }
              : d
          ) ?? null
        );
        return;
      }
      toast.success("Fichier televerse");
      onChanged();
      void loadDocuments({ silent: true });
    } catch {
      toast.error("Erreur reseau");
      setDocs((prev) =>
        prev?.map((d) =>
          d.id === doc.id
            ? { ...d, fileUrl: previousFileUrl, status: previousStatus }
            : d
        ) ?? null
      );
    }
  }

  async function handleDownload(doc: ProcessDocument) {
    const session = await getSession();
    const url = `${BACKEND}/api/processes/${processId}/documents/${doc.id}/download`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session?.jwt ?? ""}` },
    });
    if (!res.ok) {
      toast.error("Telechargement impossible");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  const [sendOpen, setSendOpen] = useState(false);

  return (
    <div className="space-y-5">
      <DocumentProgressBadge received={received} total={total} />

      <RelevantDocumentTemplates processId={processId} />

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-text-primary">
          Checklist documents ({total})
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setSendOpen(true)}>
            <Send size={14} /> Envoyer au patient
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Ajouter un document
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="animate-spin" /> Chargement...
        </div>
      ) : docs && docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-text-secondary">
          Aucun document requis. Un devis technique active la checklist automatique.
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm" data-testid="documents-list">
          {docs?.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              onStatusBump={() => handleStatusBump(d)}
              onUpload={(file) => handleUploadRequest(d, file)}
              onDownload={() => handleDownload(d)}
              onPreview={() => setPreviewDoc(d)}
              onDelete={() => setDeleting(d)}
            />
          ))}
        </ul>
      )}

      <AIAgentWhatsAppPreview patientFirstName={clientFirstName} />

      <AddDocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        processId={processId}
        onSuccess={async () => {
          await loadDocuments({ silent: true });
          onChanged();
        }}
      />

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Supprimer ${deleting.name} ?` : ""}
        description="Le document sera definitivement supprime, fichier inclus."
        onConfirm={handleDelete}
      />

      <PreviewModal
        doc={previewDoc}
        processId={processId}
        onClose={() => setPreviewDoc(null)}
      />

      <SendDocumentToPatientDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        processId={processId}
        clientFirstName={clientFirstName}
      />

      {/* P3 Pattern B : modal de consentement HDS avant upload (ADR-0002) */}
      <Dialog open={pendingUpload !== null} onOpenChange={(o) => !o && setPendingUpload(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tHds("uploadModalTitle")}</DialogTitle>
            <DialogDescription>{tHds("uploadModalIntro")}</DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {tHds("uploadModalForbidden")}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingUpload(null)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={confirmConsentAndUpload}>
              {tHds("uploadModalConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Section "Templates a generer" (EP10-S04) — affichee au-dessus de la
 * checklist documents. Liste les DocumentTemplate lies aux interventions
 * du process. Le clic sur "Generer PDF" telecharge un PDF rempli avec les
 * variables substituees (Puppeteer cote backend).
 */
function RelevantDocumentTemplates({ processId }: { processId: string }) {
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; description: string | null; kind: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<typeof templates>(
        `/api/processes/${processId}/relevant-document-templates`
      );
      if (!cancelled) {
        if (res.success) setTemplates(res.data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [processId]);

  async function handleDownload(t: { id: string; name: string }) {
    setDownloadingId(t.id);
    try {
      const session = await getSession();
      const url = `${BACKEND}/api/document-templates/${t.id}/download`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session?.jwt ?? ""}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        toast.error(err?.error ?? "Erreur telechargement");
        return;
      }
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${t.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("PDF telecharge");
    } catch {
      toast.error("Erreur reseau");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading || templates.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-text-primary">
        <FileText size={14} className="text-accent" strokeWidth={1.75} />
        Templates a envoyer au patient ({templates.length})
      </h3>
      <ul className="space-y-1.5">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-violet-900">{t.name}</div>
              {t.description && (
                <div className="truncate text-xs text-violet-700/80">{t.description}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(t)}
              disabled={downloadingId === t.id}
            >
              {downloadingId === t.id ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Telechargement...
                </>
              ) : (
                <>
                  <Download size={12} /> Telecharger
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({
  doc,
  onStatusBump,
  onUpload,
  onDownload,
  onPreview,
  onDelete,
}: {
  doc: ProcessDocument;
  onStatusBump: () => void;
  onUpload: (file: File) => void;
  onDownload: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const hasFile = doc.fileUrl !== null;

  return (
    <li
      className="flex items-center justify-between rounded-md border border-white/60 bg-white/70 px-3 py-2"
      data-testid={`document-row-${doc.id}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileIcon size={14} className="flex-shrink-0 text-text-secondary" strokeWidth={1.75} />
        <span className="truncate">{doc.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={doc.status} onClick={onStatusBump} />

        {hasFile && (
          <Button variant="ghost" size="icon" onClick={onPreview} aria-label="Apercu">
            <Eye size={14} />
          </Button>
        )}
        {hasFile && (
          <Button variant="ghost" size="icon" onClick={onDownload} aria-label="Telecharger">
            <Download size={14} />
          </Button>
        )}
        <UploadButton onUpload={onUpload} hasFile={hasFile} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Supprimer"
          className="text-danger hover:text-danger"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </li>
  );
}

function StatusPill({
  status,
  onClick,
}: {
  status: DocumentStatus;
  onClick: () => void;
}) {
  const [bumping, setBumping] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBumping(true);
        onClick();
        setTimeout(() => setBumping(false), 200);
      }}
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
        status === "EN_ATTENTE" && "bg-gray-100 text-gray-700 hover:bg-gray-200",
        status === "RECU" && "bg-blue-100 text-blue-800 hover:bg-blue-200",
        status === "VALIDE" && "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
        bumping && "scale-[1.15]"
      )}
      aria-label={`Statut ${DOCUMENT_STATUS_LABELS[status]}, clic pour avancer`}
    >
      {DOCUMENT_STATUS_LABELS[status]}
    </button>
  );
}

function UploadButton({
  onUpload,
  hasFile,
}: {
  onUpload: (file: File) => void;
  hasFile: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer" aria-label={hasFile ? "Remplacer le fichier" : "Televerser"}>
      <input
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-white/60 hover:text-accent"
        )}
      >
        <Upload size={14} />
      </span>
    </label>
  );
}

interface DocumentLabel {
  id: string;
  name: string;
  description?: string | null;
}

/**
 * Dialog "Ajouter des documents" — 3 sections :
 *   1. Recommandes par les interventions (en surbrillance violette, surlignes
 *      si initialement coches par le sync auto puis supprimes = re-import)
 *   2. Autres du catalogue (importables depuis paramètrage)
 *   3. Creer un nouveau document (input libre)
 *
 * Les sections 1 + 2 sont multi-select (checkboxes) + bouton batch.
 * La section 3 est un form separe.
 */
function AddDocumentDialog({
  open,
  onOpenChange,
  processId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processId: string;
  onSuccess: () => Promise<void>;
}) {
  const [available, setAvailable] = useState<{
    recommended: DocumentLabel[];
    others: DocumentLabel[];
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingList(true);
      const res = await apiFetch<{
        recommended: DocumentLabel[];
        others: DocumentLabel[];
      }>(`/api/processes/${processId}/documents/available`);
      setLoadingList(false);
      if (res.success) setAvailable(res.data);
      else toast.error(res.error);
    })();
  }, [open, processId]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setCustomName("");
    }
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAttachSelected() {
    if (selected.size === 0) return;
    setSubmitting(true);
    const res = await apiFetch<{ created: number }>(
      `/api/processes/${processId}/documents/attach-labels`,
      {
        method: "POST",
        body: JSON.stringify({ labelIds: Array.from(selected) }),
      }
    );
    setSubmitting(false);
    if (res.success) {
      toast.success(
        `${res.data.created} document${res.data.created > 1 ? "s" : ""} ajoute${res.data.created > 1 ? "s" : ""}`
      );
      onOpenChange(false);
      await onSuccess();
    } else {
      toast.error(formatApiError(res));
    }
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customName.trim()) return;
    setSubmitting(true);
    const res = await apiFetch(`/api/processes/${processId}/documents`, {
      method: "POST",
      body: JSON.stringify({ name: customName.trim() }),
    });
    setSubmitting(false);
    if (res.success) {
      toast.success("Document cree");
      onOpenChange(false);
      await onSuccess();
    } else {
      toast.error(formatApiError(res));
    }
  }

  const recommended = available?.recommended ?? [];
  const others = available?.others ?? [];
  const nothingToImport = recommended.length === 0 && others.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter des documents</DialogTitle>
          <DialogDescription>
            Coche les documents du catalogue a importer, ou cree un document
            ad-hoc avec un nom libre.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {loadingList && (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Chargement...
            </div>
          )}

          {!loadingList && recommended.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                <Sparkles size={12} /> Recommandes par les interventions (
                {recommended.length})
              </h3>
              <ul className="space-y-1">
                {recommended.map((l) => (
                  <LabelRow
                    key={l.id}
                    label={l}
                    checked={selected.has(l.id)}
                    onToggle={() => toggle(l.id)}
                    highlighted
                  />
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-violet-700/80">
                Ces documents sont attendus pour au moins une des interventions
                du dossier.
              </p>
            </section>
          )}

          {!loadingList && others.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
                Autres documents du catalogue ({others.length})
              </h3>
              <ul className="space-y-1">
                {others.map((l) => (
                  <LabelRow
                    key={l.id}
                    label={l}
                    checked={selected.has(l.id)}
                    onToggle={() => toggle(l.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {!loadingList && nothingToImport && (
            <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-3 text-center text-xs text-text-secondary">
              Tous les documents du catalogue sont deja dans le dossier.
              Tu peux en creer un ad-hoc ci-dessous.
            </div>
          )}

          {/* Section creation custom */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
              Creer un nouveau document
            </h3>
            <form onSubmit={handleCreateCustom} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="doc-custom-name">Nom du document</Label>
                <Input
                  id="doc-custom-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Ex: Photo avant (ad-hoc)"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={submitting || !customName.trim()}
              >
                Creer
              </Button>
            </form>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleAttachSelected}
            disabled={submitting || selected.size === 0}
          >
            {submitting
              ? "Ajout..."
              : selected.size === 0
                ? "Aucune selection"
                : `Importer ${selected.size} document${selected.size > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabelRow({
  label,
  checked,
  onToggle,
  highlighted = false,
}: {
  label: DocumentLabel;
  checked: boolean;
  onToggle: () => void;
  highlighted?: boolean;
}) {
  return (
    <li>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition",
          highlighted
            ? "border-violet-200 bg-violet-50/50 hover:bg-violet-50"
            : "border-white/60 bg-white/70 hover:bg-white",
          checked && "ring-2 ring-accent"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">{label.name}</div>
          {label.description && (
            <div className="truncate text-xs text-text-secondary">
              {label.description}
            </div>
          )}
        </div>
      </label>
    </li>
  );
}

function PreviewModal({
  doc,
  processId,
  onClose,
}: {
  doc: ProcessDocument | null;
  processId: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
      setMime(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const session = await getSession();
      const res = await fetch(
        `${BACKEND}/api/processes/${processId}/documents/${doc.id}/preview`,
        { headers: { Authorization: `Bearer ${session?.jwt ?? ""}` } }
      );
      if (!res.ok) {
        toast.error("Apercu indisponible");
        return;
      }
      const b = await res.blob();
      if (cancelled) return;
      setMime(res.headers.get("content-type"));
      setBlobUrl(URL.createObjectURL(b));
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, processId]);

  if (!doc) return null;

  return (
    <Dialog open={doc !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{doc.name}</DialogTitle>
        </DialogHeader>
        <div className="min-h-[400px]">
          {!blobUrl ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-text-secondary">
              <Loader2 size={16} className="mr-2 animate-spin" /> Chargement...
            </div>
          ) : mime === "application/pdf" ? (
            <iframe
              src={blobUrl}
              title={doc.name}
              className="h-[60vh] w-full rounded border border-white/60"
            />
          ) : (
            // image/*
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blobUrl}
              alt={doc.name}
              className="mx-auto max-h-[60vh] rounded border border-white/60 object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EP10/EP09 — Envoyer un template au patient (mode demo) ─────────────────

const KIND_ICON_SEND = { MAIL: Mail, SMS_WHATSAPP: MessageSquare, VIDEO: Video };

interface DocTemplateLite {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}
interface MsgTemplateLite {
  id: string;
  name: string;
  kind: "MAIL" | "SMS_WHATSAPP" | "VIDEO";
  subject: string | null;
  body: string;
  mediaUrl: string | null;
  isActive: boolean;
}

/**
 * Dialog "Envoyer un document au patient" (mode demo).
 * Etape 1 : choisir le PDF blank a envoyer (parmi DocumentTemplates actifs).
 * Etape 2 : choisir un template message d'accompagnement OU rediger a la main.
 * Click "Envoyer en demo" → toast vert + creation MessageSendLog. Aucun envoi reel.
 */
function SendDocumentToPatientDialog({
  open,
  onOpenChange,
  processId,
  clientFirstName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processId: string;
  clientFirstName: string;
}) {
  const [docTemplates, setDocTemplates] = useState<DocTemplateLite[]>([]);
  const [msgTemplates, setMsgTemplates] = useState<MsgTemplateLite[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedMsgId, setSelectedMsgId] = useState<string>("");
  const [customMsg, setCustomMsg] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [d, m] = await Promise.all([
        apiFetch<DocTemplateLite[]>("/api/document-templates?active=true"),
        apiFetch<MsgTemplateLite[]>("/api/message-templates?active=true"),
      ]);
      if (d.success) setDocTemplates(d.data);
      if (m.success) setMsgTemplates(m.data);
    })();
    // Reset
    setSelectedDocId("");
    setSelectedMsgId("");
    setCustomMsg("");
    setMediaUrl("");
  }, [open]);

  // Pre-fill custom message si message template choisi.
  // Pour kind=VIDEO : append le lien videe a la fin du body pour que le
  // commercial le voie dans la preview, et on conserve mediaUrl en champ
  // separe pour l'envoyer au backend (loggue dans MessageSendLog.mediaUrl).
  useEffect(() => {
    if (!selectedMsgId) {
      setMediaUrl("");
      return;
    }
    const t = msgTemplates.find((m) => m.id === selectedMsgId);
    if (!t) return;
    const subjectPart = t.subject ? `${t.subject}\n\n` : "";
    const linkPart =
      t.kind === "VIDEO" && t.mediaUrl ? `\n\nLien video : ${t.mediaUrl}` : "";
    const filled = subjectPart + t.body + linkPart;
    // Substitution simple frontale (preview), backend re-substitue au log
    setCustomMsg(
      filled.replace(/\{\{patient\.firstName\}\}/g, clientFirstName)
    );
    setMediaUrl(t.mediaUrl ?? "");
  }, [selectedMsgId, msgTemplates, clientFirstName]);

  const selectedMsg = msgTemplates.find((m) => m.id === selectedMsgId);
  const isVideo = selectedMsg?.kind === "VIDEO";

  async function handleSend() {
    if (!selectedDocId) {
      toast.error("Choisis le PDF a envoyer");
      return;
    }
    if (!customMsg.trim()) {
      toast.error("Saisis un message d'accompagnement (ou choisis un template)");
      return;
    }
    setSubmitting(true);

    // On enregistre l'envoi comme MessageSendLog avec le nom du PDF dans
    // le sujet → tracable dans l'historique du process. Mode demo, aucun
    // envoi reel.
    const docName = docTemplates.find((d) => d.id === selectedDocId)?.name ?? "Document";
    const kind: MsgTemplateLite["kind"] =
      msgTemplates.find((m) => m.id === selectedMsgId)?.kind ?? "MAIL";
    const res = await apiFetch(`/api/processes/${processId}/send-message`, {
      method: "POST",
      body: JSON.stringify({
        messageTemplateId: selectedMsgId || null,
        kind,
        subject: `[DEMO] PDF envoye : ${docName}`,
        body: customMsg.trim(),
        mediaUrl: kind === "VIDEO" && mediaUrl ? mediaUrl : null,
      }),
    });
    setSubmitting(false);
    if (res.success) {
      toast.success(`DEMO — Template "${docName}" envoye au patient`);
      onOpenChange(false);
    } else {
      toast.error("error" in res ? res.error : "Erreur envoi");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer un document au patient</DialogTitle>
          <DialogDescription>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              DEMO
            </span>{" "}
            Aucun envoi reel — l'action est simulee et tracee dans l'historique
            messages du dossier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <Label htmlFor="send-doc" className="mb-1.5">
              1. Document PDF a envoyer
            </Label>
            <select
              id="send-doc"
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
            >
              <option value="">— Choisir un PDF —</option>
              {docTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
            {docTemplates.length === 0 && (
              <p className="mt-1 text-[11px] text-text-secondary">
                Aucun template PDF dans le catalogue. Cree-en dans Parametrage →
                Templates documents.
              </p>
            )}
          </section>

          <section>
            <Label htmlFor="send-msg" className="mb-1.5">
              2. Message d&apos;accompagnement (template ou redaction libre)
            </Label>
            <select
              id="send-msg"
              value={selectedMsgId}
              onChange={(e) => setSelectedMsgId(e.target.value)}
              className="mb-2 h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
            >
              <option value="">— Pas de template, rediger ci-dessous —</option>
              {msgTemplates.map((t) => {
                const Icon = KIND_ICON_SEND[t.kind];
                return (
                  <option key={t.id} value={t.id}>
                    [{t.kind}] {t.name}
                  </option>
                );
              })}
            </select>
            <textarea
              value={customMsg}
              onChange={(e) => setCustomMsg(e.target.value)}
              rows={6}
              maxLength={10_000}
              placeholder={`Bonjour ${clientFirstName}, voici le document...`}
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {isVideo && (
              <div className="mt-2">
                <Label htmlFor="send-msg-media" className="mb-1.5">
                  URL video (jointe au log d&apos;envoi)
                </Label>
                <input
                  id="send-msg-media"
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                {mediaUrl && (
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                  >
                    <Video size={11} /> Verifier le lien
                  </a>
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={submitting || !selectedDocId || !customMsg.trim()}>
            {submitting ? "Envoi (demo)..." : <><Send size={12} /> Envoyer en demo</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
