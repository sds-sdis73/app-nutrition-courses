// Tests du module Forme : import GPX / FIT de sorties enregistrées par une montre.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const code = fs.readFileSync(path.join(ROOT, 'forme-import.js'), 'utf8');
const ctx = vm.createContext({ TextDecoder, console });
vm.runInContext(code + ';globalThis.__x = { parseGPX, parseFIT, importActivityFile, elevationProfile };', ctx);
const { parseGPX, parseFIT, importActivityFile, elevationProfile } = ctx.__x;
const plain = (o) => JSON.parse(JSON.stringify(o));

const pad = (n) => String(n).padStart(2, '0');
const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localHeure = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Montée rectiligne vers le nord : 1 point/2 s, 5 km, +300 m, bruit d'altitude ±1 m (pseudo-aléatoire déterministe).
const T0 = Date.UTC(2026, 10, 8, 7, 30, 0);
const LAT0 = 45.5, LON0 = 6.0, DEG_PAR_M = 1 / 111195.08;
function bruit(i) { return Math.sin(i * 12.9898) * 1; }
function genererMontee(nb = 1001) {
  const pts = [];
  for (let i = 0; i < nb; i++) {
    const f = i / (nb - 1);
    pts.push({ lat: LAT0 + 5000 * f * DEG_PAR_M, lon: LON0, ele: 500 + 300 * f + bruit(i), t: T0 + i * 2000, hr: 140 + (i % 21) - 10 });
  }
  return pts;
}

