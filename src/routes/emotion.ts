import { Router } from 'express';
import { logEmotion, getHistory } from '../controllers/emotionController';

const router = Router();

router.post('/log', logEmotion);
router.get('/history', getHistory);

export default router;
