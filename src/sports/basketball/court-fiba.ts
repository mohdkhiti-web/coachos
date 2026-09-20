import type { CourtPack, CourtPrimitive, Pt } from "@/engines/diagram";

/**
 * FIBA basketball court pack (ARCHITECTURE.md §10.3).
 *
 * Coordinates are metres. Origin = centre of the basket; +y runs from the basket toward the halfway
 * line; +x is screen-right. Viewed from above with the basket at the top, so an offensive player
 * facing the basket has their left on screen-left.
 *
 * SOURCE. Dimensions cross-checked (2026-09-20) against the published summary of the FIBA
 * "Official Basketball Rules 2024" (Wikipedia, "Basketball court"). Items are listed as verified or
 * unverified below rather than asserted. Nothing here is a substitute for the rulebook — check the
 * official text before using the drawings for regulatory or marketing purposes. (§15.2)
 */

const HALF_WIDTH = 7.5; //  court width 15 m
const BASELINE = -1.575; // basket centre is 1.575 m from the inner edge of the baseline
const HALF_LINE = 12.425; // half of 28 m, measured from the baseline, minus 1.575
const FAR_BASKET_Y = 2 * HALF_LINE; // basket at the other end (24.85)
const FREE_THROW_Y = 5.8 + BASELINE; // free-throw line is 5.80 m from the baseline
const LANE_HALF = 2.45; // lane (restricted area) 4.90 m wide
const ARC_R = 6.75; // three-point arc radius from the basket centre
const CORNER_X = 6.6; // corner lines 0.90 m from the sideline
const CORNER_Y = Math.sqrt(ARC_R ** 2 - CORNER_X ** 2); // where the arc meets the corner lines
const RESTRICTED_R = 1.25;
const CIRCLE_R = 1.8; // free-throw circle and centre circle
const BACKBOARD_Y = BASELINE + 1.2; // backboard face 1.20 m from the baseline
const RIM_R = 0.225; // 0.45 m inner diameter

const f = (v: number) => Number(v.toFixed(4));

/** Markings around ONE basket at the origin, with the baseline at y = BASELINE. */
function endMarkings(transform?: string): CourtPrimitive[] {
  const p = (d: string, stroke: CourtPrimitive["stroke"] = "line"): CourtPrimitive => ({
    d,
    stroke,
    transform,
  });
  return [
    p(`M ${-LANE_HALF} ${BASELINE} H ${LANE_HALF} V ${f(FREE_THROW_Y)} H ${-LANE_HALF} Z`),
    p(
      `M ${-CIRCLE_R} ${f(FREE_THROW_Y)} A ${CIRCLE_R} ${CIRCLE_R} 0 0 0 ${CIRCLE_R} ${f(FREE_THROW_Y)}`,
    ),
    p(
      `M ${-CIRCLE_R} ${f(FREE_THROW_Y)} A ${CIRCLE_R} ${CIRCLE_R} 0 0 1 ${CIRCLE_R} ${f(FREE_THROW_Y)}`,
      "dashed",
    ),
    p(
      `M ${-CORNER_X} ${BASELINE} V ${f(CORNER_Y)} A ${ARC_R} ${ARC_R} 0 0 0 ${CORNER_X} ${f(CORNER_Y)} V ${BASELINE}`,
    ),
    p(
      `M ${-RESTRICTED_R} ${f(BACKBOARD_Y)} V 0 A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 0 ${RESTRICTED_R} 0 V ${f(BACKBOARD_Y)}`,
    ),
    p(`M -0.9 ${f(BACKBOARD_Y)} H 0.9`),
    p(`M 0 ${f(BACKBOARD_Y)} V ${-RIM_R}`),
    p(`M ${-RIM_R} 0 A ${RIM_R} ${RIM_R} 0 1 0 ${RIM_R} 0 A ${RIM_R} ${RIM_R} 0 1 0 ${-RIM_R} 0`),
  ];
}

/**
 * Named positions: coaching conventions for drawing, NOT rule-book measurements. Players are placed
 * just outside the three-point line where the convention says so.
 */
const NEAR_ANCHORS: Record<string, Pt> = {
  basket: { x: 0, y: 0 },
  under_basket: { x: 0, y: -0.9 },
  free_throw_line: { x: 0, y: FREE_THROW_Y },
  top_key: { x: 0, y: 7.4 },
  left_elbow: { x: -LANE_HALF, y: FREE_THROW_Y },
  right_elbow: { x: LANE_HALF, y: FREE_THROW_Y },
  left_block: { x: -LANE_HALF - 0.1, y: 1.7 },
  right_block: { x: LANE_HALF + 0.1, y: 1.7 },
  left_short_corner: { x: -4.5, y: -0.2 },
  right_short_corner: { x: 4.5, y: -0.2 },
  left_wing: { x: -5.13, y: 5.13 },
  right_wing: { x: 5.13, y: 5.13 },
  left_slot: { x: -2.77, y: 6.7 },
  right_slot: { x: 2.77, y: 6.7 },
  left_corner: { x: -7.05, y: -0.4 },
  right_corner: { x: 7.05, y: -0.4 },
  half_court_center: { x: 0, y: 11.9 },
  left_half_court: { x: -5, y: 11.9 },
  right_half_court: { x: 5, y: 11.9 },
};

