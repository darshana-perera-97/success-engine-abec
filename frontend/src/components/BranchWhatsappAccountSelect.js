import { useEffect, useState } from "react";
import {
  formatBranchWhatsappAccountLabel,
  loadAllBranchWhatsappAccountGroups,
  loadBranchWhatsappAccounts,
  pickDefaultAccountIdFromGroups,
  pickDefaultBranchWhatsappAccountId,
} from "../utils/branchWhatsappAccounts";

export function BranchWhatsappAccountSelect({
  branchLabel,
  value,
  onChange,
  disabled = false,
  required = false,
  allowDisconnected = false,
  allowAnyAccount = false,
  className = "w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500",
}) {
  const [accounts, setAccounts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!allowAnyAccount) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    loadAllBranchWhatsappAccountGroups().then((rows) => {
      if (cancelled) return;
      setGroups(rows);
      setLoading(false);
      const total = rows.reduce((sum, row) => sum + (row.accounts?.length || 0), 0);
      if (!total) {
        setLoadError("No connected WhatsApp accounts found.");
        return;
      }
      if (!String(value || "").trim()) {
        const nextValue = pickDefaultAccountIdFromGroups(rows, branchLabel);
        if (nextValue) onChange?.(nextValue);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allowAnyAccount, branchLabel, value, onChange]);

  useEffect(() => {
    if (allowAnyAccount) return undefined;
    let cancelled = false;
    const branch = String(branchLabel || "").trim();
    if (!branch) {
      setAccounts([]);
      setLoadError("");
      return undefined;
    }
    setLoading(true);
    setLoadError("");
    loadBranchWhatsappAccounts(branch).then((rows) => {
      if (cancelled) return;
      setAccounts(rows);
      setLoading(false);
      if (!rows.length) {
        setLoadError("No Manager or Team Lead WhatsApp accounts found for this branch.");
        return;
      }
      if (!String(value || "").trim()) {
        const nextValue = pickDefaultBranchWhatsappAccountId(rows, "");
        if (nextValue) onChange?.(nextValue);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allowAnyAccount, branchLabel, value, onChange]);

  const renderOption = (account) => {
    const userId = String(account?.userId || "").trim();
    if (!userId) return null;
    if (!allowDisconnected && !account.connected) return null;
    return (
      <option key={userId} value={userId}>
        {formatBranchWhatsappAccountLabel(account)}
      </option>
    );
  };

  if (allowAnyAccount) {
    const hasAccounts = groups.some((group) => (group.accounts?.length || 0) > 0);
    return (
      <div className="space-y-2">
        <select
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled || loading || !hasAccounts}
          required={required}
          className={className}
        >
          <option value="">{loading ? "Loading WhatsApp accounts…" : "Select WhatsApp account…"}</option>
          {groups.map((group) => (
            <optgroup key={group.branch || "unassigned"} label={group.branch || "Unassigned"}>
              {group.accounts.map(renderOption)}
            </optgroup>
          ))}
        </select>
        {loadError ? <p className="text-xs text-amber-800">{loadError}</p> : null}
        {!loadError && hasAccounts ? (
          <p className="text-[11px] text-slate-500">
            Student messages will be sent from the selected WhatsApp account.
          </p>
        ) : null}
      </div>
    );
  }

  if (!String(branchLabel || "").trim()) {
    return (
      <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
        Set the student branch before choosing a WhatsApp account.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled || loading || accounts.length === 0}
        required={required}
        className={className}
      >
        <option value="">{loading ? "Loading WhatsApp accounts…" : "Select WhatsApp account…"}</option>
        {accounts.map(renderOption)}
      </select>
      {loadError ? <p className="text-xs text-amber-800">{loadError}</p> : null}
      {!loadError && accounts.length > 0 ? (
        <p className="text-[11px] text-slate-500">
          Student messages will be sent from the selected branch WhatsApp account.
        </p>
      ) : null}
    </div>
  );
}
