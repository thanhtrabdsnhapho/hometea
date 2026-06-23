import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SITE_URL = 'https://thanhtrabds.vercel.app'; // TODO: đổi sang domain riêng khi có
const SUPABASE_TIMEOUT_MS = 6_000; // fail fast trước giới hạn 10s của Vercel
const MAX_ROWS = 5_000;            // safety cap, tránh result set phình vô hạn
const MAX_IMAGES_PER_URL = 10;     // giới hạn ảnh/url theo khuyến nghị Google

// ---------------------------------------------------------------------------
// Supabase client — chỉ đọc từ env, KHÔNG bao giờ hardcode credentials
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Log rõ để dễ debug trên Vercel dashboard, không crash silently
  console.error('[sitemap] Missing env: SUPABASE_URL or SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PropertyRow {
  id: number;
  title: string;
  badge: string | null;
  img: string | null;
  img_list: string[] | null;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isHotBadge(badge: string | null): boolean {
  if (!badge) return false;
  const b = badge.toLowerCase();
  return b.includes('hot') || b.includes('nổi bật') || b.includes('giảm giá');
}

function daysSince(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return 999;
  return (Date.now() - t) / 86_400_000;
}

/** Trả về { priority, changefreq } dựa trên tuổi tin và badge */
function getSeoMeta(row: PropertyRow): { priority: string; changefreq: string } {
  const age = daysSince(row.updated_at ?? row.created_at);

  if (isHotBadge(row.badge))  return { priority: '0.9', changefreq: 'daily' };
  if (age < 14)               return { priority: '0.8', changefreq: 'weekly' };
  if (age < 60)               return { priority: '0.7', changefreq: 'weekly' };
  return                             { priority: '0.6', changefreq: 'monthly' };
}

/** Tập hợp ảnh duy nhất: img đại diện + img_list, loại trùng, giới hạn số lượng */
function collectImages(row: PropertyRow): string[] {
  const seen = new Set<string>();
  const push = (src: string | null | undefined) => {
    if (src) seen.add(src);
  };
  push(row.img);
  if (Array.isArray(row.img_list)) row.img_list.forEach(push);
  return Array.from(seen).slice(0, MAX_IMAGES_PER_URL);
}

// ---------------------------------------------------------------------------
// XML builders
// ---------------------------------------------------------------------------
function buildPropertyEntry(row: PropertyRow): string {
  // Skip row không có dữ liệu bắt buộc để tránh XML không hợp lệ
  if (!row.id || !row.title) return '';

  const loc = `${SITE_URL}/?id=${row.id}`;
  const lastmodStr = row.updated_at ?? row.created_at;
  let lastmod = '';
  try {
    const d = new Date(lastmodStr ?? Date.now());
    lastmod = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
  } catch {
    lastmod = new Date().toISOString().split('T')[0];
  }
  const { priority, changefreq } = getSeoMeta(row);

  const imageTags = collectImages(row)
    .map(
      (src) => `
    <image:image>
      <image:loc>${escapeXml(src)}</image:loc>
      <image:title>${escapeXml(row.title)}</image:title>
    </image:image>`
    )
    .join('');

  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${imageTags}
  </url>`;
}

function buildStaticEntry(loc: string, priority: string, changefreq: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildFallbackXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${buildStaticEntry(SITE_URL, '1.0', 'daily')}
</urlset>`;
}

// ---------------------------------------------------------------------------
// HTML builder — trang khám phá cho Googlebot follow link (không tốn API slot)
// Truy cập: /sitemap.xml?format=html
// ---------------------------------------------------------------------------
function buildHtmlDiscoveryPage(properties: PropertyRow[]): string {
  const links = properties
    .filter(p => p.id && p.title)
    .map(p => `  <li><a href="${SITE_URL}/?id=${p.id}">${p.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, follow">
  <title>Danh sách bất động sản - Thanh Trà BĐS</title>
</head>
<body>
  <h1>Danh sách bất động sản tại TP. Thủ Đức</h1>
  <p>Tổng cộng: ${properties.length} bất động sản</p>
  <ul>
${links}
  </ul>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Phân luồng: ?format=html → trang HTML cho Googlebot follow link
  //             (mặc định)  → XML sitemap chuẩn
  const wantHtml = req.query?.format === 'html';

  try {
    // Race giữa query thực và timeout — không bao giờ để Vercel hard-kill function
    const queryPromise = supabase
      .from('properties_hometea')
      .select('id, title, badge, img, img_list, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Supabase query timeout')), SUPABASE_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as Awaited<typeof queryPromise>;
    if (timeoutId) clearTimeout(timeoutId);

    if (error) throw error;

    const properties: PropertyRow[] = data ?? [];

    // Chỉ trang chủ được đưa vào static entries.
    // Các hash-anchor (#products, #contact) KHÔNG phải URL độc lập
    // → không đưa vào sitemap, tránh Google coi là nội dung trùng lặp.
    const staticEntries  = [buildStaticEntry(SITE_URL, '1.0', 'daily')];
    const propertyEntries = properties.map(buildPropertyEntry).filter(Boolean);

    // Nếu yêu cầu HTML → trả trang khám phá cho Googlebot follow link
    if (wantHtml) {
      const html = buildHtmlDiscoveryPage(properties);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(html);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${staticEntries.join('')}${propertyEntries.join('')}
</urlset>`;

    // Cache tại CDN edge → Googlebot và người dùng nhận response nhanh, không chờ Supabase mỗi lần
    // s-maxage=3600            : cache edge 1 giờ
    // stale-while-revalidate   : vẫn serve bản cũ (fast) tối đa 24h trong khi refresh ngầm
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(xml);

  } catch (err) {
    console.error('[sitemap] Generation failed:', err);

    // Fallback an toàn: luôn trả 200 + XML hợp lệ (chỉ trang chủ)
    // → Google không bao giờ nhận lỗi 500, tránh ảnh hưởng index toàn site.
    // Cache ngắn hơn để sự cố tạm thời (DB hiccup) không bị kẹt cache quá lâu.
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(buildFallbackXml());
  }
}