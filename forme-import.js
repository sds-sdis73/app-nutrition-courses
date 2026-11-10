// Module Forme : import des sorties enregistrées par une montre (Garmin, Coros, Suunto…).
// Fonctions pures, sans dépendance, utilisables dans le navigateur (Safari iOS) comme dans Node.
// Formats gérés : GPX (texte, parseur par expressions régulières, sans DOMParser) et FIT (binaire).

const FORME_MAX_POINTS = 2000;
const FORME_FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
const FORME_SEMI_TO_DEG = 180 / 2147483648;
const FORME_SPORTS_FIT = {
  0: 'générique', 1: 'course', 2: 'vélo', 4: 'fitness', 5: 'natation', 10: 'entraînement', 11: 'marche',
  12: 'ski de fond', 13: 'ski alpin', 15: 'aviron', 16: 'alpinisme', 17: 'randonnée', 19: 'paddle', 37: 'trail',
};
const FORME_SPORTS_GPX = {
  running: 'course', run: 'course', trail_running: 'trail', trail: 'trail', cycling: 'vélo', biking: 'vélo', ride: 'vélo',
  walking: 'marche', walk: 'marche', hiking: 'randonnée', hike: 'randonnée', swimming: 'natation',
};

// ---------- Outils communs ----------

function formeHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formePad2(n) { return (n < 10 ? '0' : '') + n; }

function formeDateHeure(ms) {
  if (ms == null || !isFinite(ms)) return { date: null, heure: null };
  const d = new Date(ms);
  return {
    date: d.getFullYear() + '-' + formePad2(d.getMonth() + 1) + '-' + formePad2(d.getDate()),
    heure: formePad2(d.getHours()) + ':' + formePad2(d.getMinutes()),
  };
}

// D+ / D- sur l'altitude lissée (moyenne glissante sur 5 points) puis seuil d'hystérésis de 2 m.
function formeDenivele(eles) {
  const v = eles.filter((e) => e != null && isFinite(e));
  if (v.length < 2) return { plus: 0, moins: 0 };
  const half = 2;
  const lisse = v.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(v.length - 1, i + half); j++) { s += v[j]; c++; }
    return s / c;
  });
  const SEUIL = 2;
  let plus = 0, moins = 0, ref = lisse[0];
  for (let i = 1; i < lisse.length; i++) {
    const diff = lisse[i] - ref;
    if (diff >= SEUIL) { plus += diff; ref = lisse[i]; } else if (diff <= -SEUIL) { moins -= diff; ref = lisse[i]; }
  }
  return { plus, moins };
}

function formeSousEchantillonner(points, max) {
  if (points.length <= max) return points;
  const out = [];
  const pas = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * pas)]);
  return out;
}

function formeEntierOuNull(x) { return x == null || !isFinite(x) ? null : Math.round(x); }

// Construit le résultat normalisé à partir des points complets et d'un éventuel résumé (session FIT).
function formeResultat(points, resume) {
  resume = resume || {};
  const den = formeDenivele(points.map((p) => p.ele));
  const hrs = points.map((p) => p.hr).filter((h) => h != null);
  const t0 = resume.debut != null ? resume.debut : (points.find((p) => p.t != null) || {}).t;
  const dh = formeDateHeure(t0);
  const distance = resume.distance != null ? resume.distance : (points.length ? points[points.length - 1].d : 0);
  const sec = resume.dureeSec != null ? resume.dureeSec : (resume.dureeCalc != null ? resume.dureeCalc : 0);
  return {
    date: dh.date,
    heure: dh.heure,
    duree_min: Math.round(sec / 60),
    distance_m: Math.round(distance),
    dplus_m: Math.round(resume.dplus != null ? resume.dplus : den.plus),
    dmoins_m: Math.round(resume.dmoins != null ? resume.dmoins : den.moins),
    fc_moy: formeEntierOuNull(resume.fcMoy != null ? resume.fcMoy : (hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null)),
    fc_max: formeEntierOuNull(resume.fcMax != null ? resume.fcMax : (hrs.length ? Math.max.apply(null, hrs) : null)),
    sport: resume.sport != null ? resume.sport : null,
    points: formeSousEchantillonner(points, FORME_MAX_POINTS).map((p) => ({
      d: Math.round(p.d * 10) / 10,
      ele: p.ele == null ? null : Math.round(p.ele * 10) / 10,
      t: p.t == null ? null : p.t,
      hr: p.hr == null ? null : p.hr,
    })),
  };
}

