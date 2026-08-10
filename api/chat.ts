import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiWithKeyPool, generateContentWithRetry, callGroqFallback } from './_gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { userQuestion, warehouseData, systemInstruction, localKey } = req.body;
  const apiKeyInput = localKey || process.env.GEMINI_API_KEY;

  try {
    // Thử gọi Gemini trước
    const reply = await callGeminiWithKeyPool(apiKeyInput, async (ai) => {
      const prompt = `${systemInstruction}\n\n${warehouseData}\n\nCâu hỏi/Yêu cầu của khách hàng: ${userQuestion}`;
      const response = await generateContentWithRetry(ai, {
        model: "gemini-2.5-flash",
        contents: prompt
      });
      return response.text || "";
    });

    return res.json({ reply, provider: "gemini" });
  } catch (geminiError: any) {
    const geminiErrMsg = geminiError?.message || String(geminiError);
    console.warn("[Warning] Lỗi khi gọi Gemini API:", geminiErrMsg);
    console.log('[Fallback] Chuyển sang Groq do Gemini hết quota hoặc bị lỗi');

    try {
      const messages = [
        {
          role: "system",
          content: systemInstruction || "Bạn là Thanh Trà BĐS, trợ lý tư vấn bất động sản tại Thủ Đức, TP.HCM."
        },
        {
          role: "user",
          content: `${warehouseData || ""}\n\nCâu hỏi/Yêu cầu của khách hàng: ${userQuestion}`
        }
      ];

      const reply = await callGroqFallback(messages);
      return res.json({ reply, provider: "groq" });
    } catch (groqError: any) {
      console.error("[Error] Cả Gemini và Groq đều lỗi:", groqError?.message || groqError);
      return res.status(500).json({
        error: "Hệ thống AI tạm thời quá tải, vui lòng thử lại sau hoặc liên hệ trực tiếp qua Fanpage."
      });
    }
  }
}
