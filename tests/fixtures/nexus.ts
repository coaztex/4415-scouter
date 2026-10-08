// Synthetic provider-shaped fixtures, authored for normalization tests.
export const nexusAssignments = { "101": "A1", "202": "A2" };
export const nexusAssignmentArray = [
  { teamNumber: 101, pitLabel: "A1" },
  { team: "202", pit: "A2" },
];
export const nexusWrappedAssignments = { pits: nexusAssignmentArray };
export const nexusFullMap = {
  size: { x: 800, y: 600 },
  pits: {
    A1: { position: { x: 10, y: 20 }, size: { x: 80, y: 80 }, team: "101" },
    A2: { position: { x: 100, y: 20 }, size: { x: 80, y: 80 }, team: "202" },
    A3: { position: { x: 190, y: 20 }, size: { x: 80, y: 80 } },
  },
  walls: { w1: { position: { x: 0, y: 0 }, size: { x: 800, y: 5 } } },
  areas: {
    a1: {
      label: "Pit admin",
      position: { x: 300, y: 100 },
      size: { x: 80, y: 40 },
    },
  },
  labels: { l1: { label: "Exit", position: { x: 700, y: 500 } } },
  arrows: {
    r1: { position: { x: 700, y: 450 }, size: { x: 20, y: 40 }, angle: 90 },
    r2: { position: { x: 650, y: 450 }, size: { x: 20, y: 40 } },
  },
};
export const nexusMalformedOptionalMap = {
  ...nexusFullMap,
  walls: {
    good: nexusFullMap.walls.w1,
    bad: { position: { x: "unknown", y: 0 } },
  },
  areas: "unavailable",
  labels: { bad: { label: "Exit", position: { x: Infinity, y: 0 } } },
  arrows: null,
};
export const nexusMissingMap = null;