// Temps en mouvement : somme des intervalles, hors pauses (intervalle > 10 s à moins de 0,5 m/s).
function formeTempsMouvement(segments) {
  let total = 0, aTemps = false;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i];
      if (a.t == null || b.t == null) continue;
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) continue;
      aTemps = true;
      const v = (b.d - a.d) / dt;
      if (dt > 10 && v < 0.5) continue;
      total += dt;
    }
  }
  return aTemps ? total : null;
}

// ---------- GPX ----------

function formeBalise(xml, nom) {
  const m = new RegExp('<(?:[\\w.-]+:)?' + nom + '\\b[^>]*>\\s*([^<]*?)\\s*</(?:[\\w.-]+:)?' + nom + '\\s*>', 'i').exec(xml);
  return m ? m[1] : null;
}

function formeAttr(attrs, nom) {
  const m = new RegExp('(?:^|\\s)(?:[\\w.-]+:)?' + nom + '\\s*=\\s*(["\'])([^"\']*)\\1', 'i').exec(attrs);
  return m ? m[2] : null;
}

function parseGPX(text) {
  text = String(text || '').replace(/<!--[\s\S]*?-->/g, '');
  // Découpe en segments (trkseg) ; sans trkseg, tout le document forme un seul segment.
  const blocs = [];
  const reSeg = /<(?:[\w.-]+:)?trkseg\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?trkseg\s*>/gi;
  let m;
  while ((m = reSeg.exec(text))) blocs.push(m[1]);
  if (!blocs.length) blocs.push(text);

  const rePt = /<(?:[\w.-]+:)?(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?(?:trkpt|rtept)\s*>)/gi;
  const segments = [];
  let dCumul = 0;
  for (const bloc of blocs) {
    const seg = [];
    let prec = null;
    rePt.lastIndex = 0;
    while ((m = rePt.exec(bloc))) {
      const lat = parseFloat(formeAttr(m[1], 'lat'));
      const lon = parseFloat(formeAttr(m[1], 'lon'));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const inner = m[2] || '';
      const eleTxt = formeBalise(inner, 'ele');
      const timeTxt = formeBalise(inner, 'time');
      const hrTxt = formeBalise(inner, 'hr') || formeBalise(inner, 'heartrate');
      const ele = eleTxt != null && eleTxt !== '' && isFinite(parseFloat(eleTxt)) ? parseFloat(eleTxt) : null;
      const t = timeTxt ? Date.parse(timeTxt) : NaN;
      const hr = hrTxt != null && isFinite(parseFloat(hrTxt)) && parseFloat(hrTxt) > 0 ? Math.round(parseFloat(hrTxt)) : null;
      if (prec) dCumul += formeHaversine(prec.lat, prec.lon, lat, lon);
      prec = { lat, lon };
      seg.push({ d: dCumul, ele, t: isFinite(t) ? t : null, hr });
    }
    if (seg.length) segments.push(seg);
  }
  const points = [].concat.apply([], segments);
  const typeTxt = formeBalise(text.replace(/<(?:[\w.-]+:)?trkseg\b[\s\S]*$/i, ''), 'type');
  const sport = typeTxt ? (FORME_SPORTS_GPX[typeTxt.toLowerCase()] || typeTxt) : null;
  let debut = null;
  if (!points.some((p) => p.t != null)) {
    const meta = /<(?:[\w.-]+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?metadata\s*>/i.exec(text);
    const mt = meta ? Date.parse(formeBalise(meta[1], 'time') || '') : NaN;
    if (isFinite(mt)) debut = mt;
  }
  return formeResultat(points, { sport, debut, dureeCalc: formeTempsMouvement(segments) });
}

// ---------- FIT ----------

// Lit une valeur numérique FIT ; renvoie null si invalide ou type non numérique.
function formeLireFit(dv, pos, size, baseType, little) {
  const bt = baseType & 0x1f;
  switch (bt) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: { // enum, uint8, uint8z, byte
      if (size !== 1) return null;
      const v = dv.getUint8(pos);
      return (bt === 0x0a ? v === 0 : v === 0xff) ? null : v;
    }
    case 0x01: { if (size !== 1) return null; const v = dv.getInt8(pos); return v === 0x7f ? null : v; }
    case 0x03: { if (size !== 2) return null; const v = dv.getInt16(pos, little); return v === 0x7fff ? null : v; }
    case 0x04: { if (size !== 2) return null; const v = dv.getUint16(pos, little); return v === 0xffff ? null : v; }
    case 0x0b: { if (size !== 2) return null; const v = dv.getUint16(pos, little); return v === 0 ? null : v; }
    case 0x05: { if (size !== 4) return null; const v = dv.getInt32(pos, little); return v === 0x7fffffff ? null : v; }
    case 0x06: { if (size !== 4) return null; const v = dv.getUint32(pos, little); return v === 0xffffffff ? null : v; }
    case 0x0c: { if (size !== 4) return null; const v = dv.getUint32(pos, little); return v === 0 ? null : v; }
    case 0x08: { if (size !== 4) return null; const v = dv.getFloat32(pos, little); return isFinite(v) && dv.getUint32(pos, little) !== 0xffffffff ? v : null; }
    case 0x09: { if (size !== 8) return null; const v = dv.getFloat64(pos, little); return isFinite(v) ? v : null; }
    default: return null; // chaînes, entiers 64 bits : inutiles ici
  }
}

