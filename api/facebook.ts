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

// Helper to sanitize error messages from potentially containing the raw access token
function sanitizeError(msg: string): string {
  if (!msg) return msg;
  // Facebook user or page tokens start with EAA and are alphanumeric
  return msg.replace(/\b(EAA[a-zA-Z0-9]{15,})\b/ig, '[MASKED_FB_TOKEN]');
}

// ---------------------------------------------------------------------------
// Main Vercel Serverless Function Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = String(req.query.action || '').trim();

  if (!action) {
    return res.status(400).json({ error: 'Cần truyền tham số query action (ví dụ: ?action=list-pages)' });
  }

  try {
    if (!supabaseUrl || !supabaseKey) {
      console.error('[facebook-api] Error: Missing Supabase credentials in env.');
      return res.status(500).json({ error: 'Cấu hình Supabase trên máy chủ chưa hoàn tất' });
    }

    switch (action) {
      // -----------------------------------------------------------------------
      // 1. GET: Fetch saved Facebook pages
      // -----------------------------------------------------------------------
      case 'list-pages': {
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const { data: pages, error } = await supabase
          .from('facebook_pages')
          .select('id, page_name, page_id, access_token, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          if (error.code === 'PGRST116' || error.code === '42P01' || error.code === '42703' || error.message?.includes('does not exist')) {
            return res.status(200).json([]);
          }
          throw error;
        }

        const sanitizedPages = (pages || []).map(p => ({
          id: p.id,
          page_name: p.page_name,
          page_id: p.page_id,
          access_token: maskToken(p.access_token),
          created_at: p.created_at
        }));

        return res.status(200).json(sanitizedPages);
      }

      // -----------------------------------------------------------------------
      // 2. POST: Add new Facebook page configuration
      // -----------------------------------------------------------------------
      case 'save-page': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

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

        if (error) throw error;

        return res.status(201).json({
          success: true,
          message: 'Lưu Fanpage thành công!',
          data: data ? data[0] : null
        });
      }

      // -----------------------------------------------------------------------
      // 3. PUT / PATCH: Update existing Facebook page
      // -----------------------------------------------------------------------
      case 'update-page': {
        if (req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'POST') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

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

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: 'Cập nhật cấu hình Fanpage thành công!',
          data: data ? data[0] : null
        });
      }

      // -----------------------------------------------------------------------
      // 4. DELETE: Remove Facebook page
      // -----------------------------------------------------------------------
      case 'delete-page': {
        if (req.method !== 'DELETE' && req.method !== 'POST' && req.method !== 'GET') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const id = req.query.id || req.body?.id;

        if (!id) {
          return res.status(400).json({ error: 'Thiếu tham số id để xóa!' });
        }

        const { error } = await supabase
          .from('facebook_pages')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: 'Đã xóa cấu hình Fanpage thành công!'
        });
      }

      // -----------------------------------------------------------------------
      // 5. POST: Post an update to Facebook Page Feed
      // -----------------------------------------------------------------------
      case 'post': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const { page_id, page_name, access_token, caption, image_urls, product_id, product_name } = req.body;

        if (!page_id) {
          return res.status(400).json({ error: 'Thiếu Facebook Page ID' });
        }

        if (!caption) {
          return res.status(400).json({ error: 'Nội dung caption không được để trống' });
        }

        const pageIdClean = String(page_id).trim();
        let tokenClean = String(access_token || '').trim();

        // Secure token recovery from database if token is masked or omitted
        if (!tokenClean || tokenClean.includes('•') || tokenClean.length < 10) {
          const { data, error } = await supabase
            .from('facebook_pages')
            .select('access_token')
            .eq('page_id', pageIdClean)
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            throw new Error(`Lỗi tìm token từ database: ${error.message}`);
          }
          if (!data || data.length === 0) {
            throw new Error(`Không thấy Fanpage ID ${pageIdClean} đã kết nối trong DB.`);
          }
          tokenClean = data[0].access_token.trim();
        }

        const mediaFbids: string[] = [];

        // Upload photos if any
        if (Array.isArray(image_urls) && image_urls.length > 0) {
          for (const imgUrl of image_urls) {
            if (!imgUrl || typeof imgUrl !== 'string') continue;

            const photoResponse = await fetch(`https://graph.facebook.com/v19.0/${pageIdClean}/photos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: imgUrl.trim(),
                published: false,
                access_token: tokenClean
              })
            });

            const photoResult: any = await photoResponse.json();

            if (!photoResponse.ok || !photoResult.id) {
              console.error('[facebook-api/post] Upload photo error details:', photoResult);
              const errorMsg = photoResult.error?.message || 'Không thể tải ảnh lên Facebook';
              throw new Error(`Lỗi tải ảnh (${imgUrl.substring(0, 30)}...): ${errorMsg}`);
            }

            mediaFbids.push(photoResult.id);
          }
        }

        // Publish to feed
        const feedBody: any = {
          message: caption,
          access_token: tokenClean
        };

        if (mediaFbids.length > 0) {
          feedBody.attached_media = JSON.stringify(
            mediaFbids.map(id => ({ media_fbid: id }))
          );
        }

        const feedResponse = await fetch(`https://graph.facebook.com/v19.0/${pageIdClean}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedBody)
        });

        const feedResult: any = await feedResponse.json();

        if (!feedResponse.ok) {
          console.error('[facebook-api/post] Publish feed error details:', feedResult);
          const errorMsg = feedResult.error?.message || 'Không thể đăng bài lên dòng thời gian';
          throw new Error(`Lỗi đăng bài lên feed: ${errorMsg}`);
        }

        // Record success to history
        try {
          await supabase.from('facebook_post_history').insert({
            product_id: String(product_id || ''),
            product_name: String(product_name || 'Sản phẩm không tên'),
            page_id: String(page_id || ''),
            page_name: String(page_name || 'Fanpage'),
            posted_at: new Date().toISOString(),
            status: 'success',
            error_message: null
          });
        } catch (dbErr) {
          console.warn('[facebook-api/post] Logging success post failed:', dbErr);
        }

        return res.status(200).json({
          success: true,
          post_id: feedResult.id || feedResult.post_id || 'ok',
          message: 'Đăng bài lên Facebook thành công!'
        });
      }

      // -----------------------------------------------------------------------
      // 6. GET: Fetch Facebook post history (pagination)
      // -----------------------------------------------------------------------
      case 'history': {
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

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
      }

      // -----------------------------------------------------------------------
      // 7. GET: Verify safety / daily rates / duplicate products
      // -----------------------------------------------------------------------
      case 'check': {
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const productId = String(req.query.product_id || '').trim();
        const pageIdsStr = String(req.query.page_ids || '').trim();

        if (!pageIdsStr) {
          return res.status(200).json({ results: {} });
        }

        const pageIds = pageIdsStr.split(',').map(id => id.trim()).filter(Boolean);
        const results: Record<string, { dailyCount: number; duplicatePostedAt: string | null }> = {};

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        for (const pageId of pageIds) {
          // Count success posts of this page in last 24h
          const { count: dailyCount, error: dailyError } = await supabase
            .from('facebook_post_history')
            .select('*', { count: 'exact', head: true })
            .eq('page_id', pageId)
            .eq('status', 'success')
            .gte('posted_at', oneDayAgo);

          // Check if product already posted on this page in the last 7 days
          const { data: dupData, error: dupError } = await supabase
            .from('facebook_post_history')
            .select('posted_at')
            .eq('page_id', pageId)
            .eq('product_id', productId)
            .eq('status', 'success')
            .gte('posted_at', sevenDaysAgo)
            .order('posted_at', { ascending: false })
            .limit(1);

          const dCount = dailyError ? 0 : (dailyCount || 0);
          const dupPostedAt = (dupError || !dupData || dupData.length === 0) ? null : dupData[0].posted_at;

          results[pageId] = {
            dailyCount: dCount,
            duplicatePostedAt: dupPostedAt
          };
        }

        return res.status(200).json({ results });
      }

      default: {
        return res.status(400).json({ error: `Hành động action='${action}' không được hỗ trợ.` });
      }
    }

  } catch (err: any) {
    const errorMsgRaw = err.message || 'Đã xảy ra lỗi không xác định tại máy chủ';
    const errorMsg = sanitizeError(errorMsgRaw);

    console.error(`[facebook-api][action=${action}] Server error:`, errorMsg);

    // If posting fails, try to save in history
    if (action === 'post') {
      try {
        const { page_id, product_id, product_name } = req.body || {};
        await supabase.from('facebook_post_history').insert({
          product_id: String(product_id || ''),
          product_name: String(product_name || 'Sản phẩm không tên'),
          page_id: String(page_id || ''),
          page_name: String(req.body?.page_name || 'Fanpage'),
          posted_at: new Date().toISOString(),
          status: 'failed',
          error_message: errorMsg
        });
      } catch (dbErr) {
        console.warn('[facebook-api/post] Failed logging failure post:', dbErr);
      }
    }

    return res.status(500).json({ error: errorMsg });
  }
}
