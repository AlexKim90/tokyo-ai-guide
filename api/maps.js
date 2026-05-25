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
      // Expand short Google Maps URLs (goo.gl, maps.app.goo.gl)
      if (!url) return res.status(400).json({ error: 'Missing url' });
      const r = await fetch(url, { redirect: 'follow' });
      const finalUrl = r.url;
      const nameMatch = finalUrl.match(/\/maps\/place\/([^\/@?]+)/);
      const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;
      const placeIdMatch = finalUrl.match(/place_id=([^&]+)/);
      return res.status(200).json({ finalUrl, name, placeId: placeIdMatch?.[1] || null });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
