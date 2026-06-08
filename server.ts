import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Helper function to safely call Gemini with a fallback model if the primary one is unavailable (e.g. 503 high demand)
async function generateContentWithRetry(ai: any, config: { model: string; contents: any; config?: any }) {
  try {
    return await ai.models.generateContent(config);
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.log(`[Info] Gemini model ${config.model} is temporarily loaded, using fallback: ${errorMsg}`);
    const fallbackModel = "gemini-3.1-flash-lite";
    console.log(`[Info] Executing seamless fallback to resilient model: ${fallbackModel}`);
    return await ai.models.generateContent({
      ...config,
      model: fallbackModel
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Check if system/server has the Gemini API Key configured
  app.get("/api/has-key", (req, res) => {
    res.json({ hasKey: !!process.env.GEMINI_API_KEY });
  });

  // API router to deliver Supabase Cloud connection configuration if defined on Server environment
  app.get("/api/supabase-config", (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
    });
  });

  // API router to proxy Gemini Chat calls
  app.post("/api/chat", async (req, res) => {
    try {
      const { userQuestion, warehouseData, systemInstruction, localKey } = req.body;
      
      const apiKey = localKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "Chưa cấu hình Gemini API Key trên hệ thống!" });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      const prompt = `${systemInstruction}\n\n${warehouseData}\n\nCâu hỏi/Yêu cầu của khách hàng: ${userQuestion}`;

      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const reply = response.text || "";
      res.json({ reply });
    } catch (error: any) {
      console.log("Error handled at /api/chat:", error?.message || error);
      const errMsg = error?.message || "";
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ 
          error: "Hạn ngạch (Quota) của API Key hệ thống hiện đã tạm thời hết lượt miễn phí hôm nay. Anh/Chị vui lòng click vào biểu tượng ⚙️ (Thiết lập) ở góc trên bên phải khung chat này để nhập mã Gemini API Key cá nhân của mình để tiếp tục sử dụng miễn phí & không giới hạn nhé!" 
        });
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid")) {
        res.status(401).json({ 
          error: "Mã API Key đã cung cấp không hợp lệ hoặc đã hết hạn. Vui lòng bấm vào biểu tượng ⚙️ (Thiết lập) để kiểm tra hoặc nhập lại mã mới." 
        });
      } else {
        res.status(500).json({ error: error?.message || "Đã xảy ra lỗi khi xử lý dữ liệu AI!" });
      }
    }
  });

  // API router to proxy AI Description helper
  app.post("/api/generate-desc", async (req, res) => {
    try {
      const { promptInput, localKey } = req.body;
      const apiKey = localKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "Chưa cấu hình Gemini API Key trên hệ thống!" });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: promptInput
      });

      const reply = response.text || "";
      res.json({ reply });
    } catch (error: any) {
      console.log("Error handled at /api/generate-desc:", error?.message || error);
      const errMsg = error?.message || "";
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ 
          error: "Học máy AI của hệ thống hiện đang quá tải lượt yêu cầu miễn phí (Quota Exceeded). Anh/Chị quản lý vui lòng bấm biểu tượng ⚙️ sửa mã API Key ở khung chat chính của trang web để gắn API Key riêng của mình nhé!" 
        });
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid")) {
        res.status(401).json({ 
          error: "Khoá API Key không hợp lệ. Vui lòng kiểm tra lại cấu hình." 
        });
      } else {
        res.status(500).json({ error: error?.message || "Đã xảy ra lỗi khi xử lý dữ liệu AI!" });
      }
    }
  });

  // API router to analyze raw input data and extract structured parameters + copywriting
  app.post("/api/analyze-raw", async (req, res) => {
    try {
      const { rawInput, localKey } = req.body;
      const apiKey = localKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "Chưa cấu hình Gemini API Key trên hệ thống!" });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const promptInput = `Bạn là một trợ lý thông minh cao cấp cho trang web BĐS TP. Thủ Đức.
Nhiệm vụ của bạn là nhận thông tin thô (thông số, vị trí, giá, đặc điểm) do người dùng cung cấp và:
1. Phân tích chi tiết để bóc tách các thông số cấu trúc của bất động sản.
2. Biên soạn một bài viết quảng cáo đăng bán chuẩn mực theo đúng quy tắc bên dưới.

Yêu cầu bóc tách các thông số cụ thể:
- Tiêu đề (title): Phải viết hoa toàn bộ, bắt đầu bằng icon (🔥), tóm tắt được điểm nhấn mạnh nhất của bất động sản (VD: LOẠI HÌNH – VỊ TRÍ – DIỆN TÍCH – GIÁ).
- Số nhà (houseNumber): Số nhà/số căn (nếu có nhắc tới trong dữ liệu thô, nếu không có thì để trống "").
- Tên đường (street): Tên đường phố, hẻm chính (nếu có nhắc tới trong dữ liệu thô, nếu không thì ghi tên đường chính gần nhất hoặc bỏ trống).
- Phường/xã (ward): Tên phường tại TP. Thủ Đức (VD: Trường Thạnh, Long Phước, Hiệp Phú, Thạnh Mỹ Lợi, Cát Lái...). Nếu không nhắc tới phường nhưng có tên đường, hãy suy đoán phường tương ứng hoặc ghi "Thủ Đức".
- Diện tích (area): Giá trị số diện tích đất hoặc sử dụng (m²), phải là số nguyên (VD: 51).
- Ngang (width): Chiều ngang (m), số thực (VD: 4.2). Nếu không có ghi nhận trong dữ liệu thô, hãy để mặc định là 4.
- Giá bán (price): Giá chào bán quy đổi thành số thực đơn vị TỶ ĐỒNG (VD: 2.5 hoặc 3.6). Nếu không có, gán mặc định là 0.
- Số phòng ngủ (bedrooms): Số phòng ngủ, là số nguyên (nếu đất trống ghi 0, nếu là nhà phố nhưng dữ liệu thô không nhắc tới thì ghi 3 làm mặc định).
- Số phòng vệ sinh (bathrooms): Số phòng vệ sinh, nguyên (nếu đất trống ghi 0, nếu là nhà phố không nhắc thì ghi 3 làm mặc định).
- Số tầng (floors): Số tầng kết cấu, nguyên (đất trống ghi 1, nhà cấp 4 ghi 1, nhà lầu ghi số tầng thực tế, hoặc mặc định 3 nếu không nêu rõ).
- Hướng nhà (direction): Một trong các hướng chuẩn có sẵn: "Không xác định", "Đông", "Tây", "Nam", "Bắc", "Đông Nam", "Đông Bắc", "Tây Nam", "Tây Bắc". Hãy tìm hướng thích hợp từ dữ liệu thô, nếu dữ liệu thô không nhắc tới hướng thì bắt buộc chọn mặc định là "Không xác định" (tuyệt đối không tự suy diễn hướng).
- Pháp lý (legal): Ghi nhận tình trạng pháp lý, mặc định thường là "Sổ hồng riêng" hoặc theo dữ liệu thô.
- Nhãn nổi bật (badge): Một nhãn ngắn như "Sổ Hồng Riêng", "Hẻm Xe Hơi", "Mặt Tiền Kinh Doanh", "Sát Đại Học", "Giá Đầu Tư".

Yêu cầu biên soạn bài viết quảng cáo (desc):
Bạn phải tuân thủ nghiêm ngặt các quy tắc sau:
* Cấu trúc bài viết:
- Tiêu đề: Phải viết hoa toàn bộ, bắt đầu bằng icon (🔥), tóm tắt được điểm nhấn mạnh nhất của bất động sản (VD: LOẠI HÌNH – VỊ TRÍ – DIỆN TÍCH – GIÁ).
- Mục 1: THÔNG SỐ & GIÁ BÁN: Liệt kê các thông tin: Vị trí (phường/quận), Diện tích, Kết cấu (nếu là nhà), Hướng (nếu có), Giá bán (ghi rõ mức giá hoặc 'Liên hệ' nếu cần).
- Mục 2: HIỆN TRẠNG & TIỀN NĂNG BỨT PHÁ: Sử dụng gạch đầu dòng để làm nổi bật các điểm mạnh: Thiết kế, nội thất, tiện ích xung quanh, tiềm năng tăng giá, giao thông, pháp lý.
- Kết bài: Một câu kêu gọi hành động (Call-to-action) lịch sự, ngắn gọn: 'Quý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất.'

* Nguyên tắc trình bày:
- Trình bày liền mạch, hoàn toàn KHÔNG CÓ KHOẢNG CÁCH DÒNG TRỐNG (tất cả các dòng phải nằm cạnh nhau liền dải văn bản, không dùng ký tự xuống dòng kép \\n\\n, hãy dùng \\n đơn lẻ và không để trống dòng).
- Tuyệt đối KHÔNG SỬ DỤNG tiêu đề 'Ưu điểm' trong bất kỳ trường hợp nào.
- KHÔNG LIỆT KÊ số nhà cụ thể hoặc tên hẻm cụ thể trong bài đăng quảng cáo (VD: hẻm 383 Long Phước hay số nhà 45 -> hãy ghi ẩn đi thành hẻm ô tô Long Phước hoặc khu vực Long Phước).
- Tuyệt đối KHÔNG ĐỀ CẬP đến các yếu tố tiêu cực như 'ngập lụt', 'ngập nước' kể cả khi thông tin thô có nhắc tới. Thay vào đó tập trung vào hạ tầng hoàn thiện, vị trí đẹp, tiện ích xung quanh.
- TUYỆT ĐỐI CẤM SỬ DỤNG CÁC TỪ NGỮ QUẢNG CÁO TỰ PHONG, KHẲNG ĐỊNH THỨ HẠNG HOẶC ĐỘC QUYỀN TRONG TIÊU ĐỀ HOẶC NỘI DUNG (BIÊN SOẠN KHÁCH QUAN, TUÂN THỦ LUẬT QUẢNG CÁO):
  + KHÔNG DÙNG từ khẳng định thứ hạng/chất lượng: "Số 1", "No.1", "Top 1", "Nhất", "Tốt nhất", "Uy tín nhất", "Hiệu quả nhất", "Chất lượng nhất", "Dẫn đầu", "Hàng đầu" hoặc các biến thể so sánh nhất.
  + KHÔNG DÙNG từ khẳng định độc quyền: "Duy nhất", "Độc nhất", "Chỉ có tại...".
  + KHÔNG DÙNG từ khẳng định quá đà, cam kết vô căn cứ về Bất động sản: "Đẹp nhất khu vực", "Vị trí đắc địa nhất", "Giá tốt nhất thị trường", "Cam kết sinh lờii cao nhất", "Sinh lời tốt nhất".
  + Hãy thay bằng các từ ngữ chuyên nghiệp và khách quan như: "tiềm năng tốt", "vị trí cực kỳ thuận tiện", "giá hết sức cạnh tranh", "không gian thoáng đãng sạch sẽ", "thiết kế hiện đại", "giao thông kết nối nhanh chóng".
- Sử dụng ngôn ngữ trung thực, chuyên nghiệp, không gây phiền.

* Phong cách viết:
- Ngắn gọn, súc tích, đánh mạnh vào giá trị đầu tư và công năng sử dụng.
- Tập trung vào sự uy tín và minh bạch về pháp lý (sổ hồng, hoàn công).
- Nếu thông tin thiếu (như giá hoặc diện tích), hãy viết bài dựa trên thông tin hiện có và giữ nguyên phần kêu gọi liên hệ để biết chi tiết.
- Luôn ưu tiên trình bày đẹp mắt, dễ đọc trên thiết bị di động.

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
  "desc": "Bài viết chuẩn liền dòng theo yêu cầu..."
}

DỮ LIỆU THÔ CẦN PHÂN TÍCH:
"${rawInput}"`;

      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: promptInput,
        config: {
          responseMimeType: "application/json"
        }
      });

      const reply = response.text || "";
      res.json(JSON.parse(reply));
    } catch (error: any) {
      console.log("Error handled at /api/analyze-raw:", error?.message || error);
      res.status(500).json({ error: error?.message || "Đã xảy ra lỗi khi phân tích dữ liệu AI!" });
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
