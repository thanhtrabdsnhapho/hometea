import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v2 as cloudinary } from 'cloudinary';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình thông tin kết nối Cloudinary trong biến môi trường!' });
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  try {
    let base64String: string | null = null;

    if (req.body && req.body.image) {
      base64String = req.body.image;
    }

    if (!base64String) {
      return res.status(400).json({ success: false, error: 'Không tìm thấy dữ liệu ảnh Base64!' });
    }

    const uploadOptions = { folder: 'thanhtrabds', resource_type: 'image' as const };
    const result = await cloudinary.uploader.upload(base64String, uploadOptions);
    return res.json({ success: true, secure_url: result.secure_url, public_id: result.public_id });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Lỗi upload: ${err.message || err}` });
  }
}
