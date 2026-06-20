import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const productId = String(req.query.product_id || '').trim();
  const pageIdsStr = String(req.query.page_ids || '').trim();

  if (!pageIdsStr) {
    return res.status(200).json({ results: {} });
  }

  const pageIds = pageIdsStr.split(',').map(id => id.trim()).filter(Boolean);

  try {
    const results: Record<string, { dailyCount: number; duplicatePostedAt: string | null }> = {};

    // Calculate dates in UTC
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const pageId of pageIds) {
      // 1. Count success posts of this page in last 24h
      const { count: dailyCount, error: dailyError } = await supabase
        .from('facebook_post_history')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', pageId)
        .eq('status', 'success')
        .gte('posted_at', oneDayAgo);

      // 2. Check if product already posted on this page in the last 7 days
      const { data: dupData, error: dupError } = await supabase
        .from('facebook_post_history')
        .select('posted_at')
        .eq('page_id', pageId)
        .eq('product_id', productId)
        .eq('status', 'success')
        .gte('posted_at', sevenDaysAgo)
        .order('posted_at', { ascending: false })
        .limit(1);

      const dCount = (dailyError) ? 0 : (dailyCount || 0);
      const dupPostedAt = (dupError || !dupData || dupData.length === 0) ? null : dupData[0].posted_at;

      results[pageId] = {
        dailyCount: dCount,
        duplicatePostedAt: dupPostedAt
      };
    }

    return res.status(200).json({ results });
  } catch (err: any) {
    console.error('[facebook-post-check] Error:', err);
    const results: Record<string, { dailyCount: number; duplicatePostedAt: string | null }> = {};
    for (const pageId of pageIds) {
      results[pageId] = { dailyCount: 0, duplicatePostedAt: null };
    }
    return res.status(200).json({ results, warning: 'Bảng facebook_post_history không tồn tại.' });
  }
}
