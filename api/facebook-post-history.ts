import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Fetch post history with pagination
  if (req.method === 'GET') {
    try {
      const page = parseInt(String(req.query.page || '1'), 10);
      const limit = parseInt(String(req.query.limit || '20'), 10);
      const offset = (page - 1) * limit;

      const { data, count, error } = await supabase
        .from('facebook_post_history')
        .select('*', { count: 'exact' })
        .order('posted_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
          return res.status(200).json({ data: [], count: 0, warning: 'Bảng facebook_post_history chưa được tạo trong database.' });
        }
        throw error;
      }

      return res.status(200).json({
        data: data || [],
        count: count || 0,
        page,
        limit
      });
    } catch (err: any) {
      console.error('[facebook-post-history] GET error:', err);
      return res.status(500).json({ error: err.message || 'Lỗi khi lấy lịch sử đăng bài' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
