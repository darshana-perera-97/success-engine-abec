import { useEffect, useMemo, useRef, useState } from "react";
import { connectWhatsapp, disconnectWhatsapp, getWhatsappStatus } from "../authApi";

const STATUS_COPY = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  awaiting_qr_scan: "Awaiting QR Scan",
  authenticated: "Authenticated",
  connected: "Connected",
  auth_failed: "Authentication Failed",
  error: "Connection Error",
};

export function IntegrationPanel({ currentUser }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const statusFailureCountRef = useRef(0);
  const userId = String(currentUser?.id || "").trim();

  const statusLabel = useMemo(() => {
    const key = String(state?.status || "disconnected");
    return STATUS_COPY[key] || key;
  }, [state?.status]);
  const canDisconnect = state?.status === "connected" || state?.status === "authenticated";
  const isConnected = canDisconnect;
  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };
  const whatsappName = String(state?.whatsappName || "").trim() || "WhatsApp User";
  const whatsappNumber = String(state?.whatsappNumber || "").trim() || "-";
  const whatsappProfilePicUrl = String(state?.whatsappProfilePicUrl || "").trim();

  const refreshStatus = async () => {
    if (!userId) return;
    const response = await getWhatsappStatus(userId);
    if (!response.ok) {
      statusFailureCountRef.current += 1;
      if (statusFailureCountRef.current >= 3) {
        setActionError(response.error || "Failed to load WhatsApp status.");
      }
      return;
    }
    statusFailureCountRef.current = 0;
    setActionError("");
    setState(response.data);
  };

  useEffect(() => {
    let stop = false;
    if (!userId) return;
    const run = async () => {
      if (stop) return;
      await refreshStatus();
    };
    run();
    const timer = setInterval(run, 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [userId]);
  const handleConnect = async () => {
    if (!userId) return;
    setLoading(true);
    setActionError("");
    const response = await connectWhatsapp(userId);
    setLoading(false);
    if (!response.ok) {
      setActionError(response.error || "Failed to start WhatsApp connection.");
      return;
    }
    setState(response.data);
  };

  const handleDisconnect = async () => {
    if (!userId) return;
    setLoading(true);
    setActionError("");
    const response = await disconnectWhatsapp(userId);
    setLoading(false);
    if (!response.ok) {
      setActionError(response.error || "Failed to disconnect WhatsApp.");
      return;
    }
    setState(response.data);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">WhatsApp Integration</h2>
            <p className="text-sm text-slate-500 mt-1">
              Connect your WhatsApp to manage counselor conversations from a single workspace.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
            {statusLabel}
          </div>
        </div>
        {state?.error ? <p className="text-sm text-rose-600 mt-3">{state.error}</p> : null}
        {actionError ? <p className="text-sm text-rose-600 mt-2">{actionError}</p> : null}
        <div className="mt-5 flex gap-2">
          {!isConnected ? (
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Working..." : "Connect WhatsApp"}
            </button>
          ) : null}
          {canDisconnect ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            {isConnected ? "Connected Account" : "QR Code"}
          </p>
          <div className="mt-4 min-h-[260px] rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            {isConnected ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <img
                  src={whatsappProfilePicUrl || "/canadian.png"}
                  alt={whatsappName}
                  className="w-24 h-24 rounded-full object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = "/canadian.png";
                  }}
                />
                <p className="mt-3 text-lg font-bold text-slate-900">{whatsappName}</p>
                <p className="text-sm text-slate-500">{whatsappNumber}</p>
              </div>
            ) : state?.qrCodeDataUrl ? (
              <div className="h-full flex items-center justify-center">
                <img src={state.qrCodeDataUrl} alt="WhatsApp connection QR code" className="w-56 h-56 object-contain" />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-sm text-slate-500 px-4 text-center">
                  Click connect to generate a QR code, then scan it in WhatsApp mobile app.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={loading}
                  className="mt-4 px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create QR code"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Connection Details</p>
          <div className="mt-4 rounded-xl border border-slate-200 divide-y divide-slate-100">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">WhatsApp Name</span>
              <span className="text-sm font-semibold text-slate-900">{isConnected ? whatsappName : "-"}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Contact Number</span>
              <span className="text-sm font-semibold text-slate-900">{isConnected ? whatsappNumber : "-"}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Connected At</span>
              <span className="text-sm font-semibold text-slate-900">{formatDateTime(state?.connectedAt)}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Last Updated</span>
              <span className="text-sm font-semibold text-slate-900">{formatDateTime(state?.lastUpdatedAt)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
