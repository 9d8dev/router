"use client";

import Script from "next/script";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  GripVertical,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { FormDefinitionV1, FormFieldV1 } from "@/lib/forms/definition";
import type { CompatibleEndpointField } from "@/lib/forms/endpoint-schema";
import {
  formDefinitionV1Schema,
  hasEndpointSchemaChanged,
} from "@/lib/forms/definition";
import {
  addFormOrigin,
  deleteForm,
  publishForm,
  removeFormOrigin,
  saveFormDraft,
  unpublishForm,
} from "@/lib/data/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  allocateSubmissionKey,
  normalizeSubmissionKey,
} from "@/lib/forms/field-identity";
import { createLatestSaveQueue } from "@/lib/forms/latest-save-queue";
import { hasEndpointSchemaChangedFromEndpoint } from "@/lib/forms/starters";
import {
  clearRecoverableFormDraft,
  readRecoverableFormDraft,
  storeRecoverableFormDraft,
  type RecoverableFormDraft,
} from "@/lib/forms/recoverable-draft";

declare global {
  interface Window {
    RouterFormsV1?: {
      mount: (
        target: Element,
        options: { definition: FormDefinitionV1; publicId: string; preview: true }
      ) => Promise<void>;
    };
  }
}

type EditorForm = {
  id: string;
  publicId: string;
  name: string;
  endpointId: string;
  endpointName: string;
  endpointSchema: CompatibleEndpointField[];
  attachedToExistingEndpoint: boolean;
  draftDefinition: FormDefinitionV1;
  draftRevision: number;
  publishedDefinition: FormDefinitionV1 | null;
  publishedRevision: number;
  publishedAt: Date | null;
};

type Origin = { id: string; origin: string; kind: "embed" | "wordpress" };
type FieldKind = FormFieldV1["kind"];

const fieldKinds: Array<{ kind: FieldKind; label: string }> = [
  { kind: "text", label: "Text" },
  { kind: "email", label: "Email" },
  { kind: "phone", label: "Phone" },
  { kind: "url", label: "URL" },
  { kind: "date", label: "Date" },
  { kind: "number", label: "Number" },
  { kind: "textarea", label: "Long text" },
  { kind: "select", label: "Select" },
  { kind: "radio", label: "Radio" },
  { kind: "checkbox", label: "Checkbox" },
  { kind: "checkbox-group", label: "Checkbox group" },
  { kind: "yes-no", label: "Yes / no" },
  { kind: "switch", label: "Switch" },
  { kind: "slider", label: "Slider" },
];

