import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

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
    await runMiddleware(req, res, upload.single('image'));

    const reqAny = req as any;
    let fileBuffer: Buffer | null = null;
    let base64String: string | null = null;

    if (reqAny.file) {
      fileBuffer = reqAny.file.buffer;
    } else if (req.body?.image) {
      base64String = req.body.image;
    } else {
      return res.status(400).json({ success: false, error: 'Không tìm thấy file ảnh!' });
    }

    const uploadOptions = { folder: 'thanhtrabds', resource_type: 'image' as const };

    if (fileBuffer) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
          if (error) reject(error); else resolve(result);
        });
        stream.end(fileBuffer);
      });
      return res.json({ success: true, secure_url: result.secure_url, public_id: result.public_id });
    } else if (base64String) {
      const result = await cloudinary.uploader.upload(base64String, uploadOptions);
      return res.json({ success: true, secure_url: result.secure_url, public_id: result.public_id });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Lỗi upload: ${err.message || err}` });
  }
}

export const config = { api: { bodyParser: false } };