function formeVue(buf) {
  if (buf && ArrayBuffer.isView(buf)) return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return new DataView(buf);
}

function parseFIT(arrayBuffer) {
  const dv = formeVue(arrayBuffer);
  const len = dv.byteLength;
  if (len < 12) throw new Error('Fichier FIT invalide : trop court.');
  const headerSize = dv.getUint8(0);
  const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if ((headerSize !== 12 && headerSize !== 14) || sig !== '.FIT') throw new Error('Fichier FIT invalide : en-tête non reconnu.');
  const dataSize = dv.getUint32(4, true);
  const fin = Math.min(len, headerSize + dataSize);

  const defs = {};
  const records = [];
  const sessions = [];
  let lastTs = null;
  let pos = headerSize;
  while (pos < fin) {
    const h = dv.getUint8(pos++);
    let local, tsComp = null;
    if (h & 0x80) {
      local = (h >> 5) & 0x03;
      const off = h & 0x1f;
      if (lastTs != null) {
        tsComp = (lastTs & ~0x1f) + off;
        if (off < (lastTs & 0x1f)) tsComp += 0x20;
        lastTs = tsComp;
      }
    } else if (h & 0x40) {
      local = h & 0x0f;
      if (pos + 5 > fin) break;
      const little = dv.getUint8(pos + 1) === 0;
      const global = dv.getUint16(pos + 2, little);
      const n = dv.getUint8(pos + 4);
      pos += 5;
      const fields = [];
      for (let i = 0; i < n; i++) {
        fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1), type: dv.getUint8(pos + 2) });
        pos += 3;
      }
      let devSize = 0;
      if (h & 0x20) {
        const nd = dv.getUint8(pos++);
        for (let i = 0; i < nd; i++) { devSize += dv.getUint8(pos + 1); pos += 3; }
      }
      defs[local] = { little, global, fields, devSize };
      continue;
    } else {
      local = h & 0x0f;
    }
    const def = defs[local];
    if (!def) throw new Error('Fichier FIT invalide : message sans définition.');
    const vals = {};
    for (const f of def.fields) {
      if (pos + f.size > fin) { pos = fin; break; }
      const v = formeLireFit(dv, pos, f.size, f.type, def.little);
      if (v != null) vals[f.num] = v;
      pos += f.size;
    }
    pos += def.devSize; // champs développeur ignorés
    if (vals[253] != null) lastTs = vals[253];
    else if (tsComp != null) vals[253] = tsComp;
    if (def.global === 20) records.push(vals);
    else if (def.global === 18) sessions.push(vals);
  }

  // Points à partir des messages record.
  const points = [];
  let d = 0, prec = null, aDistance = records.some((r) => r[5] != null);
  for (const r of records) {
    const lat = r[0] != null ? r[0] * FORME_SEMI_TO_DEG : null;
    const lon = r[1] != null ? r[1] * FORME_SEMI_TO_DEG : null;
    if (aDistance) {
      if (r[5] != null) d = r[5] / 100;
    } else if (lat != null && lon != null) {
      if (prec) d += formeHaversine(prec.lat, prec.lon, lat, lon);
      prec = { lat, lon };
    }
    const ele = r[78] != null ? r[78] / 5 - 500 : (r[2] != null ? r[2] / 5 - 500 : null);
    const t = r[253] != null ? FORME_FIT_EPOCH_MS + r[253] * 1000 : null;
    if (lat == null && r[5] == null && ele == null && r[3] == null) continue;
    points.push({ d, ele, t, hr: r[3] != null ? r[3] : null });
  }

  const resume = {};
  if (sessions.length) {
    const somme = (k, sc) => { const v = sessions.filter((s) => s[k] != null); return v.length ? v.reduce((a, s) => a + s[k], 0) / sc : null; };
    const s0 = sessions[0];
    if (s0[2] != null) resume.debut = FORME_FIT_EPOCH_MS + s0[2] * 1000;
    const timer = somme(8, 1000);
    const elapsed = somme(7, 1000);
    resume.dureeSec = timer != null ? timer : elapsed;
    const dist = somme(9, 100);
    if (dist != null) resume.distance = dist;
    resume.dplus = somme(22, 1);
    resume.dmoins = somme(23, 1);
    const avg = sessions.filter((s) => s[16] != null);
    if (avg.length) {
      let pw = 0, w = 0;
      for (const s of avg) { const p = s[8] != null ? s[8] : 1; pw += s[16] * p; w += p; }
      resume.fcMoy = pw / w;
    }
    const mx = sessions.filter((s) => s[17] != null).map((s) => s[17]);
    if (mx.length) resume.fcMax = Math.max.apply(null, mx);
    if (s0[5] != null) resume.sport = FORME_SPORTS_FIT[s0[5]] || 'sport n° ' + s0[5];
    for (const k of Object.keys(resume)) if (resume[k] == null) delete resume[k];
  }
  if (resume.dureeSec == null) {
    const ts = points.filter((p) => p.t != null);
    resume.dureeCalc = ts.length > 1 ? formeTempsMouvement([points]) : 0;
  }
  return formeResultat(points, resume);
}

