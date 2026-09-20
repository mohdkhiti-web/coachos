import {
  at,
  ball,
  coach,
  defense,
  halfCourt,
  move,
  note,
  offense,
  pass,
  shot,
  spot,
  xy,
  zone,
  cut,
  type SeedDrill,
} from "./helpers";

/** Shooting, finishing, rebounding and competition drills. Original content — see basketball-skills.ts. */
export const FINISHING_DRILLS: SeedDrill[] = [
  {
    seedKey: "form-shooting-close-range",
    title: "Form Shooting Close to the Basket",
    description:
      "Partners shoot from one to three metres using the one-hand form shot, focusing on balance, elbow alignment and a full follow-through before adding distance.",
    category: "shooting",
    primarySkill: "shooting_form",
    secondarySkills: ["ball_control"],
    level: "beginner",
    ageMin: 7,
    ageMax: 14,
    playersMin: 2,
    playersMax: 20,
    durationMin: 6,
    durationMax: 10,
    space: "half_court",
    tags: ["shooting", "form", "pairs"],
    equipment: [
      { type: "basketball", rule: "per_pair", quantity: 1 },
      { type: "hoop", rule: "fixed", quantity: 2 },
    ],
    content: {
      objective:
        "Groove a repeatable shooting motion: balanced base, elbow under the ball, and a high, relaxed follow-through.",
      setup:
        "Pairs share a basket, standing one to two metres from the rim. One player shoots while the partner rebounds and passes back. Switch after ten shots.",
      instructions: [
        "Start with the shooting foot slightly ahead, knees bent, ball in the shooting hand with the guide hand on the side.",
        "Set the elbow under the ball and pointed at the basket, eyes on the front of the rim.",
        "Extend the legs, arm and wrist in one smooth motion and hold the follow-through until the ball reaches the net.",
        "After ten makes from close range, take one big step back and repeat.",
        "Finish with ten free throws from the line, focusing on the same routine.",
      ],
      coachingPoints: [
        "Balance first: shoulders square, feet under the shoulders.",
        "The guide hand steadies the ball but does not push it.",
        "Hold the follow-through like reaching into a cookie jar so the wrist snaps down.",
        "Aim for arc: the ball should enter the basket from above, not flat.",
      ],
      commonMistakes: [
        "Pushing the ball from the chest instead of lifting it through the shooting pocket.",
        "The elbow flaring out, which sends the shot sideways.",
        "Dropping the follow-through immediately after release.",
      ],
      safety:
        "Shooters and rebounders stay out of each other's landing area, and only one ball per basket at a time.",
      progressions: [
        "Move to the elbow and wing positions, add a catch-and-shoot from a partner's pass.",
      ],
      regressions: [
        "Use a smaller ball or lower rim, and start with one-handed shooting into a target on the wall.",
      ],
      variations: [
        "Shoot with the eyes closed on the follow-through for three shots to build muscle memory of the motion.",
      ],
    },
    diagrams: [
      {
        title: "Feed and shoot",
        diagram: halfCourt(
          [offense("o1", "1", xy(0, 2.4)), offense("o2", "2", xy(2.7, 2.0)), ball("b1", "o2")],
          [pass("a1", 1, "o2", "o1"), shot("a2", 2, "o1")],
          [note(xy(0, 4.6), "Close range: 1 to 3 m")],
        ),
      },
    ],
  },
  {
    seedKey: "five-spot-shooting",
    title: "Five-Spot Shooting",
    description:
      "Shoot from five spots around the arc, moving to the next spot after a set number of makes, to build catch-and-shoot rhythm and shooting stamina.",
    category: "shooting",
    primarySkill: "shooting_form",
    secondarySkills: ["conditioning", "decision_making"],
    level: "intermediate",
    ageMin: 10,
    ageMax: 18,
    playersMin: 1,
    playersMax: 10,
    durationMin: 10,
    durationMax: 15,
    space: "half_court",
    tags: ["shooting", "spot shooting", "rhythm"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "hoop", rule: "fixed", quantity: 1 },
      { type: "markers", rule: "fixed", quantity: 5 },
    ],
    content: {
      objective:
        "Shoot with the same balanced form from different spots, and move efficiently between them.",
      setup:
        "Place markers at the two corners, two wings and the top of the arc. Groups of two or three: one shoots, one rebounds, one gets ready as the passer.",
      instructions: [
        "The shooter starts at the left corner and takes five shots, moving to the next spot immediately after each attempt.",
        "Rebounders return the ball to the passer, who feeds the shooter on the move to keep the rhythm.",
        "The shooter records makes and moves clockwise around the five spots for one lap.",
        "Rotate roles after each lap and compare totals to track improvement week to week.",
        "Finish with a final round of five shots from the spot the player likes best.",
      ],
      coachingPoints: [
        "Get feet ready before the ball arrives: hop into the shot with the knees already bent.",
        "Same form on every spot; do not rush the mechanics because the drill is timed.",
        "Call for the ball with a target hand and finish every shot with a full follow-through.",
      ],
      commonMistakes: [
        "Catching, then dipping the ball low before shooting, which wastes time.",
        "Squaring up late so the shooting base is unbalanced.",
        "Chasing missed shots instead of resetting to the next spot.",
      ],
      safety:
        "Keep the rebounders out of the shooter's path, and only start feeding once the shooter is set.",
      progressions: [
        "Add a closeout defender at each spot, or require a shot fake and one dribble before shooting.",
      ],
      regressions: ["Reduce to three spots and shoot from closer to the basket."],
      variations: ["Play it as a competition: first player to 25 total makes wins."],
    },
    diagrams: [
      {
        title: "Five spots around the arc",
        diagram: halfCourt(
          [
            spot("m1", at("left_corner"), "1"),
            spot("m2", at("left_wing"), "2"),
            spot("m3", at("top_key"), "3"),
            spot("m4", at("right_wing"), "4"),
            spot("m5", at("right_corner"), "5"),
            offense("o1", "S", at("left_corner", [0.9, 1.2])),
            ball("b1", "o1"),
          ],
          [
            shot("a1", 1, "o1"),
            move(
              "a2",
              2,
              "o1",
              at("left_wing", [0.9, 1.2]),
              at("top_key", [0, 1.2]),
              at("right_wing", [-0.9, 1.2]),
              at("right_corner", [-0.9, 1.2]),
            ),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "mikan-drill",
    title: "Mikan Drill",
    description:
      "Continuous alternating layups under the basket with a soft touch off the backboard build finishing touch with both hands and footwork under the rim.",
    category: "finishing",
    primarySkill: "finishing",
    secondarySkills: ["footwork", "ball_control"],
    level: "beginner",
    ageMin: 8,
    ageMax: 16,
    playersMin: 1,
    playersMax: 12,
    durationMin: 3,
    durationMax: 5,
    space: "half_court",
    tags: ["layups", "finishing", "touch"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "hoop", rule: "fixed", quantity: 1 },
    ],
    content: {
      objective:
        "Finish softly around the basket with either hand while staying balanced and keeping the ball high.",
      setup:
        "Players line up on one side of the basket. The first player starts under the rim to one side of the basket with a ball.",
      instructions: [
        "Step with the outside foot and shoot a right-hand layup off the backboard.",
        "Catch the ball as it drops through the net without letting it bounce.",
        "Step across the basket and shoot a left-hand layup off the backboard from the other side.",
        "Continue alternating for 30 seconds or a set number of makes, keeping the ball above the shoulders.",
        "Rotate to the next player and go to the end of the line.",
      ],
      coachingPoints: [
        "Use the backboard: aim for a small square above the rim on the near side.",
        "Finger-roll or lay the ball up softly rather than throwing it.",
        "Keep the ball high between shots and catch it above the head to avoid a low dip.",
      ],
      commonMistakes: [
        "Dropping the ball to the waist between shots and wasting time.",
        "Jumping away from the basket instead of going straight up.",
        "Using the wrong hand: right-hand layup off the right side, left off the left.",
      ],
      safety: "Only one shooter under the basket; other players wait at least three metres away.",
      progressions: ["Add a second ball or count makes in 30 seconds to make it a challenge."],
      regressions: ["Shoot one layup at a time, resetting the feet between each attempt."],
      variations: ["Perform the drill using only the weak hand for the second round."],
    },
    diagrams: [
      {
        title: "Alternate sides under the rim",
        diagram: halfCourt(
          [offense("o1", "1", at("under_basket", [-1.0, 0.9])), ball("b1", "o1")],
          [
            shot("a1", 1, "o1"),
            move("a2", 2, "o1", at("under_basket", [1.0, 0.9])),
            shot("a3", 3, "o1"),
          ],
          [note(xy(0, 3.3), "Right hand, then left hand")],
        ),
      },
    ],
  },
  {
    seedKey: "pass-and-cut-layups",
    title: "Pass-and-Cut Layup Lines",
    description:
      "Players pass to a coach at the top, cut to the basket, receive the return pass and finish with a layup. A game-like way to practice finishing in rhythm.",
    category: "finishing",
    primarySkill: "finishing",
    secondarySkills: ["cutting", "passing"],
    level: "beginner",
    ageMin: 8,
    ageMax: 14,
    playersMin: 6,
    playersMax: 16,
    durationMin: 10,
    durationMax: 15,
    space: "half_court",
    tags: ["layups", "give and go", "lines"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "hoop", rule: "fixed", quantity: 1 },
    ],
    content: {
      objective:
        "Finish at the basket after a pass-and-cut sequence, with the footwork and timing of a real game situation.",
      setup:
        "One line forms on the left wing with a ball. A coach or a designated passer stands at the top of the key. The rebounder waits under the basket.",
      instructions: [
        "The first player in line passes the ball to the passer at the top of the key.",
        "Immediately cut hard toward the basket, showing the inside hand as a target.",
        "Catch the return pass in stride, take two steps and lay the ball off the backboard.",
        "Rebound your own shot and pass to the next player in line, then join the end of the line.",
        "Switch to the right side after a set number of turns.",
      ],
      coachingPoints: [
        "Cut sharply: a change of pace makes the cut more realistic.",
        "Receive the pass in front of the body with two hands, then step into the layup.",
        "Take off from the foot opposite the shooting hand and jump up, not out.",
      ],
      commonMistakes: [
        "Passing and then walking, so the return pass arrives after the cut.",
        "Taking too many steps before the layup.",
        "Finishing with the wrong hand on the wrong side.",
      ],
      safety:
        "Rebounders stay clear of the cutter, and lines are spaced so nobody runs into the waiting group.",
      progressions: ["Add a defender who plays passively behind the cutter, then actively."],
      regressions: ["Have the coach roll the ball to the cutter so they catch it on one bounce."],
      variations: [
        "Run the drill from the right side, or change the finish to a jump stop and shot.",
      ],
    },
    diagrams: [
      {
        title: "Pass, cut, receive, finish",
        diagram: halfCourt(
          [
            offense("o1", "1", at("left_wing")),
            offense("o2", "2", at("left_wing", [-0.9, 1.1])),
            coach("c1", at("top_key")),
            ball("b1", "o1"),
          ],
          [
            pass("a1", 1, "o1", "c1"),
            cut("a2", 1, "o1", xy(-1.3, 3.0)),
            pass("a3", 2, "c1", "o1"),
            shot("a4", 3, "o1"),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "box-out-pairs",
    title: "Box-Out and Rebound Pairs",
    description:
      "Defenders find their opponent, make contact and seal them off the basket before securing the rebound of a shot taken by the coach.",
    category: "rebounding",
    primarySkill: "boxing_out",
    secondarySkills: ["rebounding", "competitiveness"],
    level: "intermediate",
    ageMin: 10,
    ageMax: 18,
    playersMin: 4,
    playersMax: 12,
    durationMin: 8,
    durationMax: 10,
    space: "half_court",
    tags: ["rebounding", "boxing out", "defense"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "hoop", rule: "fixed", quantity: 1 },
    ],
    content: {
      objective:
        "Make contact first, seal the opponent away from the basket, then pursue the ball with two hands.",
      setup:
        "Pairs stand in the paint: an offensive player on the block and a defender between them and the basket. The coach stands at the free-throw line with the ball.",
      instructions: [
        "On the coach's shot, the defender turns and finds the offensive player, making contact with the forearm and back.",
        "Hold the seal with a wide base and bent knees, feeling the opponent with the back and hands.",
        "Only after the ball hits the rim, go get it with two hands and land with a wide base.",
        "Secure the rebound with the chin tucked and elbows out, then outlet or pivot to protect it.",
        "Swap roles after every rebound and keep score of secured rebounds.",
      ],
      coachingPoints: [
        "Find your opponent before the shot leaves the coach's hand.",
        "Contact first, then rebound: never watch the ball while the offensive player slides around.",
        "Go to the ball with two hands at the highest point.",
      ],
      commonMistakes: [
        "Watching the shot and losing sight of the opponent.",
        "Standing tall with no base, so the offensive player pushes through.",
        "Leaping to the ball too early and letting the offensive player in.",
      ],
      safety:
        "Contact stays controlled: forearm and back only, no pushing, holding or grabbing shirts.",
      progressions: [
        "Add a second offensive player who crashes from the wing, or play live 2-on-2 with a box-out requirement.",
      ],
      regressions: [
        "Have the coach roll the ball so the box-out is practiced without a rebound contest.",
      ],
      variations: [
        "Award two points for a rebound after a successful box-out and one point for any other rebound.",
      ],
    },
    diagrams: [
      {
        title: "Seal, then rebound",
        diagram: halfCourt(
          [
            coach("c1", at("free_throw_line")),
            offense("o1", "O", at("right_block")),
            defense("x1", "X", xy(1.7, 1.0)),
            ball("b1", "c1"),
          ],
          [shot("a1", 1, "c1"), move("a2", 2, "x1", xy(2.05, 1.55))],
          [zone(xy(-1.5, -0.9), xy(1.5, 1.6), "Rebound zone")],
        ),
      },
    ],
  },
  {
    seedKey: "free-throw-pressure-ladder",
    title: "Free-Throw Pressure Ladder",
    description:
      "Players shoot free throws in a game-like sequence where each make earns a step up the ladder and each miss sends the shooter back, adding pressure to the routine.",
    category: "competition",
    primarySkill: "free_throws",
    secondarySkills: ["competitiveness", "shooting_form"],
    level: "intermediate",
    ageMin: 11,
    ageMax: 18,
    playersMin: 2,
    playersMax: 12,
    durationMin: 10,
    durationMax: 15,
    space: "half_court",
    tags: ["free throws", "pressure", "competition"],
    equipment: [
      { type: "basketball", rule: "per_pair", quantity: 1 },
      { type: "hoop", rule: "fixed", quantity: 2 },
    ],
    content: {
      objective:
        "Repeat a calm free-throw routine while under the pressure of a scoreboard and teammates watching.",
      setup:
        "Pairs at each basket. Each player builds a three-step routine (breath, bounce, shoot) and shoots in turn. The coach records the ladder on a whiteboard.",
      instructions: [
        "Rung one: shoot two free throws. Make both to climb to rung two.",
        "Rung two: shoot two free throws again, but the shooter must have the same routine and stance as the first rung.",
        "Continue up to rung five. A miss drops the shooter one rung and their partner shoots.",
        "First player to complete rung five and make the finishing pair wins the round.",
        "Debrief: ask each player how the routine changed under pressure and how they reset.",
      ],
      coachingPoints: [
        "The routine matters more than the makes: same breath, same bounce, same target.",
        "Use a cue word (for example 'smooth') to keep the mind quiet.",
        "Follow through on every shot, even when nervous.",
      ],
      commonMistakes: [
        "Rushing the routine after a miss.",
        "Changing the shooting form to try to force the ball in.",
        "Watching the ball instead of the front of the rim.",
      ],
      safety: "Rebounders wait outside the lane until the shooter releases the ball.",
      progressions: ["Shoot after a short sprint to simulate fatigue at the end of a game."],
      regressions: ["Reduce to three rungs and let each rung be only one shot."],
      variations: ["Play in teams with a shared ladder so teammates cheer each other on."],
    },
    diagrams: [
      {
        title: "Shooter and waiting players",
        diagram: halfCourt(
          [
            offense("o1", "1", at("free_throw_line", [0, 0.9])),
            offense("o2", "2", at("left_elbow", [-1.4, 1.6])),
            offense("o3", "3", at("right_elbow", [1.4, 1.6])),
            ball("b1", "o1"),
          ],
          [shot("a1", 1, "o1")],
          [note(at("top_key", [0, 1.4]), "Same routine every time")],
        ),
      },
    ],
  },
];
