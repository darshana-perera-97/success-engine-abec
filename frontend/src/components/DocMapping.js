import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, MapPin, ChevronDown, ChevronRight, GripVertical,
  Lock, Trash2, Save, FileText, ShieldCheck, FolderOpen, AlertCircle, ListChecks, Mail
} from "lucide-react";
import {
  getCountries, createCountry, getDocMapping, saveDocMappingStages,
  saveDocMappingPipelineDocs, saveDocMappingVisaDocs, saveDocMappingStageTasks,
  saveDocMappingAccountDetailsStage
} from "../authApi";
import { invalidateCountryDocConfigCache } from "../countryDocConfigStore";
import {
  DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
  normalizeAccountDetailsStageId
} from "../docMappingConfig";
import { Button } from "./Button";

function genId(prefix = "dm") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STAGE_IDS = new Set(["inquiry", "registration", "application", "documentation", "visa", "enrolled"]);

function buildDocMappingSnapshot(stages, pipelineDocs, visaDocs, stageTasks, accountDetailsStageId) {
  return JSON.stringify({ stages, pipelineDocs, visaDocs, stageTasks, accountDetailsStageId });
}

// ─── Stage Manager (horizontal stepper) ─────────────────────────
function StageManager({ stages, onChange }) {
  const [showAddAt, setShowAddAt] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalStageName, setModalStageName] = useState("");

  const handleAdd = (insertIdx) => {
    const label = newLabel.trim();
    if (!label) return;
    const next = [...stages];
    next.splice(insertIdx, 0, { id: genId("stg"), label, locked: false });
    onChange(next);
    setNewLabel("");
    setShowAddAt(null);
  };

  const handleModalAdd = () => {
    const label = modalStageName.trim();
    if (!label) return;
    onChange([...stages, { id: genId("stg"), label, locked: false }]);
    setModalStageName("");
    setShowAddModal(false);
  };

  const handleRemove = (id) => {
    onChange(stages.filter((s) => s.id !== id));
  };

  const handleDragStart = (idx) => {
    if (stages[idx].locked) return;
    setDragIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null) return;
    setDragOverIdx(idx);
  };

  const handleDrop = (dropIdx) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...stages];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx > dragIdx ? dropIdx - 1 : dropIdx, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const totalStages = stages.length;

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
      jsxs("div", { children: [
        jsxs("p", { className: "text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-600", children: [
          jsx("span", { children: "Pipeline Stages" }),
          jsx("span", { className: "mx-2.5 text-slate-400 font-normal", children: "|" }),
          jsxs("span", { className: "text-indigo-700", children: [totalStages, " Steps"] })
        ] }),
        jsx("p", { className: "text-xs text-slate-400 mt-0.5", children: "Default stages are fixed. Click + between stages to insert custom ones. Drag custom stages to reorder." })
      ] }),
      jsx(Button, { size: "sm", variant: "secondary", onClick: () => { setShowAddModal(true); setModalStageName(""); }, children: jsxs(Fragment, { children: [jsx(Plus, { size: 14, className: "mr-1.5" }), "Add Stage"] }) })
    ] }),

    jsx("div", { className: "p-4 sm:p-5 overflow-x-auto", children:
      jsxs("div", { className: "flex items-start gap-0 min-w-0", children:
        stages.flatMap((stage, idx) => {
          const isLocked = stage.locked;
          const isDragging = dragIdx === idx;
          const isDragOver = dragOverIdx === idx;
          const items = [];

          if (idx === 0) {
            items.push(addBetweenBtn(0, showAddAt, setShowAddAt, newLabel, setNewLabel, handleAdd, handleDragOver, handleDrop));
          }

          items.push(
            jsxs("div", {
              draggable: !isLocked,
              onDragStart: () => handleDragStart(idx),
              onDragEnd: handleDragEnd,
              className: `group relative flex flex-col items-center shrink-0 transition-all duration-200 ${isDragging ? "opacity-40 scale-95" : ""} ${isDragOver ? "scale-105" : ""}`,
              style: { cursor: isLocked ? "default" : "grab" },
              children: [
                jsxs("div", {
                  title: isLocked ? `${stage.label} (default — cannot move or remove)` : `${stage.label} (drag to reorder)`,
                  className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold leading-tight transition-all whitespace-nowrap ${
                    isLocked
                      ? "bg-nexgenai-navy text-white shadow-sm ring-1 ring-indigo-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200 hover:shadow-md"
                  }`,
                  children: [
                    isLocked
                      ? jsx("span", { className: "w-4 h-4 rounded-full flex shrink-0 items-center justify-center text-[9px] font-bold bg-white text-nexgenai-navy", children: idx + 1 })
                      : jsx("span", { className: "w-4 h-4 rounded-full flex shrink-0 items-center justify-center text-[9px] font-bold bg-amber-200 text-amber-800", children: idx + 1 }),
                    jsx("span", { className: "truncate max-w-[100px]", children: stage.label }),
                    isLocked && jsx(Lock, { size: 10, className: "shrink-0 opacity-60" }),
                    !isLocked && jsx("button", {
                      type: "button",
                      onClick: (e) => { e.stopPropagation(); handleRemove(stage.id); },
                      className: "shrink-0 opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded-full hover:bg-amber-200 text-amber-600 hover:text-rose-600 transition-all",
                      children: jsx(X, { size: 11 })
                    })
                  ]
                })
              ]
            }, stage.id)
          );

          items.push(addBetweenBtn(idx + 1, showAddAt, setShowAddAt, newLabel, setNewLabel, handleAdd, handleDragOver, handleDrop));

          return items;
        })
      })
    }),

    showAddAt !== null && jsx("div", { className: "px-5 pb-4", children:
      jsxs("div", { className: "flex items-center gap-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg animate-in fade-in duration-200", children: [
        jsx("input", {
          type: "text",
          autoFocus: true,
          className: "flex-1 px-3 py-1.5 text-sm border border-indigo-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400",
          placeholder: "New stage name…",
          value: newLabel,
          onChange: (e) => setNewLabel(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") handleAdd(showAddAt); if (e.key === "Escape") { setShowAddAt(null); setNewLabel(""); } }
        }),
        jsx(Button, { size: "sm", onClick: () => handleAdd(showAddAt), children: "Add" }),
        jsx(Button, { size: "sm", variant: "ghost", onClick: () => { setShowAddAt(null); setNewLabel(""); }, children: "Cancel" })
      ] })
    }),

    showAddModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: () => setShowAddModal(false),
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden my-auto animate-in zoom-in-95",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Add New Stage" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Stage will be added at the end. Drag it to reposition." })
            ] }),
            jsx("button", { type: "button", onClick: () => setShowAddModal(false), className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
          ] }),
          jsxs("form", { onSubmit: (e) => { e.preventDefault(); handleModalAdd(); }, children:
            jsxs("div", { className: "p-5 space-y-4", children: [
              jsxs("div", { children: [
                jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Stage Name" }),
                jsx("input", {
                  type: "text",
                  autoFocus: true,
                  className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400",
                  placeholder: "e.g. Interview Training",
                  value: modalStageName,
                  onChange: (e) => setModalStageName(e.target.value)
                })
              ] }),
              jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [
                jsx(Button, { type: "button", variant: "secondary", size: "sm", onClick: () => setShowAddModal(false), children: "Cancel" }),
                jsx(Button, { type: "submit", size: "sm", children: "Add Stage" })
              ] })
            ] })
          })
        ]
      })
    })
  ] });
}

function addBetweenBtn(idx, showAddAt, setShowAddAt, newLabel, setNewLabel, handleAdd, handleDragOver, handleDrop) {
  const isActive = showAddAt === idx;
  return jsx("div", {
    className: `flex items-center justify-center shrink-0 ${isActive ? "w-3" : "w-5"} self-center`,
    onDragOver: (e) => handleDragOver(e, idx),
    onDrop: () => handleDrop(idx),
    children: isActive
      ? jsx("div", { className: "w-0.5 h-6 bg-indigo-400 rounded-full" })
      : jsx("button", {
          type: "button",
          onClick: () => { setShowAddAt(idx); setNewLabel(""); },
          className: "w-5 h-5 flex items-center justify-center rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all",
          title: "Insert stage here",
          children: jsx(Plus, { size: 11 })
        })
  }, `gap-${idx}`);
}

// ─── Shared doc group body (renders group cards + add-doc modal) ─
function DocGroupBody({ docs, groups, onChange, removeDoc, toggleRequired, removeGroup, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup, stages }) {
  const stageById = useMemo(() => new Map((stages || []).map((s) => [s.id, s.label])), [stages]);

  return jsxs(Fragment, { children: [
    groups.length === 0
      ? jsx("p", { className: "text-center text-sm text-slate-400 py-8", children: "No document groups yet. Click \"Add Group\" to start." })
      : groups.map(([groupName, groupDocs]) => {
          const stageLabels = stageLabelsForGroup ? stageLabelsForGroup(groupDocs) : null;
          const isLocked = groupDocs.some((d) => d.locked);
          const lockedDoc = groupDocs.find((d) => d.locked);
          return jsxs("div", { className: `rounded-lg border ${isLocked ? "border-indigo-200 bg-indigo-50/30" : "border-gray-100 bg-slate-50/50"}`, children: [
            jsxs("div", { className: "flex flex-col gap-1.5 px-4 py-2.5 border-b border-gray-100", children: [
              jsxs("div", { className: "flex items-center justify-between", children: [
                jsxs("div", { className: "flex items-center gap-2", children: [
                  jsx(FolderOpen, { size: 14, className: isLocked ? "text-indigo-500" : "text-amber-500" }),
                  jsx("span", { className: "text-sm font-semibold text-slate-700", children: groupName }),
                  isLocked && jsx(Lock, { size: 12, className: "text-indigo-400" })
                ] }),
                jsxs("div", { className: "flex items-center gap-1.5", children: [
                  !isLocked && jsx("button", {
                    type: "button",
                    onClick: () => { setShowDocModal(groupName); setNewDocName(""); setNewDocRequired(true); },
                    className: "inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors",
                    children: jsxs(Fragment, { children: [jsx(Plus, { size: 12 }), "Add Document"] })
                  }),
                  !isLocked && jsx("button", {
                    type: "button",
                    onClick: () => removeGroup(groupName),
                    className: "p-1 text-slate-400 hover:text-rose-500 transition-colors",
                    title: "Remove group",
                    children: jsx(Trash2, { size: 13 })
                  })
                ] })
              ] }),
              isLocked && lockedDoc && jsxs("div", { className: "flex flex-wrap items-center gap-1.5 text-[10px]", children: [
                jsxs("span", { className: "font-medium text-slate-500", children: ["Visible from: ", jsx("span", { className: "px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold", children: stageById.get(lockedDoc.visibleFrom) || lockedDoc.visibleFrom || "—" })] }),
                jsxs("span", { className: "font-medium text-slate-500 ml-2", children: ["Complete by: ", jsx("span", { className: "px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold", children: stageById.get(lockedDoc.completeBy) || lockedDoc.completeBy || "—" })] })
              ] }),
              !isLocked && stageLabels && stageLabels.length > 0 && jsx("div", { className: "flex flex-wrap gap-1", children:
                stageLabels.map((sl) => jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100", children: sl }, sl))
              })
            ] }),
            jsx("div", { className: "divide-y divide-gray-100", children:
              groupDocs.filter((d) => d.name !== "(placeholder)").length === 0
                ? jsx("p", { className: "text-xs text-slate-400 px-4 py-3 text-center", children: "No documents in this group." })
                : groupDocs.filter((d) => d.name !== "(placeholder)").map((doc) =>
                    jsxs("div", { className: "flex items-center gap-3 px-4 py-2 hover:bg-white transition-colors", children: [
                      jsx(FileText, { size: 14, className: doc.locked ? "text-indigo-400 flex-shrink-0" : "text-slate-400 flex-shrink-0" }),
                      jsx("span", { className: "text-sm text-slate-700 flex-1", children: doc.name }),
                      doc.locked
                        ? jsx("span", { className: "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200", children: "Required" })
                        : jsx("button", {
                            type: "button",
                            onClick: () => toggleRequired(doc.id),
                            className: `inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${doc.required ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`,
                            children: doc.required ? "Required" : "Optional"
                          }),
                      !doc.locked && jsx("button", { type: "button", onClick: () => removeDoc(doc.id), className: "p-1 text-slate-400 hover:text-rose-500 transition-colors", children: jsx(Trash2, { size: 13 }) })
                    ] }, doc.id)
                  )
            })
          ] }, groupName);
        }),

    showDocModal !== null && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: () => setShowDocModal(null),
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Add Document" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: `Group: ${showDocModal}` })
            ] }),
            jsx("button", { type: "button", onClick: () => setShowDocModal(null), className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
          ] }),
          jsxs("div", { className: "p-5 space-y-4", children: [
            jsxs("div", { children: [
              jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Document Name" }),
              jsx("input", {
                type: "text",
                autoFocus: true,
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400",
                placeholder: "e.g. Passport Copy",
                value: newDocName,
                onChange: (e) => setNewDocName(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter") addDoc(showDocModal); }
              })
            ] }),
            jsxs("div", { className: "flex items-center gap-3", children: [
              jsx("label", { className: "text-xs font-semibold text-slate-700", children: "Requirement:" }),
              jsxs("div", { className: "flex gap-1.5", children: [
                jsx("button", {
                  type: "button",
                  onClick: () => setNewDocRequired(true),
                  className: `px-3 py-1 text-xs font-medium rounded-full border transition-colors ${newDocRequired ? "bg-rose-50 text-rose-700 border-rose-300" : "bg-white text-slate-500 border-gray-200 hover:border-rose-200"}`,
                  children: "Required"
                }),
                jsx("button", {
                  type: "button",
                  onClick: () => setNewDocRequired(false),
                  className: `px-3 py-1 text-xs font-medium rounded-full border transition-colors ${!newDocRequired ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-500 border-gray-200 hover:border-emerald-200"}`,
                  children: "Optional"
                })
              ] })
            ] }),
            jsxs("div", { className: "flex justify-end gap-2", children: [
              jsx(Button, { variant: "secondary", size: "sm", onClick: () => setShowDocModal(null), children: "Cancel" }),
              jsx(Button, { size: "sm", onClick: () => addDoc(showDocModal), children: "Add Document" })
            ] })
          ] })
        ]
      })
    })
  ] });
}

