import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bywboejxhpvdahbfvote.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Add a hard timeout so we never hit Vercel's 10s function limit.
    // If Supabase takes too long, we fail fast and return the fallback sitemap.
    const queryPromise = supabase
      .from('properties_hometea')
      .select('id')
      .order('id', { ascending: false })
      .limit(5000); // safety cap so result set can't grow unbounded

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Supabase query timeout')), 6000);
    });

    const { data: properties, error }: any = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const propertyUrls = (properties || []).map((p: { id: string | number }) => {
      return `
  <url>
    <loc>https://thanhtrabds.vercel.app/?id=${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thanhtrabds.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${propertyUrls}
</urlset>`;

    // CRITICAL: cache at the CDN edge so Googlebot (and everyone else)
    // gets a fast cached response instead of waiting on Supabase every time.
    // s-maxage=3600: edge cache for 1 hour
    // stale-while-revalidate=86400: serve stale (fast) for up to 24h while refreshing in background
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(xml);

  } catch (err) {
    console.error('Sitemap error:', err);
    const today = new Date().toISOString().split('T')[0];

    // Fallback sitemap: still return 200 with a valid minimal sitemap
    // so Google never sees a hard failure. Cache this briefly so a
    // transient DB hiccup doesn't get "stuck" for too long.
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thanhtrabds.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  }
}