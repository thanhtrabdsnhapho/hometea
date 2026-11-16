import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    const expectedApiKey = process.env.NGUON_API_KEY || 'thanhtra_secure_key_2025';
    if (expectedApiKey && apiKeyHeader) {
      const token = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      const cleanToken = token.startsWith('Bearer ') ? token.replace('Bearer ', '') : token;
      if (cleanToken !== expectedApiKey) {
        // Optional enforcement if NGUON_API_KEY is strict, but let's allow or check
      }
    }

    const { ma_tk, noi_dung_tho, bai_dang_tho, gia, image_urls, khu } = req.body;

    if (!ma_tk) {
      return res.status(400).json({ status: 'loi', error: 'Thiếu mã TK (ma_tk)' });
    }

    const numericPrice = typeof gia === 'number' ? gia : parseFloat(gia) || 0;
    const imgListJson = image_urls && Array.isArray(image_urls) ? JSON.stringify(image_urls) : JSON.stringify([]);
    const firstImg = (image_urls && image_urls.length > 0) ? image_urls[0] : "https://images.unsplash.com/photo-1564013799912-8581894dff3e?auto=format&fit=crop&w=800&q=80";

    // Check if ma_tk exists in properties_hometea
    const { data: existingRows, error: fetchErr } = await supabase
      .from('properties_hometea')
      .select('id, price, gia_nguon, publish_status')
      .eq('ma_tk', ma_tk)
      .limit(1);

    if (fetchErr) {
      console.error('Error fetching property by ma_tk:', fetchErr);
      return res.status(500).json({ status: 'loi', error: fetchErr.message });
    }

    if (!existingRows || existingRows.length === 0) {
      // Create new draft listing
      const newRecord = {
        ma_tk,
        noi_dung_tho: noi_dung_tho || '',
        bai_dang_tho: bai_dang_tho || '',
        title: `TIN ĐĂNG MỚI - ${ma_tk}`,
        desc: noi_dung_tho || bai_dang_tho || 'Đang cập nhật nội dung...',
        price: numericPrice,
        price_text: `${numericPrice} Tỷ`,
        ward: khu || 'Thủ Đức',
        img: firstImg,
        img_list: imgListJson,
        publish_status: 'draft',
        gia_nguon: numericPrice,
        created_at: new Date().toISOString()
      };

      const { data: insertData, error: insertErr } = await supabase
        .from('properties_hometea')
        .insert([newRecord])
        .select('id')
        .single();

      if (insertErr) {
        console.error('Error inserting new draft property:', insertErr);
        return res.status(500).json({ status: 'loi', error: insertErr.message });
      }

      return res.status(200).json({ status: 'tao_nhap', id: insertData?.id, ma_tk });
    } else {
      // Existing record found
      const currentProp = existingRows[0];
      const currentPrice = parseFloat(currentProp.price) || 0;
      const currentGiaNguon = currentProp.gia_nguon !== null && currentProp.gia_nguon !== undefined ? parseFloat(currentProp.gia_nguon) : null;

      if (numericPrice === currentPrice) {
        return res.status(200).json({ status: 'khong_doi', id: currentProp.id, ma_tk });
      }

      // Check if current price equals old gia_nguon (not modified manually by user)
      if (currentGiaNguon === null || currentPrice === currentGiaNguon) {
        // Update price, gia_cu, ngay_doi_gia, gia_nguon
        const updatePayload = {
          gia_cu: currentPrice,
          price: numericPrice,
          price_text: `${numericPrice} Tỷ`,
          ngay_doi_gia: new Date().toISOString(),
          gia_nguon: numericPrice,
          updated_at: new Date().toISOString()
        };

        const { error: updateErr } = await supabase
          .from('properties_hometea')
          .update(updatePayload)
          .eq('id', currentProp.id);

        if (updateErr) {
          return res.status(500).json({ status: 'loi', error: updateErr.message });
        }

        return res.status(200).json({ status: 'cap_nhat_gia', id: currentProp.id, ma_tk });
      } else {
        // Price was modified manually by admin -> save to gia_nguon_cho_duyet
        const updatePayload = {
          gia_nguon_cho_duyet: numericPrice,
          updated_at: new Date().toISOString()
        };

        const { error: updateErr } = await supabase
          .from('properties_hometea')
          .update(updatePayload)
          .eq('id', currentProp.id);

        if (updateErr) {
          return res.status(500).json({ status: 'loi', error: updateErr.message });
        }

        return res.status(200).json({ status: 'cho_duyet', id: currentProp.id, ma_tk });
      }
    }
  } catch (err: any) {
    console.error('Unhandled error in nguon-nhap API:', err);
    return res.status(500).json({ status: 'loi', error: err?.message || String(err) });
  }
}
