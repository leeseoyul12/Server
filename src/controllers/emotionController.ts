import { Request, Response } from 'express';
import { saveEmotionLog, getEmotionHistory } from '../services/emotionService';

export const logEmotion = async (req: Request, res: Response) => {
  const { user_id, emoji, note } = req.body;

  if (!user_id || !emoji) {
    res.status(400).json({ error: 'user_id와 emoji는 필수입니다.' });
    return;
  }

  try {
    const result = await saveEmotionLog({ user_id, emoji, note });
    res.status(201).json({ message: '감정 기록 저장 완료', data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const getHistory = async (req: Request, res: Response) => {
  const { user_id } = req.query;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id 쿼리 파라미터가 필요합니다.' });
    return;
  }

  try {
    const data = await getEmotionHistory(user_id);
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
