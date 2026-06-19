import { Router } from 'express';
import emotionRouter from './emotion';

const router = Router();

router.use('/emotion', emotionRouter);

export default router;
