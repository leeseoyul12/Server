import { Request, Response } from 'express';
import { sendMessage, getChatHistory, ChatMessage } from '../services/chatService';

const parseHistory = (value: unknown): ChatMessage[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { role?: unknown; content?: unknown };
      const role = row.role === 'user' ? 'user' : row.role === 'model' ? 'model' : null;
      const content = typeof row.content === 'string' ? row.content : null;
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((item): item is ChatMessage => item !== null)
    .slice(-20);
};

export const sendMessageHandler = async (req: Request, res: Response) => {
  const { user_id, message, history } = req.body;

  if (!user_id || !message) {
    res.status(400).json({ error: 'user_id and message are required.' });
    return;
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'message cannot be empty.' });
    return;
  }

  try {
    const { reply } = await sendMessage(user_id, message.trim(), parseHistory(history));
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const getChatHistoryHandler = async (req: Request, res: Response) => {
  const { user_id, limit } = req.query;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id query parameter is required.' });
    return;
  }

  const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    res.status(400).json({ error: 'limit must be a positive integer.' });
    return;
  }

  try {
    const data = await getChatHistory(user_id, parsedLimit);
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
