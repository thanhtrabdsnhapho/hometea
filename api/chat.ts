import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiWithKeyPool, generateContentWithRetry } from './_gemini';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
}
