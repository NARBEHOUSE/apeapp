export interface WorkoutVoiceContext {
  currentExercise: { id: string; name: string; sets: number; reps: string };
  currentSetNumber: number;
  preFilledWeight: number;
  completedSets: { weight: number; reps: number }[];
  exerciseList: { id: string; name: string }[];
}

export type WorkoutIntent =
  | { action: 'log_set'; exerciseId: string; exerciseName: string; weight: number; reps: number; rir?: number; rpe?: number }
  | { action: 'skip_exercise'; exerciseId: string; exerciseName: string; reason?: string }
  | { action: 'finish_workout' }
  | { action: 'unknown'; rawText: string };

export interface FoodIntentItem {
  searchQuery: string;
  estimatedServingSize: number;
  estimatedServingUnit: string;
  estimatedServings: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  estimatedCalories?: number;
  estimatedProtein?: number;
  estimatedCarbs?: number;
  estimatedFat?: number;
  estimatedFiber?: number;
}

export interface FoodIntent {
  items: FoodIntentItem[];
}

const WORKOUT_SYSTEM_PROMPT = `You are a workout logging voice assistant. Parse the user's speech into a structured action.

Current exercise: {{exerciseName}}
Set number: {{setNumber}} of {{totalSets}}
Pre-filled weight: {{weight}} lbs
Completed sets: {{completedSets}}
All exercises: {{exerciseList}}

Rules:
- "I got 8", "8 reps", "did 8" → log_set with pre-filled weight and those reps
- "185 for 8", "225 times 5", "100 pounds 10 reps" → log_set with specified weight and reps
- Numbers alone like "8" or "ten" → log_set with pre-filled weight
- "skip", "skip this", "pass" → skip_exercise for current exercise
- "finish", "end workout", "I'm done", "that's it" → finish_workout
- "2 in the tank", "RIR 3" → include rir field
- "RPE 8", "felt like an 8" → include rpe field
- If user names a different exercise, match it from the exercise list
- Default to the current exercise if no exercise is named

Respond ONLY with valid JSON. Include rir or rpe when mentioned, omit them otherwise:
{"action":"log_set","exerciseId":"...","exerciseName":"...","weight":185,"reps":8,"rir":2}
or {"action":"log_set","exerciseId":"...","exerciseName":"...","weight":185,"reps":8,"rpe":8}
or {"action":"log_set","exerciseId":"...","exerciseName":"...","weight":185,"reps":8}
or {"action":"skip_exercise","exerciseId":"...","exerciseName":"..."}
or {"action":"finish_workout"}
or {"action":"unknown","rawText":"..."}`;

const FOOD_SYSTEM_PROMPT = `You are a food logging voice assistant. Parse what the user ate into individual food items with accurate macros.

Current time: {{time}}

Rules:
- Extract each food item separately
- Provide a USDA-searchable query (brand names → generic: "mission tortilla" → "flour tortilla whole wheat")
- Use exact grams if given ("30g peanut butter" → 30g)
- Estimate common amounts: 1 slice bread ≈ 30g, 1 tbsp peanut butter ≈ 16g, 1 egg ≈ 50g, 1 chicken breast ≈ 170g, 1 cup rice cooked ≈ 186g, 1 tortilla ≈ 45g
- Guess meal type from time: before 11am → breakfast, 11-3pm → lunch, 3-8pm → dinner, else → snack
- Handle casual speech: "like 30g" → 30g, "a little bit of" → small serving
- Always include your best estimated macros for the stated serving size (calories, protein, carbs, fat, fiber in grams)

Respond ONLY with valid JSON:
{"items":[{"searchQuery":"flour tortilla","estimatedServingSize":45,"estimatedServingUnit":"g","estimatedServings":1,"mealType":"lunch","estimatedCalories":130,"estimatedProtein":3,"estimatedCarbs":22,"estimatedFat":3,"estimatedFiber":1}]}`;

function buildWorkoutPrompt(context: WorkoutVoiceContext): string {
  return WORKOUT_SYSTEM_PROMPT
    .replace('{{exerciseName}}', context.currentExercise.name)
    .replace('{{setNumber}}', String(context.currentSetNumber))
    .replace('{{totalSets}}', String(context.currentExercise.sets))
    .replace('{{weight}}', String(context.preFilledWeight))
    .replace('{{completedSets}}', context.completedSets.map((s) => `${s.weight}×${s.reps}`).join(', ') || 'none')
    .replace('{{exerciseList}}', context.exerciseList.map((e) => e.name).join(', '));
}

function buildFoodPrompt(): string {
  const hour = new Date().getHours();
  const timeStr = hour < 11 ? 'morning' : hour < 15 ? 'midday' : hour < 20 ? 'evening' : 'night';
  return FOOD_SYSTEM_PROMPT.replace('{{time}}', timeStr);
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = localStorage.getItem('fitos-claude-key');
  if (!apiKey) throw new Error('Claude API key not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  let text: string = data.content[0].text;
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return text;
}

export async function parseWorkoutIntent(transcript: string, context: WorkoutVoiceContext): Promise<WorkoutIntent> {
  try {
    const prompt = buildWorkoutPrompt(context);
    const text = await callClaude(prompt, transcript);
    const parsed = JSON.parse(text);

    if (parsed.action === 'log_set') {
      const exerciseId = parsed.exerciseId || context.currentExercise.id;
      const match = context.exerciseList.find((e) =>
        e.name.toLowerCase() === (parsed.exerciseName || '').toLowerCase()
      );
      return {
        action: 'log_set',
        exerciseId: match?.id || exerciseId,
        exerciseName: match?.name || parsed.exerciseName || context.currentExercise.name,
        weight: parsed.weight || context.preFilledWeight,
        reps: parsed.reps || 0,
        rir: parsed.rir,
        rpe: parsed.rpe,
      };
    }

    if (parsed.action === 'skip_exercise') {
      return {
        action: 'skip_exercise',
        exerciseId: parsed.exerciseId || context.currentExercise.id,
        exerciseName: parsed.exerciseName || context.currentExercise.name,
        reason: parsed.reason,
      };
    }

    if (parsed.action === 'finish_workout') {
      return { action: 'finish_workout' };
    }

    return { action: 'unknown', rawText: transcript };
  } catch {
    return { action: 'unknown', rawText: transcript };
  }
}

export async function parseFoodIntent(transcript: string): Promise<FoodIntent> {
  try {
    const prompt = buildFoodPrompt();
    const text = await callClaude(prompt, transcript);
    const parsed = JSON.parse(text);
    return { items: parsed.items || [] };
  } catch {
    return { items: [] };
  }
}
