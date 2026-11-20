/** Why a win rate is in the quiet colour (too few games), for screen readers; the games are counted beside it. */
export function SampleNote({ note }: { note: string | null }) {
  return note ? <span className="sr-only"> ({note})</span> : null;
}
