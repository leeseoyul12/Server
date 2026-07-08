import { supabase } from './supabase';
import { isSupabaseStorageError, memoryStore } from './memoryStore';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_CANDIDATES = (
  process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []
).concat([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
]);

export type Role = 'user' | 'model';

export interface ChatMessage {
  role: Role;
  content: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

const fallbackReply =
  'AI provider is still unavailable. The backend connection is working, but every configured Gemini model failed. Check the server terminal for the exact Gemini error.';

const toGeminiRole = (role: Role) => (role === 'model' ? 'model' : 'user');

const buildContents = (history: ChatMessage[], userMessage: string) => [
  ...history.map((message) => ({
    role: toGeminiRole(message.role),
    parts: [{ text: message.content }],
  })),
  {
    role: 'user',
    parts: [{ text: userMessage }],
  },
];

const callGeminiRest = async (
  modelName: string,
  history: ChatMessage[],
  userMessage: string
) => {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: buildContents(history, userMessage) }),
    }
  );

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini request failed with status ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
};

const generateReply = async (history: ChatMessage[], userMessage: string) => {
  let lastError: unknown;

  for (const modelName of [...new Set(MODEL_CANDIDATES)]) {
    try {
      const reply = await callGeminiRest(modelName, history, userMessage);
      console.log(`Gemini response generated with model: ${modelName}`);
      return reply;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Gemini model failed (${modelName}): ${message}`);
    }
  }

  console.error('All Gemini model candidates failed:', lastError);
  return fallbackReply;
};

export const sendMessage = async (
  user_id: string,
  userMessage: string,
  providedHistory?: ChatMessage[]
): Promise<{ reply: string }> => {
  let history: ChatMessage[] = providedHistory ?? [];

  if (!providedHistory) {
    const { data, error: historyError } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true })
      .limit(20);

    if (historyError) {
      if (!isSupabaseStorageError(historyError)) throw new Error(historyError.message);
      history = memoryStore.chatHistory
        .filter((row) => row.user_id === user_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-20)
        .map((row) => ({ role: row.role, content: row.content }));
    } else {
      history = (data ?? []) as ChatMessage[];
    }
  }

  const reply = await generateReply(history, userMessage);

  const now = new Date().toISOString();
  const rows = [
    { user_id, role: 'user' as Role, content: userMessage, created_at: now },
    { user_id, role: 'model' as Role, content: reply, created_at: new Date().toISOString() },
  ];

  const { error: insertError } = await supabase.from('chat_history').insert(rows);

  if (insertError) {
    if (!isSupabaseStorageError(insertError)) throw new Error(insertError.message);
    memoryStore.chatHistory.push(...rows);
  }

  return { reply };
};

export const getChatHistory = async (user_id: string, limit = 50) => {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, content, created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (!isSupabaseStorageError(error)) throw new Error(error.message);
    return memoryStore.chatHistory
      .filter((row) => row.user_id === user_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit);
  }

  return data ?? [];
};

