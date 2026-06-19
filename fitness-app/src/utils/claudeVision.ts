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

export async function analyzeFood(base64Image: string, apiKey: string): Promise<VisionResult> {
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
            },
            { type: 'text', text: 'Analyze this food and estimate the nutrition.' },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error: ${res.status} - ${(err as { error?: { message?: string } }).error?.message || 'Unknown error'}`);
  }

  const data = await res.json();
  const text = data.content[0].text;
  return JSON.parse(text) as VisionResult;
}

export async function testClaudeKey(apiKey: string): Promise<boolean> {
  try {
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
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
