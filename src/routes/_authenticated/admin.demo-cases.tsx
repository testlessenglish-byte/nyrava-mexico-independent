import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminListDemoCases,
  adminSaveDemoCase,
  adminDeleteDemoCase,
  adminUploadDemoThumbnail,
  adminUploadDemoDocument,
  adminDeleteDemoDocument,
  DEMO_DOC_TYPES,
  DEMO_DOC_TYPE_LABELS,
} from "@/lib/demo-cases.functions";
import { PRACTICE_AREA_LABELS } from "@/lib/intelligence/practice-areas";
import { ChevronLeft, Plus, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/demo-cases")({
  head: () => ({ meta: [{ title: "Demo Cases — Admin — Nyrava" }] }),
  component: DemoCasesAdminPage,
});

const emptyForm = {
  id: undefined as string | undefined,
  slug: "",
  name: "",
  case_type: Object.keys(PRACTICE_AREA_LABELS)[0] ?? "civil",
  summary: "",
  description: "",
  sort_order: 0,
  published: false,
};

function DemoCasesAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListDemoCases);
  const saveFn = useServerFn(adminSaveDemoCase);
  const deleteFn = useServerFn(adminDeleteDemoCase);
  const thumbnailFn = useServerFn(adminUploadDemoThumbnail);
  const uploadDocFn = useServerFn(adminUploadDemoDocument);
  const deleteDocFn = useServerFn(adminDeleteDemoDocument);

  const [form, setForm] = useState(emptyForm);
  const [docType, setDocType] = useState<(typeof DEMO_DOC_TYPES)[number]>("evidence");

  const q = useQuery({
    queryKey: ["admin-demo-cases"],
    queryFn: () => listFn(),
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-demo-cases"] });
    await qc.invalidateQueries({ queryKey: ["published-demo-cases"] });
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: form as any }),
    onSuccess: async () => {
      setForm(emptyForm);
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: refresh,
  });

  const uploadThumbnail = async (demoCaseId: string, file: File) => {
    const fd = new FormData();
    fd.append("demo_case_id", demoCaseId);
    fd.append("file", file);
    await thumbnailFn({ data: fd });
    await refresh();
  };

  const uploadDocument = async (demoCaseId: string, file: File) => {
    const fd = new FormData();
    fd.append("demo_case_id", demoCaseId);
    fd.append("doc_type", docType);
    fd.append("file", file);
    await uploadDocFn({ data: fd });
    await refresh();
  };

  const deleteDocument = async (id: string) => {
    await deleteDocFn({ data: { id } });
    await refresh();
  };

  const cases = q.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" /> Admin
        </Link>
        <div>
          <h1 className="text-3xl font-semibold">Demo Cases</h1>
          <p className="text-sm text-muted-foreground">
            Manage the public Experience Nyrava demo cases.
          </p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {form.id ? "Edit demo case" : "Add demo case"}
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Case name"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({
                ...form,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
              })
            }
            placeholder="URL slug"
            className="rounded-md border border-border bg-background px-3 py-2"
          />

          <select
            value={form.case_type}
            onChange={(e) => setForm({ ...form, case_type: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2"
          >
            {Object.entries(PRACTICE_AREA_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            placeholder="Sort order"
            className="rounded-md border border-border bg-background px-3 py-2"
          />

          <textarea
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Short summary"
            className="min-h-24 rounded-md border border-border bg-background px-3 py-2 md:col-span-2"
          />

          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Full description"
            className="min-h-36 rounded-md border border-border bg-background px-3 py-2 md:col-span-2"
          />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })}
          />
          Published
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!form.name || !form.slug || save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {form.id ? "Save changes" : "Create demo case"}
          </button>

          {form.id && (
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {cases.map((c: any) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                    {c.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">/demo/{c.slug}</p>
                <p className="mt-1 text-sm">{c.summary}</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: c.id,
                      slug: c.slug,
                      name: c.name,
                      case_type: c.case_type,
                      summary: c.summary ?? "",
                      description: c.description ?? "",
                      sort_order: c.sort_order ?? 0,
                      published: Boolean(c.published),
                    })
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete demo case "${c.name}"?`)) remove.mutate(c.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Thumbnail</h3>
                {c.thumbnail_url && (
                  <img
                    src={c.thumbnail_url}
                    alt=""
                    className="mb-3 max-h-40 rounded-lg border border-border object-cover"
                  />
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <Upload className="h-4 w-4" /> Upload thumbnail
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadThumbnail(c.id, file);
                    }}
                  />
                </label>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Demo documents</h3>

                <div className="mb-3 flex flex-wrap gap-2">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as typeof docType)}
                    className="rounded-md border border-border bg-background px-2 py-2 text-xs"
                  >
                    {DEMO_DOC_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {DEMO_DOC_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                    <Upload className="h-4 w-4" /> Upload document
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadDocument(c.id, file);
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {(c.documents ?? []).map((d: any) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-medium">
                          {DEMO_DOC_TYPE_LABELS[d.doc_type as keyof typeof DEMO_DOC_TYPE_LABELS] ?? d.doc_type}
                        </div>
                        <div className="text-muted-foreground">{d.file_name}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete "${d.file_name}"?`)) void deleteDocument(d.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {(c.documents ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No demo documents uploaded.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!q.isLoading && cases.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No demo cases yet. Create your first one above.
          </div>
        )}
      </div>
    </div>
  );
}
