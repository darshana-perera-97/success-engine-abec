import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, MapPin, GripVertical,
  Lock, Trash2, Save, FileText, ShieldCheck, FolderOpen, AlertCircle, ListChecks, Mail, MessageCircle, Pencil, Clock, Calendar,
  ChevronDown, ChevronRight
} from "lucide-react";
import {
  getCountries, createCountry, getDocMapping, saveDocMappingStages,
  saveDocMappingPipelineDocs, saveDocMappingVisaDocs, saveDocMappingStageTasks,
  saveDocMappingAccountDetailsStage, saveDocMappingDocumentNotify, saveDocMappingStageDeadlines,
  saveDocMappingIntakeOptions
} from "../authApi";
import { INTAKE_MONTHS, defaultIntakeOptions, normalizeIntakeOptions } from "../utils/intakeFields";
import { invalidateCountryDocConfigCache } from "../countryDocConfigStore";
import {
  DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
  normalizeAccountDetailsStageId,
  normalizeDocumentNotifyDocs,
  normalizeStageDeadlinesMap,
  formatStageDeadlineLabel
} from "../docMappingConfig";
import { Button } from "./Button";
import { dt } from "./DataTable";

function genId(prefix = "dm") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STAGE_IDS = new Set(["inquiry", "registration", "application", "documentation", "visa", "enrolled"]);

function buildDocMappingSnapshot(stages, pipelineDocs, visaDocs, stageTasks, stageDeadlines, accountDetailsStageId, documentNotifyDocs, intakeOptions) {
  return JSON.stringify({ stages, pipelineDocs, visaDocs, stageTasks, stageDeadlines, accountDetailsStageId, documentNotifyDocs, intakeOptions });
}

