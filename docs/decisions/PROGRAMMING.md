# Programming rules (evidence base for AI plans)

Status: adopted 2026-11. Owner: AI plan builder (`src/contracts/plans`), MCP
`create_routine` guidance, coaching copy.

**Why this exists.** The AI drafts plans, but these rules check them. Every
number below is enforced in code by a validator, never left to the model's
judgment. If the model breaks a rule, code fixes the draft or flags it before
the user sees it. Change a number here and in `src/contracts/plans/rules.ts`
together.

Evidence grades used below:

| Grade | Meaning |
|---|---|
| **A** | Meta-analysis or position stand |
| **B** | RCT, or a consistent body of trials |
| **C** | Expert consensus or coaching convention |

## 1. The headline (what matters most)

1. **Doing it beats optimising it.** The jump from no training to any
   training dwarfs every other variable.
   - Train every major muscle at least twice a week.
   - Beginners don't need a different kind of programme, just less of it.
   - *ACSM 2026 Position Stand (overview of 137 reviews).* **A**
2. **Weekly hard sets per muscle drive growth, with diminishing returns.**
   - Volume raises hypertrophy and strength; strength flattens much sooner.
   - Count a direct set as 1 and an indirect set as 0.5: this "fractional"
     counting predicts outcomes best.
   - *Pelland et al. 2024/2026, 67 studies.* **A**
   - The app already counts this way: `weeklyMuscleSets`, MCP `get_training_summary`.
3. **Sets should be hard, but don't need to reach failure.**
   - Hypertrophy improves as sets end closer to failure. Strength is largely
     insensitive to it. *Robinson et al. 2024, Sports Med 54:2209.* **A**
   - The average healthy adult doesn't need failure. *ACSM 2026.* **A**
   - Working range: 0–3 reps in reserve (RIR).
4. **Load: heavy for strength; for growth, anything hard enough.**
   - 1RM strength gains favour loads above 60% 1RM.
   - Hypertrophy is similar across load ranges when sets are taken hard.
   - *Schoenfeld et al. 2017, JSCR 31:3508.* **A**
5. **Frequency mostly delivers volume.**
   - Volume-equated, frequency barely changes hypertrophy. Pelland 2024 finds
     clearer frequency effects for strength. *Schoenfeld, Grgic & Krieger 2019; Grgic et al. 2018.* **A**
   - So use 2×/week per muscle as the floor (ACSM), and add frequency to
     spread volume or practise lifts.

## 2. Numbers the validator enforces

### Weekly fractional sets per muscle

| Experience | Floor | Target band | Cap |
|---|---|---|---|
| Beginner (<1 yr) | 4 | 6–10 | 14 |
| Intermediate | 6 | 10–16 | 20 |
| Advanced | 8 | 12–20 | 24 |

Sources and reasoning:
- Baz-Valle et al. 2022 (J Hum Kinet) suggest 12–20 weekly sets for trained
  lifters (**A**, small).
- Pelland 2024 shows diminishing returns past the mid-teens (**A**).
- The caps keep recovery and session length sane (**C**).
- "Major muscles" are chest, back, quads, hamstrings, glutes and shoulders.
  Arms, calves, core, traps and forearms get the floor only when the user asks
  for them or the goal is aesthetic.

### Per session

| Rule | Value | Grade |
|---|---|---|
| Direct sets per muscle | ≤ 10 (beyond this, quality drops; spread across days instead) | C |
| Exercises per session | 4–8 | C |
| Session length | Within the user's time budget (5 + 2.5 min per set, the app's estimate) | — |

### Rep ranges and effort by goal

| Goal | Main lifts | Accessories | RIR | Rest |
|---|---|---|---|---|
| Hypertrophy | 6–12 | 10–20 | 1–3 (isolations 0–2) | 90–180 s |
| Strength | 3–6 (≥80% 1RM) | 6–12 | 1–3, failure not needed | 2–5 min |
| General fitness | 6–12 | 10–15 | 2–3 | 60–120 s |

Sources:
- Load: Schoenfeld 2017 (**A**). ACSM 2026 has heavy (≥80%) work for strength (**A**).
- Rest: longer rest beat 1 min for strength and growth (Schoenfeld et al.
  2016, JSCR, **B**). Rest past about a minute helps hypertrophy, with little
  gained beyond about 2 min (Singer et al. 2024, Front Sports Act Living, **A**).
- RIR is the Zourdos 2016 RIR-based RPE scale (RPE 10 = 0 RIR; **B**). People
  under-estimate how close they are to failure, so the UI says "stop with 1–2
  reps left" rather than showing a number. *Helms et al. 2016* (**C**).

### Exercise selection (every week)

- Cover the six patterns: squat, hinge, horizontal push, horizontal pull,
  vertical push, vertical pull. Leave one out only on request or for an
  injury. **C**
- Put compounds before isolations within a session. **C**
- Keep the same main lifts for the whole block, so progression is measurable;
  rotating accessories between blocks is fine. **C**
- Respect equipment and injuries from the prompt. Never prescribe through
  pain: the copy says "swap it", never gives medical advice.

## 3. Progression inside a block

- **Double progression (default).**
  - Work up to the top of the rep range at the target RIR, then add load: the
    smallest step (2.5 kg / 5 lb on barbell lifts, the next dumbbell up).
  - This is what the in-app "next time" suggestion already does. **C**
- **Effort ramp.** Week 1 starts at about 3 RIR, and each week ends a little
  closer to failure (about 1 RIR in the last hard week). It's the common
  mesocycle pattern, matching the hypertrophy/proximity dose-response. **C**
