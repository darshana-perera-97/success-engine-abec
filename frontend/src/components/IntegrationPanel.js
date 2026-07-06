import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  getWhatsappStatus,
  regenerateWhatsappQr,
} from "../authApi";
import { DEFAULT_USER_AVATAR } from "../apiConfig";
import { isBranchWhatsappManagerRole, isBranchWhatsappViewerRole } from "../roles";

function IntegrationSpinner({ title, description }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-3 text-center px-4">
      <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-hidden />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="text-xs text-slate-500 max-w-xs">{description}</p> : null}
    </div>
  );
}

const STATUS_COPY = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  awaiting_qr_scan: "Awaiting QR Scan",
  authenticated: "Authenticated",
  connected: "Connected",
  auth_failed: "Authentication Failed",
  error: "Connection Error",
};

const defaultContext = {
  mode: "personal",
  branchWhatsappEnabled: false,
  canManage: false,
  statusUserId: "",
  messengerUserId: "",
  branchLabel: "",
  messengerName: "",
};

export function IntegrationPanel({ currentUser, branchWhatsappEnabled = false }) {
  const [state, setState] = useState(null);
  const [context, setContext] = useState(defaultContext);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const statusFailureCountRef = useRef(0);
  const userId = String(currentUser?.id || "").trim();
  const branchMode = context.mode === "branch" || branchWhatsappEnabled === true;
  const isCounselorViewer =
    branchWhatsappEnabled === true && isBranchWhatsappViewerRole(currentUser?.role);
  const canManage =
    context.canManage === true &&
    (!branchWhatsappEnabled || isBranchWhatsappManagerRole(currentUser?.role));
  const canShowQrCode = canManage && !isCounselorViewer;

  const statusLabel = useMemo(() => {
    const key = String(state?.status || "disconnected");
    return STATUS_COPY[key] || key;
  }, [state?.status]);
  const canDisconnect = canManage && (state?.status === "connected" || state?.status === "authenticated");
  const isConnected = canDisconnect;
  const statusKey = String(state?.status || "disconnected");
  const isSessionReady = statusKey === "connected";
  const isLinkingWhatsapp = statusKey === "authenticated";
  const hasQrCode = canShowQrCode && Boolean(state?.qrCodeDataUrl);
  const canRegenerateQr =
    canShowQrCode &&
    !isSessionReady &&
    !isLinkingWhatsapp &&
    (hasQrCode || statusKey === "awaiting_qr_scan" || statusKey === "connecting");
  const isBranchSetupInProgress =
    branchMode && !canManage && (statusKey === "connecting" || statusKey === "awaiting_qr_scan");
  const isQrCodeLoading =
    canShowQrCode &&
    !isSessionReady &&
    !isLinkingWhatsapp &&
    !hasQrCode &&
    (loading || statusKey === "connecting");
  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };
  const whatsappName = String(state?.whatsappName || "").trim() || "WhatsApp User";
  const whatsappNumber = String(state?.whatsappNumber || "").trim() || "-";
  const whatsappProfilePicUrl = String(state?.whatsappProfilePicUrl || "").trim();
  const branchLabel = String(context.branchLabel || currentUser?.branch || "").trim();
  const messengerName = String(context.messengerName || "").trim();
  const isBranchManager = isBranchWhatsappManagerRole(currentUser?.role);
  const branchManagedByOther =
    branchMode && isBranchManager && !canManage && Boolean(messengerName);

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
    setContext({ ...defaultContext, ...(response.context || {}) });
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
    if (!userId || !canManage) return;
    setLoading(true);
    setActionError("");
    const response = await connectWhatsapp(userId);
    setLoading(false);
    if (!response.ok) {
      setActionError(response.error || "Failed to start WhatsApp connection.");
      return;
    }
    setState(response.data);
    if (response.context) {
      setContext({ ...defaultContext, ...response.context });
    }
  };

  const handleDisconnect = async () => {
    if (!userId || !canManage) return;
    setLoading(true);
    setActionError("");
    const response = await disconnectWhatsapp(userId);
    setLoading(false);
    if (!response.ok) {
      setActionError(response.error || "Failed to disconnect WhatsApp.");
      return;
    }
    setState(response.data);
    if (response.context) {
      setContext({ ...defaultContext, ...response.context });
    }
  };

  const handleRegenerateQr = async () => {
    if (!userId || !canRegenerateQr) return;
    setLoading(true);
    setActionError("");
    setState((prev) => (prev ? { ...prev, qrCodeDataUrl: "", status: "connecting" } : prev));
    const response = await regenerateWhatsappQr(userId);
    setLoading(false);
    if (!response.ok) {
      setActionError(response.error || "Failed to regenerate WhatsApp QR code.");
      return;
    }
    setState(response.data);
    if (response.context) {
      setContext({ ...defaultContext, ...response.context });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">WhatsApp Integration</h2>
            <p className="text-sm text-slate-500 mt-1">
              {branchMode
                ? canManage
                  ? "Connect the shared WhatsApp account for your branch. All branch staff will send messages from this number."
                  : "View the branch WhatsApp account used for student messaging."
                : "Connect your WhatsApp to manage counselor conversations from a single workspace."}
            </p>
            {branchMode && branchLabel ? (
              <p className="text-xs text-slate-500 mt-2">
                Branch: <span className="font-semibold text-slate-700">{branchLabel}</span>
                {messengerName ? (
                  <>
                    {" "}
                    · Connected by <span className="font-semibold text-slate-700">{messengerName}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {branchManagedByOther ? (
              <p className="text-xs text-amber-700 mt-2">
                WhatsApp for this branch is managed by {messengerName}. Only they can connect or disconnect the
                branch account.
              </p>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${isSessionReady ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {branchMode && !canManage ? `Branch ${statusLabel}` : statusLabel}
          </div>
        </div>
        {state?.error ? <p className="text-sm text-rose-600 mt-3">{state.error}</p> : null}
        {actionError ? <p className="text-sm text-rose-600 mt-2">{actionError}</p> : null}
        {canManage ? (
          <div className="mt-5 flex gap-2">
            {!isConnected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Working..." : branchMode ? "Connect branch WhatsApp" : "Connect WhatsApp"}
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
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            {isSessionReady
              ? branchMode
                ? "Branch account"
                : "Connected Account"
              : isLinkingWhatsapp
                ? "Linking account"
                : canShowQrCode
                  ? "QR Code"
                  : "Branch account"}
          </p>
          <div className="mt-4 min-h-[260px] rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            {isSessionReady ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <img
                  src={whatsappProfilePicUrl || DEFAULT_USER_AVATAR}
                  alt={whatsappName}
                  className="w-24 h-24 rounded-full object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = DEFAULT_USER_AVATAR;
                  }}
                />
                <p className="mt-3 text-lg font-bold text-slate-900">{whatsappName}</p>
                <p className="text-sm text-slate-500">{whatsappNumber}</p>
              </div>
            ) : isLinkingWhatsapp ? (
              <IntegrationSpinner
                title="Linking WhatsApp to your account"
                description="Finishing sign-in and loading your profile. This usually takes a few seconds."
              />
            ) : isBranchSetupInProgress ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <IntegrationSpinner
                  title="Branch WhatsApp setup in progress"
                  description="Your Manager or Team Lead is connecting the branch account. You will see the connected number here once setup is complete."
                />
              </div>
            ) : isQrCodeLoading ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <IntegrationSpinner
                  title="Loading QR code"
                  description="Starting WhatsApp and preparing your scan code."
                />
                {canRegenerateQr ? (
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={loading}
                    className="px-3 py-2 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-60"
                  >
                    {loading ? "Regenerating..." : "Regenerate QR code"}
                  </button>
                ) : null}
              </div>
            ) : hasQrCode ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <img src={state.qrCodeDataUrl} alt="WhatsApp connection QR code" className="w-56 h-56 object-contain" />
                {canRegenerateQr ? (
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={loading}
                    className="px-3 py-2 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-60"
                  >
                    {loading ? "Regenerating..." : "Regenerate QR code"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-sm text-slate-500 px-4 text-center">
                  {canShowQrCode
                    ? "Click connect to generate a QR code, then scan it in WhatsApp mobile app."
                    : branchManagedByOther
                      ? `Branch WhatsApp is managed by ${messengerName}.`
                      : isCounselorViewer
                        ? "Branch WhatsApp is not connected yet. Ask your Manager or Team Lead to connect it."
                        : "Branch WhatsApp is not connected yet."}
                </p>
                {canShowQrCode ? (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={loading}
                    className="mt-4 px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {loading ? "Creating..." : "Create QR code"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Connection Details</p>
          <div className="mt-4 rounded-xl border border-slate-200 divide-y divide-slate-100">
            {branchMode ? (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">Branch</span>
                <span className="text-sm font-semibold text-slate-900">{branchLabel || "-"}</span>
              </div>
            ) : null}
            {branchMode && messengerName ? (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">Connected by</span>
                <span className="text-sm font-semibold text-slate-900">{messengerName}</span>
              </div>
            ) : null}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">WhatsApp Name</span>
              <span className="text-sm font-semibold text-slate-900">{isSessionReady ? whatsappName : "-"}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Contact Number</span>
              <span className="text-sm font-semibold text-slate-900">{isSessionReady ? whatsappNumber : "-"}</span>
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
