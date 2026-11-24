/** Which side of the 3D garment faces the camera to show a print area. */
export type GarmentSide = "front" | "back" | "left" | "right";

export function areaSide(areaId: string): GarmentSide {
  if (areaId === "backNeck" || areaId === "backUpper" || areaId === "fullBack" || areaId === "hood") return "back";
  if (areaId === "leftSleeve") return "left";
  if (areaId === "rightSleeve") return "right";
  return "front";
}
