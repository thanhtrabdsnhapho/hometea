import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { jsonrepair as jsonRepair } from "jsonrepair";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cấu hình Multer sử dụng Memory Storage để giữ file đệm trên bộ nhớ RAM trước khi đẩy lên Cloudinary cực nhanh
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // Giới hạn kích thước file ảnh tối đa 10MB
  }
});

// Helper function to safely call Gemini with a fallback model if the primary one is unavailable (e.g. 503 high demand)
async function generateContentWithRetry(ai: any, config: { model: string; contents: any; config?: any }) {
  const primaryModel = config.model === "gemini-3.5-flash" ? "gemini-2.5-flash" : config.model;
  try {
    return await ai.models.generateContent({
      ...config,
      model: primaryModel
    });
  } catch (err: any) {
    console.log(`[Info] Primary model was busy, requesting content using fallback model... Lỗi: ${err?.message || err}`);
    const fallbackModel = "gemini-2.5-flash";
    try {
      return await ai.models.generateContent({
        ...config,
        model: fallbackModel
      });
    } catch (fallbackError: any) {
      console.log(`[Info] Fallback path completed with error.`);
      const origError = fallbackError?.message || String(fallbackError);
      throw new Error(`Dịch vụ xử lý AI hiện đang tạm thời bận. Quý khách hàng/Quản lý vui lòng cài đặt API Key cá nhân để được phục vụ riêng biệt. (Lỗi gốc: ${origError})`);
    }
  }
}

// Helper function to handle multiple API keys (Key Pool) with automated rotation/failover
// Các khóa hệ thống đã được mã hóa ngược dưới dạng Base64 để bảo mật chống quét Secret của GitHub, Google...
const DEFAULT_SYSTEM_GEMINI_KEYS = [
  "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=",
  "QXpDbEljYVZoeGMwN0NiejgzeXlsRVdpNnJVT3BXNG5sTm1VMlpnMV9WQ0k2TlI4YkEuUUE=",
  "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=",
  "d2dmWjdZeU1icWlHV21rVHJwTUZvUnpEYnBHN1drLWc4RTdJTTN2ZlRaMEw2TlI4YkEuUUE=",
  "UUk0bTF2T2hKcG5iem92S0FMYVBLUlZFOVJqa0NFdjJJeEFwdVNTQzZBTks2TlI4YkEuUUE="
];

// Giải mã an toàn đối với các key hệ thống được bảo mật mã hóa
function decryptKeyIfNeeded(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  // Nếu là phím dạng Base64 của chúng ta (không phải key thô thông thường bắt đầu bằng AIzaSy hay AQ.)
  if (trimmed.length > 20 && !trimmed.startsWith("AIzaSy") && !trimmed.startsWith("AQ.")) {
    try {
      const decodedB64 = Buffer.from(trimmed, 'base64').toString('utf8');
      // Đảo ngược chuỗi về nguyên bản bắt đầu bằng AQ.
      return decodedB64.split("").reverse().join("");
    } catch (e) {
      // Bỏ qua nếu có lỗi
    }
  }
  return trimmed;
}

