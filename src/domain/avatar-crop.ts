/*
  PROFILE PICTURE CROP: the geometry behind the drag-to-reposition editor, kept pure so it can be
  tested and shared by the live preview and the final canvas crop.

  The crop is a square (shown as a circle) over the picture. Its state is the zoom (1 = the
  picture's shorter side exactly fills the square) and the point of the picture under the square's
  centre, as fractions of the picture's width and height. Keeping the centre point (not an offset)
  means zooming keeps what is in the middle in the middle. Every position is clamped, so the square
  always lies entirely inside the picture: no empty space can ever show in the crop.
*/

export const AVATAR_ZOOM_MIN = 1;
export const AVATAR_ZOOM_MAX = 4;

export interface CropState {
  zoom: number;
  /** The picture point under the crop's centre, 0–1 across its width and height. */
  cx: number;
  cy: number;
}

export const DEFAULT_CROP: CropState = { zoom: 1, cx: 0.5, cy: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, AVATAR_ZOOM_MIN, AVATAR_ZOOM_MAX) : AVATAR_ZOOM_MIN;
}

/** The crop square's side as a fraction of the picture's width and of its height. */
function cropFractions(width: number, height: number, zoom: number): { fw: number; fh: number } {
  const side = Math.min(width, height) / clampZoom(zoom);
  return { fw: side / width, fh: side / height };
}

/** The same state with the zoom in range and the centre moved just enough to keep the crop inside the picture. */
export function clampCrop(state: CropState, width: number, height: number): CropState {
  const zoom = clampZoom(state.zoom);
  const { fw, fh } = cropFractions(width, height, zoom);
  const cx = Number.isFinite(state.cx) ? state.cx : 0.5;
  const cy = Number.isFinite(state.cy) ? state.cy : 0.5;
  return { zoom, cx: clamp(cx, fw / 2, 1 - fw / 2), cy: clamp(cy, fh / 2, 1 - fh / 2) };
}

/**
 * Where the picture sits in a square viewport `size` px wide: its displayed width and height and
 * its top-left corner (negative or zero), for a CSS transform.
 */
export function viewportLayout(state: CropState, width: number, height: number, size: number): { w: number; h: number; x: number; y: number } {
  const s = clampCrop(state, width, height);
  const scale = (size / Math.min(width, height)) * s.zoom;
  const w = width * scale;
  const h = height * scale;
  return { w, h, x: size / 2 - s.cx * w, y: size / 2 - s.cy * h };
}

/** Moves the crop by a drag of (dx, dy) px in a `size` px viewport: the picture follows the pointer. */
export function dragCrop(state: CropState, dx: number, dy: number, width: number, height: number, size: number): CropState {
  const { w, h } = viewportLayout(state, width, height, size);
  return clampCrop({ ...state, cx: state.cx - dx / w, cy: state.cy - dy / h }, width, height);
}

/** The source rectangle to draw into the square output, in the picture's own pixels. */
export function cropRect(state: CropState, width: number, height: number): { sx: number; sy: number; side: number } {
  const s = clampCrop(state, width, height);
  const side = Math.min(width, height) / s.zoom;
  return { sx: clamp(s.cx * width - side / 2, 0, width - side), sy: clamp(s.cy * height - side / 2, 0, height - side), side };
}