function makeField(kind: FieldKind, existingKeys: Iterable<string>): FormFieldV1 {
  const label = fieldKinds.find((field) => field.kind === kind)?.label ?? "Field";
  const base = {
    id: `fld_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    key: allocateSubmissionKey(label, existingKeys),
    label,
    required: false,
  };
  if (kind === "select" || kind === "radio" || kind === "checkbox-group") {
    return {
      ...base,
      kind,
      options: [
        { id: `${base.id}_one`, label: "Option one", value: "option_one" },
        { id: `${base.id}_two`, label: "Option two", value: "option_two" },
      ],
    } as FormFieldV1;
  }
  if (kind === "textarea") return { ...base, kind, rows: 5 } as FormFieldV1;
  if (kind === "slider") {
    return { ...base, kind, defaultValue: 5, validation: { min: 0, max: 10, step: 1 } } as FormFieldV1;
  }
  return { ...base, kind } as FormFieldV1;
}

function changeFieldKind(field: FormFieldV1, kind: FieldKind): FormFieldV1 {
  const replacement = makeField(kind, []) as FormFieldV1 & Record<string, unknown>;
  return {
    ...replacement,
    id: field.id,
    key: field.key,
    label: field.label,
    helpText: field.helpText,
    required: field.required,
  } as FormFieldV1;
}

export function FormEditor({ form, origins: initialOrigins }: { form: EditorForm; origins: Origin[] }) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [definition, setDefinition] = useState<FormDefinitionV1>(form.draftDefinition);
  const [selectedId, setSelectedId] = useState<string | null>(form.draftDefinition.fields[0]?.id ?? null);
  const [revision, setRevision] = useState(form.draftRevision);
  const [publishedRevision, setPublishedRevision] = useState(form.publishedRevision);
  const [publishedAt, setPublishedAt] = useState<Date | null>(form.publishedAt);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "conflict">("saved");
  const [runtimeReady, setRuntimeReady] = useState(0);
  const [origins, setOrigins] = useState(initialOrigins);
  const [originInput, setOriginInput] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [recoverableDraft, setRecoverableDraft] =
    useState<RecoverableFormDraft | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(revision);
  const latestRef = useRef({ name, definition });
  const lastSavedRef = useRef(JSON.stringify({ name, definition }));
  const saveQueue = useMemo(
    () =>
      createLatestSaveQueue({
        getSnapshot: () => latestRef.current,
        fingerprint: JSON.stringify,
        getPersistedFingerprint: () => lastSavedRef.current,
        save: async (snapshot, serialized) => {
          setSaveState("saving");
          const result = await saveFormDraft({
            id: form.id,
            expectedRevision: revisionRef.current,
            name: snapshot.name,
            definition: snapshot.definition,
          });

          if (result?.data) {
            revisionRef.current = result.data.revision;
            setRevision(result.data.revision);
            lastSavedRef.current = serialized;
            if (JSON.stringify(latestRef.current) === serialized) {
              clearRecoverableFormDraft(window.localStorage, form.id);
            } else {
              storeRecoverableFormDraft(window.localStorage, {
                formId: form.id,
                baseRevision: result.data.revision,
                ...latestRef.current,
                updatedAt: new Date().toISOString(),
              });
            }
            setSaveState("saved");
            return true;
          }

          const message = result?.serverError || "Draft could not be saved.";
          const conflict =
            message.includes("another tab") || message.includes("newer work");
          setSaveState(conflict ? "conflict" : "error");
          toast.error(message);
          return false;
        },
      }),
    [form.id]
  );

  latestRef.current = { name, definition };

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  const persistLatest = useCallback((): Promise<boolean> => saveQueue.persist(), [
    saveQueue,
  ]);
  const hasUnsavedChanges = useCallback(
    () => JSON.stringify(latestRef.current) !== lastSavedRef.current,
    []
  );

  const preserveLatestDraft = useCallback(() => {
    if (!hasUnsavedChanges()) return;
    storeRecoverableFormDraft(window.localStorage, {
      formId: form.id,
      baseRevision: revisionRef.current,
      ...latestRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, [form.id, hasUnsavedChanges]);

  useEffect(() => {
    const recovered = readRecoverableFormDraft(window.localStorage, form.id);
    if (!recovered) return;
    const serverFingerprint = JSON.stringify({
      name: form.name,
      definition: form.draftDefinition,
    });
    const recoveredFingerprint = JSON.stringify({
      name: recovered.name,
      definition: recovered.definition,
    });
    if (serverFingerprint === recoveredFingerprint) {
      clearRecoverableFormDraft(window.localStorage, form.id);
      return;
    }
    setRecoverableDraft(recovered);
  }, [form.draftDefinition, form.id, form.name]);

  useEffect(() => {
    if (JSON.stringify({ name, definition }) === lastSavedRef.current) return;
    if (recoverableDraft) return;
    preserveLatestDraft();
    const timeout = window.setTimeout(() => void persistLatest(), 850);
    return () => window.clearTimeout(timeout);
  }, [definition, name, persistLatest, preserveLatestDraft, recoverableDraft]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        !hasUnsavedChanges() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const clicked = event.target;
      const anchor =
        clicked instanceof Element ? clicked.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void persistLatest().then((saved) => {
        if (saved) {
          router.push(
            `${destination.pathname}${destination.search}${destination.hash}`
          );
        }
      });
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      preserveLatestDraft();
      void persistLatest();
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePageHide = () => {
      if (!hasUnsavedChanges()) return;
      preserveLatestDraft();
      void persistLatest();
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      if (hasUnsavedChanges()) {
        preserveLatestDraft();
        void persistLatest();
      }
    };
  }, [hasUnsavedChanges, persistLatest, preserveLatestDraft, router]);

  useEffect(() => {
    if (!previewRef.current || !window.RouterFormsV1) return;
    void window.RouterFormsV1.mount(previewRef.current, {
      definition,
      publicId: form.publicId,
      preview: true,
    });
  }, [definition, form.publicId, runtimeReady]);

  const selected = definition.fields.find((field) => field.id === selectedId) ?? null;
  const embedCode = `<div data-router-form="${form.publicId}"></div>\n<script async src="https://forms.router.so/embed/v1.js"></script>`;
  const schemaChanged = useMemo(
    () =>
      form.publishedDefinition
        ? hasEndpointSchemaChanged(definition, form.publishedDefinition)
        : hasEndpointSchemaChangedFromEndpoint(definition, form.endpointSchema),
    [definition, form.endpointSchema, form.publishedDefinition]
  );

  function updateSelected(patch: Record<string, unknown>) {
    setDefinition((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === selectedId ? ({ ...field, ...patch } as FormFieldV1) : field
      ),
    }));
  }

  function addField(kind: FieldKind) {
    const field = makeField(kind, definition.fields.map((item) => item.key));
    setDefinition((current) => ({ ...current, fields: [...current.fields, field] }));
    setSelectedId(field.id);
  }

  function moveField(fieldId: string, offset: number) {
    setDefinition((current) => {
      const from = current.fields.findIndex((field) => field.id === fieldId);
      const to = Math.max(0, Math.min(current.fields.length - 1, from + offset));
      if (from < 0 || from === to) return current;
      const fields = [...current.fields];
      const [field] = fields.splice(from, 1);
      fields.splice(to, 0, field);
      return { ...current, fields };
    });
  }

  function dropBefore(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setDefinition((current) => {
      const fields = [...current.fields];
      const from = fields.findIndex((field) => field.id === draggedId);
      const target = fields.findIndex((field) => field.id === targetId);
      if (from < 0 || target < 0) return current;
      const [field] = fields.splice(from, 1);
      fields.splice(from < target ? target - 1 : target, 0, field);
      return { ...current, fields };
    });
    setDraggedId(null);
  }

  async function handlePublish() {
    const valid = formDefinitionV1Schema.safeParse(definition);
    if (!valid.success) {
      toast.error(valid.error.issues[0]?.message || "Complete the form before publishing.");
      return;
    }
    if (
      form.attachedToExistingEndpoint &&
      schemaChanged &&
      !window.confirm(
        "Publishing will update the validation schema of this previously headless endpoint. Its URL and bearer token stay the same. Continue?"
      )
    ) {
      return;
    }
    const saved = await persistLatest();
    if (!saved) return;
    const result = await publishForm({ id: form.id, expectedDraftRevision: revisionRef.current });
    if (!result?.data) {
      toast.error(result?.serverError || "Could not publish the form.");
      return;
    }
    setPublishedRevision(result.data.publishedRevision);
    setPublishedAt(new Date());
    toast.success("Published. Live placements now use this revision.");
    router.refresh();
  }

  async function handleUnpublish() {
    if (!window.confirm("Unpublish this form? Existing endpoint API submissions will keep working.")) return;
    const result = await unpublishForm({ id: form.id });
    if (result?.serverError) return toast.error(result.serverError);
    setPublishedAt(null);
    toast.success("Form unpublished.");
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this form? Its endpoint and existing leads will be preserved.")) return;
    const result = await deleteForm({ id: form.id });
    if (result?.serverError) return toast.error(result.serverError);
    router.push("/forms");
    router.refresh();
  }

  function restoreRecoveredDraft() {
    if (!recoverableDraft || recoverableDraft.baseRevision !== form.draftRevision) {
      return;
    }
    setName(recoverableDraft.name);
    setDefinition(recoverableDraft.definition as FormDefinitionV1);
    setSelectedId(recoverableDraft.definition.fields[0]?.id ?? null);
    setRecoverableDraft(null);
    toast.success("Recovered unsaved changes. Saving draft…");
  }

  function discardRecoveredDraft() {
    clearRecoverableFormDraft(window.localStorage, form.id);
    setRecoverableDraft(null);
  }

  function downloadRecoveredDraft() {
    if (!recoverableDraft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recoverableDraft.definition, null, 2)], {
        type: "application/json",
      })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${normalizeSubmissionKey(recoverableDraft.name)}.recovered.router-form.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function addOrigin() {
    const result = await addFormOrigin({ formId: form.id, origin: originInput });
    if (!result?.data) return toast.error(result?.serverError || "Could not add that origin.");
    const addedOrigin = result.data.origin;
    const addedOriginId = result.data.id;
    setOrigins((current) => [
      ...current.filter((origin) => origin.origin !== addedOrigin),
      { id: addedOriginId, origin: addedOrigin, kind: "embed" },
    ]);
    setOriginInput("");
    toast.success("Embed origin approved.");
    router.refresh();
  }

  function exportDefinition() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${normalizeSubmissionKey(name)}.router-form.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importDefinition(file: File) {
    try {
      const parsed = formDefinitionV1Schema.parse(JSON.parse(await file.text()));
      setDefinition(parsed);
      setSelectedId(parsed.fields[0]?.id ?? null);
      toast.success("Definition imported into the draft.");
    } catch {
      toast.error("That file is not a valid FormDefinitionV1 export.");
    }
  }

  return (
    <div className="grid gap-5">
      <Script src="/embed/v1.js" strategy="afterInteractive" onLoad={() => setRuntimeReady((value) => value + 1)} />
      {recoverableDraft && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Unsaved changes are available</p>
            <p className="text-xs text-muted-foreground">
              {recoverableDraft.baseRevision === form.draftRevision
                ? "Restore the draft preserved by this browser, or discard it and keep the saved version."
                : "A newer draft has already been saved. Download this recovered copy for manual review, or discard it and keep the newer version."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={discardRecoveredDraft}>
              Discard
            </Button>
            {recoverableDraft.baseRevision === form.draftRevision ? (
              <Button size="sm" onClick={restoreRecoveredDraft}>
                Restore changes
              </Button>
            ) : (
              <Button size="sm" onClick={downloadRecoveredDraft}>
                Download recovered copy
              </Button>
            )}
          </div>
        </div>
      )}
      <header className="flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Input
            aria-label="Internal form name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-auto border-0 bg-transparent p-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Endpoint: {form.endpointName}</span>
            <span>·</span>
            <span>Draft r{revision}</span>
            {publishedAt && <Badge variant="secondary">Live v{publishedRevision}</Badge>}
            <span className={cn("inline-flex items-center gap-1", saveState === "error" || saveState === "conflict" ? "text-destructive" : "") }>
              {saveState === "saving" ? <Save className="h-3 w-3 animate-pulse" /> : <Check className="h-3 w-3" />}
              {saveState === "saving" ? "Saving" : saveState === "saved" ? "Draft saved" : saveState === "conflict" ? "Reload required" : "Save failed"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/forms/${form.id}/leads`}>View leads</Link>
          </Button>
          {publishedAt && (
            <Button variant="outline" asChild>
              <a href={`https://forms.router.so/${form.publicId}`} target="_blank" rel="noreferrer">
                Open live <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
          {publishedAt && <Button variant="outline" onClick={handleUnpublish}>Unpublish</Button>}
          <Button onClick={handlePublish} disabled={saveState === "saving" || saveState === "conflict"}>
            <Send className="mr-2 h-4 w-4" /> {publishedAt ? "Publish changes" : "Publish"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[220px_minmax(360px,1fr)_300px]">
        <aside className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-medium">Add a field</h2>
          <p className="mt-1 text-xs text-muted-foreground">Click a type, then arrange fields in the outline.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-1">
            {fieldKinds.map((field) => (
              <button
                key={field.kind}
                type="button"
                onClick={() => addField(field.kind)}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" /> {field.label}
              </button>
            ))}
          </div>
          <div className="mt-6 border-t pt-4">
            <h2 className="text-sm font-medium">Definition</h2>
            <div className="mt-3 grid gap-2">
              <Button size="sm" variant="outline" onClick={exportDefinition}>
                <Download className="mr-2 h-3.5 w-3.5" /> Export JSON
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-3.5 w-3.5" /> Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importDefinition(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </aside>

        <section className="grid content-start gap-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Field outline</h2>
                <p className="text-xs text-muted-foreground">Drag rows or use the arrow buttons.</p>
              </div>
              <Badge variant="outline">{definition.fields.length} fields</Badge>
            </div>
            <div className="grid gap-2">
              {definition.fields.length === 0 && (
                <button
                  type="button"
                  onClick={() => addField("text")}
                  className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-accent/50"
                >
                  Add your first field
                </button>
              )}
              {definition.fields.map((field, index) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => setDraggedId(field.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropBefore(field.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2",
                    selectedId === field.id ? "border-foreground bg-accent" : "bg-card"
                  )}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(field.id)}>
                    <span className="block truncate text-sm font-medium">{field.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{field.kind} · {field.key}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveField(field.id, -1)} aria-label="Move field up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === definition.fields.length - 1} onClick={() => moveField(field.id, 1)} aria-label="Move field down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => {
                      setDefinition((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) }));
                      if (selectedId === field.id) setSelectedId(null);
                    }}
                    aria-label="Remove field"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-[#f6f6f3] p-4 text-[#171714] [--router-form-accent:#171714] [--router-form-accent-contrast:#fff] [--router-form-border-color:rgba(23,23,20,.18)] [--router-form-muted-color:rgba(23,23,20,.62)] [--router-form-surface:#fff] sm:p-8">
            <div className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-black/45">
              <Eye className="h-3.5 w-3.5" /> Production renderer preview
            </div>
            <div ref={previewRef} />
          </div>

          <PlacementSettings
            formId={form.id}
            publicId={form.publicId}
            published={Boolean(publishedAt)}
            embedCode={embedCode}
            origins={origins}
            originInput={originInput}
            setOriginInput={setOriginInput}
            addOrigin={addOrigin}
            onRemoveOrigin={async (origin) => {
              const result = await removeFormOrigin({ formId: form.id, originId: origin.id });
              if (result?.serverError) return toast.error(result.serverError);
              setOrigins((current) => current.filter((item) => item.id !== origin.id));
              router.refresh();
            }}
          />
        </section>

        <aside className="rounded-xl border bg-background p-4">
          {selected ? (
            <FieldSettings
              field={selected}
              update={updateSelected}
              changeKind={(kind) =>
                setDefinition((current) => ({
                  ...current,
                  fields: current.fields.map((field) =>
                    field.id === selected.id ? changeFieldKind(field, kind) : field
                  ),
                }))
              }
            />
          ) : (
            <FormSettings definition={definition} setDefinition={setDefinition} />
          )}
          {selected && (
            <Button variant="ghost" className="mt-5 w-full" onClick={() => setSelectedId(null)}>
              <FileJson className="mr-2 h-4 w-4" /> Edit form settings
            </Button>
          )}
          <div className="mt-6 border-t pt-4">
            <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete form
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">Endpoint and leads are preserved.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FieldSettings({
  field,
  update,
  changeKind,
}: {
  field: FormFieldV1;
  update: (patch: Record<string, unknown>) => void;
  changeKind: (kind: FieldKind) => void;
}) {
  const editable = field as FormFieldV1 & Record<string, unknown>;
  const hasOptions = "options" in field;
  const options = hasOptions ? field.options : [];
  const validation = "validation" in field ? field.validation : undefined;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-sm font-medium">Field settings</h2>
        <p className="text-xs text-muted-foreground">ID: {field.id}</p>
      </div>
      <div className="grid gap-2">
        <Label>Type</Label>
        <Select value={field.kind} onValueChange={(value) => changeKind(value as FieldKind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {fieldKinds.map((item) => <SelectItem key={item.kind} value={item.kind}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Label</Label>
        <Input value={field.label} onChange={(event) => update({ label: event.target.value })} />
      </div>
      <div className="grid gap-2">
        <Label>Submission key</Label>
        <Input value={field.key} onChange={(event) => update({ key: normalizeSubmissionKey(event.target.value) })} />
      </div>
      <div className="grid gap-2">
        <Label>Help text</Label>
        <Textarea value={field.helpText ?? ""} onChange={(event) => update({ helpText: event.target.value || undefined })} />
      </div>
      {"placeholder" in field && (
        <div className="grid gap-2">
          <Label>Placeholder</Label>
          <Input value={String(editable.placeholder ?? "")} onChange={(event) => update({ placeholder: event.target.value || undefined })} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={field.required} onCheckedChange={(checked) => update({ required: checked === true })} /> Required
      </label>
      {(field.kind === "text" ||
        field.kind === "email" ||
        field.kind === "phone" ||
        field.kind === "url" ||
        field.kind === "textarea") && (
        <div className="grid gap-2">
          <Label>Default value</Label>
          {field.kind === "textarea" ? (
            <Textarea
              value={typeof editable.defaultValue === "string" ? editable.defaultValue : ""}
              onChange={(event) =>
                update({ defaultValue: event.target.value || undefined })
              }
            />
          ) : (
            <Input
              value={typeof editable.defaultValue === "string" ? editable.defaultValue : ""}
              onChange={(event) =>
                update({ defaultValue: event.target.value || undefined })
              }
            />
          )}
        </div>
      )}
      {(field.kind === "number" || field.kind === "slider") && (
        <div className="grid gap-2">
          <Label>Default value</Label>
          <Input
            type="number"
            value={typeof editable.defaultValue === "number" ? editable.defaultValue : ""}
            onChange={(event) =>
              update({
                defaultValue:
                  event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
          />
        </div>
      )}
      {field.kind === "date" && (
        <div className="grid gap-2">
          <Label>Default date</Label>
          <Input
            type="date"
            value={typeof editable.defaultValue === "string" ? editable.defaultValue : ""}
            onChange={(event) =>
              update({ defaultValue: event.target.value || undefined })
            }
          />
        </div>
      )}
      {(field.kind === "checkbox" ||
        field.kind === "yes-no" ||
        field.kind === "switch") && (
        <div className="grid gap-2">
          <Label>Default state</Label>
          <Select
            value={
              typeof editable.defaultValue === "boolean"
                ? String(editable.defaultValue)
                : "unset"
            }
            onValueChange={(value) =>
              update({
                defaultValue: value === "unset" ? undefined : value === "true",
              })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">No default</SelectItem>
              <SelectItem value="true">Yes / on</SelectItem>
              <SelectItem value="false">No / off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {hasOptions && (
        <div className="grid gap-2">
          <Label>Options</Label>
          <Textarea
            value={options.map((option) => `${option.label}|${option.value}`).join("\n")}
            onChange={(event) =>
              update({
                options: event.target.value
                  .split("\n")
                  .map((line, index) => {
                    const [label, value] = line.split("|");
                    return {
                      id: `${field.id}_option_${index + 1}`,
                      label: label?.trim() || `Option ${index + 1}`,
                      value: value?.trim() || normalizeSubmissionKey(label || `option_${index + 1}`),
                    };
                  })
                  .filter((option) => option.value),
              })
            }
            rows={6}
          />
          <p className="text-xs text-muted-foreground">One option per line: Label|value</p>
        </div>
      )}
      {(field.kind === "select" || field.kind === "radio") && (
        <div className="grid gap-2">
          <Label>Default option</Label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={typeof editable.defaultValue === "string" ? editable.defaultValue : ""}
            onChange={(event) =>
              update({ defaultValue: event.target.value || undefined })
            }
          >
            <option value="">No default</option>
            {options.map((option) => (
              <option key={option.id} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}
      {field.kind === "checkbox-group" && (
        <div className="grid gap-2">
          <Label>Default selections</Label>
          <div className="grid gap-2 rounded-md border p-3">
            {options.map((option) => {
              const defaults = Array.isArray(editable.defaultValue)
                ? editable.defaultValue
                : [];
              return (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={defaults.includes(option.value)}
                    onCheckedChange={(checked) => {
                      const nextDefaults = checked
                        ? [...defaults, option.value]
                        : defaults.filter((value) => value !== option.value);
                      update({
                        defaultValue: nextDefaults.length
                          ? nextDefaults
                          : undefined,
                      });
                    }}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {(field.kind === "text" || field.kind === "textarea" || field.kind === "email" || field.kind === "phone" || field.kind === "url") && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2"><Label>Min length</Label><Input type="number" min={0} value={(validation as { minLength?: number })?.minLength ?? ""} onChange={(event) => update({ validation: { ...validation, minLength: event.target.value ? Number(event.target.value) : undefined } })} /></div>
          <div className="grid gap-2"><Label>Max length</Label><Input type="number" min={1} value={(validation as { maxLength?: number })?.maxLength ?? ""} onChange={(event) => update({ validation: { ...validation, maxLength: event.target.value ? Number(event.target.value) : undefined } })} /></div>
        </div>
      )}
      {(field.kind === "number" || field.kind === "slider") && (
        <div className="grid grid-cols-3 gap-2">
          {(["min", "max", "step"] as const).map((key) => (
            <div key={key} className="grid gap-2"><Label className="capitalize">{key}</Label><Input type="number" value={(validation as { min?: number; max?: number; step?: number })?.[key] ?? ""} onChange={(event) => update({ validation: { ...validation, [key]: event.target.value ? Number(event.target.value) : undefined } })} /></div>
          ))}
        </div>
      )}
      {field.kind === "date" && (
        <div className="grid grid-cols-2 gap-2">
          {(["min", "max"] as const).map((key) => (
            <div key={key} className="grid gap-2">
              <Label>{key === "min" ? "Earliest date" : "Latest date"}</Label>
              <Input
                type="date"
                value={(validation as { min?: string; max?: string })?.[key] ?? ""}
                onChange={(event) =>
                  update({
                    validation: {
                      ...validation,
                      [key]: event.target.value || undefined,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
      {field.kind === "checkbox-group" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>Minimum selections</Label>
            <Input
              type="number"
              min={0}
              max={options.length}
              value={(validation as { minSelections?: number })?.minSelections ?? ""}
              onChange={(event) =>
                update({
                  validation: {
                    ...validation,
                    minSelections:
                      event.target.value === "" ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Maximum selections</Label>
            <Input
              type="number"
              min={1}
              max={options.length}
              value={(validation as { maxSelections?: number })?.maxSelections ?? ""}
              onChange={(event) =>
                update({
                  validation: {
                    ...validation,
                    maxSelections:
                      event.target.value === "" ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      )}
      {field.kind === "textarea" && (
        <div className="grid gap-2">
          <Label>Visible rows</Label>
          <Input
            type="number"
            min={2}
            max={20}
            value={typeof editable.rows === "number" ? editable.rows : ""}
            onChange={(event) =>
              update({
                rows: event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function FormSettings({ definition, setDefinition }: { definition: FormDefinitionV1; setDefinition: (definition: FormDefinitionV1) => void }) {
  return (
    <div className="grid gap-4">
      <div><h2 className="text-sm font-medium">Form settings</h2><p className="text-xs text-muted-foreground">Public copy and completion behavior.</p></div>
      <div className="grid gap-2"><Label>Public title</Label><Input value={definition.title} onChange={(event) => setDefinition({ ...definition, title: event.target.value })} /></div>
      <div className="grid gap-2"><Label>Description</Label><Textarea value={definition.description ?? ""} onChange={(event) => setDefinition({ ...definition, description: event.target.value || undefined })} /></div>
      <div className="grid gap-2"><Label>Submit label</Label><Input value={definition.submitLabel} onChange={(event) => setDefinition({ ...definition, submitLabel: event.target.value })} /></div>
      <div className="grid gap-2">
        <Label>Completion</Label>
        <Select
          value={definition.completion.type}
          onValueChange={(value) =>
            setDefinition({
              ...definition,
              completion: value === "redirect" ? { type: "redirect", url: "https://" } : { type: "message", message: "Thanks — your response has been received." },
            })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="message">Thank-you message</SelectItem><SelectItem value="redirect">HTTPS redirect</SelectItem></SelectContent>
        </Select>
      </div>
      {definition.completion.type === "message" ? (
        <div className="grid gap-2"><Label>Message</Label><Textarea value={definition.completion.message} onChange={(event) => setDefinition({ ...definition, completion: { type: "message", message: event.target.value } })} /></div>
      ) : (
        <div className="grid gap-2"><Label>Redirect URL</Label><Input type="url" value={definition.completion.url} onChange={(event) => setDefinition({ ...definition, completion: { type: "redirect", url: event.target.value } })} /></div>
      )}
    </div>
  );
}

function PlacementSettings(props: {
  formId: string;
  publicId: string;
  published: boolean;
  embedCode: string;
  origins: Origin[];
  originInput: string;
  setOriginInput: (value: string) => void;
  addOrigin: () => void;
  onRemoveOrigin: (origin: Origin) => void;
}) {
  async function copy(text: string, event: "hosted" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      posthog.capture(event === "embed" ? "form_placement_copied" : "form_hosted_url_copied", {
        form_id: props.formId,
        placement: event,
      });
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-medium">Placements</h2><p className="text-xs text-muted-foreground">Only explicit publishing changes these live surfaces.</p></div>{!props.published && <Badge variant="secondary">Publish first</Badge>}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="grid gap-2"><Label>Hosted page</Label><div className="flex gap-2"><Input readOnly value={`https://forms.router.so/${props.publicId}`} /><Button variant="outline" size="icon" aria-label="Copy hosted form URL" onClick={() => void copy(`https://forms.router.so/${props.publicId}`, "hosted")}><Clipboard className="h-4 w-4" /></Button></div></div>
        <div className="grid gap-2"><Label>Generic embed</Label><div className="flex gap-2"><Textarea readOnly rows={3} value={props.embedCode} className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy generic embed code" onClick={() => void copy(props.embedCode, "embed")}><Clipboard className="h-4 w-4" /></Button></div></div>
      </div>
      <div className="mt-5 border-t pt-5">
        <Label>Approved generic-embed origins</Label>
        <p className="mt-1 text-xs text-muted-foreground">Add the HTTPS origin of each site that may render this form.</p>
        <div className="mt-3 flex gap-2"><Input placeholder="https://example.com" value={props.originInput} onChange={(event) => props.setOriginInput(event.target.value)} /><Button variant="outline" onClick={props.addOrigin} disabled={!props.originInput.trim()}>Approve</Button></div>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.origins.map((origin) => (
            <Badge key={origin.id} variant="outline" className="gap-1.5 py-1.5">
              {origin.kind === "wordpress" ? "WordPress · " : ""}{origin.origin}
              {origin.kind === "embed" && <button type="button" onClick={() => props.onRemoveOrigin(origin)} aria-label={`Remove ${origin.origin}`}><X className="h-3 w-3" /></button>}
            </Badge>
          ))}
          {props.origins.length === 0 && <span className="text-xs text-muted-foreground">No external origins approved yet.</span>}
        </div>
      </div>
    </section>
  );
}
