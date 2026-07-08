import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_SYSTEM_GEMINI_KEYS } from './_gemini.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({ hasKey: !!process.env.GEMINI_API_KEY || DEFAULT_SYSTEM_GEMINI_KEYS.length > 0 });
}
