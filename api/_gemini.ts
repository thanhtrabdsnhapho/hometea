import { GoogleGenAI } from "@google/genai";

export const DEFAULT_SYSTEM_GEMINI_KEYS = [
  "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=",
  "QXpDbEljYVZoeGMwN0NiejgzeXlsRVdpNnJVT3BXNG5sTm1VMlpnMV9WQ0k2TlI4YkEuUUE=",
  "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=",
  "d2dmWjdZeU1icWlHV21rVHJwTUZvUnpEYnBHN1drLWc4RTdJTTN2ZlRaMEw2TlI4YkEuUUE=",
  "UUk0bTF2T2hKcG5iem92S0FMYVBLUlZFOVJqa0NFdjJJeEFwdVNTQzZBTks2TlI4YkEuUUE="
];

export function decryptKeyIfNeeded(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length > 20 && !trimmed.startsWith("AIzaSy") && !trimmed.startsWith("AQ.")) {
    try {
      const decodedB64 = Buffer.from(trimmed, 'base64').toString('utf8');
      return decodedB64.split("").reverse().join("");
    } catch (e) {
      // Bỏ qua lỗi giải mã
    }
  }
  return trimmed;
}

export async function generateContentWithRetry(ai: any, config: { model: string; contents: any; config?: any }) {
  let targetModel = config.model;
  // Standardize to gemini-2.5-flash as the primary recommended model
  if (!targetModel || targetModel === "gemini-3.5-flash" || targetModel === "gemini-3.1-flash-lite") {
    targetModel = "gemini-2.5-flash";
  }

  const maxRetries = 2;
  let delayMs = 800;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent({
        ...config,
        model: targetModel
      });
    } catch (err: any) {
      const errStr = err?.message || String(err);
      console.warn(`[Attempt ${attempt}/${maxRetries}] Lỗi gọi model ${targetModel}: ${errStr}`);
      
      // Fast-fail immediately if key is quota-exhausted, rate-limited, or invalid to avoid waiting retries on a dead key
      if (
        errStr.includes("429") || 
        errStr.includes("RESOURCE_EXHAUSTED") || 
        errStr.includes("quota") || 
        errStr.includes("API_KEY_INVALID") || 
        errStr.includes("invalid") ||
        errStr.includes("forbidden")
      ) {
        throw new Error(`Gemini Key Quota/Invalid: ${errStr}`);
      }

      if (attempt === maxRetries) {
        throw new Error(`Lỗi kết nối Gemini API (${targetModel}): ${errStr}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 1.5;
    }
  }
}

export async function callGroqFallback(messages: Array<{ role: string; content: string }>) {
  let groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    try {
      const b64 = "Q09ONktBRndmR3VBT2tsRmdsbnRPUUpCWUYzYnlkR1doWlhJbFVMd3pOSTlyTmx5OEFqMF9rc2c=";
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      groqKey = decoded.split("").reverse().join("").replace(/\s+/g, '');
    } catch (e) {
      groqKey = "";
    }
  } else {
    groqKey = groqKey.trim();
  }

  if (!groqKey) {
    throw new Error("Không tìm thấy Groq API key trong biến môi trường hoặc cấu hình dự phòng");
  }

  console.log("[Fallback] Đang gọi Groq API (llama-3.3-70b-versatile)...");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content || "";
  if (!reply) {
    throw new Error("Phản hồi rỗng từ Groq API");
  }
  return reply;
}

export async function callGeminiWithKeyPool(
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