// ─── Pipeline Documents Section (with stage visibility picker) ──
function PipelineDocSection({ stages, docs, onChange }) {
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState([]);
  const [showDocModal, setShowDocModal] = useState(null);
  const [newDocName, setNewDocName] = useState("");
  const [newDocRequired, setNewDocRequired] = useState(true);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of docs) {
      const g = d.group || "Ungrouped";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(d);
    }
    return Array.from(map.entries());
  }, [docs]);

  const toggleStage = (id) => {
    setSelectedStageIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
    const stageIds = selectedStageIds.length > 0 ? selectedStageIds : stages.map((s) => s.id);
    onChange([...docs, { id: genId("doc"), group: name, name: "(placeholder)", required: true, stageIds }]);
    setNewGroupName("");
    setSelectedStageIds([]);
    setShowGroupModal(false);
  };

  const addDoc = (group) => {
    const name = newDocName.trim();
    if (!name) return;
    const existing = docs.find((d) => d.group === group && d.stageIds);
    const stageIds = existing ? existing.stageIds : stages.map((s) => s.id);
    onChange([...docs, { id: genId("doc"), group, name, required: newDocRequired, stageIds }]);
    setNewDocName("");
    setNewDocRequired(true);
    setShowDocModal(null);
  };

  const removeDoc = (id) => { const doc = docs.find((d) => d.id === id); if (doc?.locked) return; onChange(docs.filter((d) => d.id !== id)); };
  const toggleRequired = (id) => { const doc = docs.find((d) => d.id === id); if (doc?.locked) return; onChange(docs.map((d) => d.id === id ? { ...d, required: !d.required } : d)); };
  const removeGroup = (groupName) => { if (docs.some((d) => d.group === groupName && d.locked)) return; onChange(docs.filter((d) => d.group !== groupName)); };

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s.label])), [stages]);
  const stageLabelsForGroup = (groupDocs) => {
    const first = groupDocs.find((d) => Array.isArray(d.stageIds));
    if (!first) return null;
    return first.stageIds.map((id) => stageById.get(id) || id);
  };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
      jsxs("div", { className: "flex items-center gap-2", children: [
        jsx(FileText, { size: 16, className: "text-blue-500" }),
        jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Pipeline Documents" })
      ] }),
      jsx(Button, { size: "sm", variant: "secondary", onClick: () => { setShowGroupModal(true); setNewGroupName(""); setSelectedStageIds([]); }, children: jsxs(Fragment, { children: [jsx(FolderOpen, { size: 14, className: "mr-1.5" }), "Add Group"] }) })
    ] }),
    jsx("div", { className: "p-4 space-y-4", children:
      jsx(DocGroupBody, { docs, groups, onChange, removeDoc, toggleRequired, removeGroup, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup, stages })
    }),

    showGroupModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: () => setShowGroupModal(false),
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "New Document Group" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Select which stages this group should be visible in." })
            ] }),
            jsx("button", { type: "button", onClick: () => setShowGroupModal(false), className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
          ] }),
          jsxs("div", { className: "p-5 space-y-4", children: [
            jsxs("div", { children: [
              jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Group Name" }),
              jsx("input", {
                type: "text",
                autoFocus: true,
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400",
                placeholder: "e.g. Academic Documents",
                value: newGroupName,
                onChange: (e) => setNewGroupName(e.target.value)
              })
            ] }),
            jsxs("div", { children: [
              jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1.5 block", children: "Visible at Stages" }),
              jsx("div", { className: "flex flex-wrap gap-1.5", children:
                stages.map((s) => {
                  const selected = selectedStageIds.includes(s.id);
                  return jsx("button", {
                    type: "button",
                    onClick: () => toggleStage(s.id),
                    className: `px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${selected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700"}`,
                    children: s.label
                  }, s.id);
                })
              }),
              selectedStageIds.length === 0 && jsx("p", { className: "text-[10px] text-slate-400 mt-1", children: "No stages selected — group will be visible in all stages." })
            ] }),
            jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [
              jsx(Button, { variant: "secondary", size: "sm", onClick: () => setShowGroupModal(false), children: "Cancel" }),
              jsx(Button, { size: "sm", onClick: addGroup, children: "Create Group" })
            ] })
          ] })
        ]
      })
    })
  ] });
}

