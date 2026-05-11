export interface OverlayPosition {
  x: number;
  y: number;
}

export interface OverlayBroadcastLayout {
  player1Name: OverlayPosition;
  player2Name: OverlayPosition;
  player1Score: OverlayPosition;
  player2Score: OverlayPosition;
  footer: OverlayPosition;
}

export const DEFAULT_OVERLAY_BROADCAST_LAYOUT: OverlayBroadcastLayout = {
  player1Name: { x: 91, y: 497 },
  player2Name: { x: 91, y: 891 },
  player1Score: { x: 91, y: 527 },
  player2Score: { x: 91, y: 921 },
  footer: { x: 170, y: 998 },
};

const POSITION_KEYS = [
  "player1Name",
  "player2Name",
  "player1Score",
  "player2Score",
  "footer",
] as const;

type PositionKey = typeof POSITION_KEYS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePosition(
  value: unknown,
  fallback: OverlayPosition,
): OverlayPosition {
  if (!isRecord(value)) return fallback;
  const { x, y } = value;
  return {
    x: isFiniteCoordinate(x) ? x : fallback.x,
    y: isFiniteCoordinate(y) ? y : fallback.y,
  };
}

export function normalizeOverlayBroadcastLayout(value: unknown): OverlayBroadcastLayout {
  const input = isRecord(value) ? value : {};
  return POSITION_KEYS.reduce((layout, key) => {
    layout[key] = normalizePosition(input[key], DEFAULT_OVERLAY_BROADCAST_LAYOUT[key]);
    return layout;
  }, { ...DEFAULT_OVERLAY_BROADCAST_LAYOUT } as OverlayBroadcastLayout);
}

export function isOverlayBroadcastLayoutInput(value: unknown): value is Partial<Record<PositionKey, Partial<OverlayPosition>>> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, position]) => {
    if (!POSITION_KEYS.includes(key as PositionKey)) return false;
    if (!isRecord(position)) return false;
    const x = position.x;
    const y = position.y;
    return (x === undefined || isFiniteCoordinate(x)) && (y === undefined || isFiniteCoordinate(y));
  });
}
