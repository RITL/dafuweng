export function shouldUseNativeMirrorLayout(innerWidth: number, maxTouchPoints: number): boolean {
  return innerWidth < 1100 && maxTouchPoints > 0;
}