// ─── Visa Documents Section (fixed: Documentation stage & after) ─
function VisaDocSection({ stages, docs, onChange }) {
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showDocModal, setShowDocModal] = useState(null);
  const [newDocName, setNewDocName] = useState("");
  const [newDocRequired, setNewDocRequired] = useState(true);

  const docStageIdx = stages.findIndex((s) => s.id === "documentation");
  const visibleStageIds = useMemo(() => {
    if (docStageIdx < 0) return stages.map((s) => s.id);
    return stages.slice(docStageIdx).map((s) => s.id);
  }, [stages, docStageIdx]);
  const visibleStageLabels = useMemo(() => visibleStageIds.map((id) => { const s = stages.find((st) => st.id === id); return s ? s.label : id; }), [visibleStageIds, stages]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of docs) {
      const g = d.group || "Ungrouped";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(d);
    }
    return Array.from(map.entries());
  }, [docs]);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
    onChange([...docs, { id: genId("doc"), group: name, name: "(placeholder)", required: true, stageIds: visibleStageIds }]);
    setNewGroupName("");
    setShowGroupModal(false);
  };

  const addDoc = (group) => {
    const name = newDocName.trim();
    if (!name) return;
    onChange([...docs, { id: genId("doc"), group, name, required: newDocRequired, stageIds: visibleStageIds }]);
    setNewDocName("");
    setNewDocRequired(true);
    setShowDocModal(null);
  };

  const removeDoc = (id) => { onChange(docs.filter((d) => d.id !== id)); };
  const toggleRequired = (id) => { onChange(docs.map((d) => d.id === id ? { ...d, required: !d.required } : d)); };
  const removeGroup = (groupName) => { onChange(docs.filter((d) => d.group !== groupName)); };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
      jsxs("div", { className: "flex items-center gap-2", children: [
        jsx(ShieldCheck, { size: 16, className: "text-emerald-500" }),
        jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Visa Documents" })
      ] }),
      jsx(Button, { size: "sm", variant: "secondary", onClick: () => { setShowGroupModal(true); setNewGroupName(""); }, children: jsxs(Fragment, { children: [jsx(FolderOpen, { size: 14, className: "mr-1.5" }), "Add Group"] }) })
    ] }),
    jsxs("div", { className: "p-4 space-y-4", children: [
      jsx("div", { className: "flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500", children:
        jsxs(Fragment, { children: [
          jsx("span", { className: "font-semibold text-slate-600 mr-1", children: "Visible from:" }),
          ...visibleStageLabels.map((l) => jsx("span", { className: "px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium", children: l }, l))
        ] })
      }),
      jsx(DocGroupBody, { docs, groups, onChange, removeDoc, toggleRequired, removeGroup, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup: null, stages })
    ] }),

    showGroupModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: () => setShowGroupModal(false),
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "New Visa Document Group" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Visible from Documentation stage onwards." })
            ] }),
            jsx("button", { type: "button", onClick: () => setShowGroupModal(false), className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
          ] }),
          jsxs("div", { className: "p-5 space-y-4", children: [
            jsxs("div", { children: [
              jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Group Name" }),
              jsx("input", {
                type: "text",
                autoFocus: true,
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400",
                placeholder: "e.g. Visa Application Forms",
                value: newGroupName,
                onChange: (e) => setNewGroupName(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter") addGroup(); }
              })
            ] }),
            jsxs("div", { className: "flex justify-end gap-2", children: [
              jsx(Button, { variant: "secondary", size: "sm", onClick: () => setShowGroupModal(false), children: "Cancel" }),
              jsx(Button, { size: "sm", onClick: addGroup, children: "Create Group" })
            ] })
          ] })
        ]
      })
    })
  ] });
}

