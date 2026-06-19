import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGeminiWithKeyPool, generateContentWithRetry } from './_gemini';
import { jsonrepair } from 'jsonrepair';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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

1. CẤU TRÚC BÀI VIẾT (BẮT BUỘC SỬ DỤNG KÝ TỰ XUỐNG DÒNG '\\n' ĐỂ CHIA DÒNG CỤ THỂ):
Bạn bắt buộc phải trình bày nội dung bài viết dưới dạng có xuống dòng rõ ràng bằng ký tự '\\n' cho từng dòng y hệt như cấu trúc dưới đây. Mỗi ý, mỗi thông tin hoặc mỗi gạch đầu dòng phải nằm trên một dòng riêng biệt. KHÔNG được gộp tất cả các dòng thành một đoạn văn duy nhất liền dòng.
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
  + BẮT BUỘC xuống dòng bằng kí tự '\\n' cho từng thông số, từng dòng như hướng dẫn ở trên để bài viết đẹp mắt, dễ đọc.
  + Tuyệt đối KHÔNG dùng ký tự xuống dòng kép (\\n\\n) để tạo khoảng trống dòng trống giữa các dòng. Hãy dùng đúng một ký tự '\\n' duy nhất để xuống dòng viết tiếp ngay dòng dưới để các dòng nằm khít nhau nhưng vẫn xuống dòng đẹp đẽ.
  + TUYỆT ĐỐI KHÔNG sử dụng hay chèn thẻ HTML '<br>' hoặc bất kỳ thẻ HTML nào trong nội dung "desc" mà bạn biên soạn. Hãy chỉ dùng ký tự xuống dòng thực tế '\\n' thông thường để đổi dòng.
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
  "desc": "THÔNG SỐ & GIÁ BÁN:\\nVị trí tại phường [Tên Phường], TP. Thủ Đức.\\n- Diện tích đất [Diện Tích]m2.\\n- Kết cấu gồm [Số Tầng] tầng, thiết kế [Số PN] phòng ngủ và [Số WC] phòng vệ sinh.\\n- Hướng nhà: [Hướng Nhà]. Giá bán: [Giá] tỷ đồng.\\nHIỆN TRẠNG:\\n- [Ý hiện trạng 1]\\n- [Ý hiện trạng 2]\\n- [Ý hiện trạng 3]\\n- [Ý hiện trạng 4]\\n- [Ý hiện trạng 5]\\nQuý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất."
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
    // Using \\n instead of \n ensures we don't inject raw unescaped newlines into JSON strings
    let cleanedReply = (reply || "").replace(/<br\s*\/?>/gi, '\\n').trim();
    
    // Strip any markdown code fences if present
    if (cleanedReply.includes("```")) {
      cleanedReply = cleanedReply.replace(/```json/gi, '').replace(/```/g, '').trim();
    }

    // Helper to escape raw control characters like tabs, carriage returns, or actual line breaks inside double-quoted string literals in JSON response
    function escapeControlCharactersInJson(jsonStr: string): string {
      let result = "";
      let insideString = false;
      let i = 0;
      while (i < jsonStr.length) {
        const char = jsonStr[i];
        if (insideString) {
          if (char === '\\') {
            const nextChar = jsonStr[i + 1];
            if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'b' || nextChar === 'f' || nextChar === 'n' || nextChar === 'r' || nextChar === 't' || nextChar === 'u') {
              // It's a valid escape sequence! Keep it as is.
              result += char + (nextChar || "");
              i += 2;
              continue;
            } else {
              // It's an invalid escape sequence, or a single backslash. Let's escape the backslash itself to prevent JSON parse errors.
              result += '\\\\';
              i += 1;
              continue;
            }
          } else if (char === '"') {
            // Closing quote of the string literal
            result += char;
            insideString = false;
            i += 1;
          } else if (char === '\n') {
            result += '\\n';
            i += 1;
          } else if (char === '\r') {
            result += '\\r';
            i += 1;
          } else if (char === '\t') {
            result += '\\t';
            i += 1;
          } else {
            const code = char.charCodeAt(0);
            if (code < 32) {
              // Escape other non-printable control characters
              const hex = code.toString(16).padStart(4, '0');
              result += '\\u' + hex;
            } else {
              result += char;
            }
            i += 1;
          }
        } else {
          if (char === '"') {
            insideString = true;
          }
          result += char;
          i += 1;
        }
      }
      return result;
    }

    let parsed;
    try {
      const sanitizedReply = escapeControlCharactersInJson(cleanedReply);
      const repaired = jsonrepair(sanitizedReply);
      parsed = JSON.parse(repaired);
    } catch (parseErr) {
      // Try regex extraction of JSON block
      const match = cleanedReply.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const sanitizedMatch = escapeControlCharactersInJson(match[0]);
          const repairedMatch = jsonrepair(sanitizedMatch);
          parsed = JSON.parse(repairedMatch);
        } catch (innerParseErr) {
          console.error("JSON parse / jsonrepair failed inside match:", innerParseErr);
          console.error("Original raw reply:", reply);
          throw new Error("Không thể phân tích phản hồi định dạng JSON từ AI: " + (innerParseErr as Error).message);
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
}