// ---------- Entrée principale ----------

function importActivityFile(name, arrayBuffer) {
  const ext = (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1];
  const e = ext ? ext.toLowerCase() : '';
  let res;
  if (e === 'gpx') {
    const vue = arrayBuffer && ArrayBuffer.isView(arrayBuffer) ? arrayBuffer : new Uint8Array(arrayBuffer);
    res = parseGPX(new TextDecoder('utf-8').decode(vue));
  } else if (e === 'fit') {
    res = parseFIT(arrayBuffer);
  } else {
    throw new Error('Format de fichier non reconnu : choisissez un fichier .gpx ou .fit exporté de votre montre.');
  }
  if (!res.points.length) throw new Error('Ce fichier ne contient aucun point de parcours.');
  return res;
}

// Profil de dénivelé : n paires [distance_km, altitude_m] régulièrement espacées.
function elevationProfile(points, n) {
  if (n == null) n = 60;
  const pts = (points || []).filter((p) => p && p.ele != null && isFinite(p.ele) && isFinite(p.d));
  if (!pts.length || n < 1) return [];
  const d0 = pts[0].d, d1 = pts[pts.length - 1].d;
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const cible = n === 1 ? d0 : d0 + (d1 - d0) * i / (n - 1);
    while (j < pts.length - 2 && pts[j + 1].d < cible) j++;
    const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
    const ele = b.d > a.d ? a.ele + (b.ele - a.ele) * Math.min(1, Math.max(0, (cible - a.d) / (b.d - a.d))) : a.ele;
    out.push([Math.round(cible) / 1000, Math.round(ele * 10) / 10]);
  }
  return out;
}