function flattenStageTasksMap(stageTasks) {
  const rows = [];
  for (const [stageId, list] of Object.entries(stageTasks || {})) {
    if (!Array.isArray(list)) continue;
    for (const task of list) {
      rows.push({ ...task, stageId });
    }
  }
  return rows;
}

function stageTasksMapFromRows(rows) {
  const map = {};
  for (const row of rows) {
    const stageId = String(row.stageId || "").trim();
    const title = String(row.title || "").trim();
    if (!stageId || !title) continue;
    if (!map[stageId]) map[stageId] = [];
    const { stageId: _omit, ...task } = row;
    map[stageId].push(task);
  }
  return map;
}

function StageSelect({ stages, value, onChange, className = "" }) {
  return jsx("select", {
    className: `px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white min-w-[140px] ${className}`,
    value: value || "",
    onChange: (e) => onChange(e.target.value),
    children: [
      jsx("option", { value: "", disabled: true, children: "Select stage…" }),
      ...stages.map((s) => jsx("option", { value: s.id, children: s.label }, s.id))
    ]
  });
}

// ─── Stage counselor tasks: add task + assign stage dropdown ───
function StageTasksSection({ stages, stageTasks, onChange }) {
  const [expanded, setExpanded] = useState(true);
  const defaultStageId = stages[0]?.id || "";
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStageId, setDraftStageId] = useState(defaultStageId);
  const [draftPriority, setDraftPriority] = useState("Medium");
  const [draftDueDays, setDraftDueDays] = useState(3);

  useEffect(() => {
    if (!draftStageId && defaultStageId) setDraftStageId(defaultStageId);
    if (draftStageId && !stages.some((s) => s.id === draftStageId) && defaultStageId) {
      setDraftStageId(defaultStageId);
    }
  }, [stages, defaultStageId, draftStageId]);

  const taskRows = useMemo(() => flattenStageTasksMap(stageTasks), [stageTasks]);

  const applyRows = (rows) => onChange(stageTasksMapFromRows(rows));

  const addTask = () => {
    const title = draftTitle.trim();
    const stageId = String(draftStageId || "").trim();
    if (!title || !stageId) return;
    const dueDays = Math.min(90, Math.max(1, Number(draftDueDays) || 3));
    applyRows([
      ...taskRows,
      { id: genId("stt"), title, priority: draftPriority, dueDays, stageId },
    ]);
    setDraftTitle("");
    setDraftPriority("Medium");
    setDraftDueDays(3);
  };

  const updateRow = (taskId, patch) => {
    applyRows(
      taskRows.map((row) => (row.id === taskId ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (taskId) => {
    applyRows(taskRows.filter((row) => row.id !== taskId));
  };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", {
      className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100 cursor-pointer select-none",
      onClick: () => setExpanded(!expanded),
      children: [
        jsxs("div", { className: "flex items-center gap-2", children: [
          jsx(expanded ? ChevronDown : ChevronRight, { size: 16, className: "text-indigo-500" }),
          jsx(ListChecks, { size: 16, className: "text-violet-500" }),
          jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Stage Counselor Tasks" }),
          jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100", children: taskRows.length })
        ] }),
        jsx("p", { className: "text-[10px] text-slate-400 max-w-xs text-right hidden sm:block", children: "Assigned to counselors when a student enters the selected stage" })
      ]
    }),
    expanded && jsx("div", { className: "p-4 space-y-4", children:
      stages.length === 0
        ? jsx("p", { className: "text-sm text-slate-400 text-center py-6", children: "Add pipeline stages first." })
        : jsxs(Fragment, { children: [
            jsxs("div", {
              className: "p-3 rounded-lg border border-indigo-100 bg-indigo-50/40 space-y-3",
              children: [
                jsx("p", { className: "text-xs font-semibold text-slate-700", children: "Add task" }),
                jsxs("div", { className: "flex flex-col lg:flex-row lg:items-end gap-2", children: [
                  jsxs("div", { className: "flex-1 min-w-0 space-y-1", children: [
                    jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Task" }),
                    jsx("input", {
                      type: "text",
                      className: "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-slate-400",
                      placeholder: "e.g. Schedule intake call",
                      value: draftTitle,
                      onChange: (e) => setDraftTitle(e.target.value),
                      onKeyDown: (e) => { if (e.key === "Enter") addTask(); }
                    })
                  ] }),
                  jsxs("div", { className: "space-y-1 shrink-0", children: [
                    jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Stage" }),
                    jsx(StageSelect, { stages, value: draftStageId, onChange: setDraftStageId })
                  ] }),
                  jsxs("div", { className: "space-y-1 shrink-0", children: [
                    jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Priority" }),
                    jsx("select", {
                      className: "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white",
                      value: draftPriority,
                      onChange: (e) => setDraftPriority(e.target.value),
                      children: [
                        jsx("option", { value: "High", children: "High" }),
                        jsx("option", { value: "Medium", children: "Medium" }),
                        jsx("option", { value: "Low", children: "Low" })
                      ]
                    })
                  ] }),
                  jsxs("div", { className: "space-y-1 shrink-0", children: [
                    jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Due (days)" }),
                    jsx("input", {
                      type: "number",
                      min: 1,
                      max: 90,
                      className: "w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white",
                      value: draftDueDays,
                      onChange: (e) => setDraftDueDays(Number(e.target.value))
                    })
                  ] }),
                  jsx(Button, {
                    type: "button",
                    size: "sm",
                    className: "shrink-0 lg:mb-0",
                    onClick: addTask,
                    disabled: !draftTitle.trim() || !draftStageId,
                    children: jsxs(Fragment, { children: [jsx(Plus, { size: 14, className: "mr-1" }), "Add Task"] })
                  })
                ] })
              ]
            }),
            taskRows.length === 0
              ? jsx("p", { className: "text-sm text-slate-400 text-center py-4", children: "No stage tasks configured yet." })
              : jsx("div", { className: "space-y-2", children:
                  taskRows.map((row) =>
                    jsxs("div", {
                      key: row.id,
                      className: "flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-gray-100 bg-slate-50/50",
                      children: [
                        jsx("input", {
                          type: "text",
                          className: "flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white",
                          value: row.title,
                          onChange: (e) => updateRow(row.id, { title: e.target.value })
                        }),
                        jsx(StageSelect, {
                          stages,
                          value: row.stageId,
                          onChange: (stageId) => updateRow(row.id, { stageId })
                        }),
                        jsx("select", {
                          className: "px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white shrink-0",
                          value: row.priority || "Medium",
                          onChange: (e) => updateRow(row.id, { priority: e.target.value }),
                          children: [
                            jsx("option", { value: "High", children: "High" }),
                            jsx("option", { value: "Medium", children: "Medium" }),
                            jsx("option", { value: "Low", children: "Low" })
                          ]
                        }),
                        jsxs("label", { className: "flex items-center gap-1 text-[10px] text-slate-500 shrink-0", children: [
                          "Due",
                          jsx("input", {
                            type: "number",
                            min: 1,
                            max: 90,
                            className: "w-12 px-1.5 py-1 text-xs border border-gray-200 rounded-lg bg-white",
                            value: row.dueDays ?? 3,
                            onChange: (e) => updateRow(row.id, { dueDays: Number(e.target.value) })
                          }),
                          "d"
                        ] }),
                        jsx("button", {
                          type: "button",
                          onClick: () => removeRow(row.id),
                          className: "p-1.5 text-slate-400 hover:text-rose-500 shrink-0 self-end sm:self-center",
                          title: "Remove task",
                          children: jsx(Trash2, { size: 14 })
                        })
                      ]
                    }, row.id)
                  )
                })
          ] })
    })
  ] });
}

