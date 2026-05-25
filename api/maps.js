export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { type, query, place_id, url } = req.query;
  const key = process.env.GOOGLE_MAPS_KEY;
  try {
    if (type === 'search') {
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=ko&key=${key}`);
      return res.status(200).json(await r.json());
    } else if (type === 'details') {
      const fields = 'name,formatted_address,formatted_phone_number,opening_hours,rating,user_ratings_total,website,url,place_id';
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&language=ko&key=${key}`);
      return res.status(200).json(await r.json());
    } else if (type === 'expand') {
      if (!url) return res.status(400).json({ error: 'Missing url' });

      // 1) Try to parse place name directly from full URL
      const directMatch = url.match(/\/maps\/place\/([^\/@?]+)/);
      if (directMatch) {
        const name = decodeURIComponent(directMatch[1].replace(/\+/g, ' '));
        return res.status(200).json({ name, finalUrl: url });
      }

      // 2) For short URLs (maps.app.goo.gl, goo.gl) — fetch with mobile UA to trigger redirect
      const r = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        }
      });
      const finalUrl = r.url;
      const html = await r.text();

      // 3) Try to find destination URL embedded in HTML / JS
      const htmlPatterns = [
        /"(https:\/\/www\.google\.com\/maps\/place\/[^"]+)"/,
        /'(https:\/\/www\.google\.com\/maps\/place\/[^']+)'/,
        /href="(https:\/\/www\.google\.com\/maps\/place\/[^"]+)"/,
        /"link"\s*:\s*"(https?:\/\/[^"]+maps[^"]+)"/,
      ];
      let destUrl = finalUrl;
      for (const pat of htmlPatterns) {
        const m = html.match(pat);
        if (m) { destUrl = m[1]; break; }
      }

      const nameMatch = destUrl.match(/\/maps\/place\/([^\/@?]+)/);
      const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;
      return res.status(200).json({ finalUrl: destUrl, name });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
