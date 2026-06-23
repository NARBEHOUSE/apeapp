import { callAI } from './aiAdapter';

interface DetectedFood {
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

interface VisionResult {
  foods: DetectedFood[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  disclaimer: string;
}

const SYSTEM_PROMPT = `You are a nutrition estimation assistant. Analyze the food in the image and estimate nutritional content.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "foods": [
    {
      "name": "Food name",
      "estimatedAmount": "e.g. 150g, 1 cup, 1 medium",
      "calories": 250,
      "protein": 30,
      "carbs": 15,
      "fat": 8,
      "confidence": "high|medium|low",
      "notes": "Brief note about the estimate"
    }
  ],
  "totalCalories": 250,
  "totalProtein": 30,
  "totalCarbs": 15,
  "totalFat": 8,
  "disclaimer": "These are estimates. Verify against packaging when possible."
}`;

export async function analyzeFood(base64Image: string, _apiKey: string, userNotes?: string): Promise<VisionResult> {
  const userText = userNotes?.trim()
    ? `Analyze this food and estimate the nutrition. The user provided these notes about the food — use them to make your estimates more accurate:\n"${userNotes.trim()}"`
    : 'Analyze this food and estimate the nutrition.';

  const { text } = await callAI({ systemPrompt: SYSTEM_PROMPT, userPrompt: userText, imageBase64: base64Image });

  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned) as VisionResult;
}

export async function testClaudeKey(_apiKey: string): Promise<boolean> {
  try {
    await callAI({ systemPrompt: '', userPrompt: 'Hi' });
    return true;
  } catch {
    return false;
  }
}
