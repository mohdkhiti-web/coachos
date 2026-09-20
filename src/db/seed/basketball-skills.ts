import {
  at,
  ball,
  coach,
  cone,
  defense,
  dribble,
  fullCourt,
  halfCourt,
  move,
  near,
  note,
  offense,
  pass,
  shot,
  xy,
  cut,
  type SeedDrill,
} from "./helpers";

/**
 * Original coaching content written for CoachOS. Generic, widely taught fundamentals expressed in our
 * own words — nothing is copied from books or websites (ARCHITECTURE.md §9.2). Reviewed content only:
 * new drills should be checked by a qualified coach before being added to the library.
 */
export const SKILL_DRILLS: SeedDrill[] = [
  {
    seedKey: "dynamic-court-warm-up",
    title: "Dynamic Court Warm-up",
    description:
      "A progressive lines warm-up that raises heart rate and prepares ankles, hips and shoulders using jogging, skips and lateral shuffles.",
    category: "warm_up",
    primarySkill: "conditioning",
    secondarySkills: ["footwork"],
    level: "beginner",
    ageMin: 8,
    ageMax: 18,
    playersMin: 6,
    playersMax: 30,
    durationMin: 6,
    durationMax: 8,
    space: "full_court",
    tags: ["warm-up", "movement", "whole team"],
    equipment: [],
    content: {
      objective:
        "Raise body temperature and rehearse the movement patterns of the session before any high-intensity work.",
      setup:
        "Players form three lines on the baseline. Each line moves in turn to the half-court line and back, so every movement covers about 14 metres and gives natural rest.",
      instructions: [
        "Easy jog to half court and walk back, arms swinging freely.",
        "High knees to half court, jog back.",
        "Butt kicks to half court, jog back.",
        "Side shuffle to half court, keeping hips low and feet from crossing; shuffle back leading with the other side.",
        "Skip with an arm swing, then two bounding strides, to half court.",
        "Finish with three build-up runs at 60%, 75% and 90% effort.",
      ],
      coachingPoints: [
        "Quality of movement over speed: tall posture, quiet feet, controlled landings.",
        "Start each movement slowly and progress the intensity across the sets.",
        "Ask players to land on the balls of their feet and soften the knees.",
      ],
      commonMistakes: [
        "Rushing the first sets so the warm-up becomes a race.",
        "Crossing feet during the shuffle, which loses balance.",
        "Slouching shoulders and looking at the floor.",
      ],
      safety:
        "Check the floor is dry and clear. Players with pain should stop and tell the coach; do not warm up through pain.",
      progressions: [
        "Add a ball to a jog-and-dribble variation once the movement patterns are clean.",
      ],
      regressions: ["Shorten the distance to the free-throw line and drop the bounding stride."],
      variations: [
        "Turn it into a follow-the-leader warm-up with a different movement chosen by each line leader.",
      ],
    },
    diagrams: [
      {
        title: "Three lines to half court",
        diagram: fullCourt(
          [
            offense("o1", "1", at("left_corner")),
            offense("o2", "2", at("under_basket")),
            offense("o3", "3", at("right_corner")),
          ],
          [
            move("a1", 1, "o1", at("left_half_court")),
            move("a2", 1, "o2", at("half_court_center")),
            move("a3", 1, "o3", at("right_half_court")),
          ],
          [note(xy(0, 15.2), "Move, then return")],
        ),
      },
    ],
  },
  {
    seedKey: "stationary-ball-handling",
    title: "Stationary Ball-Handling Series",
    description:
      "Every player has a ball and a spot. A short sequence of stationary dribbles and ball movements builds feel, wrist control and confidence.",
    category: "ball_handling",
    primarySkill: "dribbling",
    secondarySkills: ["ball_control"],
    level: "beginner",
    ageMin: 8,
    ageMax: 18,
    playersMin: 1,
    playersMax: 30,
    durationMin: 5,
    durationMax: 8,
    space: "any_space",
    tags: ["dribbling", "warm-up", "individual"],
    equipment: [{ type: "basketball", rule: "per_player", quantity: 1 }],
    content: {
      objective: "Build hand-eye coordination and a comfortable feel for the ball with both hands.",
      setup:
        "Each player finds an open spot with one ball, an arm's length from teammates. The coach stands where everyone can see and calls each exercise.",
      instructions: [
        "Pound dribble: 20 hard dribbles with the right hand, then the left, at waist height with the head up.",
        "Crossover: 20 low, quick crossovers in front of the body.",
        "Around the body: pass the ball around the waist, then the knees, then the head, for 10 seconds each.",
        "Figure eight: weave the ball in a figure eight through the legs for 20 seconds.",
        "Two-ball or tennis-ball finish (optional): catch and toss a small ball while dribbling.",
      ],
      coachingPoints: [
        "Use the finger pads, not the palm, and push the ball down rather than slapping it.",
        "Eyes up: pick a spot on the wall or watch the coach's hand signals.",
        "Stay low in a balanced athletic stance with the knees bent.",
      ],
      commonMistakes: [
        "Looking down at the ball, which prevents seeing the court later.",
        "Dribbling with a flat palm so the ball is hard to control.",
        "Standing upright and stiff instead of staying balanced and low.",
      ],
      safety: "Give players enough space so a loose ball does not strike a neighbour.",
      progressions: [
        "Add a moving element: dribble on the spot while the coach calls a colour or number to react to.",
      ],
      regressions: [
        "Allow a two-hand dribble or use slightly deflated smaller balls for the youngest players.",
      ],
      variations: ["Perform the whole series while walking slowly around the court."],
    },
    diagrams: [
      {
        title: "Own spot, own ball",
        diagram: halfCourt(
          [offense("o1", "1", at("top_key")), ball("b1", "o1")],
          [],
          [note(at("top_key", [0, 2.2]), "Head up, ball low")],
        ),
      },
    ],
  },
  {
    seedKey: "cone-weave-dribble",
    title: "Cone Weave Dribble",
    description:
      "Dribble through a line of cones with changes of direction, then finish with a controlled shot or layup at the rim.",
    category: "ball_handling",
    primarySkill: "dribbling",
    secondarySkills: ["ball_control", "decision_making"],
    level: "intermediate",
    ageMin: 9,
    ageMax: 16,
    playersMin: 2,
    playersMax: 12,
    durationMin: 8,
    durationMax: 12,
    space: "half_court",
    tags: ["dribbling", "change of direction", "cones"],
    equipment: [
      { type: "cones", rule: "fixed", quantity: 4 },
      { type: "basketball", rule: "per_player", quantity: 1 },
    ],
    content: {
      objective:
        "Change direction with the ball under control and maintain a low, protected dribble at speed.",
      setup:
        "Place four cones in a line about two metres apart running toward the basket. Players line up behind the first cone, each with a ball.",
      instructions: [
        "The first player dribbles toward the first cone with the strong hand.",
        "At each cone, plant the outside foot and change direction with a crossover, keeping the ball low.",
        "After the last cone, accelerate to the basket and finish with a layup or pull-up shot.",
        "Rebound your own shot and return to the end of the line by jogging around the outside.",
        "Start the next player once the previous one has reached the third cone.",
      ],
      coachingPoints: [
        "Change of pace as well as direction: slow into the cone, explode out of it.",
        "Protect the ball with the off-hand and the body when changing direction.",
        "Keep eyes up so the finish is seen before arriving at the basket.",
      ],
      commonMistakes: [
        "Dribbling the ball too high, giving defenders a target.",
        "Turning wide of the cone so the change of direction loses speed.",
        "Stopping the dribble early and travelling on the finish.",
      ],
      safety: "Stagger the start so dribblers do not collide, and keep the return lane clear.",
      progressions: ["Add a defender who guards passively and then actively after the last cone."],
      regressions: ["Remove the finish and dribble to the free-throw line, or use only two cones."],
      variations: [
        "Require weak-hand only through the cones, or swap in a specific move at each cone (crossover, between the legs, behind the back).",
      ],
    },
    diagrams: [
      {
        title: "Weave then finish",
        diagram: halfCourt(
          [
            cone("c1", xy(0, 9.6)),
            cone("c2", xy(0, 7.6)),
            cone("c3", xy(0, 5.6)),
            cone("c4", xy(0, 3.6)),
            offense("o1", "1", xy(0, 11.6)),
            ball("b1", "o1"),
          ],
          [
            dribble("a1", 1, "o1", xy(-1.4, 8.6), xy(1.4, 6.6), xy(-1.4, 4.6), xy(0.6, 2.6)),
            shot("a2", 2, "o1"),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "partner-passing",
    title: "Partner Chest & Bounce Passing",
    description:
      "Pairs pass to each other across a short distance to build accurate, crisp chest and bounce passes and secure two-handed catches.",
    category: "passing",
    primarySkill: "passing",
    secondarySkills: ["catching"],
    level: "beginner",
    ageMin: 7,
    ageMax: 14,
    playersMin: 2,
    playersMax: 20,
    durationMin: 6,
    durationMax: 10,
    space: "any_space",
    tags: ["passing", "pairs", "fundamentals"],
    equipment: [{ type: "basketball", rule: "per_pair", quantity: 1 }],
    content: {
      objective:
        "Deliver and receive an accurate pass to a target on time, using proper technique.",
      setup:
        "Partners face each other about four to five metres apart with one ball between them. Hands ready as a target.",
      instructions: [
        "Chest passes for one minute: step toward the target, extend both arms and snap the thumbs down through the release.",
        "Switch to bounce passes for one minute, aiming for a spot about two-thirds of the way to the partner.",
        "Add a step: pass, then move two steps to the side and receive the next pass on the move.",
        "Finish with overhead passes for 30 seconds, releasing from above the forehead.",
      ],
      coachingPoints: [
        "Give the target: show both hands to the passer before the pass leaves.",
        "Step to pass and follow through with the fingers pointing at the target.",
        "Catch with soft hands and bring the ball to the chest immediately to be ready.",
      ],
      commonMistakes: [
        "Passing with the arms only and no step, which loses accuracy and power.",
        "Catching with stiff hands and letting the ball bounce off.",
        "Throwing to where the partner is, not to where they will be.",
      ],
      safety:
        "Keep a pair at least two metres from the next pair, and use a lighter ball for the youngest players.",
      progressions: [
        "Increase the distance to six or seven metres, or add a passive defender between the partners.",
      ],
      regressions: ["Shorten the distance to three metres and slow the pace."],
      variations: [
        "Turn it into a scoring game where each clean catch counts a point, first pair to twenty wins.",
      ],
    },
    diagrams: [
      {
        title: "Chest pass exchange",
        diagram: halfCourt(
          [
            offense("o1", "1", at("left_slot")),
            offense("o2", "2", at("right_slot")),
            ball("b1", "o1"),
          ],
          [pass("a1", 1, "o1", "o2"), pass("a2", 2, "o2", "o1")],
          [note(at("top_key", [0, 2.4]), "4 to 5 metres apart")],
        ),
      },
    ],
  },
  {
    seedKey: "three-man-weave",
    title: "Three-Man Weave",
    description:
      "Three players pass and run behind the receiver down the full court, then finish with a layup: a classic drill for spacing, passing on the move and communication.",
    category: "passing",
    primarySkill: "passing",
    secondarySkills: ["cutting", "communication", "spacing"],
    level: "intermediate",
    ageMin: 12,
    ageMax: 18,
    playersMin: 3,
    playersMax: 15,
    durationMin: 10,
    durationMax: 15,
    space: "full_court",
    tags: ["passing", "transition", "layups", "groups of three"],
    equipment: [{ type: "basketball", rule: "fixed", quantity: 2 }],
    content: {
      objective:
        "Pass accurately on the move, keep even spacing across the court, and finish the break with a controlled layup.",
      setup:
        "Groups of three start on the baseline, one in each lane (left, middle, right), with the middle player holding the ball. Additional groups wait behind the baseline.",
      instructions: [
        "The middle player passes to a wing and immediately runs behind the receiver toward the wing lane.",
        "The receiver catches on the move, takes one or two dribbles toward the middle lane and passes to the far player.",
        "The passer always runs behind the pass, so the three players weave across the court.",
        "At the far end, the player who receives the last pass finishes with a layup while the other two rebound and prepare to weave back.",
        "Continue back down the court and rotate positions after each length.",
      ],
      coachingPoints: [
        "Pass ahead of the receiver so they catch in stride without slowing.",
        "Call for the ball and communicate so everyone knows where teammates are.",
        "Hold the width: keep about four to five metres between players.",
        "Run behind the pass, not in front of it, to keep the weave flowing.",
      ],
      commonMistakes: [
        "Passing behind the receiver, which forces them to stop.",
        "Bunching together instead of spreading the width of the court.",
        "Slowing the run after the pass, which breaks the rhythm of the weave.",
      ],
      safety:
        "Run the lanes one group at a time and stay clear of the baseline structure and the stage or wall behind the basket.",
      progressions: ["Add a defender at the end to finish against, or require no dribbles."],
      regressions: ["Walk through the pattern first, then jog, then increase the speed."],
      variations: ["Make the ending a jump stop and a shot instead of a layup."],
    },
    diagrams: [
      {
        title: "Weave down the court",
        diagram: fullCourt(
          [
            offense("o1", "1", xy(-4.2, -0.4)),
            offense("o2", "2", xy(0, -0.4)),
            offense("o3", "3", xy(4.2, -0.4)),
            ball("b1", "o2"),
          ],
          [
            pass("a1", 1, "o2", "o1"),
            cut("a2", 1, "o2", xy(-4.2, 7)),
            move("a3", 1, "o3", xy(4.2, 6)),
            dribble("a4", 2, "o1", xy(0, 12.5)),
            move("a5", 2, "o3", xy(4.2, 12.5)),
            pass("a6", 3, "o1", "o3"),
            cut("a7", 3, "o1", xy(4.2, 17)),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "triple-threat-pivots",
    title: "Triple-Threat Stance and Pivots",
    description:
      "Learn to catch in a balanced triple-threat stance and protect the ball with front and reverse pivots without travelling.",
    category: "footwork",
    primarySkill: "pivoting",
    secondarySkills: ["footwork", "decision_making"],
    level: "beginner",
    ageMin: 8,
    ageMax: 16,
    playersMin: 2,
    playersMax: 20,
    durationMin: 5,
    durationMax: 8,
    space: "any_space",
    tags: ["footwork", "pivoting", "fundamentals"],
    equipment: [{ type: "basketball", rule: "per_pair", quantity: 1 }],
    content: {
      objective:
        "Receive the ball balanced and pivot without travelling so the player always has the option to shoot, pass or drive.",
      setup:
        "Pairs stand about three metres apart. One player is the passer, the other is the receiver who practices the stance and pivots. Swap after each set of six.",
      instructions: [
        "Receiver catches a chest pass and lands in a balanced stance: feet shoulder-width apart, knees bent, ball on one hip.",
        "Establish a pivot foot and hold the position for a two-second count while looking at the basket.",
        "Perform a front pivot: turn toward the basket while keeping the pivot foot planted.",
        "Perform a reverse pivot: turn away from the passer while keeping the pivot foot planted.",
        "Add a defender who applies light pressure to the ball so the pivot has a purpose.",
      ],
      coachingPoints: [
        "Weight on the balls of the feet with the head up.",
        "Keep the ball protected close to the body with elbows out.",
        "The pivot foot never lifts or slides before the ball is released or dribbled.",
      ],
      commonMistakes: [
        "Lifting or dragging the pivot foot, which is a travelling violation.",
        "Bringing the ball to the chest and standing tall so the stance is not balanced.",
        "Looking down at the feet instead of scanning the court.",
      ],
      safety: "Keep the pressure light and controlled so the pivots do not become collisions.",
      progressions: [
        "Make the receiver catch on the move, jump-stop into the stance and finish with a decision: shoot, pass or dribble.",
      ],
      regressions: [
        "Start without a ball and rehearse the foot movements with the coach's demonstration.",
      ],
      variations: [
        "Make it a game: the receiver has to pivot around a cone placed on the floor to face a target.",
      ],
    },
    diagrams: [
      {
        title: "Catch, then pivot",
        diagram: halfCourt(
          [
            coach("c1", at("top_key")),
            offense("o1", "1", at("right_wing")),
            defense("x1", "X", near("o1", [-0.9, -1.1])),
            ball("b1", "c1"),
          ],
          [pass("a1", 1, "c1", "o1")],
          [note(at("right_wing", [-1.6, 2.4]), "Pivot foot stays planted")],
        ),
      },
    ],
  },
];
