import { getApiKey, detectProvider } from './apiKeyManager';

const MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
};

export async function callAI({
  systemPrompt,
  userPrompt,
  imageBase64,
}: {
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string;
}): Promise<{ text: string }> {
  const key = getApiKey();
  if (!key) throw new Error('No API key set. Add one in Settings.');

  const provider = detectProvider(key);

  switch (provider) {
    case 'anthropic':
      return callAnthropic(key, systemPrompt, userPrompt, imageBase64);
    case 'openai':
      return callOpenAICompat(key, 'https://api.openai.com/v1/chat/completions', MODELS.openai, systemPrompt, userPrompt, imageBase64);
    case 'openrouter':
      return callOpenAICompat(key, 'https://openrouter.ai/api/v1/chat/completions', MODELS.openrouter, systemPrompt, userPrompt, imageBase64);
    case 'gemini':
      return callGemini(key, systemPrompt, userPrompt, imageBase64);
    default:
      throw new Error('Unrecognized API key format. Check your key in Settings.');
  }
}

async function callAnthropic(
  key: string,
  system: string,
  user: string,
  imageBase64?: string,
): Promise<{ text: string }> {
  const content: object[] = [];
  if (imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } });
  }
  content.push({ type: 'text', text: user });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Anthropic error ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }

  const data = await res.json() as { content: Array<{ text: string }> };
  return { text: data.content[0].text };
}

async function callOpenAICompat(
  key: string,
  url: string,
  model: string,
  system: string,
  user: string,
  imageBase64?: string,
): Promise<{ text: string }> {
  type ContentPart = { type: string; text?: string; image_url?: { url: string } };
  const userContent: ContentPart[] | string = imageBase64
    ? [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        { type: 'text', text: user },
      ]
    : user;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`AI error ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return { text: data.choices[0].message.content };
}

async function callGemini(
  key: string,
  system: string,
  user: string,
  imageBase64?: string,
): Promise<{ text: string }> {
  const parts: object[] = [];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
  }
  parts.push({ text: system ? `${system}\n\n${user}` : user });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gemini error ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }

  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return { text: data.candidates[0].content.parts[0].text };
}
