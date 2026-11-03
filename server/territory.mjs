// Public, read-only spatial lookup. Never forwards credentials or accepts an upstream URL/layer.
export const TERRITORY_SOURCE = 'https://filipeia.joaopessoa.pb.gov.br/geoserver/ows';
export const TERRITORY_LAYER = 'digeoc:zoneamento2024';
export function territoryURL(search) {
  const names = ['west', 'south', 'east', 'north'];
  if (names.some(name => !search.has(name) || !search.get(name).trim())) throw Error('bounds');
  const [w, s, e, n] = names.map(name => Number(search.get(name)));
  if (![w, s, e, n].every(Number.isFinite) || w < -35 || e > -34.75 || s < -7.3 || n > -7
    || w >= e || s >= n || e - w > .05 || n - s > .05) throw Error('bounds');
  const url = new URL(TERRITORY_SOURCE);
  url.search = new URLSearchParams({service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: TERRITORY_LAYER, outputFormat: 'application/json', srsName: 'CRS:84', count: '50',
    bbox: [w, s, e, n, 'urn:ogc:def:crs:OGC:1.3:CRS84'].join(',')});
  return url;
}
export async function territoryAPI(request, fetcher = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
  if (request.method !== 'GET') return json({error: 'Método não permitido.'}, 405);
  let url;
  try { url = territoryURL(new URL(request.url).searchParams); }
  catch { return json({error: 'Informe uma localização ou perímetro válido de João Pessoa.'}, 400); }
  try {
    const response = await fetcher(url.href, {signal: AbortSignal.timeout(8000), redirect: 'error',
      headers: {Accept: 'application/json'}});
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw Error('upstream');
    // Bound decoded body size even when Content-Length is missing or compressed.
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4_000_000) throw Error('large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder().decode(buffer));
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length >= 50
      || Number(data.numberMatched) > data.features.length) throw Error('incomplete');
    return json({type: data.type, features: data.features, source: {name: 'Filipeia/SEPLAN/PMJP',
      layer: TERRITORY_LAYER, url: url.href, retrievedAt: new Date().toISOString(), legalValidation: false}});
  } catch { return json({error: 'Consulta territorial indisponível. Tente novamente; nenhum enquadramento foi presumido.'}, 503); }
}