// ─── Student portal account details (email + WhatsApp) ──────────
function AccountDetailsStageSection({ stages, accountDetailsStageId, onChange }) {
  const resolvedId = normalizeAccountDetailsStageId(accountDetailsStageId, stages);
  const selectedStage = stages.find((s) => s.id === resolvedId);

  return jsxs("div", {
    className: "bg-white rounded-xl border border-gray-200 shadow-sm",
    children: [
      jsxs("div", {
        className: "flex items-center gap-2 px-5 py-3.5 border-b border-gray-100",
        children: [
          jsx(Mail, { size: 16, className: "text-indigo-600 shrink-0" }),
          jsxs("div", { children: [
            jsx("p", {
              className: "text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-600",
              children: "Student Portal Account Details"
            }),
            jsx("p", {
              className: "text-xs text-slate-400 mt-0.5",
              children: "When a student enters the selected pipeline stage, their portal login is sent by email and WhatsApp (from the assigned counselor's WhatsApp)."
            })
          ] })
        ]
      }),
      jsx("div", { className: "px-5 py-4", children:
        jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-3", children: [
          jsx("label", {
            htmlFor: "account-details-stage",
            className: "text-sm font-medium text-slate-700 shrink-0",
            children: "Send on stage"
          }),
          jsx("select", {
            id: "account-details-stage",
            className: "w-full sm:max-w-xs px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
            value: resolvedId,
            onChange: (e) => onChange(e.target.value),
            children: stages.map((s) =>
              jsx("option", { value: s.id, children: s.label }, s.id)
            )
          }),
          selectedStage && jsx("p", {
            className: "text-xs text-slate-500",
            children: `Default: Application. Currently: ${selectedStage.label}.`
          })
        ] })
      })
    ]
  });
}

