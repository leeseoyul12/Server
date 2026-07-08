import { Request, Response } from 'express';
import { signUp, signIn, signOut } from '../services/authService';

export const signUpHandler = async (req: Request, res: Response) => {
  const { email, password, nickname } = req.body;

  if (!email || !password || !nickname) {
    res.status(400).json({ error: 'email, password, nickname are required.' });
    return;
  }

  try {
    const result = await signUp(email, password, nickname);
    res.status(201).json({ message: 'signup complete', ...result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

export const signInHandler = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }

  try {
    const result = await signIn(email, password);
    res.status(200).json(result);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
};

export const signOutHandler = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header is required.' });
    return;
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    await signOut(accessToken);
    res.status(200).json({ message: 'logout complete' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
