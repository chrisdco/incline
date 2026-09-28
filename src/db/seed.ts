import type { SQLiteDatabase } from 'expo-sqlite';

import { buildSearchText } from '@/lib/exercise-search';
import type {
  Category,
  Equipment,
  MovementPattern,
  MuscleGroup,
} from './types';

interface SeedExercise {
  id: number;
  name: string;
  aliases: string[];
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementPattern;
  equipment: Equipment;
  category: Category;
  isCompound: boolean;
  instructions: string[];
  tips: string;
}

const EXERCISES: SeedExercise[] = [
  { id: 1, name: 'Barbell Bench Press', aliases: ['bp', 'bench', 'chest press'], primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], movementPattern: 'horizontal_push', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Lie flat with eyes under the bar and shoulder blades retracted.', 'Grip slightly wider than shoulder-width and unrack.', 'Lower to mid-chest, then press to lockout.'], tips: 'Drive through your feet and keep elbows around 45 degrees.' },
  { id: 2, name: 'Barbell Back Squat', aliases: ['squat', 'back squat'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings', 'core'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Set the bar on your upper back with braced core.', 'Descend until hips break below knee depth.', 'Drive through mid-foot back to standing.'], tips: 'Keep knees tracking over toes and chest tall.' },
  { id: 3, name: 'Conventional Deadlift', aliases: ['dl', 'deadlift'], primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'back', 'traps', 'forearms'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Stand with mid-foot under the bar, hip-width stance.', 'Grip the bar and brace, shins vertical.', 'Push the floor away and extend hips to lockout.'], tips: 'Keep the bar close and your back flat throughout.' },
  { id: 4, name: 'Standing Overhead Press', aliases: ['ohp', 'press', 'military press'], primaryMuscle: 'shoulders', secondaryMuscles: ['triceps', 'traps'], movementPattern: 'vertical_push', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Grip just outside shoulders with bar at upper chest.', 'Brace hard and press straight overhead.', 'Lock out over the ears with ribs down.'], tips: 'Squeeze glutes to avoid excessive lower-back arch.' },
  { id: 5, name: 'Barbell Bent-Over Row', aliases: ['row', 'bent row', 'pendlay row'], primaryMuscle: 'back', secondaryMuscles: ['biceps', 'shoulders'], movementPattern: 'horizontal_pull', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Hinge to a flat back, torso around 45 degrees.', 'Pull the bar to your lower ribs.', 'Lower under control and reset each rep.'], tips: 'Lead with the elbows and keep the neck neutral.' },
  { id: 6, name: 'Pull-Up', aliases: ['pullup', 'pull up', 'chin'], primaryMuscle: 'back', secondaryMuscles: ['biceps', 'forearms'], movementPattern: 'vertical_pull', equipment: 'bodyweight', category: 'strength', isCompound: true, instructions: ['Hang from the bar with a shoulder-width overhand grip.', 'Pull your chest toward the bar.', 'Lower with control to a full hang.'], tips: 'Avoid swinging; initiate by driving elbows down.' },
  { id: 7, name: 'Romanian Deadlift', aliases: ['rdl'], primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'back'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Hold the bar at hips with soft knees.', 'Hinge back, pushing hips rearward.', 'Feel a hamstring stretch, then drive hips through.'], tips: 'Keep the bar grazing your legs; do not round the back.' },
  { id: 8, name: 'Lat Pulldown', aliases: ['pulldown', 'lat pull'], primaryMuscle: 'back', secondaryMuscles: ['biceps'], movementPattern: 'vertical_pull', equipment: 'cable', category: 'strength', isCompound: true, instructions: ['Grip the bar wider than shoulders.', 'Pull the bar to your upper chest.', 'Return slowly to a full stretch.'], tips: 'Drive elbows to the floor; do not lean back excessively.' },
  { id: 9, name: 'Seated Cable Row', aliases: ['cable row', 'seated row'], primaryMuscle: 'back', secondaryMuscles: ['biceps'], movementPattern: 'horizontal_pull', equipment: 'cable', category: 'strength', isCompound: true, instructions: ['Sit tall with a neutral spine and feet braced.', 'Pull the handle to your stomach, squeezing the back.', 'Return under control to a light stretch.'], tips: 'Keep shoulders down and away from your ears.' },
  { id: 10, name: 'Dumbbell Lateral Raise', aliases: ['lateral raise', 'side raise'], primaryMuscle: 'shoulders', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'dumbbell', category: 'accessory', isCompound: false, instructions: ['Stand with dumbbells at your sides.', 'Raise the arms out to shoulder height.', 'Lower slowly with control.'], tips: 'Lead with the elbows and keep a slight bend.' },
  { id: 11, name: 'Dumbbell Bicep Curl', aliases: ['curl', 'bicep curl', 'db curl'], primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], movementPattern: 'isolation', equipment: 'dumbbell', category: 'accessory', isCompound: false, instructions: ['Stand with dumbbells at your sides, palms forward.', 'Curl up while keeping elbows pinned.', 'Lower slowly to full extension.'], tips: 'Avoid swinging; control the negative.' },
  { id: 12, name: 'Triceps Cable Pushdown', aliases: ['pushdown', 'tricep pushdown', 'triceps'], primaryMuscle: 'triceps', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Stand at the cable with elbows tucked.', 'Push the bar down to full extension.', 'Return slowly to 90 degrees.'], tips: 'Keep elbows fixed; only the forearms should move.' },
  { id: 13, name: 'Leg Press', aliases: ['leg press', 'press'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], movementPattern: 'squat_hinge', equipment: 'machine', category: 'strength', isCompound: true, instructions: ['Set feet shoulder-width on the platform.', 'Lower to around 90 degrees of knee flexion.', 'Press through the whole foot to extension.'], tips: 'Do not lock the knees or let the lower back round.' },
  { id: 14, name: 'Cable Face Pull', aliases: ['face pull', 'facepull'], primaryMuscle: 'shoulders', secondaryMuscles: ['traps', 'back'], movementPattern: 'horizontal_pull', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Set the cable at face height with a rope.', 'Pull toward your face, elbows high.', 'Squeeze the rear delts and return slowly.'], tips: 'Use a light load for clean reps and posture work.' },
  // --- Expanded library (30+ exercises) ---
  { id: 15, name: 'Incline Dumbbell Press', aliases: ['incline press', 'idb press'], primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'triceps'], movementPattern: 'horizontal_push', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Set bench to 30-45 degrees.', 'Press dumbbells up from chest level.', 'Lower with control to a stretch.'], tips: 'Keep elbows at about 45 degrees to protect shoulders.' },
  { id: 16, name: 'Dumbbell Fly', aliases: ['chest fly', 'db fly'], primaryMuscle: 'chest', secondaryMuscles: ['shoulders'], movementPattern: 'isolation', equipment: 'dumbbell', category: 'accessory', isCompound: false, instructions: ['Lie on a flat bench holding dumbbells above chest.', 'Lower arms out to the sides with a slight elbow bend.', 'Squeeze the chest to bring the weights back together.'], tips: 'Keep a slight bend in the elbows throughout the movement.' },
  { id: 17, name: 'Cable Crossover', aliases: ['cable fly', 'crossover'], primaryMuscle: 'chest', secondaryMuscles: ['shoulders'], movementPattern: 'isolation', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Set cables high and stand between them.', 'Pull the handles down and together in front of chest.', 'Return slowly to the starting position.'], tips: 'Squeeze at the bottom for peak contraction.' },
  { id: 18, name: 'Dumbbell Shoulder Press', aliases: ['db shoulder press', 'seated db press'], primaryMuscle: 'shoulders', secondaryMuscles: ['triceps'], movementPattern: 'vertical_push', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Sit on a bench with back support.', 'Press dumbbells overhead from shoulder height.', 'Lower to ear level with control.'], tips: 'Keep core braced and avoid arching the lower back.' },
  { id: 19, name: 'Face Pull (Rope)', aliases: ['rope face pull'], primaryMuscle: 'shoulders', secondaryMuscles: ['traps', 'back'], movementPattern: 'horizontal_pull', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Set cable at face height with a rope attachment.', 'Pull the rope toward your face, separating the ends.', 'Squeeze the rear delts and return slowly.'], tips: 'Focus on external rotation at the end of the pull.' },
  { id: 20, name: 'Barbell Curl', aliases: ['barbell bicep curl', 'bb curl'], primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], movementPattern: 'isolation', equipment: 'barbell', category: 'accessory', isCompound: false, instructions: ['Stand holding a barbell with an underhand grip.', 'Curl the bar up by flexing the elbows.', 'Lower slowly to full extension.'], tips: 'Keep elbows close to the body and avoid swinging.' },
  { id: 21, name: 'Hammer Curl', aliases: ['dumbbell hammer curl'], primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], movementPattern: 'isolation', equipment: 'dumbbell', category: 'accessory', isCompound: false, instructions: ['Stand with dumbbells at your sides, palms facing each other.', 'Curl up while keeping palms neutral.', 'Lower slowly to full extension.'], tips: 'Great for building brachialis and forearm thickness.' },
  { id: 22, name: 'Skull Crushers', aliases: ['lying tricep extension', 'ez bar extension'], primaryMuscle: 'triceps', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'barbell', category: 'accessory', isCompound: false, instructions: ['Lie on a bench holding an EZ bar above your chest.', 'Lower the bar toward your forehead by bending elbows.', 'Extend back to the starting position.'], tips: 'Keep upper arms stationary and elbows tucked.' },
  { id: 23, name: 'Tricep Dips', aliases: ['dips', 'chest dips'], primaryMuscle: 'triceps', secondaryMuscles: ['chest', 'shoulders'], movementPattern: 'vertical_push', equipment: 'bodyweight', category: 'strength', isCompound: true, instructions: ['Grip parallel bars and lift yourself up.', 'Lower by bending elbows to about 90 degrees.', 'Press back up to full extension.'], tips: 'Lean forward slightly to target chest more; stay upright for triceps.' },
  { id: 24, name: 'Front Squat', aliases: ['fs', 'front barbell squat'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'core'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Clean the bar to front rack position.', 'Descend with an upright torso.', 'Drive up through the mid-foot.'], tips: 'Keep elbows high and chest up throughout.' },
  { id: 25, name: 'Walking Lunges', aliases: ['lunges', 'barbell lunges'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Hold a barbell across your upper back.', 'Step forward into a lunge, lowering back knee toward floor.', 'Push off the front foot and step into the next lunge.'], tips: 'Keep the front knee tracking over the toes.' },
  { id: 26, name: 'Leg Extension', aliases: ['quad extension', 'leg ext'], primaryMuscle: 'quads', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'machine', category: 'accessory', isCompound: false, instructions: ['Sit on the machine with pads on your shins.', 'Extend the knees to lift the weight.', 'Lower slowly to the starting position.'], tips: 'Squeeze at the top for a peak contraction.' },
  { id: 27, name: 'Lying Leg Curl', aliases: ['leg curl', 'hamstring curl'], primaryMuscle: 'hamstrings', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'machine', category: 'accessory', isCompound: false, instructions: ['Lie face down on the machine with pads behind your ankles.', 'Curl the weight up by flexing the knees.', 'Lower slowly to full extension.'], tips: 'Avoid lifting the hips off the pad.' },
  { id: 28, name: 'Hip Thrust', aliases: ['barbell hip thrust', 'glute bridge'], primaryMuscle: 'glutes', secondaryMuscles: ['hamstrings'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Sit on the floor with upper back against a bench.', 'Roll the bar over your hips.', 'Drive hips up to full extension, squeezing glutes.'], tips: 'Pause at the top and drive through the heels.' },
  { id: 29, name: 'Calf Raise (Standing)', aliases: ['calf raise', 'standing calf raise'], primaryMuscle: 'calves', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'machine', category: 'accessory', isCompound: false, instructions: ['Stand on the calf raise machine with shoulders under pads.', 'Rise up onto the balls of your feet.', 'Lower slowly to a full stretch.'], tips: 'Hold the top position for a 2-second squeeze.' },
  { id: 30, name: 'Hanging Leg Raise', aliases: ['hanging leg curl', 'leg raise'], primaryMuscle: 'core', secondaryMuscles: ['forearms'], movementPattern: 'core', equipment: 'bodyweight', category: 'strength', isCompound: false, instructions: ['Hang from a pull-up bar.', 'Raise your legs to parallel or higher.', 'Lower slowly with control.'], tips: 'Keep the movement slow and controlled to avoid swinging.' },
  { id: 31, name: 'Cable Woodchop', aliases: ['woodchop', 'cable chop'], primaryMuscle: 'core', secondaryMuscles: ['shoulders'], movementPattern: 'core', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Set the cable high and stand sideways.', 'Pull the handle diagonally across your body.', 'Control the return to the start.'], tips: 'Rotate through the torso, not just the arms.' },
  { id: 32, name: 'Plank', aliases: ['front plank', 'plank hold'], primaryMuscle: 'core', secondaryMuscles: ['shoulders', 'glutes'], movementPattern: 'core', equipment: 'bodyweight', category: 'strength', isCompound: false, instructions: ['Hold a push-up position on your forearms.', 'Keep a straight line from head to heels.', 'Hold for the prescribed time.'], tips: 'Squeeze the glutes and brace the core tight.' },
  { id: 33, name: 'Dumbbell Row (Single Arm)', aliases: ['single arm row', 'db row', 'one arm row'], primaryMuscle: 'back', secondaryMuscles: ['biceps'], movementPattern: 'horizontal_pull', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Place one knee and hand on a bench.', 'Pull the dumbbell to your hip.', 'Lower under control.'], tips: 'Keep the back flat and avoid rotating the torso.' },
  { id: 34, name: 'T-Bar Row', aliases: ['tbar row', 'landmine row'], primaryMuscle: 'back', secondaryMuscles: ['biceps', 'shoulders'], movementPattern: 'horizontal_pull', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Straddle the T-bar with a V-handle.', 'Pull the weight to your chest.', 'Lower under control.'], tips: 'Keep the back flat and drive with the elbows.' },
  { id: 35, name: 'Chest-Supported Row', aliases: ['incline db row', 'supported row'], primaryMuscle: 'back', secondaryMuscles: ['biceps'], movementPattern: 'horizontal_pull', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Lie face-down on an incline bench.', 'Row the dumbbells to your sides.', 'Lower slowly with control.'], tips: 'Great for isolating the back without lower-back strain.' },
  { id: 36, name: 'Shrug', aliases: ['barbell shrug', 'trap shrug'], primaryMuscle: 'traps', secondaryMuscles: ['forearms'], movementPattern: 'isolation', equipment: 'barbell', category: 'accessory', isCompound: false, instructions: ['Stand holding a barbell at arm length.', 'Shrug your shoulders up toward your ears.', 'Lower slowly with control.'], tips: 'Hold the top for a 1-second squeeze.' },
  { id: 37, name: 'Preacher Curl', aliases: ['ez bar curl', 'preacher bench curl'], primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], movementPattern: 'isolation', equipment: 'barbell', category: 'accessory', isCompound: false, instructions: ['Sit at a preacher bench with arms over the pad.', 'Curl the bar up by flexing the elbows.', 'Lower slowly to a full stretch.'], tips: 'Avoid using momentum; keep the movement strict.' },
  { id: 38, name: 'Close-Grip Bench Press', aliases: ['close grip bench', 'cgbp'], primaryMuscle: 'triceps', secondaryMuscles: ['chest', 'shoulders'], movementPattern: 'horizontal_push', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Lie on a bench with a narrow grip on the bar.', 'Lower to the lower chest.', 'Press up, focusing on tricep engagement.'], tips: 'Keep elbows close to the body throughout.' },
  { id: 39, name: 'Sumo Deadlift', aliases: ['sumo', 'wide stance deadlift'], primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'quads', 'back'], movementPattern: 'squat_hinge', equipment: 'barbell', category: 'strength', isCompound: true, instructions: ['Take a wide stance with toes pointed out.', 'Grip the bar inside the knees.', 'Drive the floor apart and lock out.'], tips: 'Keep the chest up and push the knees out.' },
  { id: 40, name: 'Bulgarian Split Squat', aliases: ['bulgarian squat', 'rear foot elevated split squat'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], movementPattern: 'squat_hinge', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Stand a few feet in front of a bench.', 'Rest the rear foot on the bench behind you.', 'Lower until the front thigh is parallel, then drive up.'], tips: 'Keep the torso upright and front knee tracking over toes.' },
  { id: 41, name: 'Glute Kickback (Cable)', aliases: ['cable kickback', 'glute kickback'], primaryMuscle: 'glutes', secondaryMuscles: ['hamstrings'], movementPattern: 'isolation', equipment: 'cable', category: 'accessory', isCompound: false, instructions: ['Attach an ankle cuff to a low cable.', 'Kick the leg back, squeezing the glute.', 'Return slowly to the starting position.'], tips: 'Keep the hips square and avoid arching the back.' },
  { id: 42, name: 'Goblet Squat', aliases: ['goblet', 'db goblet squat'], primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'core'], movementPattern: 'squat_hinge', equipment: 'dumbbell', category: 'strength', isCompound: true, instructions: ['Hold a dumbbell at chest height.', 'Squat down, keeping the chest tall.', 'Drive back up through the heels.'], tips: 'Great for learning squat form and core bracing.' },
  { id: 43, name: 'Reverse Fly', aliases: ['rear delt fly', 'bent over reverse fly'], primaryMuscle: 'shoulders', secondaryMuscles: ['traps'], movementPattern: 'isolation', equipment: 'dumbbell', category: 'accessory', isCompound: false, instructions: ['Bend forward with dumbbells hanging below.', 'Raise arms out to the sides, squeezing rear delts.', 'Lower slowly with control.'], tips: 'Keep a slight bend in the elbows and lead with the pinkies.' },
  { id: 44, name: 'Wrist Curl', aliases: ['barbell wrist curl', 'forearm curl'], primaryMuscle: 'forearms', secondaryMuscles: [], movementPattern: 'isolation', equipment: 'barbell', category: 'accessory', isCompound: false, instructions: ['Sit with forearms on a bench, wrists hanging off.', 'Curl the wrists up, squeezing the forearms.', 'Lower slowly to a full stretch.'], tips: 'Use a light weight and focus on the squeeze.' },
  { id: 45, name: 'Chin-Up', aliases: ['chinup', 'underhand pull-up'], primaryMuscle: 'back', secondaryMuscles: ['biceps', 'forearms'], movementPattern: 'vertical_pull', equipment: 'bodyweight', category: 'strength', isCompound: true, instructions: ['Hang from a bar with an underhand grip.', 'Pull your chin above the bar.', 'Lower with control to a full hang.'], tips: 'Squeeze the biceps at the top for extra activation.' },
];

interface SeedTemplateExercise {
  exerciseId: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
  notes: string;
}

interface SeedTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  exercises: SeedTemplateExercise[];
}

const TEMPLATES: SeedTemplate[] = [
  { id: 1, name: 'Full Body A', description: 'Foundational strength session hitting the big movers.', category: 'strength', difficulty: 'beginner', estimatedMinutes: 50, exercises: [{ exerciseId: 2, targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, notes: '' }, { exerciseId: 1, targetSets: 3, targetRepsMin: 5, targetRepsMax: 6, restSeconds: 150, notes: '' }, { exerciseId: 5, targetSets: 3, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 120, notes: '' }] },
  { id: 2, name: 'Full Body B', description: 'Complementary full body day with a pull and press bias.', category: 'strength', difficulty: 'beginner', estimatedMinutes: 50, exercises: [{ exerciseId: 4, targetSets: 3, targetRepsMin: 5, targetRepsMax: 6, restSeconds: 150, notes: '' }, { exerciseId: 3, targetSets: 1, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, notes: '' }, { exerciseId: 8, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 90, notes: '' }] },
  { id: 3, name: 'Push Day', description: 'Chest, shoulders and triceps focus for a PPL split.', category: 'strength', difficulty: 'intermediate', estimatedMinutes: 60, exercises: [{ exerciseId: 1, targetSets: 4, targetRepsMin: 5, targetRepsMax: 8, restSeconds: 150, notes: '' }, { exerciseId: 4, targetSets: 3, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 120, notes: '' }, { exerciseId: 10, targetSets: 3, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60, notes: '' }, { exerciseId: 12, targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 60, notes: '' }] },
  { id: 4, name: 'Pull Day', description: 'Back and biceps focus for a PPL split.', category: 'strength', difficulty: 'intermediate', estimatedMinutes: 55, exercises: [{ exerciseId: 5, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 120, notes: '' }, { exerciseId: 6, targetSets: 3, targetRepsMin: 6, targetRepsMax: 10, restSeconds: 90, notes: '' }, { exerciseId: 9, targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 75, notes: '' }, { exerciseId: 11, targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 60, notes: '' }] },
  { id: 5, name: 'Leg Day', description: 'Quad, hamstring and glute focus for a PPL split.', category: 'strength', difficulty: 'intermediate', estimatedMinutes: 55, exercises: [{ exerciseId: 2, targetSets: 4, targetRepsMin: 5, targetRepsMax: 8, restSeconds: 180, notes: '' }, { exerciseId: 7, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 120, notes: '' }, { exerciseId: 13, targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90, notes: '' }, { exerciseId: 14, targetSets: 3, targetRepsMin: 15, targetRepsMax: 20, restSeconds: 45, notes: '' }] },
  { id: 6, name: 'Upper Body', description: 'Balanced upper session mixing pushes and pulls.', category: 'strength', difficulty: 'intermediate', estimatedMinutes: 55, exercises: [{ exerciseId: 1, targetSets: 4, targetRepsMin: 5, targetRepsMax: 8, restSeconds: 150, notes: '' }, { exerciseId: 5, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 120, notes: '' }, { exerciseId: 4, targetSets: 3, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 120, notes: '' }, { exerciseId: 8, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 90, notes: '' }, { exerciseId: 11, targetSets: 2, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60, notes: '' }, { exerciseId: 12, targetSets: 2, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60, notes: '' }] },
];

interface SeedProgram {
  id: number;
  name: string;
  description: string;
  weeks: number;
  days: { week: number; day: number; templateId: number }[];
}

const PROGRAMS: SeedProgram[] = [
  { id: 1, name: 'Push / Pull / Legs', description: 'A classic 6-day split built for hypertrophy and strength.', weeks: 4, days: [{ week: 1, day: 1, templateId: 3 }, { week: 1, day: 2, templateId: 4 }, { week: 1, day: 3, templateId: 5 }] },
  { id: 2, name: 'Upper / Lower', description: 'A balanced 4-day split for steady progression.', weeks: 4, days: [{ week: 1, day: 1, templateId: 6 }, { week: 1, day: 2, templateId: 5 }, { week: 1, day: 4, templateId: 6 }, { week: 1, day: 5, templateId: 2 }] },
];

/** Baseline working weights in kg used to generate a realistic history. */
const BASELINE: Record<number, number> = { 1: 60, 2: 80, 3: 100, 4: 40, 5: 55, 6: 0, 7: 70, 8: 50, 9: 55, 10: 9, 11: 12, 12: 25, 13: 120, 14: 20, 15: 24, 16: 10, 17: 15, 18: 16, 19: 15, 20: 25, 21: 12, 22: 25, 23: 0, 24: 70, 25: 40, 26: 30, 27: 25, 28: 60, 29: 40, 30: 0, 31: 15, 32: 0, 33: 22, 34: 50, 35: 18, 36: 40, 37: 20, 38: 50, 39: 90, 40: 14, 41: 15, 42: 16, 43: 6, 44: 15, 45: 0 };

const DAY_MS = 86_400_000;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Seed the catalog (exercises, templates, programs) and a realistic ~8 week
 * training history, then a default profile. Runs once, guarded by schema_meta.
 */
export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    for (const ex of EXERCISES) {
      await db.runAsync(
        `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, is_compound, tips, search_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ex.id, ex.name, ex.primaryMuscle, ex.movementPattern, ex.equipment, ex.category, ex.isCompound ? 1 : 0, ex.tips,
        buildSearchText({ name: ex.name, primaryMuscle: ex.primaryMuscle, equipment: ex.equipment, pattern: ex.movementPattern, category: ex.category }),
        now, now,
      );
      for (const alias of ex.aliases) {
        await db.runAsync(`INSERT INTO exercise_aliases (exercise_id, alias) VALUES (?, ?)`, ex.id, alias.toLowerCase());
      }
      for (const muscle of ex.secondaryMuscles) {
        await db.runAsync(`INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)`, ex.id, muscle);
      }
      for (let i = 0; i < ex.instructions.length; i++) {
        await db.runAsync(`INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)`, ex.id, i + 1, ex.instructions[i]);
      }
    }

    for (const t of TEMPLATES) {
      await db.runAsync(
        `INSERT INTO workout_templates (id, name, description, category, difficulty, estimated_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        t.id, t.name, t.description, t.category, t.difficulty, t.estimatedMinutes, now, now,
      );
      for (let i = 0; i < t.exercises.length; i++) {
        const te = t.exercises[i];
        await db.runAsync(
          `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          t.id, te.exerciseId, i, te.targetSets, te.targetRepsMin, te.targetRepsMax, te.restSeconds, te.notes,
        );
      }
    }

    for (const p of PROGRAMS) {
      await db.runAsync(
        `INSERT INTO programs (id, name, description, weeks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        p.id, p.name, p.description, p.weeks, now, now,
      );
      for (let i = 0; i < p.days.length; i++) {
        const d = p.days[i];
        await db.runAsync(
          `INSERT INTO program_workouts (program_id, template_id, week, day, sort_order) VALUES (?, ?, ?, ?, ?)`,
          p.id, d.templateId, d.week, d.day, i,
        );
      }
      // Repeat the week-1 pattern across the remaining program weeks.
      for (let w = 2; w <= p.weeks; w++) {
        for (let i = 0; i < p.days.length; i++) {
          const d = p.days[i];
          await db.runAsync(
            `INSERT INTO program_workouts (program_id, template_id, week, day, sort_order) VALUES (?, ?, ?, ?, ?)`,
            p.id, d.templateId, w, d.day, i,
          );
        }
      }
    }

    await generateHistory(db, now);

    await db.runAsync(
      `INSERT INTO user_profile (id, name, goal, bodyweight, unit, experience_level, onboarding_completed, updated_at) VALUES (1, '', 'build_muscle', NULL, 'metric', 'intermediate', 0, ?)`,
      now,
    );
  });
}

async function generateHistory(db: SQLiteDatabase, now: number): Promise<void> {
  const sessionCount = 25;
  for (let i = 0; i < sessionCount; i++) {
    const templateId = (i % 6) + 1;
    const tmpl = TEMPLATES.find((t) => t.id === templateId)!;
    const startedAt = now - (sessionCount - 1 - i) * 2 * DAY_MS;
    const durationSeconds = 2400 + ((i * 97) % 1200);
    const endedAt = startedAt + durationSeconds;

    let totalVolume = 0;
    const setRows: { exerciseId: number; setIndex: number; weight: number; reps: number }[] = [];

    for (const te of tmpl.exercises) {
      const base = BASELINE[te.exerciseId] ?? 0;
      for (let s = 0; s < te.targetSets; s++) {
        const progression = 1 + i * 0.012;
        const weight = base > 0 ? roundTo(base * progression, 2.5) : 0;
        const repRange = Math.max(1, te.targetRepsMax - te.targetRepsMin + 1);
        const reps = te.targetRepsMin + ((i + s) % repRange);
        totalVolume += weight * reps;
        setRows.push({ exerciseId: te.exerciseId, setIndex: s, weight, reps });
      }
    }

    const res = await db.runAsync(
      `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, total_volume, unit, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'metric', '', ?, ?)`,
      templateId, tmpl.name, startedAt, endedAt, durationSeconds, Math.round(totalVolume * 100) / 100, startedAt, endedAt,
    );
    const logId = res.lastInsertRowId as number;
    for (const sr of setRows) {
      await db.runAsync(
        `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        logId, sr.exerciseId, sr.setIndex, sr.weight, sr.reps, 90, endedAt,
      );
    }
  }
}
