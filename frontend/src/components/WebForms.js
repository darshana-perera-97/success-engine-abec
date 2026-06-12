import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  Copy,
  Code2,
  Monitor,
  Tablet,
  Smartphone,
  ArrowLeft,
  Eye,
  GripVertical,
} from "lucide-react";
import { Button } from "./Button";
import { EmbeddableWebForm } from "./EmbeddableWebForm";
import {
  createWebForm,
  deleteWebForm,
  getWebForms,
  updateWebForm,
} from "../authApi";
import {
  WEB_FORM_FIELD_CATALOG,
  buildWebFormEmbedSnippet,
  createDefaultWebFormDesign,
  normalizeWebFormRecord,
} from "../webFormConfig";

const DEVICE_OPTIONS = [
  { id: "mobile", label: "Mobile", icon: Smartphone, width: 375 },
  { id: "tablet", label: "Tablet", icon: Tablet, width: 768 },
  { id: "desktop", label: "Desktop", icon: Monitor, width: 960 },
];

const COLOR_FIELDS = [
  { key: "pageBackground", label: "Page background" },
  { key: "formBackground", label: "Form background" },
  { key: "primaryColor", label: "Primary / button" },
  { key: "textColor", label: "Text" },
  { key: "labelColor", label: "Labels" },
  { key: "borderColor", label: "Borders" },
  { key: "inputBackground", label: "Input background" },
];

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function FieldEditorRow({ field, catalog, onChange }) {
  const meta = catalog;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical size={16} className="text-slate-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{meta?.defaultLabel || field.key}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">{field.key}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 flex-shrink-0">
          <input
            type="checkbox"
            checked={field.enabled}
            onChange={(e) => onChange({ ...field, enabled: e.target.checked })}
          />
          Visible
        </label>
      </div>

      {field.enabled ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Label</label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Width</label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
              value={field.width}
              onChange={(e) => onChange({ ...field, width: e.target.value })}
            >
              <option value="full">Full width</option>
              <option value="half">Half width</option>
            </select>
          </div>
          {meta?.type === "text" || meta?.type === "email" || meta?.type === "tel" || meta?.type === "textarea" ? (
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Placeholder</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                value={field.placeholder}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
            />
            Required field
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function WebForms() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("list");
  const [editing, setEditing] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [embedForm, setEmbedForm] = useState(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const catalogByKey = useMemo(
    () => new Map(WEB_FORM_FIELD_CATALOG.map((f) => [f.key, f])),
    []
  );

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getWebForms();
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Failed to load forms.");
      return;
    }
    setForms(result.data || []);
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const openCreate = () => {
    const draft = normalizeWebFormRecord(createDefaultWebFormDesign());
    setEditing(draft);
    setMode("editor");
    setNotice("");
    setError("");
  };

  const openEdit = (form) => {
    setEditing(normalizeWebFormRecord(form));
    setMode("editor");
    setNotice("");
    setError("");
  };

  const closeEditor = () => {
    setMode("list");
    setEditing(null);
    setPreviewDevice("desktop");
  };

  const updateEditing = (patch) => {
    setEditing((prev) => normalizeWebFormRecord({ ...prev, ...patch }));
  };

  const updateAppearance = (key, value) => {
    setEditing((prev) =>
      normalizeWebFormRecord({
        ...prev,
        appearance: { ...prev.appearance, [key]: value },
      })
    );
  };

  const updateField = (key, nextField) => {
    setEditing((prev) =>
      normalizeWebFormRecord({
        ...prev,
        fields: prev.fields.map((field) => (field.key === key ? nextField : field)),
      })
    );
  };

  const handleSave = async () => {
    if (!editing) return;
    const name = String(editing.name || "").trim();
    if (!name) {
      setError("Form name is required.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    const payload = normalizeWebFormRecord(editing);
    const isNew = !forms.some((f) => f.id === payload.id);
    const result = isNew
      ? await createWebForm(payload)
      : await updateWebForm(payload.id, payload);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error || "Failed to save form.");
      return;
    }
    setNotice("Form saved.");
    setEditing(normalizeWebFormRecord(result.data));
    await loadForms();
    if (isNew) setMode("editor");
  };

  const handleDelete = async (form) => {
    if (!window.confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    const result = await deleteWebForm(form.id);
    if (!result.ok) {
      setError(result.error || "Failed to delete form.");
      return;
    }
    if (editing?.id === form.id) closeEditor();
    await loadForms();
    setNotice("Form deleted.");
  };

  const copyEmbed = async (form) => {
    const snippet = buildWebFormEmbedSnippet(form.id);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch {
      setError("Could not copy embed code.");
    }
  };

  const previewFrameWidth = DEVICE_OPTIONS.find((d) => d.id === previewDevice)?.width || 960;

  if (mode === "editor" && editing) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Back to forms
            </button>
            <h1 className="text-xl font-bold text-slate-900">Design form</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setEmbedForm(editing)} disabled={!editing.id}>
              <Code2 size={16} className="mr-2" />
              Embed code
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              <Save size={16} className="mr-2" />
              Save form
            </Button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}
        {notice ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</p>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-900">Form details</h2>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Form name <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                  value={editing.name}
                  onChange={(e) => updateEditing({ name: e.target.value })}
                  placeholder="e.g. UK September intake landing page"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Saved in the Additional message field on submission as <code>Form: [name]</code>.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Page title</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                  value={editing.title}
                  onChange={(e) => updateEditing({ title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Subtitle</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-y"
                  value={editing.subtitle}
                  onChange={(e) => updateEditing({ subtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Submit button</label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.submitButtonText}
                    onChange={(e) => updateEditing({ submitButtonText: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Success title</label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.successTitle}
                    onChange={(e) => updateEditing({ successTitle: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Success message</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-y"
                  value={editing.successMessage}
                  onChange={(e) => updateEditing({ successMessage: e.target.value })}
                />
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-900">Appearance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {COLOR_FIELDS.map((item) => (
                  <div key={item.key}>
                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">{item.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editing.appearance[item.key] || "#000000"}
                        onChange={(e) => updateAppearance(item.key, e.target.value)}
                        className="h-9 w-10 rounded border border-gray-200 p-0.5"
                      />
                      <input
                        className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono"
                        value={editing.appearance[item.key] || ""}
                        onChange={(e) => updateAppearance(item.key, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Border radius (px)</label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.borderRadius}
                    onChange={(e) => updateAppearance("borderRadius", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Form padding (px)</label>
                  <input
                    type="number"
                    min={8}
                    max={64}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.formPadding}
                    onChange={(e) => updateAppearance("formPadding", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Field gap (px)</label>
                  <input
                    type="number"
                    min={8}
                    max={48}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.fieldGap}
                    onChange={(e) => updateAppearance("fieldGap", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Desktop max width (px)</label>
                  <input
                    type="number"
                    min={320}
                    max={960}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.maxWidthDesktop}
                    onChange={(e) => updateAppearance("maxWidthDesktop", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Tablet max width (px)</label>
                  <input
                    type="number"
                    min={280}
                    max={800}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.maxWidthTablet}
                    onChange={(e) => updateAppearance("maxWidthTablet", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Mobile width (%)</label>
                  <input
                    type="number"
                    min={80}
                    max={100}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    value={editing.appearance.maxWidthMobile}
                    onChange={(e) => updateAppearance("maxWidthMobile", Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
              <h2 className="font-semibold text-slate-900">Fields</h2>
              <p className="text-xs text-slate-500">
                Same fields as the student registration form. Toggle visibility, labels, width, and required state.
              </p>
              <div className="space-y-3">
                {editing.fields.map((field) => (
                  <FieldEditorRow
                    key={field.key}
                    field={field}
                    catalog={catalogByKey.get(field.key)}
                    onChange={(next) => updateField(field.key, next)}
                  />
                ))}
              </div>
            </section>
          </div>

          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky top-4">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-slate-50">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Eye size={16} />
                Live preview
              </div>
              <div className="flex items-center gap-1">
                {DEVICE_OPTIONS.map((device) => {
                  const Icon = device.icon;
                  const active = previewDevice === device.id;
                  return (
                    <button
                      key={device.id}
                      type="button"
                      title={device.label}
                      onClick={() => setPreviewDevice(device.id)}
                      className={`p-2 rounded-md transition-colors ${
                        active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-4 bg-slate-100 overflow-auto max-h-[calc(100vh-8rem)]">
              <div
                className="mx-auto transition-all duration-300 border border-dashed border-slate-300 bg-white overflow-hidden"
                style={{ width: previewDevice === "desktop" ? "100%" : previewFrameWidth, maxWidth: "100%" }}
              >
                <EmbeddableWebForm
                  formConfig={editing}
                  previewDevice={previewDevice}
                  isPreview
                />
              </div>
            </div>
          </section>
        </div>

        {embedForm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
            <div className="w-full max-w-2xl rounded-xl bg-white border border-gray-200 shadow-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">Embed code</h3>
                <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setEmbedForm(null)}>
                  ×
                </button>
              </div>
              <p className="text-sm text-slate-600">
                Paste this iframe on your website to show <strong>{embedForm.name}</strong>.
              </p>
              <textarea
                readOnly
                rows={4}
                className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3 bg-slate-50"
                value={buildWebFormEmbedSnippet(embedForm.id)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEmbedForm(null)}>Close</Button>
                <Button onClick={() => copyEmbed(embedForm)}>
                  <Copy size={16} className="mr-2" />
                  {copiedEmbed ? "Copied" : "Copy code"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Web Forms</h1>
          <p className="text-sm text-slate-500 mt-1">
            Design embeddable student interest forms and share them with an iframe snippet.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" />
          New form
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading forms…</p>
      ) : forms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-slate-600 mb-4">No web forms yet. Create your first embeddable form.</p>
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" />
            Create form
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {forms.map((form) => (
            <article key={form.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="h-44 overflow-hidden border-b border-gray-100 bg-slate-50 pointer-events-none">
                <div className="scale-[0.55] origin-top -mb-16">
                  <EmbeddableWebForm formConfig={form} previewDevice="desktop" isPreview />
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <h2 className="font-semibold text-slate-900">{form.name}</h2>
                  <p className="text-xs text-slate-500 mt-1">Updated {formatDate(form.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(form)}>
                    <Pencil size={14} className="mr-1.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEmbedForm(form)}>
                    <Code2 size={14} className="mr-1.5" />
                    Embed
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(form)}>
                    <Trash2 size={14} className="mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {embedForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-2xl rounded-xl bg-white border border-gray-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">Embed code</h3>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setEmbedForm(null)}>
                ×
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Paste this iframe on your website to show <strong>{embedForm.name}</strong>.
            </p>
            <textarea
              readOnly
              rows={4}
              className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3 bg-slate-50"
              value={buildWebFormEmbedSnippet(embedForm.id)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEmbedForm(null)}>Close</Button>
              <Button onClick={() => copyEmbed(embedForm)}>
                <Copy size={16} className="mr-2" />
                {copiedEmbed ? "Copied" : "Copy code"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
