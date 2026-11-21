/**
 * Where the docked preview's notch goes (CM §4.1): beside the selected row, over the preview's edge
 * line, clipped to the part of that edge the pinned preview draws. Boxes are viewport rectangles:
 * the row, the preview's column (the notch's containing box, which scrolls with the list) and the
 * preview itself (pinned under the section tabs). Hidden once no part of the row is beside it.
 */
export function notchPlacement(row: { top: number; bottom: number }, column: { top: number }, preview: { top: number; bottom: number }) {
  const height = row.bottom - row.top;
  const clipTop = Math.max(0, preview.top - row.top);
  const clipBottom = Math.max(0, row.bottom - preview.bottom);
  return { y: row.top - column.top, height, clipTop: Math.min(clipTop, height), clipBottom: Math.min(clipBottom, height), hidden: clipTop + clipBottom >= height };
}