describe('parseGPX', () => {
  test('montée de 5 km et 300 m de D+ avec bruit d’altitude', () => {
    const pts = genererMontee();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Montée</name><type>running</type><trkseg>
${pts.map((p) => `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.t).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n')}
  </trkseg></trk></gpx>`;
    const r = plain(parseGPX(xml));
    assert.ok(Math.abs(r.distance_m - 5000) <= 100, `distance ${r.distance_m}`);
    assert.ok(Math.abs(r.dplus_m - 300) <= 30, `D+ ${r.dplus_m}`);
    assert.ok(r.dmoins_m < 10, `D- ${r.dmoins_m}`);
    const fcMoy = pts.reduce((a, p) => a + p.hr, 0) / pts.length;
    assert.equal(r.fc_moy, Math.round(fcMoy));
    assert.equal(r.fc_max, 150);
    assert.equal(r.date, localDate(T0));
    assert.equal(r.heure, localHeure(T0));
    assert.equal(r.duree_min, Math.round((pts.length - 1) * 2 / 60));
    assert.equal(r.sport, 'course');
    assert.equal(r.points.length, pts.length);
    assert.equal(r.points[0].t, T0);
    assert.equal(r.points[0].hr, pts[0].hr);
  });

  test('espaces de noms ns3: et deux segments concaténés', () => {
    const seg = (debut, n, t0) => Array.from({ length: n }, (_, i) =>
      `<ns3:trkpt lat='${(LAT0 + (debut + i * 10) * DEG_PAR_M).toFixed(7)}' lon='${LON0}'>
         <ns3:ele>${100 + i}</ns3:ele><ns3:time>${new Date(t0 + i * 5000).toISOString()}</ns3:time>
         <ns3:extensions><ns3:TrackPointExtension><ns3:hr>${120 + i}</ns3:hr></ns3:TrackPointExtension></ns3:extensions>
       </ns3:trkpt>`).join('\n');
    const xml = `<?xml version="1.0"?><ns3:gpx xmlns:ns3="http://www.topografix.com/GPX/1/1"><ns3:trk>
      <ns3:trkseg>${seg(0, 11, T0)}</ns3:trkseg>
      <ns3:trkseg>${seg(200, 11, T0 + 10 * 60000)}</ns3:trkseg>
    </ns3:trk></ns3:gpx>`;
    const r = plain(parseGPX(xml));
    assert.equal(r.points.length, 22);
    // 100 m par segment, l'écart entre segments n'est pas compté.
    assert.ok(Math.abs(r.distance_m - 200) <= 2, `distance ${r.distance_m}`);
    assert.equal(r.points[11].d, r.points[10].d);
    assert.equal(r.fc_max, 130);
    assert.equal(r.fc_moy, 125);
    assert.equal(r.points[21].hr, 130);
    // Deux fois 50 s de mouvement (la pause entre segments est exclue).
    assert.equal(r.duree_min, 2);
    assert.equal(r.date, localDate(T0));
    assert.equal(r.sport, null);
  });
});

// ---------- Petit encodeur FIT pour les tests ----------
const BT = { enum: 0x00, uint8: 0x02, uint16: 0x84, sint32: 0x85, uint32: 0x86 };
const SIZE = { 0x00: 1, 0x02: 1, 0x84: 2, 0x85: 4, 0x86: 4 };
function fitEncoder({ bigEndian = false } = {}) {
  const bytes = [];
  const defs = {};
  const push = (v, type) => {
    const b = Buffer.alloc(SIZE[type]);
    const le = !bigEndian;
    if (SIZE[type] === 1) b.writeUInt8(v);
    else if (type === BT.uint16) le ? b.writeUInt16LE(v) : b.writeUInt16BE(v);
    else if (type === BT.sint32) le ? b.writeInt32LE(v) : b.writeInt32BE(v);
    else le ? b.writeUInt32LE(v >>> 0) : b.writeUInt32BE(v >>> 0);
    bytes.push(...b);
  };
  return {
    define(local, global, fields, devFields = []) {
      defs[local] = fields;
      bytes.push(0x40 | (devFields.length ? 0x20 : 0) | local, 0, bigEndian ? 1 : 0);
      bigEndian ? bytes.push(global >> 8, global & 0xff) : bytes.push(global & 0xff, global >> 8);
      bytes.push(fields.length);
      for (const [num, type] of fields) bytes.push(num, SIZE[type], type);
      if (devFields.length) { bytes.push(devFields.length); for (const [num, size] of devFields) bytes.push(num, size, 0); }
    },
    data(local, values, { devBytes = [], compressedOffset = null } = {}) {
      bytes.push(compressedOffset != null ? 0x80 | (local << 5) | compressedOffset : local);
      defs[local].forEach(([num, type], i) => push(values[i], type));
      bytes.push(...devBytes);
    },
    build() {
      const header = Buffer.alloc(14);
      header.writeUInt8(14, 0); header.writeUInt8(0x20, 1); header.writeUInt16LE(2132, 2);
      header.writeUInt32LE(bytes.length, 4); header.write('.FIT', 8, 'ascii'); header.writeUInt16LE(0, 12);
      const all = Buffer.concat([header, Buffer.from(bytes), Buffer.from([0, 0])]);
      return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
    },
  };
}
const FIT_EPOCH = Date.UTC(1989, 11, 31);
const fitTs = (ms) => Math.round((ms - FIT_EPOCH) / 1000);
const semi = (deg) => Math.round(deg * 2147483648 / 180);

describe('parseFIT', () => {
  test('records + session (en-tête 14 octets, champs développeur sautés, gros boutiste)', () => {
    const enc = fitEncoder({ bigEndian: true });
    enc.define(0, 20, [[253, BT.uint32], [0, BT.sint32], [1, BT.sint32], [2, BT.uint16], [3, BT.uint8], [5, BT.uint32]], [[0, 2]]);
    for (let i = 0; i <= 100; i++) {
      const t = T0 + i * 3000;
      enc.data(0, [fitTs(t), semi(LAT0 + i * 10 * DEG_PAR_M), semi(LON0), (200 + i * 0.5 + 500) * 5, 130 + (i % 10), i * 1000], { devBytes: [0xab, 0xcd] });
    }
    enc.define(1, 18, [[253, BT.uint32], [2, BT.uint32], [5, BT.enum], [7, BT.uint32], [8, BT.uint32], [9, BT.uint32], [16, BT.uint8], [17, BT.uint8], [22, BT.uint16], [23, BT.uint16]]);
    enc.data(1, [fitTs(T0 + 300000), fitTs(T0), 1, 310000, 300000, 100000, 134, 139, 57, 3]);
    const r = plain(parseFIT(enc.build()));
    assert.equal(r.distance_m, 1000);
    assert.equal(r.dplus_m, 57);
    assert.equal(r.dmoins_m, 3);
    assert.equal(r.fc_moy, 134);
    assert.equal(r.fc_max, 139);
    assert.equal(r.duree_min, 5);
    assert.equal(r.sport, 'course');
    assert.equal(r.date, localDate(T0));
    assert.equal(r.heure, localHeure(T0));
    assert.equal(r.points.length, 101);
    assert.equal(r.points[100].d, 1000);
    assert.equal(r.points[0].ele, 200);
    assert.equal(r.points[100].ele, 250);
    assert.equal(r.points[0].t, T0);
  });

  test('timestamp compressé, FC invalide (0xFF) ignorée, sans session', () => {
    const enc = fitEncoder();
    enc.define(0, 20, [[253, BT.uint32], [3, BT.uint8], [5, BT.uint32]]);
    const ts0 = fitTs(T0);
    enc.data(0, [ts0, 150, 0]);
    // Messages suivants avec en-tête compressé : seule la FC et la distance, l'heure vient de l'en-tête.
    enc.define(1, 20, [[3, BT.uint8], [5, BT.uint32]]);
    for (let i = 1; i <= 40; i++) {
      const ts = ts0 + i;
      enc.data(1, [i === 20 ? 0xff : 150 + (i % 2) * 10, i * 300], { compressedOffset: ts & 0x1f });
    }
    const r = plain(importActivityFile('Sortie.FIT', enc.build()));
    assert.equal(r.points.length, 41);
    assert.equal(r.points[20].hr, null);
    assert.equal(r.points[40].t, T0 + 40000);
    assert.equal(r.points[31].t, T0 + 31000); // passage du compteur 5 bits
    assert.equal(r.distance_m, 120);
    assert.equal(r.fc_max, 160);
    const hrs = r.points.map((p) => p.hr).filter((h) => h != null);
    assert.equal(hrs.length, 40);
    assert.equal(r.fc_moy, Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length));
    assert.equal(r.duree_min, 1);
    assert.equal(r.dplus_m, 0);
    assert.equal(r.sport, null);
  });
});

describe('importActivityFile', () => {
  test('format inconnu → erreur en français', () => {
    assert.throws(() => importActivityFile('sortie.tcx', new ArrayBuffer(10)), /Format de fichier non reconnu/);
    assert.throws(() => importActivityFile('sans-extension', new ArrayBuffer(10)), /\.gpx ou \.fit/);
  });
  test('GPX sans point → erreur en français', () => {
    const buf = new TextEncoder().encode('<gpx><trk><trkseg></trkseg></trk></gpx>');
    assert.throws(() => importActivityFile('vide.GPX', buf.buffer), /aucun point/);
  });
  test('FIT corrompu → erreur en français', () => {
    assert.throws(() => importActivityFile('x.fit', new Uint8Array(20).buffer), /Fichier FIT invalide/);
  });
  test('GPX décodé en UTF-8', () => {
    const xml = '<gpx><trk><name>Été à Chambéry</name><trkseg><trkpt lat="45.5" lon="6"><ele>300</ele></trkpt><trkpt lat="45.501" lon="6"/></trkseg></trk></gpx>';
    const r = plain(importActivityFile('été.gpx', new TextEncoder().encode(xml).buffer));
    assert.equal(r.points.length, 2);
    assert.ok(Math.abs(r.distance_m - 111) <= 1);
    assert.equal(r.points[1].ele, null);
    assert.equal(r.date, null);
  });
});

describe('elevationProfile', () => {
  test('longueur n et distances croissantes', () => {
    const pts = genererMontee(500).map((p, i) => ({ d: i * 10, ele: p.ele, t: null, hr: null }));
    const prof = plain(elevationProfile(pts));
    assert.equal(prof.length, 60);
    for (let i = 1; i < prof.length; i++) assert.ok(prof[i][0] > prof[i - 1][0]);
    assert.equal(prof[0][0], 0);
    assert.equal(prof[59][0], 4.99);
    assert.ok(Math.abs(prof[59][1] - pts[499].ele) < 0.1);
    assert.equal(plain(elevationProfile(pts, 10)).length, 10);
    assert.deepEqual(plain(elevationProfile([{ d: 0, ele: null }])), []);
  });
});
