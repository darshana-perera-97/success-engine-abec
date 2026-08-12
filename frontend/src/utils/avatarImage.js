export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_CROP_VIEWPORT_SIZE = 280;
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 3;

export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-load-failed"));
    image.src = src;
  });
}

export function computeAvatarCropLayout(naturalWidth, naturalHeight, viewportSize, zoom = 1) {
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const baseScale = Math.max(viewportSize / safeWidth, viewportSize / safeHeight);
  const scale = baseScale * zoom;
  const scaledWidth = safeWidth * scale;
  const scaledHeight = safeHeight * scale;
  return {
    scale,
    offsetX: (viewportSize - scaledWidth) / 2,
    offsetY: (viewportSize - scaledHeight) / 2,
  };
}

export function clampAvatarCropOffsets(offsetX, offsetY, scale, naturalWidth, naturalHeight, viewportSize) {
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const minOffsetX = viewportSize - scaledWidth;
  const minOffsetY = viewportSize - scaledHeight;
  return {
    offsetX: Math.min(0, Math.max(minOffsetX, offsetX)),
    offsetY: Math.min(0, Math.max(minOffsetY, offsetY)),
  };
}

export function exportAvatarCropDataUrl(
  image,
  { scale, offsetX, offsetY },
  viewportSize = AVATAR_CROP_VIEWPORT_SIZE,
  outputSize = AVATAR_OUTPUT_SIZE
) {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context || !image?.naturalWidth || !image?.naturalHeight) return "";

  const sourceX = (-offsetX) / scale;
  const sourceY = (-offsetY) / scale;
  const sourceSize = viewportSize / scale;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL("image/jpeg", 0.92);
}
