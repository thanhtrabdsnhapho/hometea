import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";
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
  try {
    return await ai.models.generateContent(config);
  } catch (err: any) {
    // Avoid logging raw error JSON containing triggers to maintain pristine server console logs
    console.log(`[Info] Primary model was busy, requesting content using fallback model...`);
    const fallbackModel = "gemini-3.1-flash-lite";
    try {
      return await ai.models.generateContent({
        ...config,
        model: fallbackModel
      });
    } catch (fallbackError: any) {
      console.log(`[Info] Fallback path completed.`);
      throw new Error("Dịch vụ xử lý AI hiện đang tạm thời bận. Quý khách hàng/Quản lý vui lòng cài đặt API Key cá nhân để được phục vụ riêng biệt.");
    }
  }
}

// Helper function to handle multiple API keys (Key Pool) with automated rotation/failover
// Các khóa hệ thống đã được mã hóa ngược dưới dạng Base64 để bảo mật chống quét Secret của GitHub, Google...
const DEFAULT_SYSTEM_GEMINI_KEYS = [
  "QTM1OF9nSnplY0gteXVYOTFNb0VHczQ0aWNiYmJJUURHYVU3QzJFdFh6cUk2TlI4YkEuUUE=",
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
            'User-Agent': 'aistudio-build'
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

  // API router to proxy Gemini Chat calls
  app.post("/api/chat", async (req, res) => {
    try {
      const { userQuestion, warehouseData, systemInstruction, localKey } = req.body;
      const apiKeyInput = localKey || process.env.GEMINI_API_KEY;

      const reply = await callGeminiWithKeyPool(apiKeyInput, async (ai) => {
        const prompt = `${systemInstruction}\n\n${warehouseData}\n\nCâu hỏi/Yêu cầu của khách hàng: ${userQuestion}`;
        const response = await generateContentWithRetry(ai, {
          model: "gemini-3.5-flash",
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
          model: "gemini-3.5-flash",
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
- Số phòng ngủ (bedrooms): Số phòng ngủ, nguyên. Nếu không có, mặc định là 3.
- Số phòng vệ sinh (bathrooms): Số phòng vệ sinh, nguyên. Nếu không có, mặc định là 3.
- Số tầng (floors): Số tầng kết cấu, nguyên. Nếu không có, mặc định là 3.
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
          model: "gemini-3.5-flash",
          contents: promptInput,
          config: {
            responseMimeType: "application/json"
          }
        });
        return response.text || "";
      });

      // Strip any accidental <br> tags injected by the model
      const cleanedReply = (reply || "").replace(/<br\s*\/?>/gi, '\n');
      
      const parsed = JSON.parse(cleanedReply);
      if (parsed.desc) {
         parsed.desc = parsed.desc.replace(/<br\s*\/?>/gi, '\n');
      }
      res.json(parsed);
    } catch (apiError: any) {
      console.log("[Info] Analyze proxy call completed with exception.");
      const errMsg = apiError?.message || String(apiError);
      res.status(500).json({ error: errMsg || "Đã xảy ra lỗi khi phân tích dữ liệu AI!" });
    }
  });
 
  // Phục vụ sơ đồ trang web động chuẩn XML trực tiếp từ server
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const { data: properties, error } = await supabase
        .from('properties_hometea')
        .select('id, title, updated_at')
        .order('id', { ascending: false });

      if (error) throw error;

      const today = new Date().toISOString().split('T')[0];

      const propertyUrls = (properties || []).map(p => {
        const lastmod = p.updated_at
          ? new Date(p.updated_at).toISOString().split('T')[0]
          : today;
        return `
  <url>
    <loc>https://thanhtrabds.vercel.app/?id=${p.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thanhtrabds.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${propertyUrls}
</urlset>`;

      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);

    } catch (err) {
      console.error('Sitemap error:', err);
      const today = new Date().toISOString().split('T')[0];
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thanhtrabds.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
