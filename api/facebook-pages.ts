import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase Client Initialization
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

// Helper to mask token: shows only last 4 characters
function maskToken(token: string): string {
  if (!token) return '••••';
  const clean = token.trim();
  if (clean.length <= 4) return '••••';
  return '••••••••' + clean.slice(-4);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!supabaseUrl || !supabaseKey) {
      console.error('[facebook-pages] Error: Missing Supabase credentials in env.');
      return res.status(500).json({ error: 'Cấu hình Supabase trên máy chủ chưa hoàn tất' });
    }

    // 1. GET: Fetch saved facebook pages
    if (req.method === 'GET') {
      const { data: pages, error } = await supabase
        .from('facebook_pages')
        .select('id, page_name, page_id, access_token, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist yet, return empty list or a helpful hint instead of a hard crash
        if (error.code === 'PGRST116' || error.code === '42P01' || error.code === '42703' || error.message?.includes('does not exist')) {
          return res.status(200).json([]);
        }
        throw error;
      }

      // Mask token before returning
      const sanitizedPages = (pages || []).map(p => ({
        id: p.id,
        page_name: p.page_name,
        page_id: p.page_id,
        access_token: maskToken(p.access_token),
        created_at: p.created_at
      }));

      return res.status(200).json(sanitizedPages);
    }

    // 2. POST: Add new facebook page configuration
    if (req.method === 'POST') {
      const { page_name, page_id, access_token } = req.body;

      if (!page_name || !page_id || !access_token) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ: Tên hiển thị, Page ID và Access Token!' });
      }

      const { data, error } = await supabase
        .from('facebook_pages')
        .insert([
          {
            page_name: page_name.trim(),
            page_id: page_id.trim(),
            access_token: access_token.trim()
          }
        ])
        .select();

      if (error) {
        throw error;
      }

      return res.status(201).json({
        success: true,
        message: 'Lưu Fanpage thành công!',
        data: data ? data[0] : null
      });
    }

    // 3. DELETE: Remove facebook page configuration
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Thiếu tham số id để xóa!' });
      }

      const { error } = await supabase
        .from('facebook_pages')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        message: 'Đã xóa cấu hình Fanpage thành công!'
      });
    }

    // 4. PUT / PATCH: Update existing facebook page configuration
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { id, page_name, page_id, access_token } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Thiếu tham số id để cập nhật!' });
      }

      const updateData: any = {};
      if (page_name !== undefined) updateData.page_name = page_name.trim();
      if (page_id !== undefined) updateData.page_id = page_id.trim();
      if (access_token && !access_token.includes('•') && access_token.trim() !== '') {
        updateData.access_token = access_token.trim();
      }

      const { data, error } = await supabase
        .from('facebook_pages')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        message: 'Cập nhật cấu hình Fanpage thành công!',
        data: data ? data[0] : null
      });
    }

    // Unhandled methods
    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (err: any) {
    console.error('[facebook-pages] Server error:', err);
    return res.status(500).json({ error: err?.message || 'Đã xảy ra lỗi trên hệ thống máy chủ' });
  }
}
