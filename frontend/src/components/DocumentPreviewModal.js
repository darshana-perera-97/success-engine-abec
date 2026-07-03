import { useCallback, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { X, Download, FileText, Eye } from "lucide-react";
import { toAbsoluteAssetUrl } from "../apiConfig";

export function resolveDocumentUrl(url) {
  const resolved = toAbsoluteAssetUrl(String(url || "").trim());
  return resolved || url;
}

export function documentDownloadProps(url, name) {
  const href = resolveDocumentUrl(url);
  if (!href) return null;
  return {
    href,
    download: String(name || "").trim() || "document",
    target: "_blank",
    rel: "noopener noreferrer"
  };
}

export function isPreviewableImage(url, name) {
  const hint = `${String(name || "")} ${String(url || "")}`.toLowerCase();
  if (hint.includes("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(hint.split("?")[0]);
}

export function isPreviewablePdf(url, name) {
  const hint = `${String(name || "")} ${String(url || "")}`.toLowerCase();
  return (
    hint.includes("application/pdf") ||
    hint.includes("data:application/pdf") ||
    /\.pdf$/i.test(hint.split("?")[0])
  );
}

function DocumentPreviewContent({ url, name }) {
  if (isPreviewableImage(url, name)) {
    return jsx("img", {
      src: url,
      alt: name || "Document preview",
      className: "max-w-full max-h-full object-contain select-none"
    });
  }
  if (isPreviewablePdf(url, name)) {
    return jsx("iframe", {
      title: name || "Document preview",
      src: url,
      className: "w-full h-full border-0 bg-white rounded-lg shadow-lg"
    });
  }
  return jsxs("div", {
    className: "text-center space-y-4 px-6",
    children: [
      jsx(FileText, { size: 48, className: "mx-auto text-slate-400" }),
      jsx("p", {
        className: "text-sm text-slate-300 max-w-md",
        children: name || "This file type cannot be previewed in the browser."
      }),
      jsx("p", {
        className: "text-xs text-slate-500",
        children: "Use the download button above to save the file."
      })
    ]
  });
}

export function useDocumentPreview() {
  const [preview, setPreview] = useState(null);

  const openDocumentPreview = useCallback((url, name, title) => {
    const resolved = resolveDocumentUrl(url);
    if (!resolved) return;
    setPreview({
      url: resolved,
      name: String(name || "").trim() || "document",
      title: String(title || name || "Document").trim() || "Document"
    });
  }, []);

  const closeDocumentPreview = useCallback(() => setPreview(null), []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDocumentPreview();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [preview, closeDocumentPreview]);

  const documentPreviewModal = preview
    ? jsx("div", {
        className:
          "fixed inset-0 z-[200] flex flex-col bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-200",
        onClick: closeDocumentPreview,
        children: jsxs("div", {
          className: "flex flex-col h-full w-full",
          onClick: (event) => event.stopPropagation(),
          children: [
            jsxs("div", {
              className:
                "flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/80 shrink-0",
              children: [
                jsxs("div", {
                  className: "min-w-0 flex-1",
                  children: [
                    jsx("p", {
                      className: "text-sm font-semibold text-white truncate",
                      title: preview.title,
                      children: preview.title
                    }),
                    preview.name !== preview.title
                      ? jsx("p", {
                          className: "text-xs text-slate-400 truncate mt-0.5",
                          title: preview.name,
                          children: preview.name
                        })
                      : null
                  ]
                }),
                jsxs("div", {
                  className: "flex items-center gap-2 shrink-0",
                  children: [
                    jsx("a", {
                      ...documentDownloadProps(preview.url, preview.name),
                      className:
                        "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors",
                      title: "Download",
                      children: [
                        jsx(Download, { size: 16 }),
                        jsx("span", { className: "hidden sm:inline", children: "Download" })
                      ]
                    }),
                    jsx("button", {
                      type: "button",
                      onClick: closeDocumentPreview,
                      className:
                        "p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors",
                      title: "Close",
                      children: jsx(X, { size: 20 })
                    })
                  ]
                })
              ]
            }),
            jsx("div", {
              className: "flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 overflow-hidden",
              children: jsx(DocumentPreviewContent, { url: preview.url, name: preview.name })
            })
          ]
        })
      })
    : null;

  return { openDocumentPreview, closeDocumentPreview, documentPreviewModal };
}

export function DocumentViewButton({
  url,
  name,
  title = "View",
  onOpen,
  className = "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
}) {
  return jsx("button", {
    type: "button",
    onClick: () => onOpen(url, name, title),
    title,
    className,
    children: jsx(Eye, { size: 16 })
  });
}