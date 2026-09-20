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
  screen,
  shot,
  spot,
  xy,
  cut,
  type SeedDrill,
} from "./helpers";

/** Defence, team play, transition and conditioning drills. Original content — see basketball-skills.ts. */
export const TEAM_DRILLS: SeedDrill[] = [
  {
    seedKey: "defensive-slide-zigzag",
    title: "Defensive Slide Zig-Zag",
    description:
      "Defenders slide through a zig-zag of cones in a low stance, changing direction with quick, controlled steps and keeping their chest facing forward.",
    category: "individual_defense",
    primarySkill: "on_ball_defense",
    secondarySkills: ["footwork", "speed_agility"],
    level: "beginner",
    ageMin: 9,
    ageMax: 16,
    playersMin: 1,
    playersMax: 10,
    durationMin: 6,
    durationMax: 10,
    space: "half_court",
    tags: ["defense", "slides", "stance", "agility"],
    equipment: [{ type: "cones", rule: "fixed", quantity: 4 }],
    content: {
      objective:
        "Move laterally in a balanced defensive stance without crossing the feet and change direction without standing up.",
      setup:
        "Place four cones in a zig-zag pattern about two and a half metres apart, alternating sides of the lane. Players line up behind the first cone in a defensive stance.",
      instructions: [
        "Start in a low stance: feet wider than the shoulders, knees bent, hands active and chest up.",
        "Slide to the first cone with quick, short steps, pushing off the trail foot without crossing the feet.",
        "At the cone, drop the lead foot, pivot and push off in the opposite direction with a drop step.",
        "Continue through all four cones, then sprint back on the outside to the start.",
        "Repeat for a fixed time, with rest equal to the work time.",
      ],
      coachingPoints: [
        "Stay low: hips down, back straight, head up.",
        "Push off the inside foot rather than reaching with the lead foot.",
        "Active hands: one high on the ball, one low in the passing lane.",
        "Change direction with the drop step, not by turning the hips or crossing the feet.",
      ],
      commonMistakes: [
        "Crossing the feet, which loses balance and speed.",
        "Standing up at each change of direction.",
        "Letting the heels touch when sliding, which slows the movement.",
      ],
      safety:
        "Space lines so players do not collide when returning, and stop if a player feels knee or ankle pain.",
      progressions: ["Add a ball handler to mirror, or a coach pointing directions to react to."],
      regressions: [
        "Reduce the distance between the cones and slow the pace until the footwork is clean.",
      ],
      variations: [
        "Time each player through the sequence and encourage them to beat their own best.",
      ],
    },
    diagrams: [
      {
        title: "Slide through the zig-zag",
        diagram: halfCourt(
          [
            cone("c1", xy(-3, 10.4)),
            cone("c2", xy(3, 8.4)),
            cone("c3", xy(-3, 6.4)),
            cone("c4", xy(3, 4.4)),
            defense("x1", "X", xy(0, 11.6)),
          ],
          [move("a1", 1, "x1", xy(-2.4, 10.3), xy(2.4, 8.3), xy(-2.4, 6.3), xy(2.4, 4.3))],
        ),
      },
    ],
  },
  {
    seedKey: "closeout-and-contain",
    title: "Closeout and Contain",
    description:
      "From a help position in the paint, defenders sprint to close out on a wing shooter with control, then contain the drive.",
    category: "individual_defense",
    primarySkill: "closeouts",
    secondarySkills: ["on_ball_defense", "footwork"],
    level: "intermediate",
    ageMin: 12,
    ageMax: 18,
    playersMin: 3,
    playersMax: 12,
    durationMin: 8,
    durationMax: 12,
    space: "half_court",
    tags: ["defense", "closeout", "1-on-1"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "hoop", rule: "fixed", quantity: 1 },
    ],
    content: {
      objective: "Close out under control, take away the shot, and stay in front on the drive.",
      setup:
        "A passer stands at the top of the key with a ball. An offensive player waits on the wing. The defender starts in a help position near the lane on the same side.",
      instructions: [
        "The passer swings the ball to the wing. The defender sprints toward the shooter as the pass is made.",
        "Two steps before arriving, shorten the steps and chop the feet to break down into a balanced stance.",
        "Arrive with one hand high to contest the shot and the other low; the lead foot is inside the shooter's.",
        "If the shooter drives, slide with the dribbler and contain them without reaching until they pick up the ball.",
        "Play live until a score, a stop or a turnover, then rotate players.",
      ],
      coachingPoints: [
        "Sprint, then chop: fast at the start, controlled at the finish.",
        "Take away the shot and force the offensive player toward help, not the baseline.",
        "Keep the weight on the balls of the feet and the hips low.",
      ],
      commonMistakes: [
        "Flying by the shooter because of no controlled finish.",
        "Jumping at the shot and getting beaten off the dribble.",
        "Standing straight up with the arms low at the end of the closeout.",
      ],
      safety:
        "The shooter lands with space to spare; defenders do not close out with a leap or step under the shooter's landing area.",
      progressions: [
        "Add a second offensive player on the opposite wing so the defender must also read the next pass.",
      ],
      regressions: ["Walk through the closeout without live offence, then add the shooter."],
      variations: ["Make the rule that the offensive player only gets three dribbles to score."],
    },
    diagrams: [
      {
        title: "Sprint, chop, contain",
        diagram: halfCourt(
          [
            coach("c1", at("top_key")),
            offense("o1", "1", at("left_wing")),
            defense("x1", "X", at("left_block", [1.0, 0.7])),
            ball("b1", "c1"),
          ],
          [
            pass("a1", 1, "c1", "o1"),
            move("a2", 1, "x1", xy(-4.1, 4.3)),
            dribble("a3", 2, "o1", xy(-3.4, 2.6)),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "give-and-go",
    title: "Give-and-Go (Pass and Cut)",
    description:
      "Pass to a teammate and cut hard to the basket to receive the return pass. This is the foundation of moving without the ball against a defender.",
    category: "team_offense",
    primarySkill: "cutting",
    secondarySkills: ["passing", "spacing", "decision_making"],
    level: "beginner",
    ageMin: 9,
    ageMax: 15,
    playersMin: 4,
    playersMax: 12,
    durationMin: 8,
    durationMax: 12,
    space: "half_court",
    tags: ["cutting", "2-on-2", "spacing", "fundamentals"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "bibs", rule: "fixed", quantity: 4 },
    ],
    content: {
      objective:
        "Use a pass and a sharp cut to create a scoring chance against a defender who is watching the ball.",
      setup:
        "Groups of four play 2-on-2 on one basket. One offensive player starts at the top of the key with the ball, the other on the wing. Each has a defender.",
      instructions: [
        "The ball handler passes to the wing player.",
        "Immediately cut toward the basket, going behind or in front of the defender depending on where they look.",
        "The wing player passes back to the cutter early, leading them toward the basket.",
        "The cutter catches in stride and finishes with a layup.",
        "Start with passive defenders and progress to live defence once the timing is clear.",
      ],
      coachingPoints: [
        "Fake one way, then cut the other: use the defender's attention against them.",
        "Cut hard with the hands up as a target, then stop the cut if the pass is not there.",
        "The passer sees the cutter before releasing the ball and leads them to the basket.",
      ],
      commonMistakes: [
        "Passing and standing still, so there is no cut.",
        "Cutting in front of the passer so the pass path is blocked.",
        "Passing late after the cutter has already gone.",
      ],
      safety:
        "Use passive defence at first to avoid collisions at the cut, and keep the lane clear.",
      progressions: [
        "Add a third defender (help defence) so the cutter must read and use a different pass.",
      ],
      regressions: ["Perform without defenders, focusing on timing and footwork of the cut."],
      variations: [
        "Start the give-and-go from the wing and cut to the corner or the opposite block.",
      ],
    },
    diagrams: [
      {
        title: "Pass, cut, return pass",
        diagram: halfCourt(
          [
            offense("o1", "1", at("top_key")),
            offense("o2", "2", at("left_wing")),
            defense("x1", "X1", near("o1", [0.2, -1.1])),
            defense("x2", "X2", near("o2", [0.6, -1.0])),
            ball("b1", "o1"),
          ],
          [
            pass("a1", 1, "o1", "o2"),
            cut("a2", 1, "o1", xy(-1.2, 3.6)),
            pass("a3", 2, "o2", "o1"),
            shot("a4", 3, "o1"),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "ball-screen-2v2",
    title: "Ball Screen 2-on-2",
    description:
      "A ball handler and a screener use an on-ball screen against two defenders, practising the screen, the use of the screen and the roll to the basket.",
    category: "team_offense",
    primarySkill: "screening",
    secondarySkills: ["decision_making", "spacing", "communication"],
    level: "advanced",
    ageMin: 14,
    ageMax: 18,
    playersMin: 4,
    playersMax: 12,
    durationMin: 10,
    durationMax: 15,
    space: "half_court",
    tags: ["pick and roll", "screening", "2-on-2", "reads"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "bibs", rule: "fixed", quantity: 4 },
    ],
    content: {
      objective:
        "Set a legal, effective ball screen, use it patiently, and read the defence to decide between scoring, passing or rolling.",
      setup:
        "Groups of four play live 2-on-2 from the top of the key. The ball handler starts at the top, the screener at the elbow, each with a defender.",
      instructions: [
        "The screener sprints to the ball handler's defender and sets a stationary, wide screen, feet planted and arms in.",
        "The ball handler waits for the screen, then uses it by dribbling off the screener's shoulder, staying close to it.",
        "Read the defence: if the screener's defender steps up, pass to the roller; if the defenders switch, attack the mismatch.",
        "The screener rolls to the basket after the screen, turning to face the ball with a hand up as a target.",
        "Finish with a shot, layup or pass to the open player. Rotate roles after each possession.",
      ],
      coachingPoints: [
        "Set the screen with the body still, not moving; contact should be firm but legal.",
        "The ball handler must set up the screen with a fake or a change of pace before using it.",
        "Roll with the chest facing the ball and hands ready as a target.",
        "Communicate: talk about the screen ('screen left') so defenders and teammates react quickly.",
      ],
      commonMistakes: [
        "Setting a moving screen, which is a foul.",
        "The ball handler using the screen too early so the defender is not delayed.",
        "Rolling with the back to the ball, so the screener cannot catch a pass.",
      ],
      safety:
        "Teach screeners to set with the arms tucked close, and check that players are balanced to avoid injuries during contact.",
      progressions: [
        "Add a third defender helping from the weak side, so the ball handler reads two defenders.",
      ],
      regressions: [
        "Practice the screen and roll against no defence first, then add one defender.",
      ],
      variations: ["Set the screen on the wing or from a side angle to change the read."],
    },
    diagrams: [
      {
        title: "Screen, use, roll, finish",
        diagram: halfCourt(
          [
            offense("o1", "1", at("top_key")),
            offense("o2", "2", at("right_elbow")),
            defense("x1", "X1", near("o1", [0, -1.1])),
            defense("x2", "X2", near("o2", [-0.3, -1.1])),
            ball("b1", "o1"),
          ],
          [
            screen("a1", 1, "o2", near("x1")),
            dribble("a2", 2, "o1", xy(2.8, 6.0), xy(1.6, 3.8)),
            cut("a3", 2, "o2", at("right_block")),
            pass("a4", 3, "o1", "o2"),
            shot("a5", 4, "o2"),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "shell-defense-4v4",
    title: "Shell Defense 4-on-4",
    description:
      "Four defenders adjust position as the ball moves around the perimeter: jump to the ball, help in the lane, and recover on the next pass.",
    category: "team_defense",
    primarySkill: "help_defense",
    secondarySkills: ["communication", "closeouts", "decision_making"],
    level: "advanced",
    ageMin: 14,
    ageMax: 18,
    playersMin: 8,
    playersMax: 16,
    durationMin: 12,
    durationMax: 20,
    space: "half_court",
    tags: ["team defense", "help side", "rotations", "4-on-4"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "bibs", rule: "fixed", quantity: 8 },
    ],
    content: {
      objective:
        "Move together as a defence: pressure the ball, deny or help depending on the ball's location, and recover after every pass.",
      setup:
        "Four offensive players stand on the perimeter (two wings, top and corner) and pass the ball around without dribbling at first. Four defenders match up and adjust with each pass.",
      instructions: [
        "Defender on the ball plays tight pressure with a hand up and a low stance.",
        "One pass away: deny the pass by staying in the passing lane, chest to the ball, one hand in the lane.",
        "Two passes away (help side): stay in the lane, one foot in the paint, seeing both the ball and the player.",
        "As the ball is passed, every defender jumps to the ball and adjusts to the new position in the same instant.",
        "Add a dribble drive after a few minutes and practice helping and recovering. Rotate offence and defence every two minutes.",
      ],
      coachingPoints: [
        "See both your player and the ball at all times: 'ball, you, ball'.",
        "Jump to the ball on the pass, and be in position before the ball arrives.",
        "Talk constantly: 'ball', 'help', 'I've got ball', 'deny'.",
        "Close out under control when recovering to a shooter.",
      ],
      commonMistakes: [
        "Ball-watching, forgetting the player and losing help-side vision.",
        "Reacting after the pass instead of moving as the ball is released.",
        "Staying too far from the ball on the help side and giving up easy drives.",
      ],
      safety:
        "Keep contact to a minimum, and use a whistle to stop play if the defence loses control or players collide.",
      progressions: [
        "Allow live dribble drives, cuts and skip passes to test the defensive reactions.",
      ],
      regressions: ["Run it as 3-on-3 first, or walk through the rotations without a live ball."],
      variations: [
        "Award points to the defence for stops and to the offence for open shots to add a competition.",
      ],
    },
    diagrams: [
      {
        title: "Ball moves, defence rotates",
        diagram: halfCourt(
          [
            offense("o1", "1", at("right_wing")),
            offense("o2", "2", at("top_key")),
            offense("o3", "3", at("left_wing")),
            offense("o4", "4", at("left_corner")),
            defense("x1", "X1", near("o1", [-1.0, -0.9])),
            defense("x2", "X2", near("o2", [0.6, -1.3])),
            defense("x3", "X3", xy(-1.9, 3.4)),
            defense("x4", "X4", xy(-4.5, 0.4)),
            ball("b1", "o1"),
          ],
          [
            pass("a1", 1, "o1", "o2"),
            move("a2", 1, "x1", xy(2.9, 4.5)),
            move("a3", 1, "x2", xy(0.6, 6.3)),
            move("a4", 1, "x3", xy(-1.7, 3.1)),
            move("a5", 1, "x4", xy(-3.4, 1.4)),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "three-on-two-fast-break",
    title: "3-on-2 Fast Break",
    description:
      "Three attackers race against two defenders down the full court, practising lane filling, quick decisions and finishing before help arrives.",
    category: "transition",
    primarySkill: "decision_making",
    secondarySkills: ["passing", "spacing", "finishing"],
    level: "intermediate",
    ageMin: 12,
    ageMax: 18,
    playersMin: 5,
    playersMax: 15,
    durationMin: 10,
    durationMax: 15,
    space: "full_court",
    tags: ["transition", "fast break", "3-on-2", "decisions"],
    equipment: [
      { type: "basketball", rule: "fixed", quantity: 2 },
      { type: "bibs", rule: "fixed", quantity: 5 },
    ],
    content: {
      objective:
        "Attack an outnumbered defence with speed and spacing, making the simple play to a good shot before the defence recovers.",
      setup:
        "Three attackers start at the centre circle with the middle player holding the ball. Two defenders wait near the free-throw line at the far end, one at the top and one in the lane.",
      instructions: [
        "The middle player pushes the ball up the court while the wings fill their lanes wide.",
        "Attack the top defender with the dribble to make them commit to the ball.",
        "As the defender stops the ball, pass to the open wing, who finishes or passes again to the other wing.",
        "Attackers rebound and outlet quickly if the shot is missed. Play ends on a score, a stop or a turnover.",
        "The defenders become attackers on the next repetition and three players return the other way, so play is continuous.",
      ],
      coachingPoints: [
        "Wide lanes: the wings run wide so defenders cannot guard two at once.",
        "The ball handler attacks the top defender and reads their feet, not the ball.",
        "Make the first good pass and finish under control instead of forcing a difficult shot.",
        "Communicate: 'ball', 'left', 'right', 'shot'.",
      ],
      commonMistakes: [
        "Bunching in the middle so the defenders can guard everybody.",
        "Dribbling too much or passing too early before the defence commits.",
        "Rushing the finish and missing an easy layup.",
      ],
      safety:
        "Run in straight lanes and go around the basket support after finishing, keeping the return lane clear.",
      progressions: [
        "Add a trailer who runs late for a 4-on-3 situation, or add a time limit of eight seconds.",
      ],
      regressions: ["Walk through with two defenders in fixed positions, then increase speed."],
      variations: ["Play 2-on-1 to isolate decisions, or 3-on-3 when the group is comfortable."],
    },
    diagrams: [
      {
        title: "Fill the lanes, attack the top defender",
        diagram: fullCourt(
          [
            offense("o1", "1", at("center_circle")),
            offense("o2", "2", at("center_circle", [-4.5, 0.3])),
            offense("o3", "3", at("center_circle", [4.5, 0.3])),
            defense("x1", "X1", xy(0, 19.6)),
            defense("x2", "X2", xy(0, 22.6)),
            ball("b1", "o1"),
          ],
          [
            dribble("a1", 1, "o1", xy(0, 15.0)),
            cut("a2", 1, "o2", xy(-5.2, 17.5)),
            cut("a3", 1, "o3", xy(5.2, 17.5)),
            dribble("a4", 2, "o1", xy(0, 17.6)),
            pass("a5", 3, "o1", "o2"),
            shot("a6", 4, "o2", at("far_basket")),
          ],
        ),
      },
    ],
  },
  {
    seedKey: "court-line-sprints",
    title: "Court-Line Sprints",
    description:
      "Sprint to each court line and back in a progressive sequence to build basketball-specific speed endurance with clear work and rest intervals.",
    category: "conditioning",
    primarySkill: "conditioning",
    secondarySkills: ["speed_agility", "competitiveness"],
    level: "intermediate",
    ageMin: 12,
    ageMax: 18,
    playersMin: 4,
    playersMax: 24,
    durationMin: 8,
    durationMax: 12,
    space: "full_court",
    tags: ["conditioning", "sprints", "endurance"],
    equipment: [
      { type: "cones", rule: "fixed", quantity: 5 },
      { type: "stopwatch", rule: "fixed", quantity: 1 },
    ],
    content: {
      objective:
        "Improve the ability to repeat high-intensity efforts with short recovery, as required in a game.",
      setup:
        "Players line up on the baseline in groups of four to six. Mark the free-throw line, half-court line, far free-throw line and far baseline with cones or use the floor lines.",
      instructions: [
        "Sprint to the free-throw line, touch it and return to the baseline.",
        "Sprint to the half-court line, touch it and return.",
        "Sprint to the far free-throw line, touch and return, then to the far baseline and back.",
        "Rest for 60 to 90 seconds after each full set. Repeat for two to four sets depending on the age and fitness of the group.",
        "Groups take turns so the work-to-rest ratio is roughly one to two.",
      ],
      coachingPoints: [
        "Touch each line with the hand and turn quickly, dropping the hips to change direction.",
        "Maintain form when fatigued: head up, arm drive, quick feet.",
        "Encourage teammates and measure improvement over the weeks, not against others.",
      ],
      commonMistakes: [
        "Slowing early to avoid the turn, which wastes the drill's purpose.",
        "Cutting corners or skipping a line when tired.",
        "Beginning with maximum effort in the first set and being unable to complete later sets.",
      ],
      safety:
        "Always warm up first, keep water available, and stop players who show dizziness, chest pain or unusual breathlessness. Adjust the volume for age and fitness.",
      progressions: ["Add a dribble with a ball, or a defensive slide on the return."],
      regressions: ["Reduce the number of lines or extend the rest period between sets."],
      variations: [
        "Run it as a team challenge where the last runner in each group must finish before the next group starts.",
      ],
    },
    diagrams: [
      {
        title: "Line to line and back",
        diagram: fullCourt(
          [
            spot("m1", xy(-7.0, 4.225), "FT"),
            spot("m2", xy(-7.0, 12.425), "HC"),
            spot("m3", xy(-7.0, 20.625), "FT"),
            spot("m4", xy(-7.0, 25.4), "BL"),
            offense("o1", "1", xy(-6.3, -0.4)),
          ],
          [
            move(
              "a1",
              1,
              "o1",
              xy(-5.6, 4.225),
              xy(-6.3, -0.4),
              xy(-5.6, 12.425),
              xy(-6.3, -0.4),
              xy(-5.6, 20.625),
              xy(-6.3, -0.4),
            ),
          ],
          [note(xy(0, 15.6), "Touch each line, then return")],
        ),
      },
    ],
  },
];
