import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiWithKeyPool, generateContentWithRetry } from './_gemini';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
}
