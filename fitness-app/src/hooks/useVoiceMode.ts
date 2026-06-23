import { useState, useCallback, useRef } from 'react';
import { useSpeech } from './useSpeech';
import { parseWorkoutIntent, parseFoodIntent, type WorkoutVoiceContext, type WorkoutIntent, type FoodIntentItem } from '../utils/voiceIntentParser';
import { searchFoods } from '../utils/usda';
import type { FoodEntry } from '../types';

interface PendingWorkoutAction {
  type: 'workout';
  intent: WorkoutIntent;
  message: string;
  detail?: string;
}

interface PendingFoodAction {
  type: 'food';
  items: { item: FoodIntentItem; macros: { name: string; brand?: string; calories: number; protein: number; carbs: number; fat: number; fiber: number; servingSize: number } }[];
  message: string;
  detail?: string;
}

type PendingAction = PendingWorkoutAction | PendingFoodAction;

interface UseVoiceModeOptions {
  mode: 'workout' | 'food';
  enabled: boolean;
  workoutContext?: WorkoutVoiceContext;
  onLogSet?: (exerciseId: string, weight: number, reps: number, rir?: number, rpe?: number) => void;
  onSkipExercise?: (exerciseId: string, reason?: string) => void;
  onFinishWorkout?: () => void;
  onAddFoodEntry?: (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => void;
  selectedDate?: string;
}

export function useVoiceMode({
  mode, enabled, workoutContext, onLogSet, onSkipExercise, onFinishWorkout, onAddFoodEntry, selectedDate,
}: UseVoiceModeOptions) {
  const { speak } = useSpeech();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmListenerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTranscript = useCallback(async (transcript: string) => {
    if (!enabled || !transcript.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (mode === 'workout' && workoutContext) {
        const intent = await parseWorkoutIntent(transcript, workoutContext);

        if (intent.action === 'log_set') {
          const msg = `Log set: ${intent.weight} × ${intent.reps} on ${intent.exerciseName}`;
          const detail = (intent.rir != null ? `RIR ${intent.rir}` : '') + (intent.rpe != null ? `RPE ${intent.rpe}` : '');
          setPendingAction({ type: 'workout', intent, message: msg, detail: detail || undefined });
          speak(`${intent.weight} times ${intent.reps} on ${intent.exerciseName}. Confirm?`);
        } else if (intent.action === 'skip_exercise') {
          setPendingAction({ type: 'workout', intent, message: `Skip ${intent.exerciseName}?` });
          speak(`Skip ${intent.exerciseName}?`);
        } else if (intent.action === 'finish_workout') {
          setPendingAction({ type: 'workout', intent, message: 'Finish workout?' });
          speak('Finish workout?');
        } else {
          speak("Sorry, I didn't understand that. Try again.");
          setError(`Didn't understand: "${transcript}"`);
        }
      } else if (mode === 'food') {
        const foodIntent = await parseFoodIntent(transcript);
        if (foodIntent.items.length === 0) {
          speak("I couldn't identify any foods. Try again.");
          setError('No foods identified');
          setIsProcessing(false);
          return;
        }

        // Look up each item via USDA, fall back to Claude's own estimates
        const resolved = await Promise.all(
          foodIntent.items.map(async (item) => {
            try {
              const results = await searchFoods(item.searchQuery);
              if (results.length > 0) {
                const top = results[0];
                const factor = item.estimatedServingSize / 100;
                const calories = Math.round(top.caloriesPer100g * factor);
                if (calories > 0) {
                  return {
                    item,
                    macros: {
                      name: top.name, brand: top.brand,
                      calories,
                      protein: Math.round(top.proteinPer100g * factor * 10) / 10,
                      carbs: Math.round(top.carbsPer100g * factor * 10) / 10,
                      fat: Math.round(top.fatPer100g * factor * 10) / 10,
                      fiber: Math.round(top.fiberPer100g * factor * 10) / 10,
                      servingSize: item.estimatedServingSize,
                    },
                  };
                }
              }
            } catch {}
            // Fallback to Claude's own estimates when USDA fails or returns empty macros
            return {
              item,
              macros: {
                name: item.searchQuery,
                calories: item.estimatedCalories ?? 0,
                protein: item.estimatedProtein ?? 0,
                carbs: item.estimatedCarbs ?? 0,
                fat: item.estimatedFat ?? 0,
                fiber: item.estimatedFiber ?? 0,
                servingSize: item.estimatedServingSize,
              },
            };
          })
        );

        const totalCal = resolved.reduce((s, r) => s + r.macros.calories, 0);
        const names = resolved.map((r) => r.macros.name).join(', ');
        const msg = `Add ${resolved.length} item${resolved.length > 1 ? 's' : ''}: ${totalCal} cal total`;

        setPendingAction({ type: 'food', items: resolved, message: msg, detail: names });
        speak(`Adding ${names}. ${totalCal} calories total. Confirm?`);
      }
    } catch (err) {
      speak("Sorry, something went wrong. Try again.");
      setError(err instanceof Error ? err.message : 'Voice processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [enabled, mode, workoutContext, speak]);

  const confirmAction = useCallback(() => {
    if (!pendingAction) return;

    if (pendingAction.type === 'workout') {
      const intent = pendingAction.intent;
      if (intent.action === 'log_set') {
        onLogSet?.(intent.exerciseId, intent.weight, intent.reps, intent.rir, intent.rpe);
        speak(`Set logged. ${intent.weight} times ${intent.reps}.`);
      } else if (intent.action === 'skip_exercise') {
        onSkipExercise?.(intent.exerciseId, intent.reason);
        speak(`${intent.exerciseName} skipped.`);
      } else if (intent.action === 'finish_workout') {
        onFinishWorkout?.();
        speak('Workout complete. Great job!');
      }
    } else if (pendingAction.type === 'food') {
      const date = selectedDate || new Date().toISOString().split('T')[0];
      for (const { item, macros } of pendingAction.items) {
        onAddFoodEntry?.({
          date,
          name: macros.name,
          brand: macros.brand,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
          fiber: macros.fiber,
          servingSize: macros.servingSize,
          servingUnit: item.estimatedServingUnit || 'g',
          servingsConsumed: item.estimatedServings || 1,
          source: 'manual',
          mealType: item.mealType,
        });
      }
      speak(`${pendingAction.items.length} item${pendingAction.items.length > 1 ? 's' : ''} added.`);
    }

    setPendingAction(null);
  }, [pendingAction, onLogSet, onSkipExercise, onFinishWorkout, onAddFoodEntry, selectedDate, speak]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    speak('Cancelled.');
  }, [speak]);

  // Listen for voice confirmation
  const handleConfirmTranscript = useCallback((text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('yes') || lower.includes('confirm') || lower.includes('do it') || lower.includes('log it') || lower.includes('add it')) {
      confirmAction();
    } else if (lower.includes('no') || lower.includes('cancel') || lower.includes('nevermind')) {
      cancelAction();
    }
  }, [confirmAction, cancelAction]);

  return {
    isProcessing,
    pendingAction,
    confirmAction,
    cancelAction,
    handleTranscript,
    handleConfirmTranscript,
    error,
  };
}
