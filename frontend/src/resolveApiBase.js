/**
 * When the React app runs on localhost, call the local backend (port 3334) so
 * `backend/data/*.json` matches what you see in the terminal. Override anytime
 * with REACT_APP_API_BASE in frontend/.env
 */
export function resolveApiBase(remoteBase) {
  const override = process.env.REACT_APP_API_BASE;
  if (override && String(override).trim()) {
    return String(override).trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3334";
    }
  }
  return String(remoteBase || "").replace(/\/+$/, "");
}