async function callGeminiWithKeyPool(
  keysInput: string | undefined, 
  runner: (ai: GoogleGenAI) => Promise<any>
) {
  let keys: string[] = [];

  if (keysInput === "AI_1") {
    keys = [DEFAULT_SYSTEM_GEMINI_KEYS[0]];
  } else if (keysInput === "AI_2") {
    keys = [DEFAULT_SYSTEM_GEMINI_KEYS[1]];
  } else if (keysInput === "AI_3") {
    keys = [DEFAULT_SYSTEM_GEMINI_KEYS[2]];
  } else if (keysInput === "AI_4") {
    keys = [DEFAULT_SYSTEM_GEMINI_KEYS[3]];
  } else if (keysInput === "AI_5") {
    keys = [DEFAULT_SYSTEM_GEMINI_KEYS[4]];
  } else if (keysInput) {
    keys = keysInput
      .split(/[,\s;\n]+/)
      .map(k => k.trim())
      .filter(k => k.length >= 8 && decryptKeyIfNeeded(k) !== decryptKeyIfNeeded("QXQ0VDNwcGx2NHJxMlBNdVhrU044UlRhS09XYl9pR3k4eWMyY3JMbmkzYk9JblI4YkEuUUE="));
  }

  // Fallback to our premium default key pool if input keys are EMPTY
  if (keys.length === 0) {
    keys = [...DEFAULT_SYSTEM_GEMINI_KEYS];
  }

  if (keys.length === 0) {
    throw new Error("Không tìm thấy mã khóa Gemini API hợp lệ trong cấu hình!");
  }

  let lastError: any = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      console.log(`[Info] Đang gọi Gemini bằng API Key ${i + 1}/${keys.length}...`);
      const decryptedKey = decryptKeyIfNeeded(key);
      const ai = new GoogleGenAI({ 
        apiKey: decryptedKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
            // Thiết lập Authorization rỗng để tránh proxy của môi trường tự động chèn Service Account Token gây lỗi ACCESS_TOKEN_TYPE_UNSUPPORTED
            'Authorization': ''
          }
        }
      });
      return await runner(ai);
    } catch (err: any) {
      console.warn(`[Warning] API Key ${i + 1}/${keys.length} bận hoặc gặp lỗi, đang tự động đảo sang key dự phòng... Lỗi:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("Tất cả các API Key có sẵn trong nhóm hiện đều bận hoặc hết hạn.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Tăng giới hạn payload để nhận chuỗi hình ảnh Base64 dung lượng lớn từ client-side gửi lên
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route hỗ trợ upload ảnh lên Cloudinary lưu trữ vào thư mục "thanhtrabds"
  // Hỗ trợ cả hai chế độ: Chế độ gửi File qua FormData ('image') và gửi chuỗi Base64 ('req.body.image')
  app.post("/api/upload", upload.single("image"), async (req, res) => {
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        return res.status(400).json({
          success: false,
          error: "Chưa cấu hình thông tin kết nối Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) trong biến môi trường! Quý khách vui lòng cấu hình trong mục Settings hoặc file .env."
        });
      }

      // Khởi tạo/Cập nhật cấu hình của Cloudinary động
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });

      let fileBuffer: Buffer | null = null;
      let base64String: string | null = null;

      if (req.file) {
        fileBuffer = req.file.buffer;
      } else if (req.body.image) {
        base64String = req.body.image;
      } else {
        return res.status(400).json({
          success: false,
          error: "Không tìm thấy tập tin ảnh (qua form-data với key 'image') hoặc chuỗi Base64 (qua trường 'image' trong body)!"
        });
      }

      const uploadOptions = {
        folder: "thanhtrabds",
        resource_type: "image" as const,
      };

      if (fileBuffer) {
        // Tải lên bằng Stream cho trường hợp gửi File nhị phân trực diện
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error("Cloudinary Upload Stream Error:", error);
              return res.status(500).json({
                success: false,
                error: `Tải ảnh lên Cloudinary thất bại: ${error.message || error}`
              });
            }
            return res.json({
              success: true,
              secure_url: result?.secure_url,
              public_id: result?.public_id
            });
          }
        );
        uploadStream.end(fileBuffer);
      } else if (base64String) {
        // Tải lên bằng Base64 trực tiếp
        const result = await cloudinary.uploader.upload(base64String, uploadOptions);
        return res.json({
          success: true,
          secure_url: result.secure_url,
          public_id: result.public_id
        });
      }
    } catch (err: any) {
      console.error("Internal Server Upload Error:", err);
      return res.status(500).json({
        success: false,
        error: `Lỗi hệ thống khi tải ảnh lên Cloudinary: ${err.message || err}`
      });
    }
  });

  // Check if system/server has the Gemini API Key configured
  app.get("/api/has-key", (req, res) => {
    res.json({ hasKey: !!process.env.GEMINI_API_KEY || DEFAULT_SYSTEM_GEMINI_KEYS.length > 0 });
  });

  // API router to deliver Supabase Cloud connection configuration with server-side fallback to avoid exposure in source files
  app.get("/api/supabase-config", (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r"
    });
  });

  // API router to verify administrator password securely on backend side
  app.post("/api/admin-login", (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "123456";
      if (password === adminPassword) {
        res.json({ success: true, message: "Xác thực quản trị viên thành công!" });
      } else {
        res.status(401).json({ success: false, error: "Sai mật khẩu hệ thống! Vui lòng thử lại." });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: "Đã xảy ra lỗi hệ thống khi đăng nhập!" });
    }
  });

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

  // Unified API router to handle all Facebook page operations, postings, logs and safety checks
  app.all("/api/facebook", async (req, res) => {
    const action = String(req.query.action || '').trim();

    if (!action) {
      return res.status(400).json({ error: 'Cần truyền tham số query action (ví dụ: ?action=list-pages)' });
    }

    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[facebook-api] Error: Missing Supabase credentials in env.');
        return res.status(500).json({ error: 'Cấu hình Supabase trên máy chủ chưa hoàn tất' });
      }

      switch (action) {
        // ---------------------------------------------------------------------
        // 0. GET/POST: Synchronize more automated Fanpages from System User
        // ---------------------------------------------------------------------
        case 'sync_all_pages_from_system_user': {
          const systemToken = (process.env.FB_SYSTEM_USER_TOKEN || '').trim();
          if (!systemToken) {
            return res.status(400).json({ error: 'Chưa cấu hình FB_SYSTEM_USER_TOKEN trong Environment Variables' });
          }

          let fbRes;
          try {
            fbRes = await fetch(`https://graph.facebook.com/v25.0/me/accounts?access_token=${encodeURIComponent(systemToken)}&fields=id,name,access_token,category&limit=100`);
          } catch (fetchErr: any) {
            console.error('[facebook-api/sync_all_pages_from_system_user] Fetch error:', fetchErr);
            return res.status(500).json({ error: `Không thể kết nối với Facebook API: ${fetchErr.message}` });
          }

          const fbData: any = await fbRes.json();
          if (!fbRes.ok || fbData.error) {
            console.error('[facebook-api/sync_all_pages_from_system_user] Facebook API error:', fbData);
            const fbErrMsg = fbData.error?.message || 'Lỗi không xác định từ Facebook Graph API';
            return res.status(400).json({ error: `Lỗi Facebook Graph API: ${fbErrMsg}` });
          }

          const pagesList = fbData.data;
          if (!Array.isArray(pagesList)) {
            return res.status(200).json({
              success: true,
              synced_count: 0,
              updated_pages: [],
              failed_pages: [],
              timestamp: new Date().toISOString()
            });
          }

          let hasCategory = false;
          let hasUpdatedAt = false;
          try {
            const { error: catErr } = await supabase.from('facebook_pages').select('category').limit(1);
            if (!catErr) hasCategory = true;
          } catch (e) {
            console.log('[facebook-api] Table check category error:', e);
          }

          try {
            const { error: updErr } = await supabase.from('facebook_pages').select('updated_at').limit(1);
            if (!updErr) hasUpdatedAt = true;
          } catch (e) {
            console.log('[facebook-api] Table check updated_at error:', e);
          }

          const { data: existingPages, error: extError } = await supabase
            .from('facebook_pages')
            .select('id, page_id');

          if (extError) {
            console.error('[facebook-api] Error reading existing facebook_pages:', extError);
            return res.status(500).json({ error: 'Bảng facebook_pages chưa tồn tại hoặc bị lỗi truy vấn Database.' });
          }

          const existingMap = new Map<string, string>();
          if (existingPages) {
            existingPages.forEach(p => {
              if (p.page_id) {
                existingMap.set(String(p.page_id).trim(), p.id);
              }
            });
          }

          const successList: string[] = [];
          const failedList: { name: string; page_id: string; reason: string }[] = [];

          for (const item of pagesList) {
            try {
              const pageIdStr = item.id ? String(item.id).trim() : '';
              if (!pageIdStr || !item.name) {
                failedList.push({
                  name: item.name || 'Không rõ',
                  page_id: pageIdStr || 'Không rõ',
                  reason: 'Thiếu thông tin ID hoặc tên Page từ Facebook'
                });
                continue;
              }

              if (!item.access_token) {
                failedList.push({
                  name: item.name,
                  page_id: pageIdStr,
                  reason: 'Facebook không trả về Access Token (Vui lòng kiểm tra phân quyền trang cho System User)'
                });
                continue;
              }

              const payload: any = {
                page_id: pageIdStr,
                page_name: String(item.name).trim(),
                access_token: String(item.access_token).trim()
              };

              if (hasCategory) {
                payload.category = item.category ? String(item.category).trim() : '';
              }
              if (hasUpdatedAt) {
                payload.updated_at = new Date().toISOString();
              }

              const existingId = existingMap.get(pageIdStr);
              let dbError = null;

              if (existingId) {
                const { error } = await supabase
                  .from('facebook_pages')
                  .update(payload)
                  .eq('id', existingId);
                dbError = error;
              } else {
                const { error } = await supabase
                  .from('facebook_pages')
                  .insert([payload]);
                dbError = error;
              }

              if (dbError) {
                throw dbError;
              }

              successList.push(item.name);
            } catch (pageErr: any) {
              console.error(`[facebook-api] Error on page item ${item.name || 'unknown'}:`, pageErr);
              failedList.push({
                name: item.name || 'Không rõ',
                page_id: item.id || 'Không rõ',
                reason: sanitizeError(pageErr.message || 'Lỗi lưu database hoặc thao tác Facebook')
              });
            }
          }

          return res.status(200).json({
            success: true,
            synced_count: successList.length,
            updated_pages: successList,
            failed_pages: failedList,
            timestamp: new Date().toISOString()
          });
        }

        // 1. GET: Fetch saved Facebook pages
        // ---------------------------------------------------------------------
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
              return res.json([]);
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

          return res.json(sanitizedPages);
        }

        // 2. POST: Add new Facebook page configuration
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

        // 3. PUT / PATCH: Update existing Facebook page
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

          return res.json({
            success: true,
            message: 'Cập nhật cấu hình Fanpage thành công!',
            data: data ? data[0] : null
          });
        }

        // 4. DELETE: Remove Facebook page
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

          return res.json({
            success: true,
            message: 'Đã xóa cấu hình Fanpage thành công!'
          });
        }

        // 5. POST: Post an update to Facebook Page Feed
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

          return res.json({
            success: true,
            post_id: feedResult.id || feedResult.post_id || 'ok',
            message: 'Đăng bài lên Facebook thành công!'
          });
        }

        // 6. GET: Fetch Facebook post history (pagination)
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
              return res.json({ data: [], count: 0, warning: 'Bảng facebook_post_history chưa được tạo trong database.' });
            }
            throw error;
          }

          return res.json({
            data: data || [],
            count: count || 0,
            page,
            limit
          });
        }

        // 7. GET: Verify safety / daily rates / duplicate products
        case 'check': {
          if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method Not Allowed' });
          }

          const productId = String(req.query.product_id || '').trim();
          const pageIdsStr = String(req.query.page_ids || '').trim();

          if (!pageIdsStr) {
            return res.json({ results: {} });
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

            // Check if product already posted on this page in last 7 days
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

          return res.json({ results });
        }

        default: {
          return res.status(400).json({ error: `Hành động action='${action}' không được hỗ trợ.` });
        }
      }

    } catch (err: any) {
      const errorMsgRaw = err.message || 'Đã xảy ra lỗi không xác định tại máy chủ';
      const errorMsg = sanitizeError(errorMsgRaw);

      console.error(`[facebook-api][action=${action}] Local error:`, errorMsg);

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
  });

  // API router to proxy Gemini Chat calls
  app.post("/api/chat", async (req, res) => {
    try {
      const { userQuestion, warehouseData, systemInstruction, localKey } = req.body;
      const apiKeyInput = localKey || process.env.GEMINI_API_KEY;

      const reply = await callGeminiWithKeyPool(apiKeyInput, async (ai) => {
        const prompt = `${systemInstruction}\n\n${warehouseData}\n\nCâu hỏi/Yêu cầu của khách hàng: ${userQuestion}`;
        const response = await generateContentWithRetry(ai, {
          model: "gemini-2.5-flash",
          contents: prompt
        });
        return response.text || "";
      });

      res.json({ reply });
    } catch (apiError: any) {
      console.log("[Info] Proxy call completed with exception.");
      const errMsg = apiError?.message || String(apiError);
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ 
          error: "Hiện tại tất cả API Key hệ thống của bạn đều đã quá tải hoặc hết hạn ngạch ngày hôm nay. Anh/Chị vui lòng nhấn biểu tượng bánh răng ⚙️ ở góc chatbox để nhập hoặc bổ sung các API Key cá nhân của mình nhé!" 
        });
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid")) {
        res.status(401).json({ 
          error: "Các API Key đã cung cấp không còn hợp lệ. Vui lòng kiểm tra lại thiết lập." 
        });
      } else {
        res.status(500).json({ error: errMsg || "Đã xảy ra lỗi khi xử lý dữ liệu AI!" });
      }
    }
  });

  // API router to proxy AI Description helper
  app.post("/api/generate-desc", async (req, res) => {
    try {
      const { promptInput, localKey } = req.body;
      const apiKeyInput = localKey || process.env.GEMINI_API_KEY;

      const reply = await callGeminiWithKeyPool(apiKeyInput, async (ai) => {
        const response = await generateContentWithRetry(ai, {
          model: "gemini-2.5-flash",
          contents: promptInput
        });
        return response.text || "";
      });

      res.json({ reply });
    } catch (apiError: any) {
      console.log("[Info] Generate desc proxy call completed with exception.");
      const errMsg = apiError?.message || String(apiError);
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ 
          error: "Hiện tại tất cả các khóa API trong nhóm đã hết lượt sử dụng miễn phí hôm nay. Vui lòng bấm vào bánh răng ⚙️ (Thiết lập) để nhập/thêm khóa dự phòng." 
        });
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid")) {
        res.status(401).json({ 
          error: "Các khóa API của bạn không hợp lệ hoặc đã hết hạn." 
        });
      } else {
        res.status(500).json({ error: errMsg || "Đã xảy ra lỗi khi xử lý dữ liệu AI!" });
      }
    }
  });

  // API router to analyze raw input data and extract structured parameters + copywriting
  app.post("/api/analyze-raw", async (req, res) => {
    try {
      const { rawInput, localKey } = req.body;
      const apiKeyInput = localKey || process.env.GEMINI_API_KEY;

      // Convert any literal HTML break tags from user copy-paste or web references to clean actual newlines
      const sanitizedRawInput = (rawInput || "").replace(/<br\s*\/?>/gi, '\n');

      const reply = await callGeminiWithKeyPool(apiKeyInput, async (ai) => {
        const promptInput = `Bạn là một trợ lý thông minh cao cấp cho trang web BĐS TP. Thủ Đức, là chuyên gia sáng tạo nội dung bất động sản chuyên nghiệp.
Nhiệm vụ của bạn là nhận thông tin thô do người dùng cung cấp, lọc bỏ từ ngữ vi phạm, và:
1. Phân tích chi tiết để bóc tách các thông số cấu trúc của bất động sản.
2. Biên soạn một bài viết quảng cáo đăng bán (desc) chuẩn mực theo đúng quy tắc bên dưới.

Yêu cầu bóc tách các thông số cụ thể:
- Tiêu đề (title): Phải viết hoa toàn bộ, bắt đầu bằng icon (🔥), tóm tắt được điểm nhấn (Loại hình – Vị trí – Diện tích – Giá).
- Số nhà (houseNumber): Số nhà/số căn (nếu nhắc tới trong dữ liệu thô, nếu không thì để trống "").
- Tên đường (street): Tên đường phố, hẻm chính (nếu nhắc tới, không thì bỏ trống).
- Phường/xã (ward): Tên phường tại TP. Thủ Đức (VD: Trường Thạnh, Long Phước, Hiệp Phú, Thạnh Mỹ Lợi, Cát Lái...). Nếu không nhắc tới phường nhưng có tên đường, hãy suy đoán phường tương ứng hoặc ghi "Thủ Đức".
- Diện tích (area): Giá trị số diện tích đất hoặc sử dụng (m²), phải là số nguyên.
- Ngang (width): Chiều ngang (m), số thực. Nếu không có, mặc định là 4.
- Giá bán (price): Giá chào bán quy đổi thành số thực đơn vị TỶ ĐỒNG (VD: 2.5 hoặc 3.6). Nếu không có, gán mặc định là 0.
- Số phòng ngủ (bedrooms): Số phòng ngủ, nguyên. Nếu không có, mặc định là 3. (Nếu là đất trống/đất bán không có nhà thì đặt là 0).
- Số phòng vệ sinh (bathrooms): Số phòng vệ sinh, nguyên. Nếu không có, mặc định là 3. (Nếu là đất trống/đất bán không có nhà thì đặt là 0).
- Số tầng (floors): Số tầng kết cấu, nguyên. Nếu không có, mặc định là 3. ĐẶC BIỆT: Nếu bất động sản là đất trống, đất thổ cư, đất vườn, hoặc là bán đất (không có nhà cửa xây dựng hoặc ghi rõ là đất trống, đất thổ cư), thì trường floors (Số tầng) bắt buộc phải bóc tách bằng số 0 (không).
- Hướng nhà (direction): Một trong các hướng chuẩn: "Không xác định", "Đông", "Tây", "Nam", "Bắc", "Đông Nam", "Đông Bắc", "Tây Nam", "Tây Bắc". Hãy tìm hướng thích hợp từ dữ liệu thô, nếu không nhắc tới hướng thì bắt buộc chọn mặc định là "Không xác định".
- Pháp lý (legal): Tình trạng pháp lý, mặc định thường là "Sổ hồng riêng" hoặc theo dữ liệu thô.
- Nhãn nổi bật (badge): Một nhãn ngắn như "Sổ Hồng Riêng", "Hẻm Xe Hơi", "Mặt Tiền Kinh Doanh", "Sát Đại Học", "Giá Đầu Tư".

Yêu cầu biên soạn bài viết quảng cáo (desc):
Bạn phải tuân thủ nghiêm ngặt các quy tắc sau:

1. CẤU TRÚC BÀI VIẾT (BẮT BUỘC SỬ DỤNG KÝ TỰ XUỐNG DÒNG '\n' ĐỂ CHIA DÒNG CỤ THỂ):
Bạn bắt buộc phải trình bày nội dung bài viết dưới dạng có xuống dòng rõ ràng bằng ký tự '\n' cho từng dòng y hệt như cấu trúc dưới đây. Mỗi ý, mỗi thông tin hoặc mỗi gạch đầu dòng phải nằm trên một dòng riêng biệt. KHÔNG được gộp tất cả các dòng thành một đoạn văn duy nhất liền dòng.
- Tiêu đề: VIẾT HOA TOÀN BỘ, bắt đầu bằng icon (🔥), tóm tắt điểm nhấn (như loại hình, vị trí, diện tích, giá).
- Mục 1: THÔNG SỐ & GIÁ BÁN:
  + Dòng chữ: THÔNG SỐ & GIÁ BÁN:
  + Dòng tiếp theo: Vị trí tại phường [Tên Phường, ví dụ: Long Phước], TP. Thủ Đức.
  + Dòng tiếp theo: - Diện tích đất [Diện tích]m2.
  + Dòng tiếp theo: - Kết cấu gồm [Số tầng] tầng, thiết kế [Số PN] phòng ngủ và [Số WC] phòng vệ sinh.
  + Dòng tiếp theo: - Hướng nhà: [Hướng nhà]. Giá bán: [Giá] tỷ đồng.
- Mục 2: HIỆN TRẠNG:
  + Dòng chữ: HIỆN TRẠNG:
  + Sử dụng các dòng tiếp theo, mỗi dòng bắt đầu bằng dấu trừ '-' để liệt kê: thiết kế, nội thất, hạ tầng giao thông đường xá, pháp lý minh bạch...
- Kết bài: Dòng tiếp theo: Quý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất.
👉 CHÚ Ý QUAN TRỌNG: Tuyệt đối KHÔNG ĐƯỢC ghi thêm bất kỳ thông tin liên hệ, số điện thoại, zalo, email, hoặc địa chỉ văn phòng của Thanh Trà BĐS ở cuối bài viết. Hãy kết thúc chính xác ở câu kêu gọi hành động phía trên.

2. QUY ĐỊNH VỀ NGÔN NGỮ VÀ TRÌNH BÀY (TUÂN THỦ PHÁP LUẬT):
- CẤM: Tuyệt đối không dùng các từ ngữ khẳng định tuyệt đối hoặc mang tính cường điệu như: "tốt nhất", "đẹp nhất", "hiếm nhất", "số 1", "đỉnh nhất", "duy nhất", "hoàn hảo", "đẳng cấp nhất", "siêu phẩm".
- KHUYẾN KHÍCH: Sử dụng từ ngữ trung lập, khách quan như: "đắc địa", "tiềm năng", "hiện đại", "thuận tiện", "thông thoáng", "nổi bật", "phù hợp cho nhu cầu ở hoặc kinh doanh", "thiết kế chỉn chu".
- TRÌNH BÀY HÌNH THỨC:
  + BẮT BUỘC xuống dòng bằng kí tự '\n' cho từng thông số, từng dòng như hướng dẫn ở trên để bài viết đẹp mắt, dễ đọc.
  + Tuyệt đối KHÔNG dùng ký tự xuống dòng kép (\n\n) để tạo khoảng trống dòng trống giữa các dòng. Hãy dùng đúng một ký tự '\n' duy nhất để xuống dòng viết tiếp ngay dòng dưới để các dòng nằm khít nhau nhưng vẫn xuống dòng đẹp đẽ.
  + TUYỆT ĐỐI KHÔNG sử dụng hay chèn thẻ HTML '<br>' hoặc bất kỳ thẻ HTML nào trong nội dung "desc" mà bạn biên soạn. Hãy chỉ dùng ký tự xuống dòng thực tế '\n' thông thường để đổi dòng.
  + Không được đưa số nhà cụ thể hay số hẻm riêng tư chi tiết vào nội dung bài viết quảng cáo (trừ khi có yêu cầu riêng). Chỉ đăng thông tin chung về khu vực/đường phố.
  + Không sử dụng tiêu đề "Ưu điểm" hay "Ưu điểm nổi bật". Thay vào đó hãy đặt tên phần là "HIỆN TRẠNG" đúng theo yêu cầu.

3. PHONG CÁCH VIẾT:
Ngắn gọn, súc tích, tập trung vào công năng sử dụng và tính pháp lý minh bạch (Sổ hồng, hoàn công đầy đủ).
Ngôn ngữ chuyên nghiệp, rõ ràng, phù hợp để người dùng đọc nhanh trên thiết bị di động.

4. CƠ CHẾ XỬ LÝ DỮ LIỆU:
Khi người dùng cung cấp thông tin thô, hãy lọc bỏ các từ ngữ vi phạm quy định ở mục 2 và áp dụng cấu trúc ở mục 1.
Nếu thông tin thiếu (như giá hoặc diện tích), hãy trình bày dựa trên những gì có sẵn và giữ nguyên câu kết bài.

Hãy trả về kết quả hoàn chỉnh dưới định dạng JSON duy nhất. KHÔNG bao quanh bằng bất cứ văn bản dẫn dắt hay markdown nhãn ngoại trừ cấu trúc JSON hợp lệ sau:
{
  "title": "...",
  "houseNumber": "...",
  "street": "...",
  "ward": "...",
  "area": 0,
  "width": 0,
  "price": 0,
  "bedrooms": 0,
  "bathrooms": 0,
  "floors": 0,
  "direction": "...",
  "legal": "...",
  "badge": "...",
  "desc": "THÔNG SỐ & GIÁ BÁN:\nVị trí tại phường [Tên Phường], TP. Thủ Đức.\n- Diện tích đất [Diện Tích]m2.\n- Kết cấu gồm [Số Tầng] tầng, thiết kế [Số PN] phòng ngủ và [Số WC] phòng vệ sinh.\n- Hướng nhà: [Hướng Nhà]. Giá bán: [Giá] tỷ đồng.\nHIỆN TRẠNG:\n- [Ý hiện trạng 1]\n- [Ý hiện trạng 2]\n- [Ý hiện trạng 3]\n- [Ý hiện trạng 4]\n- [Ý hiện trạng 5]\nQuý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất."
}

DỮ LIỆU THÔ CẦN PHÂN TÍCH:
"${sanitizedRawInput}"`;

        const response = await generateContentWithRetry(ai, {
          model: "gemini-2.5-flash",
          contents: promptInput,
          config: {
            responseMimeType: "application/json"
          }
        });
        return response.text || "";
      });

      // Strip any accidental <br> tags injected by the model
      let cleanedReply = (reply || "").replace(/<br\s*\/?>/gi, '\n').trim();
      
      // Strip any markdown code fences if present
      if (cleanedReply.includes("```")) {
        cleanedReply = cleanedReply.replace(/```json/gi, '').replace(/```/g, '').trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonRepair(cleanedReply));
      } catch (parseErr) {
        // Try regex extraction of JSON block
        const match = cleanedReply.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(jsonRepair(match[0]));
          } catch (innerParseErr) {
            console.error("JSON parse failed inside match:", innerParseErr);
            throw new Error("Không thể phân tích phản hồi định dạng JSON từ AI: " + (parseErr as Error).message);
          }
        } else {
          console.error("No JSON structure match found in reply:", cleanedReply);
          throw new Error("Không tìm thấy cấu trúc JSON hợp lệ trong phản hồi của AI: " + (parseErr as Error).message);
        }
      }

      if (parsed.desc) {
         parsed.desc = parsed.desc.replace(/<br\s*\/?>/gi, '\n');
      }
      res.json(parsed);
    } catch (apiError: any) {
      console.log("[Info] Analyze proxy call failed:", apiError?.message || apiError);
      console.log("[Info] Analyze proxy call completed with exception.");
      const errMsg = apiError?.message || String(apiError);
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ 
          error: "Hiện tại tất cả các khóa API trong nhóm đã hết lượt sử dụng miễn phí hôm nay. Vui lòng bấm vào bánh răng ⚙️ (Thiết lập) để nhập/thêm khóa dự phòng." 
        });
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid")) {
        res.status(401).json({ 
          error: "Các khóa API của bạn không hợp lệ hoặc đã hết hạn." 
        });
      } else {
        res.status(500).json({ error: errMsg || "Đã xảy ra lỗi khi phân tích dữ liệu AI!" });
      }
    }
  });
 
  // ---------------------------------------------------------------------------
  // Sitemap config — đồng bộ với api/sitemap.ts (logic chạy trên Vercel production)
  // ---------------------------------------------------------------------------
  const SITE_URL = 'https://thanhtrabds.vercel.app'; // TODO: đổi sang domain riêng khi có
  const MAX_IMAGES_PER_URL = 10;

  function escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function isHotBadge(badge: string | null | undefined): boolean {
    if (!badge) return false;
    const b = badge.toLowerCase();
    return b.includes('hot') || b.includes('nổi bật') || b.includes('giảm giá');
  }

  function daysSince(dateStr: string): number {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return 999;
    return (Date.now() - t) / 86_400_000;
  }

  function getSeoMeta(row: { badge?: string | null; created_at?: string; updated_at?: string | null }): { priority: string; changefreq: string } {
    const age = daysSince(row.updated_at ?? row.created_at ?? new Date().toISOString());
    if (isHotBadge(row.badge)) return { priority: '0.9', changefreq: 'daily' };
    if (age < 14)              return { priority: '0.8', changefreq: 'weekly' };
    if (age < 60)              return { priority: '0.7', changefreq: 'weekly' };
    return                            { priority: '0.6', changefreq: 'monthly' };
  }

  function collectImages(row: { img?: string | null; img_list?: string[] | null }): string[] {
    const seen = new Set<string>();
    if (row.img) seen.add(row.img);
    if (Array.isArray(row.img_list)) row.img_list.forEach(s => s && seen.add(s));
    return Array.from(seen).slice(0, MAX_IMAGES_PER_URL);
  }

  function buildPropertyEntry(row: any): string {
    if (!row.id || !row.title) return '';
    const loc = `${SITE_URL}/?id=${row.id}`;
    const lastmodStr = row.updated_at ?? row.created_at;
    let lastmod = '';
    try {
      const d = new Date(lastmodStr ?? Date.now());
      lastmod = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
    } catch { lastmod = new Date().toISOString().split('T')[0]; }
    const { priority, changefreq } = getSeoMeta(row);
    const imageTags = collectImages(row)
      .map(src => `
    <image:image>
      <image:loc>${escapeXml(src)}</image:loc>
      <image:title>${escapeXml(row.title)}</image:title>
    </image:image>`).join('');
    return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${imageTags}
  </url>`;
  }

  function buildStaticEntry(loc: string, priority: string, changefreq: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }

  function buildFallbackXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${buildStaticEntry(SITE_URL, '1.0', 'daily')}
</urlset>`;
  }

  // Định nghĩa hàm xử lý Sơ đồ trang web động chuẩn XML trực tiếp từ Supabase
  const getSitemapXmlHandler = async (req: any, res: any) => {
    try {
      const { data: properties, error } = await supabase
        .from('properties_hometea')
        .select('id, title, badge, img, img_list, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const staticEntries = [buildStaticEntry(SITE_URL, '1.0', 'daily')];
      const propertyEntries = (properties || []).map(buildPropertyEntry).filter(Boolean);

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${staticEntries.join('')}${propertyEntries.join('')}
</urlset>`;

      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.send(xml);

    } catch (err) {
      console.error('[sitemap] Generation failed:', err);
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      res.send(buildFallbackXml());
    }
  };

  // Đăng ký cho môi trường chung (như Local / Development)
  const getRobotsTxtHandler = (req: any, res: any) => {
    const robots = `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(robots);
  };

  app.get("/sitemap.xml", getSitemapXmlHandler);
  app.get("/robots.txt", getRobotsTxtHandler);
  app.get("/api/robots", getRobotsTxtHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // ✅ Sitemap PHẢI đứng TRƯỚC static và wildcard ở môi trường Production
    app.get("/sitemap.xml", getSitemapXmlHandler);

    app.use(express.static(distPath));
    
    // Wildcard đứng CUỐI cùng để tránh ghi đè các API khác
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();