// Adresses que les fonctions ne doivent jamais appeler pour le compte d'un membre (lecture d'un lien d'agenda) :
// réseau local, adresses privées, partagées (CGNAT), de lien local, de métadonnées, et leurs écritures IPv6.
// Fonctions pures, vérifiées par tests/unit/agenda-synchro.test.js.

// IPv4 « a.b.c.d » → nombre, ou null.
function ipv4(h) {
  const m = String(h).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}
const PLAGES_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([a, n]) => [ipv4(a), n]);
const dansPlage = (v, [base, n]) => (n === 0 ? true : ((v >>> (32 - n)) === (base >>> (32 - n))));

// IPv6 → 8 groupes de 16 bits, ou null (formes abrégées « :: » et IPv4 finale « ::ffff:1.2.3.4 » comprises).
function ipv6(h) {
  let s = String(h).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!s.includes(':')) return null;
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4(v4[2]);
    if (n === null) return null;
    s = `${v4[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const tete = parts[0] ? parts[0].split(':') : [];
  const queue = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const manque = 8 - tete.length - queue.length;
  if (parts.length === 1 ? manque !== 0 : manque < 1) return null;
  const groupes = [...tete, ...Array(parts.length === 2 ? manque : 0).fill('0'), ...queue];
  if (groupes.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groupes.map((g) => parseInt(g, 16));
}

// Adresse IP (v4 ou v6) privée, locale ou réservée ? null si ce n'est pas une adresse IP.
export function ipInterdite(h) {
  const v4 = ipv4(h);
  if (v4 !== null) return PLAGES_V4.some((p) => dansPlage(v4, p));
  const g = ipv6(h);
  if (!g) return null;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4 cachée dans une IPv6 : ::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d (NAT64)
  const v4cache = (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) || (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0));
  if (v4cache) return ipInterdite(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (adresses uniques locales)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (lien local)
  if ((g[0] & 0xff00) === 0xff00) return true; // multidiffusion
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

// Nom d'hôte refusé d'emblée (avant toute résolution DNS) ?
export function hoteInterdit(hote) {
  const h = String(hote || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  const ip = ipInterdite(h);
  if (ip !== null) return ip;
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h) || /^[\d.]+$/.test(h)) return true; // écritures numériques détournées (2130706433, 0x7f000001, 127.1)
  return !h.includes('.'); // nom sans domaine (machine du réseau local)
}
