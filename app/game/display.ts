export const TELEVISION_VIRTUAL_WIDTH = 1366;

export function shouldUseVirtualTelevisionViewport(innerWidth: number, maxTouchPoints: number): boolean {
  return innerWidth < 900 && maxTouchPoints > 0;
}

export function createTelevisionViewportContent(physicalLandscapeWidth: number): string {
  const safeWidth = Number.isFinite(physicalLandscapeWidth) ? physicalLandscapeWidth : 844;
  const scale = Math.max(0.25, Math.min(1, safeWidth / TELEVISION_VIRTUAL_WIDTH));
  const fixedScale = scale.toFixed(4);
  return `width=${TELEVISION_VIRTUAL_WIDTH}, initial-scale=${fixedScale}, minimum-scale=${fixedScale}, maximum-scale=${fixedScale}, user-scalable=no, viewport-fit=cover`;
}
