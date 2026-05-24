export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { type, query, place_id } = req.query;
  const key = process.env.GOOGLE_MAPS_KEY;
  try {
    let url;
    if (type === 'search') {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=ko&key=${key}`;
    } else if (type === 'details') {
      const fields = 'name,formatted_address,formatted_phone_number,opening_hours,rating,user_ratings_total,website,url';
      url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&language=ko&key=${key}`;
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
