import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Check if system/server has the Gemini API Key configured
  app.get("/api/has-key", (req, res) => {
    res.json({ hasKey: !!process.env.GEMINI_API_KEY });
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

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const reply = response.text || "";
      res.json({ reply });
    } catch (error: any) {
      console.error("Error at /api/chat:", error);
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
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptInput
      });

      const reply = response.text || "";
      res.json({ reply });
    } catch (error: any) {
      console.error("Error at /api/generate-desc:", error);
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