function collectAvailableDocOptions(pipelineDocs, visaDocs) {
  const options = [];
  const seen = new Set();
  for (const doc of pipelineDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)" || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    options.push({ docName: name, source: "pipeline", group: String(doc?.group || "").trim() || "Ungrouped" });
  }
  for (const doc of visaDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)" || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    options.push({ docName: name, source: "visa", group: String(doc?.group || "").trim() || "Ungrouped" });
  }
  return options.sort((a, b) => a.docName.localeCompare(b.docName));
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
function DocGroupBody({ docs, groups, onChange, removeDoc, toggleRequired, removeGroup, onEditGroup, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup, stages }) {
  const stageById = useMemo(() => new Map((stages || []).map((s) => [s.id, s.label])), [stages]);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroupExpanded = (groupName) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };
  const isGroupExpanded = (groupName) => !collapsedGroups.has(groupName);

  return jsxs(Fragment, { children: [
    groups.length === 0
      ? jsx("p", { className: "text-center text-sm text-slate-400 py-8", children: "No document groups yet. Click \"Add Group\" to start." })
      : groups.map(([groupName, groupDocs]) => {
          const stageLabels = stageLabelsForGroup ? stageLabelsForGroup(groupDocs) : null;
          const isLocked = groupDocs.some((d) => d.locked);
          const lockedDoc = groupDocs.find((d) => d.locked);
          const groupExpanded = isGroupExpanded(groupName);
          return jsxs("div", { className: `rounded-lg border overflow-hidden ${isLocked ? "border-indigo-200 bg-indigo-50/30" : "border-gray-100 bg-slate-50/50"}`, children: [
            jsxs("div", { className: "flex flex-col gap-1.5 px-4 py-2.5 border-b border-gray-100", children: [
              jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                jsxs("button", {
                  type: "button",
                  onClick: () => toggleGroupExpanded(groupName),
                  "aria-expanded": groupExpanded,
                  className: "flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity",
                  children: [
                    groupExpanded
                      ? jsx(ChevronDown, { size: 14, className: "text-slate-400 shrink-0" })
                      : jsx(ChevronRight, { size: 14, className: "text-slate-400 shrink-0" }),
                    jsx(FolderOpen, { size: 14, className: isLocked ? "text-indigo-500 shrink-0" : "text-amber-500 shrink-0" }),
                    jsx("span", { className: "text-sm font-semibold text-slate-700 truncate", children: groupName }),
                    isLocked && jsx(Lock, { size: 12, className: "text-indigo-400 shrink-0" })
                  ]
                }),
                jsxs("div", { className: "flex items-center gap-1.5", children: [
                  !isLocked && jsx("button", {
                    type: "button",
                    onClick: () => { setShowDocModal(groupName); setNewDocName(""); setNewDocRequired(true); },
                    className: "inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors",
                    children: jsxs(Fragment, { children: [jsx(Plus, { size: 12 }), "Add Document"] })
                  }),
                  !isLocked && onEditGroup && jsx("button", {
                    type: "button",
                    onClick: () => onEditGroup(groupName, groupDocs),
                    className: "p-1 text-slate-400 hover:text-indigo-600 transition-colors",
                    title: "Edit group",
                    children: jsx(Pencil, { size: 13 })
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
              !isLocked && stageLabels && stageLabels.length > 0 && jsx("div", { className: "flex flex-wrap gap-1 pl-6", children:
                stageLabels.map((sl) => jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100", children: sl }, sl))
              })
            ] }),
            groupExpanded && jsx("div", { className: "divide-y divide-gray-100", children:
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
  const [editingGroupName, setEditingGroupName] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const defaultStartStageId = stages[0]?.id || "";
  const defaultCheckingStageId = stages[1]?.id || stages[0]?.id || "";
  const [startVisibleStageId, setStartVisibleStageId] = useState(defaultStartStageId);
  const [checkingStageId, setCheckingStageId] = useState(defaultCheckingStageId);
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

  useEffect(() => {
    if (!stages.some((s) => s.id === startVisibleStageId)) {
      setStartVisibleStageId(defaultStartStageId);
    }
    if (!stages.some((s) => s.id === checkingStageId)) {
      setCheckingStageId(defaultCheckingStageId);
    }
  }, [stages, startVisibleStageId, checkingStageId, defaultStartStageId, defaultCheckingStageId]);

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroupName(null);
    setNewGroupName("");
    setStartVisibleStageId(defaultStartStageId);
    setCheckingStageId(defaultCheckingStageId);
  };

  const openAddGroupModal = () => {
    setEditingGroupName(null);
    setNewGroupName("");
    setStartVisibleStageId(defaultStartStageId);
    setCheckingStageId(defaultCheckingStageId);
    setShowGroupModal(true);
  };

  const openEditGroupModal = (groupName, groupDocs) => {
    const first = groupDocs.find((d) => d.group === groupName) || groupDocs[0];
    setEditingGroupName(groupName);
    setNewGroupName(groupName);
    setStartVisibleStageId(first?.visibleFrom || defaultStartStageId);
    setCheckingStageId(first?.completeBy || defaultCheckingStageId);
    setShowGroupModal(true);
  };

  const saveGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const visibleFrom = startVisibleStageId || defaultStartStageId;
    const completeBy = checkingStageId || visibleFrom || defaultCheckingStageId;
    const showUntilStageId = getEnrolledStageId(stages);
    const stageIds = getStageRangeIds(stages, visibleFrom, showUntilStageId);

    if (editingGroupName) {
      if (name.toLowerCase() !== editingGroupName.toLowerCase() && groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
      onChange(docs.map((d) =>
        d.group === editingGroupName
          ? { ...d, group: name, visibleFrom, completeBy, stageIds }
          : d
      ));
    } else {
      if (groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
      onChange([...docs, { id: genId("doc"), group: name, name: "(placeholder)", required: true, stageIds, visibleFrom, completeBy }]);
    }
    closeGroupModal();
  };

  const addDoc = (group) => {
    const name = newDocName.trim();
    if (!name) return;
    const existing = docs.find((d) => d.group === group);
    const visibleFrom = existing?.visibleFrom || startVisibleStageId || defaultStartStageId;
    const completeBy = existing?.completeBy || checkingStageId || visibleFrom || defaultCheckingStageId;
    const showUntilStageId = getEnrolledStageId(stages);
    const stageIds = getStageRangeIds(stages, visibleFrom, showUntilStageId);
    onChange([...docs, { id: genId("doc"), group, name, required: newDocRequired, stageIds, visibleFrom, completeBy }]);
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
      jsx(Button, { size: "sm", variant: "secondary", onClick: openAddGroupModal, children: jsxs(Fragment, { children: [jsx(FolderOpen, { size: 14, className: "mr-1.5" }), "Add Group"] }) })
    ] }),
    jsx("div", { className: "p-4 space-y-4", children:
      jsx(DocGroupBody, { docs, groups, onChange, removeDoc, toggleRequired, removeGroup, onEditGroup: openEditGroupModal, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup, stages })
    }),

    showGroupModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: closeGroupModal,
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: editingGroupName ? "Edit Document Group" : "New Document Group" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Select when this group starts and where it must be checked." })
            ] }),
            jsx("button", { type: "button", onClick: closeGroupModal, className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
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
                onChange: (e) => setNewGroupName(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter") saveGroup(); }
              })
            ] }),
            jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
              jsxs("div", { children: [
                jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Start Visible" }),
                jsx("select", {
                  className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all",
                  value: startVisibleStageId,
                  onChange: (e) => setStartVisibleStageId(e.target.value),
                  children: stages.map((s) => jsx("option", { value: s.id, children: s.label }, s.id))
                })
              ] }),
              jsxs("div", { children: [
                jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Checking Stage" }),
                jsx("select", {
                  className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all",
                  value: checkingStageId,
                  onChange: (e) => setCheckingStageId(e.target.value),
                  children: stages.map((s) => jsx("option", { value: s.id, children: s.label }, s.id))
                })
              ] })
            ] }),
            jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [
              jsx(Button, { variant: "secondary", size: "sm", onClick: closeGroupModal, children: "Cancel" }),
              jsx(Button, { size: "sm", onClick: saveGroup, children: editingGroupName ? "Save Changes" : "Create Group" })
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
  const [editingGroupName, setEditingGroupName] = useState(null);
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

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroupName(null);
    setNewGroupName("");
  };

  const openAddGroupModal = () => {
    setEditingGroupName(null);
    setNewGroupName("");
    setShowGroupModal(true);
  };

  const openEditGroupModal = (groupName) => {
    setEditingGroupName(groupName);
    setNewGroupName(groupName);
    setShowGroupModal(true);
  };

  const saveGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;

    if (editingGroupName) {
      if (name.toLowerCase() !== editingGroupName.toLowerCase() && groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
      onChange(docs.map((d) => d.group === editingGroupName ? { ...d, group: name } : d));
    } else {
      if (groups.some(([g]) => g.toLowerCase() === name.toLowerCase())) return;
      onChange([...docs, { id: genId("doc"), group: name, name: "(placeholder)", required: true, stageIds: visibleStageIds }]);
    }
    closeGroupModal();
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
      jsx(Button, { size: "sm", variant: "secondary", onClick: openAddGroupModal, children: jsxs(Fragment, { children: [jsx(FolderOpen, { size: 14, className: "mr-1.5" }), "Add Group"] }) })
    ] }),
    jsxs("div", { className: "p-4 space-y-4", children: [
      jsx("div", { className: "flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500", children:
        jsxs(Fragment, { children: [
          jsx("span", { className: "font-semibold text-slate-600 mr-1", children: "Visible from:" }),
          ...visibleStageLabels.map((l) => jsx("span", { className: "px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium", children: l }, l))
        ] })
      }),
      jsx(DocGroupBody, { docs, groups, onChange, removeDoc, toggleRequired, removeGroup, onEditGroup: openEditGroupModal, showDocModal, setShowDocModal, newDocName, setNewDocName, newDocRequired, setNewDocRequired, addDoc, stageLabelsForGroup: null, stages })
    ] }),

    showGroupModal && jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: closeGroupModal,
      children: jsxs("div", {
        className: "bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
            jsxs("div", { children: [
              jsx("h3", { className: "text-sm font-semibold text-slate-900", children: editingGroupName ? "Edit Visa Document Group" : "New Visa Document Group" }),
              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Visible from Documentation stage onwards." })
            ] }),
            jsx("button", { type: "button", onClick: closeGroupModal, className: "text-slate-400 hover:text-slate-700 p-1", children: jsx(X, { size: 18 }) })
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
                onKeyDown: (e) => { if (e.key === "Enter") saveGroup(); }
              })
            ] }),
            jsxs("div", { className: "flex justify-end gap-2", children: [
              jsx(Button, { variant: "secondary", size: "sm", onClick: closeGroupModal, children: "Cancel" }),
              jsx(Button, { size: "sm", onClick: saveGroup, children: editingGroupName ? "Save Changes" : "Create Group" })
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

function getStageRangeIds(stages, startStageId, endStageId) {
  const list = Array.isArray(stages) ? stages : [];
  const startIdx = list.findIndex((s) => s.id === startStageId);
  const endIdx = list.findIndex((s) => s.id === endStageId);
  if (startIdx < 0 || endIdx < 0) return list.map((s) => s.id);
  const from = Math.min(startIdx, endIdx);
  const to = Math.max(startIdx, endIdx);
  return list.slice(from, to + 1).map((s) => s.id);
}

function getEnrolledStageId(stages) {
  const list = Array.isArray(stages) ? stages : [];
  const enrolled = list.find(
    (s) => String(s?.id || "").trim().toLowerCase() === "enrolled" || String(s?.label || "").trim().toLowerCase() === "enrolled"
  );
  return enrolled?.id || list[list.length - 1]?.id || "";
}

// ─── Stage counselor tasks: add task + assign stage dropdown ───
function StageTasksSection({ stages, stageTasks, onChange }) {
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
      className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100",
      children: [
        jsxs("div", { className: "flex items-center gap-2", children: [
          jsx(ListChecks, { size: 16, className: "text-violet-500" }),
          jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Stage Counselor Tasks" }),
          jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100", children: taskRows.length })
        ] }),
        jsx("p", { className: "text-[10px] text-slate-400 max-w-xs text-right hidden sm:block", children: "Assigned to counselors when a student enters the selected stage" })
      ]
    }),
    jsx("div", { className: "p-4 space-y-4", children:
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
// ─── Stage SLA deadlines (per pipeline stage) ───────────────────
function StageDeadlinesSection({ stages, stageDeadlines, onChange }) {
  const rows = useMemo(() => {
    const normalized = normalizeStageDeadlinesMap(stageDeadlines, stages);
    return (stages || []).map((stage) => ({
      stage,
      deadline: normalized[stage.id] ?? null,
    }));
  }, [stages, stageDeadlines]);

  const updateStageDeadline = (stageId, patch) => {
    const normalized = normalizeStageDeadlinesMap(stageDeadlines, stages);
    const current = normalized[stageId] ?? null;
    if (patch === null) {
      onChange({ ...normalized, [stageId]: null });
      return;
    }
    const next = current && typeof current === "object" ? { ...current, ...patch } : { value: 1, unit: "hours", ...patch };
    onChange({ ...normalized, [stageId]: next });
  };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", {
      className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100",
      children: [
        jsxs("div", { className: "flex items-center gap-2", children: [
          jsx(Clock, { size: 16, className: "text-sky-600 shrink-0" }),
          jsxs("div", { children: [
            jsx("p", {
              className: "text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-600",
              children: "Stage Deadlines"
            }),
            jsx("p", {
              className: "text-xs text-slate-400 mt-0.5",
              children: "SLA timers shown on student profiles, lists, and escalation views. Defaults load from product spec; leave blank for no deadline."
            })
          ] })
        ] }),
        jsx("span", {
          className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100",
          children: `${rows.filter((r) => r.deadline).length} active`
        })
      ]
    }),
    jsx("div", { className: `p-4 ${dt.scroll}`, children:
      stages.length === 0
        ? jsx("p", { className: "text-sm text-slate-400 text-center py-6", children: "Add pipeline stages first." })
        : jsx("table", { className: `${dt.tableCompact} min-w-[520px]`, children:
            jsxs(Fragment, { children: [
              jsx("thead", { className: dt.head, children:
                jsx("tr", { children: [
                  jsx("th", { className: dt.thCompact, children: "Stage" }),
                  jsx("th", { className: `${dt.thCompact} w-28`, children: "Deadline" }),
                  jsx("th", { className: `${dt.thCompact} w-28`, children: "Unit" }),
                  jsx("th", { className: `${dt.thCompact} w-32`, children: "Summary" }),
                  jsx("th", { className: dt.thCompactRight, children: "No deadline" })
                ] })
              }),
              jsx("tbody", { className: dt.body, children:
                rows.map(({ stage, deadline }) => {
                  const hasDeadline = Boolean(deadline && deadline.value);
                  const summary = hasDeadline ? formatStageDeadlineLabel(deadline) : "—";
                  return jsx("tr", { key: stage.id, className: "align-middle", children: [
                    jsxs("td", { className: "py-2.5 pr-3", children: [
                      jsx("span", { className: "font-medium text-slate-800", children: stage.label }),
                      stage.locked && jsx(Lock, { size: 11, className: "inline ml-1.5 text-slate-400" })
                    ] }),
                    jsx("td", { className: "py-2.5 pr-3", children:
                      jsx("input", {
                        type: "number",
                        min: 1,
                        max: deadline?.unit === "days" ? 365 : 8760,
                        disabled: !hasDeadline,
                        className: "w-full max-w-[7rem] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-400",
                        value: hasDeadline ? deadline.value : "",
                        placeholder: "—",
                        onChange: (e) => {
                          const value = Math.max(1, Number(e.target.value) || 1);
                          updateStageDeadline(stage.id, { value });
                        }
                      })
                    }),
                    jsx("td", { className: "py-2.5 pr-3", children:
                      jsx("select", {
                        disabled: !hasDeadline,
                        className: "w-full max-w-[7rem] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-400",
                        value: hasDeadline ? (deadline.unit || "hours") : "hours",
                        onChange: (e) => updateStageDeadline(stage.id, { unit: e.target.value }),
                        children: [
                          jsx("option", { value: "hours", children: "Hours" }),
                          jsx("option", { value: "days", children: "Days" })
                        ]
                      })
                    }),
                    jsx("td", { className: "py-2.5 pr-3 text-xs text-slate-500 tabular-nums", children: summary }),
                    jsx("td", { className: "py-2.5 text-right", children:
                      jsx("label", { className: "inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer", children: [
                        jsx("input", {
                          type: "checkbox",
                          className: "rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/30",
                          checked: !hasDeadline,
                          onChange: (e) => {
                            if (e.target.checked) {
                              updateStageDeadline(stage.id, null);
                            } else {
                              updateStageDeadline(stage.id, { value: 1, unit: "hours" });
                            }
                          }
                        }),
                        jsx("span", { children: "None" })
                      ] })
                    })
                  ] }, stage.id);
                })
              })
            ] })
          })
    })
  ] });
}

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

