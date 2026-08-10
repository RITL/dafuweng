export function shouldUseNativeMirrorLayout(innerWidth: number, maxTouchPoints: number): boolean {
  void maxTouchPoints;
  return innerWidth < 1100;
}

export function getClassicBoardGridArea(index: number, columns: number, rows: number): string {
  const sideLength = rows - 2;
  const topStart = columns + sideLength;
  const rightStart = topStart + columns;
  if (index < columns) return `${rows} / ${columns - index}`;
  if (index < topStart) return `${rows + columns - index - 1} / 1`;
  if (index < rightStart) return `1 / ${index - topStart + 1}`;
  return `${index - rightStart + 2} / ${columns}`;
}