// The far end is the near end rotated 180°, so "left" stays left from the attacking team's point of view
// (their left is screen-right when they attack the far basket). Court markings are symmetric in x, so the
// far-end drawing can simply be flipped vertically.
const mirror = (name: string, p: Pt): [string, Pt] => [
  `far_${name}`,
  { x: f(-p.x), y: f(FAR_BASKET_Y - p.y) },
];

const FULL_ANCHORS: Record<string, Pt> = {
  ...NEAR_ANCHORS,
  ...Object.fromEntries(
    Object.entries(NEAR_ANCHORS)
      .filter(([k]) => !k.endsWith("half_court") && k !== "half_court_center")
      .map(([k, p]) => mirror(k, p)),
  ),
  center_circle: { x: 0, y: HALF_LINE },
  left_sideline_center: { x: -7.0, y: HALF_LINE },
  right_sideline_center: { x: 7.0, y: HALF_LINE },
};

const SOURCE = {
  name: "FIBA Official Basketball Rules 2024 (dimensions cross-checked 2026-09-20 against a published summary)",
  verified: [
    "Court 28 m × 15 m",
    "Three-point arc radius 6.75 m from the basket centre",
    "Corner three-point lines 6.60 m from the court centre line (0.90 m from the sideline)",
    "Lane (restricted area) 4.90 m wide",
    "Restricted-area arc radius 1.25 m",
    "Centre circle 3.60 m diameter",
    "Free-throw line 4.60 m from the point on the floor below the backboard face",
  ],
  unverified: [
    "Basket centre 1.575 m from the inner edge of the baseline",
    "Backboard 1.80 m wide, face 1.20 m from the baseline",
    "Free-throw circle radius 1.80 m",
    "Rim inner diameter 0.45 m",
    "Restricted-area connector lines 0.375 m long",
    "Named anchors are coaching conventions for drawing, not rule-book measurements",
  ],
} as const;

const ACTIONS = ["pass", "cut", "move", "dribble", "screen", "shot"] as const;

export const FIBA_HALF_COURT: CourtPack = {
  id: "basketball.fiba.half",
  label: "Half basketball court (FIBA)",
  bounds: { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: BASELINE, maxY: HALF_LINE },
  margin: 0.9,
  tolerance: 0.6,
  anchors: NEAR_ANCHORS,
  primaryTarget: { x: 0, y: 0 },
  primitives: [
    {
      d: `M ${-HALF_WIDTH} ${BASELINE} H ${HALF_WIDTH} V ${HALF_LINE} H ${-HALF_WIDTH} Z`,
      stroke: "line",
    },
    // centre-circle half toward the basket (the other half belongs to the far court)
    {
      d: `M ${-CIRCLE_R} ${HALF_LINE} A ${CIRCLE_R} ${CIRCLE_R} 0 0 1 ${CIRCLE_R} ${HALF_LINE}`,
      stroke: "line",
    },
    ...endMarkings(),
  ],
  actions: ACTIONS,
  source: SOURCE,
};

export const FIBA_FULL_COURT: CourtPack = {
  id: "basketball.fiba.full",
  label: "Full basketball court (FIBA)",
  bounds: { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: BASELINE, maxY: HALF_LINE * 2 - BASELINE },
  margin: 0.9,
  tolerance: 0.6,
  anchors: FULL_ANCHORS,
  primaryTarget: { x: 0, y: 0 },
  primitives: [
    {
      d: `M ${-HALF_WIDTH} ${BASELINE} H ${HALF_WIDTH} V ${f(HALF_LINE * 2 - BASELINE)} H ${-HALF_WIDTH} Z`,
      stroke: "line",
    },
    { d: `M ${-HALF_WIDTH} ${HALF_LINE} H ${HALF_WIDTH}`, stroke: "line" },
    {
      d: `M ${-CIRCLE_R} ${HALF_LINE} A ${CIRCLE_R} ${CIRCLE_R} 0 1 0 ${CIRCLE_R} ${HALF_LINE} A ${CIRCLE_R} ${CIRCLE_R} 0 1 0 ${-CIRCLE_R} ${HALF_LINE}`,
      stroke: "line",
    },
    ...endMarkings(),
    ...endMarkings(`translate(0 ${f(FAR_BASKET_Y)}) scale(1 -1)`),
  ],
  actions: ACTIONS,
  source: SOURCE,
};

/** Exposed for tests: the geometry constants the drawings are built from. */
export const FIBA_DIMENSIONS = {
  courtLength: 28,
  courtWidth: 15,
  arcRadius: ARC_R,
  cornerLineFromCentre: CORNER_X,
  laneWidth: LANE_HALF * 2,
  restrictedArcRadius: RESTRICTED_R,
  centreCircleRadius: CIRCLE_R,
  freeThrowLineFromBaseline: FREE_THROW_Y - BASELINE,
} as const;
