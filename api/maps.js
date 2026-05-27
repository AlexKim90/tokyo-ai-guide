const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractName(fullName, address) {
  if (!fullName) return null;
  if (fullName.startsWith('일본') || fullName.startsWith('〒')) return null;
  // Split before address portion (comma + digit, or 〒, or Chome)
  const cut = fullName.search(/,\s*[\d〒]|,\s*\d| \d+[-\s][A-Za-z]| Chome/);
  if (cut > 0) return fullName.substring(0, cut).trim();
  // Remove address prefix from end by matching start of address
  if (address) {
    const addrKey = address.split(',')[0].trim().replace(/^일본\s*〒?\d*\s*/, '').split(' ')[0];
    if (addrKey.length > 2 && fullName.includes(addrKey)) {
      const idx = fullName.indexOf(addrKey);
      if (idx > 0) return fullName.substring(0, idx).trim().replace(/[,\s]+$/, '');
    }
  }
  return fullName.split(',')[0].trim();
}

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

      // 1) Full Google Maps URL — parse place name directly
      const directMatch = url.match(/\/maps\/place\/([^\/@?]+)/);
      if (directMatch) {
        return res.status(200).json({ name: decodeURIComponent(directMatch[1].replace(/\+/g, ' ')), finalUrl: url });
      }

      // 2) Strip app-share tracking params (g_st=i from iOS, etc.) before following redirect
      //    These params can cause Google to return app-scheme redirects instead of web URLs
      const cleanUrl = url.replace(/([?&])g_st=[^&]*(&|$)/g, (_, p, s) => s === '&' ? p : '').replace(/[?&]$/, '');

      // 3) Short URL — follow the redirect (no-follow, manual)
      const r1 = await fetch(cleanUrl, { redirect: 'manual', headers: { 'User-Agent': UA_MOBILE } });
      const location = r1.headers.get('location') || '';

      // 3) Check if redirect goes to a list (@/data= pattern) or a place
      const isListUrl = location.includes('/maps/@/') && location.includes('!2s');

      if (!isListUrl) {
        // Single place — try to extract name from redirect URL
        const nameMatch = location.match(/\/maps\/place\/([^\/@?]+)/);
        const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;
        return res.status(200).json({ name, finalUrl: location || url });
      }

      // ---- IT'S A SAVED LIST ----
      // 4) Fetch the Maps page to find the entitylist preload URL
      const fullLocation = location.startsWith('http') ? location : `https://www.google.com${location}`;
      const r2 = await fetch(fullLocation, { headers: { 'User-Agent': UA_DESKTOP } });
      const html = await r2.text();

      const preloadMatch = html.match(/href="(\/maps\/preview\/entitylist\/getlist[^"]+)"/);
      if (!preloadMatch) return res.status(200).json({ name: null, finalUrl: location, isList: false });

      // 5) Fetch the list JSON
      const listUrl = `https://www.google.com${preloadMatch[1].replace(/&amp;/g, '&')}`;
      const r3 = await fetch(listUrl, { headers: { 'User-Agent': UA_DESKTOP } });
      const raw = await r3.text();
      const text = raw.startsWith(")]}'") ? raw.slice(5) : raw;

      // 6) Extract list name — appears after googleusercontent owner avatar URL
      let listName = 'Google Maps 리스트';
      const lnMatch = text.match(/googleusercontent\.com[^"]*","[^"]+"\],"([^"]{1,40})"/);
      if (lnMatch) listName = lnMatch[1];

      // 7) Extract all places
      const placeRe = /\[null,\[null,null,"([^"]+)",null,"([^"]+)",\[null,null,(-?[\d.]+),(-?[\d.]+)\]/g;
      const places = [];
      let m;
      while ((m = placeRe.exec(text)) !== null && places.length < 30) {
        const fullName = m[1], address = m[2];
        const lat = parseFloat(m[3]), lng = parseFloat(m[4]);
        const name = extractName(fullName, address);
        if (!name || name.length < 2) continue;
        places.push({
          name,
          address: address.replace(/^일본\s*/, '').trim(),
          lat, lng,
          mapsUrl: `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z`
        });
      }

      return res.status(200).json({ isList: true, listName, places });

    } else if (type === 'directions') {
      const { origin, destination } = req.query;
      if (!origin || !destination) return res.status(400).json({ error: 'Missing origin/destination' });
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=transit&language=ko&departure_time=now&key=${key}`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());

    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
