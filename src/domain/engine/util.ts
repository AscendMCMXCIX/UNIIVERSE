export function* enumerate2<T>(items: T[]): Generator<[T, T]> {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) yield [items[i]!, items[j]!];
  }
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDelta(value: number): string {
  const pts = value * 100;
  return `${pts >= 0 ? "+" : ""}${pts.toFixed(1)}`;
}
