import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    nguonnhapkUrl: process.env.NGUONNHAPK_SUPABASE_URL || process.env.VITE_NGUONNHAPK_SUPABASE_URL || 'https://ziesvswqtpaohfmkwwhy.supabase.co',
    nguonnhapkAnonKey: (process.env.NGUONNHAPK_SUPABASE_ANON_KEY || process.env.VITE_NGUONNHAPK_SUPABASE_ANON_KEY || 'sb_publishable_bLdFCx-K-fKEfwP2XSayCQ_TcP08uoM').replace(/^d(sb_)/, '$1'),
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'xkenwzvh',
    cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || '674579822363486'
  });
}

