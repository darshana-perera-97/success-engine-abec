import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  LogOut,
  MessageSquare,
  Plug,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  disconnectAdminWhatsappSession,
  getAdminLoginLogs,
  getAdminWhatsappIncomingLogs,
  getAdminWhatsappOutgoingLogs,
  getAdminWhatsappSessions,
  reconnectAdminWhatsappSession,
} from "../authApi";
import { getRoleDisplayName } from "../roleDisplay";
import { POLL_MS } from "../runtimeConfig";
import { useClientPagination } from "../hooks/usePagination";
import { Button } from "./Button";
import { dt, DataTablePagination } from "./DataTable";
import { TableSkeletonRows } from "./LoadingPlaceholder";

function formatLogDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  return {
    date: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function matchesQuery(query, ...parts) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => String(part || "").toLowerCase().includes(q));
}

function statusBadgeClass(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "connected" || s === "authenticated" || s === "sent") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (s === "connecting" || s === "reconnecting" || s === "awaiting_qr_scan" || s === "pending") {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  if (s === "failed" || s === "error" || s === "auth_failed") {
    return "bg-rose-50 text-rose-800 border-rose-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function statusLabel(status) {
  const s = String(status || "").trim();
  if (s === "awaiting_qr_scan") return "Awaiting QR scan";
  if (s === "auth_failed") return "Auth failed";
  if (!s) return "Unknown";
  return s.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function healthBarClass(score) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  if (score > 0) return "bg-rose-500";
  return "bg-slate-300";
}

function healthScoreClass(score) {
  if (score >= 80) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  if (score > 0) return "text-rose-700";
  return "text-slate-500";
}

function WhatsappHealthCell({ score, label }) {
  const n = Number(score);
  const value = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  if (value == null) return <span className="text-slate-400">—</span>;
  return (
    <div className="min-w-[92px]">
      <div className="flex items-baseline gap-1">
        <span className={`text-sm font-semibold tabular-nums ${healthScoreClass(value)}`}>{value}</span>
        <span className="text-[11px] text-slate-400">/ 100</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${healthBarClass(value)}`} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">{label || "—"}</div>
    </div>
  );
}

function LogSection({ icon, title, description, toolbar, children }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              {icon}
            </span>
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {toolbar}
      </div>
      {children}
    </section>
  );
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-64"
      />
    </div>
  );
}

function MessageDetailModal({ title, rows, onClose }) {
  if (!rows) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <dl className="space-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</dt>
              <dd className={`mt-1 whitespace-pre-wrap break-words text-slate-800 ${row.wide ? "rounded-lg bg-slate-50 px-3 py-2" : ""}`}>
                {row.value || "—"}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoginLogsSection({ rows, loading, error }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(query, row.username, row.email, row.role, getRoleDisplayName(row.role))
      ),
    [rows, query]
  );
  const { page, setPage, pageSize, setPageSize, pageItems, totalRows } = useClientPagination(
    filtered,
    query
  );

  return (
    <LogSection
      icon={<Users size={16} />}
      title="Logged users"
      description="Portal sign-ins with username, email, date, and time."
      toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search users…" />}
    >
      <div className={dt.card}>
        <div className={dt.scroll}>
          <table className={dt.table}>
            <thead className={dt.head}>
              <tr>
                <th className={dt.th}>User name</th>
                <th className={dt.th}>Email</th>
                <th className={dt.th}>Date</th>
                <th className={dt.th}>Time</th>
              </tr>
            </thead>
            <tbody className={dt.body}>
              {loading ? (
                <TableSkeletonRows rows={6} cols={4} />
              ) : pageItems.length ? (
                pageItems.map((row) => {
                  const { date, time } = formatLogDateTime(row.loggedInAt);
                  return (
                    <tr key={row.id} className={dt.row}>
                      <td className={dt.tdPrimary}>{row.username || "—"}</td>
                      <td className={dt.td}>{row.email || "—"}</td>
                      <td className={dt.td}>{date}</td>
                      <td className={dt.td}>{time}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className={dt.emptyRow}>
                    {error || "No login records yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rowLabel="logins"
        />
      </div>
    </LogSection>
  );
}

function WhatsappSessionsSection({ rows, loading, error, disconnectingId, reconnectingId, onLogout, onReconnect }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(query, row.userName, row.account, row.status, row.email, row.healthLabel, row.healthScore)
      ),
    [rows, query]
  );
  const { page, setPage, pageSize, setPageSize, pageItems, totalRows } = useClientPagination(
    filtered,
    query
  );

  return (
    <LogSection
      icon={<Plug size={16} />}
      title="WhatsApp integrations"
      description="Every WhatsApp account connected to the system, with live health scores. Admins can reconnect or log them out from here."
      toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search accounts…" />}
    >
      <div className={dt.card}>
        <div className={dt.scroll}>
          <table className={dt.table}>
            <thead className={dt.head}>
              <tr>
                <th className={dt.th}>Account</th>
                <th className={dt.th}>User name</th>
                <th className={dt.th}>Status</th>
                <th className={dt.th}>Health</th>
                <th className={dt.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody className={dt.body}>
              {loading ? (
                <TableSkeletonRows rows={5} cols={5} />
              ) : pageItems.length ? (
                pageItems.map((row) => {
                  const busy = disconnectingId === row.userId || reconnectingId === row.userId;
                  return (
                  <tr key={row.userId} className={dt.row}>
                    <td className={dt.tdPrimary}>
                      <div>{row.account || "Not linked"}</div>
                      {row.whatsappNumber && row.account !== row.whatsappNumber ? (
                        <div className="text-xs font-normal text-slate-400">{row.whatsappNumber}</div>
                      ) : null}
                    </td>
                    <td className={dt.td}>{row.userName || "—"}</td>
                    <td className={dt.td}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className={dt.td}>
                      <WhatsappHealthCell score={row.healthScore} label={row.healthLabel} />
                    </td>
                    <td className={dt.tdActions}>
                      <div className="inline-flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          isLoading={reconnectingId === row.userId}
                          onClick={() => onReconnect(row)}
                        >
                          <RefreshCw size={14} className="mr-1.5" />
                          Reconnect
                        </Button>
                        {row.canLogout ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            isLoading={disconnectingId === row.userId}
                            onClick={() => onLogout(row)}
                          >
                            <LogOut size={14} className="mr-1.5" />
                            Logout
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className={dt.emptyRow}>
                    {error || "No WhatsApp integrations found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rowLabel="accounts"
        />
      </div>
    </LogSection>
  );
}

function IncomingMessagesSection({ rows, loading, error, onView }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(query, row.account, row.userName, row.receivedNumber, row.messagePreview, row.mappedStudentName)
      ),
    [rows, query]
  );
  const { page, setPage, pageSize, setPageSize, pageItems, totalRows } = useClientPagination(
    filtered,
    query
  );

  return (
    <LogSection
      icon={<MessageSquare size={16} />}
      title="Incoming WhatsApp messages"
      description="Messages received on all connected WhatsApp accounts."
      toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search messages…" />}
    >
      <div className={dt.card}>
        <div className={dt.scroll}>
          <table className={dt.table}>
            <thead className={dt.head}>
              <tr>
                <th className={dt.th}>Account</th>
                <th className={dt.th}>User name</th>
                <th className={dt.th}>Received number</th>
                <th className={dt.th}>Message preview</th>
                <th className={dt.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody className={dt.body}>
              {loading ? (
                <TableSkeletonRows rows={6} cols={5} />
              ) : pageItems.length ? (
                pageItems.map((row) => (
                  <tr key={row.id} className={dt.row}>
                    <td className={dt.tdPrimary}>{row.account || "—"}</td>
                    <td className={dt.td}>{row.userName || "—"}</td>
                    <td className={dt.td}>{row.receivedNumber || "—"}</td>
                    <td className={`${dt.td} max-w-xs`}>
                      <span className="line-clamp-2">{row.messagePreview || "—"}</span>
                    </td>
                    <td className={dt.tdActions}>
                      <Button variant="secondary" size="sm" onClick={() => onView(row)}>
                        <Eye size={14} className="mr-1.5" />
                        View more
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={dt.emptyRow}>
                    {error || "No incoming WhatsApp messages yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rowLabel="messages"
        />
      </div>
    </LogSection>
  );
}

function OutgoingMessagesSection({ rows, loading, error }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(query, row.userName, row.message, row.messagePreview, row.whatsappAccount, row.status)
      ),
    [rows, query]
  );
  const { page, setPage, pageSize, setPageSize, pageItems, totalRows } = useClientPagination(
    filtered,
    query
  );

  return (
    <LogSection
      icon={<Send size={16} />}
      title="Outgoing WhatsApp messages"
      description="Notifications and messages that were sent, or attempted, through WhatsApp."
      toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search messages…" />}
    >
      <div className={dt.card}>
        <div className={dt.scroll}>
          <table className={dt.table}>
            <thead className={dt.head}>
              <tr>
                <th className={dt.th}>User name</th>
                <th className={dt.th}>Message</th>
                <th className={dt.th}>WhatsApp account</th>
                <th className={dt.th}>Message preview</th>
                <th className={dt.th}>Status</th>
              </tr>
            </thead>
            <tbody className={dt.body}>
              {loading ? (
                <TableSkeletonRows rows={6} cols={5} />
              ) : pageItems.length ? (
                pageItems.map((row) => (
                  <tr key={row.id} className={dt.row}>
                    <td className={dt.tdPrimary}>{row.userName || "—"}</td>
                    <td className={`${dt.td} max-w-xs`}>
                      <span className="line-clamp-2 whitespace-pre-wrap">{row.message || "—"}</span>
                    </td>
                    <td className={dt.td}>{row.whatsappAccount || "—"}</td>
                    <td className={`${dt.td} max-w-xs`}>
                      <span className="line-clamp-2">{row.messagePreview || "—"}</span>
                    </td>
                    <td className={dt.td}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                      {row.reason && String(row.status).toLowerCase() !== "sent" ? (
                        <div className="mt-1 max-w-[180px] text-xs text-slate-400 line-clamp-2">{row.reason}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={dt.emptyRow}>
                    {error || "No outgoing WhatsApp messages yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rowLabel="messages"
        />
      </div>
    </LogSection>
  );
}

export function AdminLogs() {
  const [logins, setLogins] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState({
    logins: true,
    sessions: true,
    incoming: true,
    outgoing: true,
  });
  const [errors, setErrors] = useState({
    logins: "",
    sessions: "",
    incoming: "",
    outgoing: "",
  });
  const [disconnectingId, setDisconnectingId] = useState("");
  const [reconnectingId, setReconnectingId] = useState("");
  const [incomingDetail, setIncomingDetail] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState("success");

  const loadSection = useCallback(async (key, fetcher, setter) => {
    const result = await fetcher();
    if (result.ok) {
      setter(result.data);
      setErrors((prev) => ({ ...prev, [key]: "" }));
    } else {
      setErrors((prev) => ({ ...prev, [key]: result.error || "Failed to load." }));
    }
    setLoading((prev) => ({ ...prev, [key]: false }));
  }, []);

  const refreshAll = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading({ logins: true, sessions: true, incoming: true, outgoing: true });
      }
      await Promise.all([
        loadSection("logins", getAdminLoginLogs, setLogins),
        loadSection("sessions", getAdminWhatsappSessions, setSessions),
        loadSection("incoming", getAdminWhatsappIncomingLogs, setIncoming),
        loadSection("outgoing", getAdminWhatsappOutgoingLogs, setOutgoing),
      ]);
    },
    [loadSection]
  );

  useEffect(() => {
    refreshAll();
    const timer = setInterval(() => refreshAll({ silent: true }), POLL_MS.whatsapp);
    return () => clearInterval(timer);
  }, [refreshAll]);

  const handleLogoutSession = async (row) => {
    const label = row.account && row.account !== "Not linked" ? row.account : row.userName;
    if (!window.confirm(`Log out WhatsApp for ${label}? This disconnects the account from the system.`)) {
      return;
    }
    setDisconnectingId(row.userId);
    setNotice("");
    const result = await disconnectAdminWhatsappSession(row.userId);
    setDisconnectingId("");
    if (!result.ok) {
      setNoticeTone("error");
      setNotice(result.error || "Failed to log out WhatsApp account.");
      return;
    }
    setNoticeTone("success");
    setNotice(`WhatsApp logged out for ${row.userName || row.userId}.`);
    await loadSection("sessions", getAdminWhatsappSessions, setSessions);
  };

  const handleReconnectSession = async (row) => {
    const label = row.account && row.account !== "Not linked" ? row.account : row.userName;
    setReconnectingId(row.userId);
    setNotice("");
    const result = await reconnectAdminWhatsappSession(row.userId);
    setReconnectingId("");
    if (!result.ok) {
      setNoticeTone("error");
      setNotice(result.error || `Failed to reconnect WhatsApp for ${label}.`);
      return;
    }
    setNoticeTone("success");
    setNotice(`Reconnecting WhatsApp for ${row.userName || row.userId}.`);
    await loadSection("sessions", getAdminWhatsappSessions, setSessions);
  };

  const incomingModalRows = incomingDetail
    ? [
        { label: "Account", value: incomingDetail.account },
        { label: "User name", value: incomingDetail.userName },
        { label: "Received number", value: incomingDetail.receivedNumber },
        { label: "Received at", value: (() => {
          const { date, time } = formatLogDateTime(incomingDetail.timestamp);
          return date === "—" ? "" : `${date} ${time}`;
        })() },
        { label: "Mapped student", value: incomingDetail.mappedStudentName },
        {
          label: "Attachment",
          value: incomingDetail.attachment?.name
            ? `${incomingDetail.attachment.name}${incomingDetail.attachment.mime ? ` (${incomingDetail.attachment.mime})` : ""}`
            : "",
        },
        {
          label: "Reply to",
          value: incomingDetail.replyTo?.content || "",
        },
        { label: "Full message", value: incomingDetail.message, wide: true },
      ]
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ScrollText size={22} className="text-slate-500" />
            Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Admin-only activity for portal logins and WhatsApp connections, inbound messages, and outbound notifications.
          </p>
        </div>
        <Button variant="secondary" onClick={() => refreshAll()}>
          <RefreshCw size={14} className="mr-1.5" />
          Refresh
        </Button>
      </div>

      {notice ? (
        <p
          className={
            noticeTone === "error"
              ? "rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              : "rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          }
        >
          {notice}
        </p>
      ) : null}

      <LoginLogsSection rows={logins} loading={loading.logins} error={errors.logins} />
      <WhatsappSessionsSection
        rows={sessions}
        loading={loading.sessions}
        error={errors.sessions}
        disconnectingId={disconnectingId}
        reconnectingId={reconnectingId}
        onLogout={handleLogoutSession}
        onReconnect={handleReconnectSession}
      />
      <IncomingMessagesSection
        rows={incoming}
        loading={loading.incoming}
        error={errors.incoming}
        onView={setIncomingDetail}
      />
      <OutgoingMessagesSection rows={outgoing} loading={loading.outgoing} error={errors.outgoing} />

      <MessageDetailModal
        title="Incoming WhatsApp message"
        rows={incomingModalRows}
        onClose={() => setIncomingDetail(null)}
      />
    </div>
  );
}
