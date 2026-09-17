export interface ShipData {
  serial: number;
  pilot: string;
  posX: number;
  posY: number;
  fuel: number;
}

export interface PelletData {
  posX: number;
  posY: number;
  fuel: number;
}

function cellFor(ships: ShipData[], pellets: PelletData[], x: number, y: number): string {
  if (x === 0 && y === 0) return "*";
  const ship = ships.find((s) => s.posX === x && s.posY === y);
  if (ship) return String(ship.serial % 10);
  if (pellets.some((p) => p.posX === x && p.posY === y)) return "o";
  return ".";
}

export function renderGrid(ships: ShipData[], pellets: PelletData[]): string {
  const xs = [0, ...ships.map((s) => s.posX), ...pellets.map((p) => p.posX)];
  const ys = [0, ...ships.map((s) => s.posY), ...pellets.map((p) => p.posY)];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const columnWidth = String(maxX).length + 1;
  const lines: string[] = [];
  lines.push(" ".repeat(columnWidth - 1) + " " + Array.from({ length: maxX - minX + 1 }, (_, i) => String(minX + i).padStart(2)).join(" "));
  for (let y = maxY; y >= minY; y--) {
    const cells = Array.from({ length: maxX - minX + 1 }, (_, i) => cellFor(ships, pellets, minX + i, y).padStart(2));
    lines.push(`${String(y).padStart(columnWidth - 1)} ${cells.join(" ")}`);
  }
  if (ships.length > 0) {
    lines.push("");
    for (const ship of ships) lines.push(`Nave ${ship.serial} (${ship.pilot}): (${ship.posX},${ship.posY}) fuel ${ship.fuel}`);
  }
  if (pellets.length > 0) {
    lines.push("");
    for (const pellet of pellets) lines.push(`Pellet: (${pellet.posX},${pellet.posY}) fuel ${pellet.fuel}`);
  }
  return lines.join("\n");
}