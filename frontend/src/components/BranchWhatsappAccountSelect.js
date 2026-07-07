import { useEffect, useState } from "react";
import {
  formatBranchWhatsappAccountLabel,
  loadBranchWhatsappAccounts,
  pickDefaultBranchWhatsappAccountId,
} from "../utils/branchWhatsappAccounts";

export function BranchWhatsappAccountSelect({
  branchLabel,
  value,
  onChange,
  disabled = false,
  required = false,
  allowDisconnected = false,
  className = "w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500",
}) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
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
  }, [branchLabel, value, onChange]);

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
        {accounts.map((account) => {
          const userId = String(account?.userId || "").trim();
          if (!userId) return null;
          const optionDisabled = !allowDisconnected && !account.connected;
          return (
            <option key={userId} value={userId} disabled={optionDisabled}>
              {formatBranchWhatsappAccountLabel(account)}
            </option>
          );
        })}
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