// ─── Main DocMapping Page ───────────────────────────────────────
export function DocMapping() {
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCountryName, setNewCountryName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [stages, setStages] = useState([]);
  const [pipelineDocs, setPipelineDocs] = useState([]);
  const [visaDocs, setVisaDocs] = useState([]);
  const [stageTasks, setStageTasks] = useState({});
  const [accountDetailsStageId, setAccountDetailsStageId] = useState(DEFAULT_ACCOUNT_DETAILS_STAGE_ID);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saveMsg, setSaveMsg] = useState("");

  const fetchCountries = useCallback(async () => {
    setCountriesLoading(true);
    const result = await getCountries();
    if (result.ok) {
      setCountries(result.data);
      if (result.data.length > 0 && !selectedCountry) {
        setSelectedCountry(countryLabel(result.data[0]));
      }
    }
    setCountriesLoading(false);
  }, []);

  useEffect(() => { fetchCountries(); }, [fetchCountries]);

  const loadConfig = useCallback(async (country) => {
    if (!country) return;
    setConfigLoading(true);
    setConfigError("");
    setSavedSnapshot(null);
    const result = await getDocMapping(country);
    if (result.ok) {
      const nextStages = result.data.stages || [];
      const nextPipelineDocs = result.data.pipelineDocs || [];
      const nextVisaDocs = result.data.visaDocs || [];
      const nextStageTasks = result.data.stageTasks || {};
      const nextAccountDetailsStageId = normalizeAccountDetailsStageId(
        result.data.accountDetailsStageId,
        nextStages
      );
      setStages(nextStages);
      setPipelineDocs(nextPipelineDocs);
      setVisaDocs(nextVisaDocs);
      setStageTasks(nextStageTasks);
      setAccountDetailsStageId(nextAccountDetailsStageId);
      setSavedSnapshot(buildDocMappingSnapshot(
        nextStages,
        nextPipelineDocs,
        nextVisaDocs,
        nextStageTasks,
        nextAccountDetailsStageId
      ));
    } else {
      setConfigError(result.error);
    }
    setConfigLoading(false);
  }, []);

  useEffect(() => { if (selectedCountry) loadConfig(selectedCountry); }, [selectedCountry, loadConfig]);

  const flash = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 2500); };

  const isDirty = useMemo(() => {
    if (!savedSnapshot || !selectedCountry || configLoading) return false;
    return buildDocMappingSnapshot(
      stages,
      pipelineDocs,
      visaDocs,
      stageTasks,
      accountDetailsStageId
    ) !== savedSnapshot;
  }, [stages, pipelineDocs, visaDocs, stageTasks, accountDetailsStageId, savedSnapshot, selectedCountry, configLoading]);

  const handleSaveAll = async () => {
    if (!selectedCountry || !isDirty) return;
    setSaving(true);
    setConfigError("");
    const stagesResult = await saveDocMappingStages(selectedCountry, stages);
    if (!stagesResult.ok) {
      setConfigError(stagesResult.error);
      setSaving(false);
      return;
    }
    const pipelineResult = await saveDocMappingPipelineDocs(selectedCountry, pipelineDocs);
    if (!pipelineResult.ok) {
      setConfigError(pipelineResult.error);
      setSaving(false);
      return;
    }
    const visaResult = await saveDocMappingVisaDocs(selectedCountry, visaDocs);
    if (!visaResult.ok) {
      setConfigError(visaResult.error);
      setSaving(false);
      return;
    }
    const stageTasksResult = await saveDocMappingStageTasks(selectedCountry, stageTasks);
    if (!stageTasksResult.ok) {
      setConfigError(stageTasksResult.error);
      setSaving(false);
      return;
    }
    const accountDetailsResult = await saveDocMappingAccountDetailsStage(
      selectedCountry,
      accountDetailsStageId
    );
    setSaving(false);
    if (!accountDetailsResult.ok) {
      setConfigError(accountDetailsResult.error);
      return;
    }
    const nextStages = stagesResult.data.stages;
    const nextPipelineDocs = pipelineResult.data.pipelineDocs;
    const nextVisaDocs = visaResult.data.visaDocs;
    const nextStageTasks = stageTasksResult.data.stageTasks || {};
    const nextAccountDetailsStageId = normalizeAccountDetailsStageId(
      accountDetailsResult.data.accountDetailsStageId,
      nextStages
    );
    setStages(nextStages);
    setPipelineDocs(nextPipelineDocs);
    setVisaDocs(nextVisaDocs);
    setStageTasks(nextStageTasks);
    setAccountDetailsStageId(nextAccountDetailsStageId);
    setSavedSnapshot(buildDocMappingSnapshot(
      nextStages,
      nextPipelineDocs,
      nextVisaDocs,
      nextStageTasks,
      nextAccountDetailsStageId
    ));
    invalidateCountryDocConfigCache(selectedCountry);
    flash("All changes saved");
  };

  const handleAddCountry = async (e) => {
    e.preventDefault();
    const name = newCountryName.trim();
    if (!name) { setAddError("Country name is required."); return; }
    setAddError("");
    setAdding(true);
    const result = await createCountry(name);
    setAdding(false);
    if (!result.ok) { setAddError(result.error || "Failed to add country."); return; }
    setCountries(result.data);
    setNewCountryName("");
    setShowAddModal(false);
    setSelectedCountry(name);
  };

  return jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [

    // ── Header ───────────────────────────────────────────────────
    jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", children: [
      jsx("div", { children:
        jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Doc Mapping" })
      }),
      jsxs("div", { className: "flex w-full sm:w-auto flex-wrap gap-2", children: [
        jsx("select", {
          className: "w-full sm:w-56 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
          value: selectedCountry,
          onChange: (e) => setSelectedCountry(e.target.value),
          disabled: countriesLoading || saving,
          children: [
            jsx("option", { value: "", disabled: true, children: countriesLoading ? "Loading…" : "Select country…" }),
            ...countries.map((c) => {
              const label = countryLabel(c);
              return jsx("option", { value: label, children: label }, label);
            })
          ]
        }),
        jsxs(Button, {
          type: "button",
          className: "gap-1.5 whitespace-nowrap",
          onClick: () => { setShowAddModal(true); setAddError(""); setNewCountryName(""); },
          disabled: saving,
          children: [jsx(Plus, { size: 14 }), "Add Country"]
        }),
        jsx(Button, {
          type: "button",
          className: "gap-1.5 whitespace-nowrap",
          onClick: handleSaveAll,
          isLoading: saving,
          disabled: !isDirty || !selectedCountry || configLoading,
          children: [jsx(Save, { size: 14 }), "Save Changes"]
        })
      ] })
    ] }),

    // ── Flash message ────────────────────────────────────────────
    saveMsg && jsx("div", { className: "text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 animate-in fade-in duration-200", children: saveMsg }),
    configError && jsx("div", { className: "text-xs font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: configError }),

    // ── Body ─────────────────────────────────────────────────────
    !selectedCountry
      ? jsx("div", { className: "flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-24 text-sm text-slate-400", children: "Select a country to get started." })
      : configLoading
        ? jsx("div", { className: "flex items-center justify-center py-24 text-sm text-slate-400", children: "Loading configuration…" })
        : jsxs("div", { className: "space-y-6", children: [
            jsx(StageManager, { stages, onChange: setStages }),
            jsx(AccountDetailsStageSection, {
              stages,
              accountDetailsStageId,
              onChange: setAccountDetailsStageId
            }),
            jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
              jsx(PipelineDocSection, {
                stages,
                docs: pipelineDocs,
                onChange: setPipelineDocs
              }),
              jsx(VisaDocSection, {
                stages,
                docs: visaDocs,
                onChange: setVisaDocs
              })
            ] }),
            jsx(StageTasksSection, { stages, stageTasks, onChange: setStageTasks })
          ] }),

    // ── Add Country Modal ────────────────────────────────────────
    showAddModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: () => setShowAddModal(false),
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 overflow-hidden my-auto flex flex-col",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Add Country" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Enter the name of the destination country." })
            ] }),
            jsx("button", { type: "button", onClick: () => setShowAddModal(false), className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
          ] }),
          jsx("form", { onSubmit: handleAddCountry, children:
            jsxs("div", { className: "p-5 space-y-4", children: [
              jsxs("div", { children: [
                jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Country Name" }),
                jsx("input", {
                  type: "text",
                  autoFocus: true,
                  className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400",
                  placeholder: "e.g. Australia",
                  value: newCountryName,
                  onChange: (e) => { setNewCountryName(e.target.value); setAddError(""); }
                })
              ] }),
              addError && jsx("p", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: addError }),
              jsxs("div", { className: "flex items-center justify-end gap-2 pt-1", children: [
                jsx(Button, { type: "button", variant: "secondary", onClick: () => setShowAddModal(false), children: "Cancel" }),
                jsx(Button, { type: "submit", isLoading: adding, children: "Add Country" })
              ] })
            ] })
          })
        ]
      })
    })
  ] });
}

function countryLabel(c) {
  return typeof c === "string" ? c : c?.name ?? "";
}
