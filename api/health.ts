import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY_PAID || process.env.GEMINI_API_KEY),
    env: process.env.NODE_ENV || 'production',
    ts: new Date().toISOString(),
  });
}
