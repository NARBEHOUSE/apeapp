import { getApiKey, detectProvider } from './apiKeyManager';

const MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
};

const DEFAULT_MAX_TOKENS = 1024;

export async function callAI({
  systemPrompt,
  userPrompt,
  imagesBase64,
  maxTokens,
}: {
  systemPrompt: string;
  userPrompt: string;
  /** Raw base64 JPEG data (no data: prefix), in the order the prompt refers to them. */
  imagesBase64?: string[];
  /** Output cap for this call. Left to the provider's own default when omitted. */
  maxTokens?: number;
}): Promise<{ text: string }> {
  const key = getApiKey();
  if (!key) throw new Error('No API key set. Add one in Settings.');

  const provider = detectProvider(key);
  const images = imagesBase64 ?? [];

  switch (provider) {
    case 'anthropic':
      return callAnthropic(key, systemPrompt, userPrompt, images, maxTokens);
    case 'openai':
      return callOpenAICompat(key, 'https://api.openai.com/v1/chat/completions', MODELS.openai, systemPrompt, userPrompt, images, maxTokens);
    case 'openrouter':
      return callOpenAICompat(key, 'https://openrouter.ai/api/v1/chat/completions', MODELS.openrouter, systemPrompt, userPrompt, images, maxTokens);
    case 'gemini':
      return callGemini(key, systemPrompt, userPrompt, images, maxTokens);
    default:
      throw new Error('Unrecognized API key format. Check your key in Settings.');
  }
}

async function callAnthropic(
  key: string,
  system: string,
  user: string,
  images: string[],
  maxTokens: number | undefined,
): Promise<{ text: string }> {
  const content: object[] = images.map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }));
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
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
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
  images: string[],
  maxTokens: number | undefined,
): Promise<{ text: string }> {
  type ContentPart = { type: string; text?: string; image_url?: { url: string } };
  const userContent: ContentPart[] | string = images.length > 0
    ? [
        ...images.map((data): ContentPart => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${data}` },
        })),
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
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
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
  images: string[],
  maxTokens: number | undefined,
): Promise<{ text: string }> {
  const parts: object[] = images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  parts.push({ text: system ? `${system}\n\n${user}` : user });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      // Left off entirely when uncapped, so Gemini keeps its own (much larger) default.
      ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gemini error ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }

  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return { text: data.candidates[0].content.parts[0].text };
}