// ─── Document Notify (WhatsApp on upload) ───────────────────────
function DocumentNotifySection({ pipelineDocs, visaDocs, documentNotifyDocs, onChange }) {
  const [draftDocName, setDraftDocName] = useState("");
  const availableOptions = useMemo(
    () => collectAvailableDocOptions(pipelineDocs, visaDocs),
    [pipelineDocs, visaDocs]
  );
  const selectedKeys = useMemo(
    () => new Set((documentNotifyDocs || []).map((d) => String(d.docName || "").trim().toLowerCase())),
    [documentNotifyDocs]
  );
  const addableOptions = useMemo(
    () => availableOptions.filter((opt) => !selectedKeys.has(opt.docName.toLowerCase())),
    [availableOptions, selectedKeys]
  );

  useEffect(() => {
    if (draftDocName && !addableOptions.some((o) => o.docName === draftDocName)) {
      setDraftDocName(addableOptions[0]?.docName || "");
    } else if (!draftDocName && addableOptions.length > 0) {
      setDraftDocName(addableOptions[0].docName);
    }
  }, [addableOptions, draftDocName]);

  const addDoc = () => {
    const option = addableOptions.find((o) => o.docName === draftDocName);
    if (!option) return;
    onChange([
      ...(documentNotifyDocs || []),
      { id: genId("dn"), docName: option.docName, source: option.source },
    ]);
    setDraftDocName("");
  };

  const removeDoc = (id) => {
    onChange((documentNotifyDocs || []).filter((d) => d.id !== id));
  };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
      jsxs("div", { className: "flex items-center gap-2", children: [
        jsx(MessageCircle, { size: 16, className: "text-emerald-600" }),
        jsxs("div", { children: [
          jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Document Notify" }),
          jsx("p", { className: "text-[10px] text-slate-400 mt-0.5", children: "Students receive a WhatsApp message (with attachment when supported) when these documents are uploaded by their counselor." })
        ] })
      ] }),
      jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100", children: `${(documentNotifyDocs || []).length} selected` })
    ] }),
    jsx("div", { className: "p-4 space-y-4", children:
      availableOptions.length === 0
        ? jsx("p", { className: "text-sm text-slate-400 text-center py-6", children: "Add pipeline or visa documents first, then select which ones trigger WhatsApp notifications." })
        : jsxs(Fragment, { children: [
            (documentNotifyDocs || []).length === 0
              ? jsx("p", { className: "text-sm text-slate-400 text-center py-2", children: "No documents selected for WhatsApp notification." })
              : jsx("div", { className: "space-y-2", children:
                  (documentNotifyDocs || []).map((entry) => {
                    const meta = availableOptions.find((o) => o.docName.toLowerCase() === entry.docName.toLowerCase());
                    return jsxs("div", {
                      key: entry.id,
                      className: "flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-slate-50/50",
                      children: [
                        jsx(FileText, { size: 14, className: "text-emerald-500 shrink-0" }),
                        jsxs("div", { className: "flex-1 min-w-0", children: [
                          jsx("p", { className: "text-sm font-medium text-slate-700 truncate", children: entry.docName }),
                          meta && jsx("p", { className: "text-[10px] text-slate-400 truncate", children: `${meta.source === "visa" ? "Visa" : "Pipeline"} · ${meta.group}` })
                        ] }),
                        jsx("button", {
                          type: "button",
                          onClick: () => removeDoc(entry.id),
                          className: "p-1.5 text-slate-400 hover:text-rose-500 shrink-0",
                          title: "Remove from notify list",
                          children: jsx(Trash2, { size: 14 })
                        })
                      ]
                    }, entry.id);
                  })
                }),
            addableOptions.length > 0 && jsxs("div", {
              className: "p-3 rounded-lg border border-emerald-100 bg-emerald-50/40 space-y-3",
              children: [
                jsx("p", { className: "text-xs font-semibold text-slate-700", children: "Add document to notify" }),
                jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end gap-2", children: [
                  jsxs("div", { className: "flex-1 min-w-0 space-y-1", children: [
                    jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Document" }),
                    jsx("select", {
                      className: "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white",
                      value: draftDocName,
                      onChange: (e) => setDraftDocName(e.target.value),
                      children: addableOptions.map((opt) =>
                        jsx("option", { value: opt.docName, children: `${opt.docName} (${opt.source === "visa" ? "Visa" : "Pipeline"})` }, `${opt.source}-${opt.docName}`)
                      )
                    })
                  ] }),
                  jsx(Button, {
                    type: "button",
                    size: "sm",
                    className: "shrink-0",
                    onClick: addDoc,
                    disabled: !draftDocName,
                    children: jsxs(Fragment, { children: [jsx(Plus, { size: 14, className: "mr-1" }), "Add"] })
                  })
                ] })
              ]
            })
          ] })
    })
  ] });
}

