import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase Client Initialization
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

// Helper to sanitize error messages from potentially containing the raw access token
function sanitizeError(msg: string): string {
  if (!msg) return msg;
  // Facebook user or page tokens start with EAA and are alphanumeric
  return msg.replace(/\b(EAA[a-zA-Z0-9]{15,})\b/ig, '[MASKED_FB_TOKEN]');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  try {
    const pageIdClean = String(page_id).trim();
    let tokenClean = String(access_token || '').trim();

    // Secure token recovery from database if token is masked or omitted
    if (!tokenClean || tokenClean.includes('•') || tokenClean.length < 10) {
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase URL hoặc Key chưa cấu hình trên máy chủ để phục hồi token dài hạn');
      }

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
        throw new Error(`Không tìm thấy Fanpage ID ${pageIdClean} đã kết nối trong cơ sở dữ liệu.`);
      }
      tokenClean = data[0].access_token.trim();
    }

    const mediaFbids: string[] = [];

    // 1. Upload photos to Facebook if any are provided
    if (Array.isArray(image_urls) && image_urls.length > 0) {
      for (const imgUrl of image_urls) {
        if (!imgUrl || typeof imgUrl !== 'string') continue;

        const photoResponse = await fetch(`https://graph.facebook.com/v19.0/${pageIdClean}/photos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: imgUrl.trim(),
            published: false,
            access_token: tokenClean
          })
        });

        const photoResult: any = await photoResponse.json();

        if (!photoResponse.ok || !photoResult.id) {
          console.error('[post-to-facebook] Upload photo error details:', photoResult);
          const errorMsg = photoResult.error?.message || 'Không thể tải ảnh lên Facebook';
          throw new Error(`Lỗi tải ảnh (${imgUrl.substring(0, 30)}...): ${errorMsg}`);
        }

        mediaFbids.push(photoResult.id);
      }
    }

    // 2. Publish to Facebook feed
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(feedBody)
    });

    const feedResult: any = await feedResponse.json();

    if (!feedResponse.ok) {
      console.error('[post-to-facebook] Publish feed error details:', feedResult);
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
      console.warn('[post-to-facebook] Database logging failed (success post):', dbErr);
    }

    return res.status(200).json({
      success: true,
      post_id: feedResult.id || feedResult.post_id || 'ok',
      message: 'Đăng bài lên Facebook thành công!'
    });

  } catch (err: any) {
    const errorMsgRaw = err.message || 'Đã xảy ra lỗi không xác định tại máy chủ khi đăng bài';
    const errorMsg = sanitizeError(errorMsgRaw);
    
    console.error('[post-to-facebook] Handler internal error:', errorMsg);

    // Record failure in history
    try {
      await supabase.from('facebook_post_history').insert({
        product_id: String(product_id || ''),
        product_name: String(product_name || 'Sản phẩm không tên'),
        page_id: String(page_id || ''),
        page_name: String(page_name || 'Fanpage'),
        posted_at: new Date().toISOString(),
        status: 'failed',
        error_message: errorMsg
      });
    } catch (dbErr) {
      console.warn('[post-to-facebook] Database logging failed (failed post):', dbErr);
    }

    return res.status(500).json({
      error: errorMsg
    });
  }
}
