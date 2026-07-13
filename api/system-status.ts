import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@supabase/supabase-js';

interface SystemStatusData {
  cloudinary: {
    storageUsedBytes: number;
    creditsUsed: number;
    creditsLimit: number;
    error?: string;
  };
  supabase: {
    databaseSizeBytes: number;
    totalListings: number;
    error?: string;
  };
  checkedAt: string;
}

interface CacheState {
  data: SystemStatusData;
  timestamp: number;
}

// In-memory cache
let cachedStatus: CacheState | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const now = Date.now();

  // Return cached data if valid
  if (cachedStatus && now - cachedStatus.timestamp < CACHE_DURATION_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cachedStatus.data);
  }

  // 1. Initialize Cloudinary
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  let cloudinaryData = {
    storageUsedBytes: 0,
    creditsUsed: 0,
    creditsLimit: 0,
    error: undefined as string | undefined
  };

  if (!cloudName || !apiKey || !apiSecret) {
    cloudinaryData.error = 'Chưa cấu hình CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY hoặc CLOUDINARY_API_SECRET';
  } else {
    try {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
      });
      const usage = await cloudinary.api.usage();
      cloudinaryData.storageUsedBytes = usage.storage?.usage || 0;
      cloudinaryData.creditsUsed = usage.credits?.usage || 0;
      cloudinaryData.creditsLimit = usage.credits?.limit || 0;
    } catch (err: any) {
      console.error('Lỗi khi lấy thông tin Cloudinary usage:', err);
      cloudinaryData.error = `Lỗi Cloudinary: ${err.message || err}`;
    }
  }

  // 2. Initialize Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";

  let supabaseData = {
    databaseSizeBytes: 0,
    totalListings: 0,
    error: undefined as string | undefined
  };

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Call RPC get_database_size
    try {
      const { data: dbSize, error: dbSizeError } = await supabase.rpc('get_database_size');
      if (dbSizeError) {
        console.warn('Lỗi gọi RPC get_database_size:', dbSizeError);
        supabaseData.error = `Lỗi RPC: ${dbSizeError.message}`;
      } else if (typeof dbSize === 'number') {
        supabaseData.databaseSizeBytes = dbSize;
      } else {
        supabaseData.databaseSizeBytes = Number(dbSize) || 0;
      }
    } catch (rpcErr: any) {
      console.error('Lỗi thực thi RPC get_database_size:', rpcErr);
      supabaseData.error = `Không hỗ trợ RPC get_database_size: ${rpcErr.message || rpcErr}`;
    }

    // Count listings in properties_hometea
    try {
      const { count, error: countError } = await supabase
        .from('properties_hometea')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        console.warn('Lỗi đếm bảng properties_hometea, thử properties:', countError);
        // Fallback to 'properties'
        const { count: altCount, error: altCountError } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true });
        
        if (altCountError) {
          const errMsg = `Lỗi đếm tin: ${altCountError.message}`;
          supabaseData.error = supabaseData.error ? `${supabaseData.error} | ${errMsg}` : errMsg;
        } else {
          supabaseData.totalListings = altCount || 0;
        }
      } else {
        supabaseData.totalListings = count || 0;
      }
    } catch (countErr: any) {
      console.error('Lỗi đếm bản ghi:', countErr);
      const errMsg = `Lỗi đếm tin: ${countErr.message || countErr}`;
      supabaseData.error = supabaseData.error ? `${supabaseData.error} | ${errMsg}` : errMsg;
    }
  } catch (err: any) {
    console.error('Lỗi khởi tạo hoặc truy vấn Supabase:', err);
    supabaseData.error = `Lỗi kết nối Supabase: ${err.message || err}`;
  }

  // 3. Prepare response
  const responseData: SystemStatusData = {
    cloudinary: cloudinaryData,
    supabase: supabaseData,
    checkedAt: new Date().toISOString()
  };

  // Cache response
  cachedStatus = {
    data: responseData,
    timestamp: now
  };

  res.setHeader('X-Cache', 'MISS');
  return res.json(responseData);
}
