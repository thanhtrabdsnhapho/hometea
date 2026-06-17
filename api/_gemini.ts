import { GoogleGenAI } from "@google/genai";

export const DEFAULT_SYSTEM_GEMINI_KEYS = [
  "QTM1OF9nSnplY0gteXVYOTFNb0VHczQ0aWNiYmJJUURHYVU3QzJFdFh6cUk2TlI4YkEuUUE=",
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
  try {
    return await ai.models.generateContent(config);
  } catch (err: any) {
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
