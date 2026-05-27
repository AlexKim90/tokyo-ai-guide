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
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.location'
        },
        body: JSON.stringify({ textQuery: query, languageCode: 'ko' })
      });
      const data = await r.json();
      const results = (data.places || []).map(p => ({
        place_id: p.id,
        name: p.displayName?.text || '',
        formatted_address: p.formattedAddress || '',
        types: p.types || [],
        rating: p.rating,
        user_ratings_total: p.userRatingCount,
        lat: p.location?.latitude,
        lng: p.location?.longitude
      }));
      return res.status(200).json({ results });

    } else if (type === 'details') {
      const fields = 'id,displayName,formattedAddress,nationalPhoneNumber,regularOpeningHours,rating,userRatingCount,websiteUri,googleMapsUri,types,location,editorialSummary,priceLevel,reservable,parkingOptions,photos';
      const r = await fetch(`https://places.googleapis.com/v1/places/${place_id}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields, 'Accept-Language': 'ko' }
      });
      const p = await r.json();
      return res.status(200).json({ result: {
        name: p.displayName?.text || '',
        formatted_address: p.formattedAddress || '',
        formatted_phone_number: p.nationalPhoneNumber || '',
        opening_hours: p.regularOpeningHours ? { weekday_text: p.regularOpeningHours.weekdayDescriptions || [] } : null,
        rating: p.rating,
        user_ratings_total: p.userRatingCount,
        website: p.websiteUri,
        url: p.googleMapsUri,
        place_id: p.id,
        types: p.types || [],
        lat: p.location?.latitude,
        lng: p.location?.longitude,
        editorial: p.editorialSummary?.text || '',
        priceLevel: p.priceLevel || '',
        reservable: p.reservable ?? null,
        parkingOptions: p.parkingOptions || null,
        photoName: p.photos?.[0]?.name || ''
      }});

    } else if (type === 'expand') {
      if (!url) return res.status(400).json({ error: 'Missing url' });

      // 1) Full Google Maps URL — parse place name directly (no redirect needed)
      const directMatch = url.match(/\/maps\/place\/([^\/@?]+)/);
      if (directMatch) {
        return res.status(200).json({ name: decodeURIComponent(directMatch[1].replace(/\+/g, ' ')), finalUrl: url });
      }

      // 2) Strip iOS/Android share tracking params (g_st=i, etc.) that alter redirect behavior
      const cleanUrl = url.replace(/([?&])g_st=[^&]*/g, '').replace(/\?&/, '?').replace(/[?&]$/, '');

      // 3) Follow ALL redirects with MOBILE UA — maps.app.goo.gl is mobile-targeted,
      //    desktop UA gives a different redirect destination
      //    redirect:'follow' handles multi-hop chains: maps.app.goo.gl → goo.gl → google.com/maps
      const r1 = await fetch(cleanUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': UA_MOBILE }
      });
      const finalUrl = r1.url;

      // 4) Re-fetch final Maps URL with DESKTOP UA to get entitylist preload in HTML
      //    (preload link only appears in the desktop HTML response)
      const r2 = await fetch(finalUrl, {
        headers: {
          'User-Agent': UA_DESKTOP,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
      });
      const html = await r2.text();

      // 5) Detect list vs single place by looking for entitylist preload in HTML
      const preloadMatch = html.match(/href="(\/maps\/preview\/entitylist\/getlist[^"]+)"/);

      if (!preloadMatch) {
        // Not a list — try to get place name from final URL
        const nameMatch = finalUrl.match(/\/maps\/place\/([^\/@?]+)/);
        const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;
        return res.status(200).json({ name, finalUrl });
      }

      // ---- IT'S A SAVED LIST ----
      // 6) Fetch the list JSON using preload URL found in HTML
      const listUrl = `https://www.google.com${preloadMatch[1].replace(/&amp;/g, '&')}`;
      const r3 = await fetch(listUrl, { headers: { 'User-Agent': UA_DESKTOP } });
      const raw = await r3.text();
      const text = raw.startsWith(")]}'") ? raw.slice(5) : raw;

      // 6) Extract list name
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

    } else if (type === 'photo') {
      const { name } = req.query;
      if (!name) return res.status(400).json({ error: 'Missing name' });
      const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=600&skipHttpRedirect=true`, {
        headers: { 'X-Goog-Api-Key': key }
      });
      const d = await r.json();
      return res.status(200).json({ url: d.photoUri || '' });

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
