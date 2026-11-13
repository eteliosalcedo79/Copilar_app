const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const RELOJ = typeof setTimeout === 'function';
const PRESUPUESTO = RELOJ ? 42000 : 25000;
const CIERRE = RELOJ ? 50000 : 40000;
let inicio = Date.now();

function esperar(ms) {
  return RELOJ ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
function transcurrido() { return Date.now() - inicio; }
function restante() { return PRESUPUESTO - transcurrido(); }

function conLimite(promesa, ms, valor) {
  let listo = false;
  const fin = Date.now() + ms;
  const trabajo = Promise.resolve(promesa).then(
    (v) => { listo = true; return v; },
    () => { listo = true; return valor; }
  );
  if (!RELOJ) return trabajo;
  const reloj = (async () => {
    while (!listo && Date.now() < fin) await esperar(Math.max(1, Math.min(250, fin - Date.now())));
    return valor;
  })();
  return Promise.race([trabajo, reloj]);
}

async function traer(url, opciones) {
  if (typeof window.nativeFetch === 'function') {
    return window.nativeFetch(url, opciones);
  }
  return fetch(url, opciones);
}

async function pedirCrudo(url, opciones) {
  const o = Object.assign({}, opciones || {});
  const limite = Math.min(o.limite || CIERRE, CIERRE - transcurrido());
  delete o.limite;
  o.headers = Object.assign({
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8'
  }, o.headers || {});
  return conLimite(traer(url, o).catch(() => null), limite, null);
}

async function texto(url, opciones) {
  const r = await pedirCrudo(url, opciones);
  if (!r || !r.ok) return '';
  try { return (await conLimite(r.text(), 10000, '')) || ''; } catch (e) { return ''; }
}

function limitar(buscador) {
  return (...args) => {
    inicio = Date.now();
    return conLimite(Promise.resolve().then(() => buscador(...args)), CIERRE, null)
      .then((s) => s || []);
  };
}

const BASE   = 'https://futbollibreplus.st';
const AGENDA = `${BASE}/agenda.php`;

const FLAGS = {
  NAT: '🌍', COL: '🇨🇴', MEX: '🇲🇽', AR: '🇦🇷', URU: '🇺🇾', CHA: '🇨🇱',
  ES: '🇪🇸', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', IT: '🇮🇹', BRA: '🇧🇷', FRA: '🇫🇷', ALE: '🇩🇪',
  USA: '🇺🇸', ECU: '🇪🇨', PER: '🇵🇪', LIB: '🏆', SUD: '🏆',
  CONNAT: '🌎', CONCACAFCHA: '🌎', UEFA: '🇪🇺',
  NBA: '🏀', NFL: '🏈', MLB: '⚾', NHL: '🏒', UFC: '🥊', F1: '🏎️',
  MOTOGP: '🏍️', BOX: '🥊', WWE: '🤼', VOLEY: '🏐', RUG: '🏉',
  BAS: '🏀', TENIS: '🎾', TE: '🎾'
};

const MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11
};

function b64dec(s) {
  try {
    if (typeof atob === 'function') {
      const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
      let out = '';
      for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i));
      return out;
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
  } catch (e) {}
  return '';
}

function fechaAgenda(html) {
  const m = html.match(/Agenda\s*-\s*\w+\s+(\d{1,2})\s+de\s+([A-Za-záéíóúñ]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = MESES[m[2].toLowerCase()];
  const anio = Number(m[3]);
  if (mes === undefined) return null;
  return { dia, mes, anio };
}

function aUtc(fecha, hora) {
  if (!fecha) return '';
  const [h, min] = hora.split(':').map(Number);
  const d = new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia, h, min || 0, 0));
  return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function parsearCanales(bloque) {
  const canales = [];
  const rx = /<li class="subitem\d+">\s*<a href="\/eventos\.html\?r=([^"]+)"[^>]*>([\s\S]*?)<\/a><\/li>/g;
  let m;
  while ((m = rx.exec(bloque))) {
    const url = b64dec(m[1]);
    if (!/^https?:\/\//.test(url)) continue;
    const interior = m[2];
    const cm = interior.match(/^([\s\S]*?)(?:<span>\s*([^<]*?)\s*<\/span>)?\s*$/);
    const nombre  = (cm && cm[1] ? cm[1] : interior).replace(/\s+/g, ' ').trim();
    const calidad = (cm && cm[2] ? cm[2] : '').trim();
    canales.push({ name: nombre, url: url, quality: calidad });
  }
  return canales;
}

function parsearAgenda(html) {
  const fecha = fechaAgenda(html);
  const eventos = [];
  const rx = /<li class="([^"]+)">\s*<a href="#">\s*([\s\S]*?)\s*<span class="t">(\d{1,2}:\d{2})<\/span><\/a>\s*<ul>([\s\S]*?)<\/ul>\s*<\/li>/g;
  let m;
  while ((m = rx.exec(html))) {
    const clase = m[1].trim();
    const bruto = m[2].replace(/\s+/g, ' ').trim();
    const hora  = m[3];
    const canales = parsearCanales(m[4]);
    if (!canales.length) continue;

    const partes = bruto.split(':');
    const liga   = partes.length > 1 ? partes[0].trim() : '';
    const match  = partes.length > 1 ? partes.slice(1).join(':').trim() : bruto;

    eventos.push({
      time:     hora,
      time_utc: aUtc(fecha, hora),
      match:    match,
      league:   liga || clase,
      flag:     FLAGS[clase] || '⚽',
      channels: canales
    });
  }
  return eventos;
}

async function getEventos() {
  const html = await texto(AGENDA, { headers: { Referer: `${BASE}/` } });
  if (!html) return [];
  return parsearAgenda(html);
}

window.getEventos = limitar(getEventos);