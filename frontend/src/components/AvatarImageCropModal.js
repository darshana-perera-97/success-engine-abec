import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { Button } from "./Button";
import {
  AVATAR_CROP_VIEWPORT_SIZE,
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  AVATAR_OUTPUT_SIZE,
  clampAvatarCropOffsets,
  computeAvatarCropLayout,
  exportAvatarCropDataUrl,
  loadImageElement,
} from "../utils/avatarImage";

const AvatarImageCropModal = ({
  open,
  imageDataUrl,
  title = "Crop profile photo",
  description = `Adjust the image, then save. Output size is ${AVATAR_OUTPUT_SIZE}×${AVATAR_OUTPUT_SIZE}px.`,
  confirmLabel = "Save photo",
  onClose,
  onConfirm,
}) => {
  const dragStateRef = useRef(null);
  const [imageElement, setImageElement] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !imageDataUrl) {
      setImageElement(null);
      setLoadError("");
      setZoom(1);
      return undefined;
    }

    let cancelled = false;
    setLoadError("");
    loadImageElement(imageDataUrl)
      .then((image) => {
        if (cancelled) return;
        const layout = computeAvatarCropLayout(
          image.naturalWidth,
          image.naturalHeight,
          AVATAR_CROP_VIEWPORT_SIZE,
          1
        );
        setImageElement(image);
        setZoom(1);
        setScale(layout.scale);
        setOffsetX(layout.offsetX);
        setOffsetY(layout.offsetY);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load image.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, imageDataUrl]);

  const applyZoom = useCallback(
    (nextZoom) => {
      if (!imageElement) return;
      const layout = computeAvatarCropLayout(
        imageElement.naturalWidth,
        imageElement.naturalHeight,
        AVATAR_CROP_VIEWPORT_SIZE,
        nextZoom
      );
      const clamped = clampAvatarCropOffsets(
        layout.offsetX,
        layout.offsetY,
        layout.scale,
        imageElement.naturalWidth,
        imageElement.naturalHeight,
        AVATAR_CROP_VIEWPORT_SIZE
      );
      setZoom(nextZoom);
      setScale(layout.scale);
      setOffsetX(clamped.offsetX);
      setOffsetY(clamped.offsetY);
    },
    [imageElement]
  );

  const handlePointerDown = (event) => {
    if (!imageElement) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetX,
      originY: offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageElement) return;
    const nextOffsetX = drag.originX + (event.clientX - drag.startX);
    const nextOffsetY = drag.originY + (event.clientY - drag.startY);
    const clamped = clampAvatarCropOffsets(
      nextOffsetX,
      nextOffsetY,
      scale,
      imageElement.naturalWidth,
      imageElement.naturalHeight,
      AVATAR_CROP_VIEWPORT_SIZE
    );
    setOffsetX(clamped.offsetX);
    setOffsetY(clamped.offsetY);
  };

  const handlePointerUp = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleConfirm = async () => {
    if (!imageElement) return;
    setIsSaving(true);
    const croppedDataUrl = exportAvatarCropDataUrl(
      imageElement,
      { scale, offsetX, offsetY },
      AVATAR_CROP_VIEWPORT_SIZE,
      AVATAR_OUTPUT_SIZE
    );
    setIsSaving(false);
    if (!croppedDataUrl) {
      setLoadError("Failed to process image.");
      return;
    }
    onConfirm?.(croppedDataUrl);
  };

  if (!open || !imageDataUrl) return null;

  return /* @__PURE__ */ jsx("div", {
    className:
      "fixed inset-0 z-[130] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm",
    children: /* @__PURE__ */ jsxs("div", {
      className:
        "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 max-h-[90vh] overflow-hidden my-auto flex flex-col",
      children: [
        /* @__PURE__ */ jsxs("div", {
          className: "flex justify-between items-center p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0",
          children: [
            /* @__PURE__ */ jsxs("div", {
              children: [
                /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900", children: title }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: description }),
              ],
            }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: onClose,
              className: "text-slate-400 hover:text-slate-600 transition-colors",
              children: /* @__PURE__ */ jsx(X, { size: 20 }),
            }),
          ],
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "p-5 space-y-4 overflow-y-auto flex-1 min-h-0",
          children: [
            loadError
              ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: loadError,
                })
              : null,
            /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col items-center gap-3",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  className: "relative rounded-full overflow-hidden border-4 border-white shadow-lg ring-2 ring-indigo-100 touch-none select-none",
                  style: { width: AVATAR_CROP_VIEWPORT_SIZE, height: AVATAR_CROP_VIEWPORT_SIZE },
                  onPointerDown: handlePointerDown,
                  onPointerMove: handlePointerMove,
                  onPointerUp: handlePointerUp,
                  onPointerCancel: handlePointerUp,
                  children: [
                    imageElement
                      ? /* @__PURE__ */ jsx("img", {
                          src: imageDataUrl,
                          alt: "Crop preview",
                          draggable: false,
                          className: "absolute left-0 top-0 max-w-none pointer-events-none",
                          style: {
                            width: imageElement.naturalWidth * scale,
                            height: imageElement.naturalHeight * scale,
                            transform: `translate(${offsetX}px, ${offsetY}px)`,
                          },
                        })
                      : /* @__PURE__ */ jsx("div", {
                          className: "w-full h-full bg-slate-100 animate-pulse",
                        }),
                    /* @__PURE__ */ jsx("div", {
                      className: "absolute inset-0 pointer-events-none ring-1 ring-inset ring-black/10 rounded-full",
                    }),
                  ],
                }),
                /* @__PURE__ */ jsx("p", {
                  className: "text-[11px] text-slate-500 text-center",
                  children: "Drag to reposition. Use the slider to zoom.",
                }),
              ],
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "space-y-2",
              children: [
                /* @__PURE__ */ jsxs("label", {
                  className: "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600",
                  children: [
                    /* @__PURE__ */ jsx(ZoomIn, { size: 14 }),
                    " Zoom",
                  ],
                }),
                /* @__PURE__ */ jsx("input", {
                  type: "range",
                  min: AVATAR_MIN_ZOOM,
                  max: AVATAR_MAX_ZOOM,
                  step: 0.01,
                  value: zoom,
                  onChange: (event) => applyZoom(Number(event.target.value)),
                  className: "w-full accent-indigo-600",
                }),
              ],
            }),
          ],
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "flex justify-end gap-2 p-5 border-t border-gray-100 flex-shrink-0",
          children: [
            /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: onClose, disabled: isSaving, children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, {
              type: "button",
              onClick: handleConfirm,
              isLoading: isSaving,
              disabled: !imageElement,
              children: confirmLabel,
            }),
          ],
        }),
      ],
    }),
  });
};

export { AvatarImageCropModal };