- **Optional volume ramp.** Intermediate and advanced lifters may add 1 set
  per muscle per week, within the cap. **C**

## 4. Deloads

Deload = a period of reduced training stress to shed fatigue and get ready to
train again. *Bell et al. 2023, Sports Med Open 9:87 (Delphi consensus).* **C**

- **Prefer a reduced deload to full rest.** A week completely off cost
  strength and gained no hypertrophy. *Coleman et al. 2024, PeerJ 12:e16777.* **B**
- **The app's deload week:**
  - same exercises;
  - about half the sets;
  - the same or slightly lighter load;
  - 3+ RIR.
- **Placement:**

  | Block | Deload |
  |---|---|
  | Beginners | None under 6 weeks; one at the end of a 6+ week block. Stalls are flagged by the plateau detector |
  | 4–6 weeks | The last week |
  | 8 weeks | Week 4 or 5, plus the end, or one at the end for intermediates |
  | 12 weeks | Every 4th week |

## 5. Presets the plan builder offers

| Preset | Weeks | Shape |
|---|---|---|
| 1-week kickstart | 1 | Hard weeks only, no deload |
| 4 weeks (default) | 4 | 3 build + 1 deload (beginners: 4 build) |
| 6 weeks | 6 | 5 build + 1 deload |
| 8 weeks | 8 | 3+1, 3+1 (beginners: 7 + 1) |
| 12 weeks | 12 | (3+1) × 3 |

### Split by training days

Each split hits every major muscle at least twice a week. **A** (ACSM floor)

| Days | Split |
|---|---|
| 2 | Full body A / B |
| 3 | Full body A / B / C, or Upper / Lower / Full |
| 4 | Upper / Lower × 2 |
| 5 | Upper / Lower / Push / Pull / Legs |
| 6 | Push / Pull / Legs × 2 |

Beginners are capped at 4 days: novices need full recovery between sessions,
and 2–3 full-body days already give them the frequency they respond to. **A**
(ACSM novice guidance)

**Challenges** (Winter Arc and the like) are the same structure with a theme:
- a preset length;
- a name;
- optional extra daily habits (steps, check-ins).

The training part is held to these rules like any other plan.

## 6. How the builder uses this

1. **Code** picks the skeleton from the user's answers:
   - weeks, days a week, goal, experience, minutes per session, equipment;
   - the split, slots per day, and the set and rep band per slot.
2. **AI** fills the slots:
   - exercise choice (from the library names it's given), names and notes;
   - adapting to the prompt ("bad knee", "home gym with dumbbells", "focus
     arms").
   - It returns JSON only (`PlanDraft`).
3. **Code** validates the draft against §2:
   - unknown exercises are re-matched or dropped;
   - sets and reps are clamped to the bands;
   - weekly sets per muscle are recomputed, then topped up or trimmed;
   - deload weeks are derived from the build weeks, never written by the model.
4. **The user** sees the plan and taps Save. It is saved as templates plus a
   program in one `mutate()` call, and it syncs like anything else.

## Sources

- ACSM. Resistance Training Prescription for Muscle Function, Hypertrophy, and
  Physical Performance in Healthy Adults: An Overview of Reviews. *Med Sci
  Sports Exerc*, 2026.
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The resistance
  training dose-response: meta-regressions exploring the effects of weekly
  volume and frequency on muscle hypertrophy and strength gain. SportRxiv
  2024; *Sports Med* 2026.
- Robinson ZP et al. Exploring the dose-response relationship between estimated
  resistance training proximity to failure, strength gain, and muscle
  hypertrophy. *Sports Med* 2024;54(9):2209–2231.
- Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and hypertrophy
  adaptations between low- vs. high-load resistance training. *J Strength Cond
  Res* 2017;31(12):3508–3523.
- Schoenfeld BJ, Grgic J, Krieger J. How many times per week should a muscle be
  trained to maximize hypertrophy? *J Sports Sci* 2019.
- Grgic J et al. Effect of resistance training frequency on gains in muscular
  strength. *Sports Med* 2018.
- Baz-Valle E et al. A systematic review of the effects of different resistance
  training volumes on muscle hypertrophy. *J Hum Kinet* 2022 (PMC8884877).
- Schoenfeld BJ et al. Longer interset rest periods enhance muscle strength and
  hypertrophy in resistance-trained men. *J Strength Cond Res* 2016 (PMID 26605807).
- Singer N et al. Give it a rest: a systematic review with Bayesian
  meta-analysis on inter-set rest interval duration and muscle hypertrophy.
  *Front Sports Act Living* 2024 (doi 10.3389/fspor.2024.1429789).
- Zourdos MC et al. Novel resistance training-specific RPE scale measuring
  repetitions in reserve. *J Strength Cond Res* 2016;30(1):267–275.
- Helms ER et al. Application of the repetitions in reserve-based RPE scale for
  resistance training. *Strength Cond J* 2016;38(4):42–49.
- Bell L et al. Integrating deloading into strength and physique sports training
  programmes: an international Delphi consensus approach. *Sports Med Open*
  2023;9:87.
- Coleman M et al. Gaining more from doing less? The effects of a one-week
  deload period during supervised resistance training on muscular adaptations.
  *PeerJ* 2024;12:e16777.
- ACSM. Progression models in resistance training for healthy adults. *Med Sci
  Sports Exerc* 2009;41(3):687–708 (superseded by the 2026 stand; kept for
  the frequency-by-level guidance: 2–3, 3–4 and 4–5 days a week).