function CountryIntakeOptionsSection({ intakeOptions, onChange, canEdit = true }) {
  const [draftYear, setDraftYear] = useState("");
  const normalized = normalizeIntakeOptions(intakeOptions);
  const selectedMonths = new Set(normalized.months);

  const toggleMonth = (month) => {
    if (!canEdit) return;
    const next = new Set(selectedMonths);
    if (next.has(month)) next.delete(month);
    else next.add(month);
    onChange({
      ...normalized,
      months: INTAKE_MONTHS.filter((m) => next.has(m)),
    });
  };

  const addYear = () => {
    if (!canEdit) return;
    const year = String(draftYear || "").trim();
    if (!/^\d{4}$/.test(year)) return;
    const nextYears = [...new Set([...normalized.years, year])].sort((a, b) => Number(a) - Number(b));
    onChange({ ...normalized, years: nextYears });
    setDraftYear("");
  };

  const removeYear = (year) => {
    if (!canEdit) return;
    onChange({
      ...normalized,
      years: normalized.years.filter((y) => y !== year),
    });
  };

  return jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm", children: [
    jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-gray-100", children: [
      jsxs("div", { className: "flex items-center gap-2", children: [
        jsx(Calendar, { size: 16, className: "text-indigo-600" }),
        jsxs("div", { children: [
          jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Country intakes" }),
          jsx("p", { className: "text-[10px] text-slate-400 mt-0.5", children: canEdit
            ? "Choose which intake months and years appear on inquiry and registration forms for this country."
            : "View-only. Only Admin can edit country intake options." })
        ] })
      ] }),
      jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100", children: `${normalized.months.length} mo · ${normalized.years.length} yr` })
    ] }),
    jsxs("div", { className: "p-4 space-y-5", children: [
      jsxs("div", { children: [
        jsx("p", { className: "text-xs font-semibold text-slate-700 mb-2", children: "Intake months" }),
        jsx("div", { className: "flex flex-wrap gap-2", children:
          INTAKE_MONTHS.map((month) => {
            const active = selectedMonths.has(month);
            return jsx("button", {
              key: month,
              type: "button",
              disabled: !canEdit,
              onClick: () => toggleMonth(month),
              className: `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-gray-200 hover:border-indigo-200"
              } ${!canEdit ? "opacity-70 cursor-not-allowed" : ""}`,
              children: month.slice(0, 3)
            });
          })
        })
      ] }),
      jsxs("div", { children: [
        jsx("p", { className: "text-xs font-semibold text-slate-700 mb-2", children: "Intake years" }),
        normalized.years.length === 0
          ? jsx("p", { className: "text-sm text-slate-400", children: "No years selected." })
          : jsx("div", { className: "flex flex-wrap gap-2 mb-3", children:
              normalized.years.map((year) => jsxs("span", {
                key: year,
                className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200",
                children: [
                  year,
                  canEdit && jsx("button", {
                    type: "button",
                    className: "text-slate-400 hover:text-rose-600",
                    onClick: () => removeYear(year),
                    "aria-label": `Remove ${year}`,
                    children: jsx(X, { size: 12 })
                  })
                ]
              }))
            }),
        canEdit && jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [
          jsxs("div", { className: "space-y-1", children: [
            jsx("label", { className: "text-[10px] font-medium text-slate-500 uppercase tracking-wide", children: "Add year" }),
            jsx("input", {
              type: "text",
              inputMode: "numeric",
              pattern: "[0-9]*",
              maxLength: 4,
              placeholder: "e.g. 2027",
              className: "w-28 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white",
              value: draftYear,
              onChange: (e) => setDraftYear(e.target.value.replace(/\D/g, "").slice(0, 4)),
              onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); addYear(); } }
            })
          ] }),
          jsx(Button, { type: "button", size: "sm", onClick: addYear, disabled: draftYear.length !== 4, children: jsxs(Fragment, { children: [jsx(Plus, { size: 14, className: "mr-1" }), "Add year"] }) })
        ] })
      ] })
    ] })
  ] });
}

// ─── Main DocMapping Page ───────────────────────────────────────
export function DocMapping({ userRole = "Admin" }) {
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
  const [stageDeadlines, setStageDeadlines] = useState({});
  const [accountDetailsStageId, setAccountDetailsStageId] = useState(DEFAULT_ACCOUNT_DETAILS_STAGE_ID);
  const [documentNotifyDocs, setDocumentNotifyDocs] = useState([]);
  const [intakeOptions, setIntakeOptions] = useState(() => defaultIntakeOptions());
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
      const nextStageDeadlines = normalizeStageDeadlinesMap(result.data.stageDeadlines, nextStages);
      const nextAccountDetailsStageId = normalizeAccountDetailsStageId(
        result.data.accountDetailsStageId,
        nextStages
      );
      const nextDocumentNotifyDocs = normalizeDocumentNotifyDocs(result.data.documentNotifyDocs);
      const nextIntakeOptions = normalizeIntakeOptions(result.data.intakeOptions);
      setStages(nextStages);
      setPipelineDocs(nextPipelineDocs);
      setVisaDocs(nextVisaDocs);
      setStageTasks(nextStageTasks);
      setStageDeadlines(nextStageDeadlines);
      setAccountDetailsStageId(nextAccountDetailsStageId);
      setDocumentNotifyDocs(nextDocumentNotifyDocs);
      setIntakeOptions(nextIntakeOptions);
      setSavedSnapshot(buildDocMappingSnapshot(
        nextStages,
        nextPipelineDocs,
        nextVisaDocs,
        nextStageTasks,
        nextStageDeadlines,
        nextAccountDetailsStageId,
        nextDocumentNotifyDocs,
        nextIntakeOptions
      ));
    } else {
      setConfigError(result.error);
    }
    setConfigLoading(false);
  }, []);

  useEffect(() => { if (selectedCountry) loadConfig(selectedCountry); }, [selectedCountry, loadConfig]);

  const flash = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 2500); };

  useEffect(() => {
    if (!stages.length) return;
    setStageDeadlines((prev) => normalizeStageDeadlinesMap(prev, stages));
  }, [stages]);

  const canEditIntakeOptions = userRole === "Admin";

  const isDirty = useMemo(() => {
    if (!savedSnapshot || !selectedCountry || configLoading) return false;
    return buildDocMappingSnapshot(
      stages,
      pipelineDocs,
      visaDocs,
      stageTasks,
      stageDeadlines,
      accountDetailsStageId,
      documentNotifyDocs,
      intakeOptions
    ) !== savedSnapshot;
  }, [stages, pipelineDocs, visaDocs, stageTasks, stageDeadlines, accountDetailsStageId, documentNotifyDocs, intakeOptions, savedSnapshot, selectedCountry, configLoading]);

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
    const stageDeadlinesResult = await saveDocMappingStageDeadlines(selectedCountry, stageDeadlines);
    if (!stageDeadlinesResult.ok) {
      setConfigError(stageDeadlinesResult.error);
      setSaving(false);
      return;
    }
    const accountDetailsResult = await saveDocMappingAccountDetailsStage(
      selectedCountry,
      accountDetailsStageId
    );
    if (!accountDetailsResult.ok) {
      setConfigError(accountDetailsResult.error);
      setSaving(false);
      return;
    }
    const documentNotifyResult = await saveDocMappingDocumentNotify(
      selectedCountry,
      documentNotifyDocs
    );
    if (!documentNotifyResult.ok) {
      setConfigError(documentNotifyResult.error);
      setSaving(false);
      return;
    }
    const intakeResult = canEditIntakeOptions
      ? await saveDocMappingIntakeOptions(selectedCountry, intakeOptions, userRole)
      : { ok: true, data: { intakeOptions } };
    setSaving(false);
    if (!intakeResult.ok) {
      setConfigError(intakeResult.error);
      return;
    }
    const nextStages = stagesResult.data.stages;
    const nextPipelineDocs = pipelineResult.data.pipelineDocs;
    const nextVisaDocs = visaResult.data.visaDocs;
    const nextStageTasks = stageTasksResult.data.stageTasks || {};
    const nextStageDeadlines = normalizeStageDeadlinesMap(stageDeadlinesResult.data.stageDeadlines, nextStages);
    const nextAccountDetailsStageId = normalizeAccountDetailsStageId(
      accountDetailsResult.data.accountDetailsStageId,
      nextStages
    );
    const nextDocumentNotifyDocs = normalizeDocumentNotifyDocs(
      documentNotifyResult.data.documentNotifyDocs
    );
    const nextIntakeOptions = normalizeIntakeOptions(
      intakeResult.data?.intakeOptions ?? intakeOptions
    );
    setStages(nextStages);
    setPipelineDocs(nextPipelineDocs);
    setVisaDocs(nextVisaDocs);
    setStageTasks(nextStageTasks);
    setStageDeadlines(nextStageDeadlines);
    setAccountDetailsStageId(nextAccountDetailsStageId);
    setDocumentNotifyDocs(nextDocumentNotifyDocs);
    setIntakeOptions(nextIntakeOptions);
    setSavedSnapshot(buildDocMappingSnapshot(
      nextStages,
      nextPipelineDocs,
      nextVisaDocs,
      nextStageTasks,
      nextStageDeadlines,
      nextAccountDetailsStageId,
      nextDocumentNotifyDocs,
      nextIntakeOptions
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
            jsx(CountryIntakeOptionsSection, {
              intakeOptions,
              onChange: setIntakeOptions,
              canEdit: canEditIntakeOptions
            }),
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
            jsx(DocumentNotifySection, {
              pipelineDocs,
              visaDocs,
              documentNotifyDocs,
              onChange: setDocumentNotifyDocs
            }),
            jsx(StageTasksSection, { stages, stageTasks, onChange: setStageTasks }),
            jsx(StageDeadlinesSection, { stages, stageDeadlines, onChange: setStageDeadlines })
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
