
'use strict';

/*
  Cadena de Frío IoT — dashboard S3
  Lecturas públicas de demostración desde Lambda (solo lectura).
  No almacenar credenciales, certificados, tokens ni claves de AWS aquí.
  El control del LED sigue deshabilitado hasta disponer de una API autenticada.
*/

const READINGS_API_URL = 'https://asgwo7yxa3ixmsqroebyrdk4yq0qjcnu.lambda-url.us-east-1.on.aws/';
const DEVICE_ID = 'ESP32-CadenaFrio';
const POLL_MS = 15000;
const MAX_ROWS = 50;

const $ = id => document.getElementById(id);

let readings = [];
let refreshing = false;

const configured = Boolean(READINGS_API_URL.trim());

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function parseRecord(x) {
  if (!x || typeof x !== 'object') return null;

  const temperatura = Number(x.temperatura);
  const humedad = Number(x.humedad);
  let timestamp = Number(x.timestamp);

  if (
    !Number.isFinite(temperatura) ||
    !Number.isFinite(humedad) ||
    !Number.isFinite(timestamp)
  ) return null;

  if (x.deviceId && x.deviceId !== DEVICE_ID) return null;

  // DynamoDB utiliza timestamp en milisegundos;
  // tolerar segundos si otro emisor los utiliza.
  if (timestamp < 1e11) timestamp *= 1000;

  const alerta = typeof x.alerta === 'boolean'
    ? x.alerta
    : temperatura < 2 || temperatura > 8;

  return { timestamp, temperatura, humedad, alerta };
}

function dateText(ms) {
  return new Date(ms).toLocaleString('es-CO', {
    dateStyle:'short',
    timeStyle:'medium'
  });
}

function setConnection(state, text) {
  $('connection').className = 'connection ' + state;
  $('connectionText').textContent = text;
  $('apiHealth').textContent = text;
}

function render() {
  const latest = readings.at(-1);

  $('recordCount').textContent = readings.length;
  $('pointsCount').textContent = readings.length + ' registros';
  $('lastReading').textContent = latest
    ? dateText(latest.timestamp)
    : 'Sin datos';

  $('temperature').textContent = latest
    ? latest.temperatura.toFixed(2) + ' °C'
    : '-- °C';

  $('humidity').textContent = latest
    ? latest.humedad.toFixed(2) + ' %'
    : '-- %';

  const banner = $('alertBanner');
  const label = $('tempLabel');

  if (!latest) {
    banner.className = 'banner waiting';
    $('bannerIcon').textContent = '◷';
    $('alertTitle').textContent = 'Esperando mediciones';
    $('alertDescription').textContent =
      'No hay lecturas disponibles en DynamoDB para mostrar.';

    label.textContent = 'Sin lectura';
    label.className = 'pill neutral';

  } else if (latest.alerta) {
    banner.className = 'banner alert';
    $('bannerIcon').textContent = '⚠';

    $('alertTitle').textContent =
      'ALERTA: temperatura fuera del rango permitido';

    $('alertDescription').textContent =
      latest.temperatura < 2
        ? 'La última temperatura registrada está por debajo de 2 °C.'
        : 'La última temperatura registrada supera el límite de 8 °C.';

    label.textContent = 'Alerta';
    label.className = 'pill alert';

  } else {
    banner.className = 'banner safe';
    $('bannerIcon').textContent = '✓';

    $('alertTitle').textContent =
      'Temperatura dentro del rango permitido';

    $('alertDescription').textContent =
      'La última medición está entre 2 °C y 8 °C.';

    label.textContent = 'Normal';
    label.className = 'pill safe';
  }

  $('recordsBody').innerHTML = readings.length
    ? [...readings].reverse().map(r => `
        <tr>
          <td>${escapeHtml(dateText(r.timestamp))}</td>
          <td class="${r.alerta ? 'out-range' : ''}">
            ${r.temperatura.toFixed(2)} °C
          </td>
          <td>${r.humedad.toFixed(2)} %</td>
          <td>
            <span class="pill ${r.alerta ? 'alert' : 'safe'}">
              ${r.alerta ? 'ALERTA' : 'NORMAL'}
            </span>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" class="empty">No hay lecturas disponibles.</td></tr>';

  $('downloadCsv').disabled = !readings.length;

  drawChart(readings.slice(-50));
}

function drawChart(rows) {
  const svg = $('chart');

  const x0 = 53;
  const x1 = 780;
  const y0 = 12;
  const y1 = 245;

  const nums = rows.map(r => r.temperatura);

  const min = Math.floor(Math.min(0, ...nums) - 1);
  const max = Math.ceil(Math.max(10, ...nums) + 1);

  const y = n => y1 - (n - min) / (max - min) * (y1 - y0);

  const x = i =>
    x0 + (rows.length === 1 ? 0.5 : i / (rows.length - 1)) * (x1 - x0);

  let html = `
    <rect
      x="${x0}"
      y="${y(8)}"
      width="${x1-x0}"
      height="${y(2)-y(8)}"
      fill="#e4f5ee"
    />
  `;

  for (
    let t = Math.ceil(min / 2) * 2;
    t <= max;
    t += 2
  ) {
    html += `
      <line
        x1="${x0}" y1="${y(t)}"
        x2="${x1}" y2="${y(t)}"
        stroke="#e4ecf6"
      />
      <text
        x="39" y="${y(t)+4}"
        font-size="12"
        fill="#7990ad"
        text-anchor="end"
      >${t}</text>
    `;
  }

  for (const t of [2, 8]) {
    html += `
      <line
        x1="${x0}" x2="${x1}"
        y1="${y(t)}" y2="${y(t)}"
        stroke="#35ad89"
        stroke-dasharray="6 5"
        stroke-width="1.4"
      />
    `;
  }

  if (rows.length) {
    html += `
      <polyline
        points="${rows.map((r,i) =>
          x(i)+','+y(r.temperatura)
        ).join(' ')}"
        fill="none"
        stroke="#0d71ee"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `;

    rows.forEach((r,i) => {
      html += `
        <circle
          cx="${x(i)}"
          cy="${y(r.temperatura)}"
          r="${r.alerta ? 5 : 3}"
          fill="${r.alerta ? '#cf3545' : '#0d71ee'}"
          stroke="white"
          stroke-width="1.5"
        />
      `;
    });

    for (const i of [...new Set([
      0,
      Math.floor((rows.length-1)/2),
      rows.length-1
    ])]) {
      html += `
        <text
          x="${x(i)}"
          y="272"
          text-anchor="middle"
          font-size="11"
          fill="#7990ad"
        >${new Date(rows[i].timestamp).toLocaleTimeString('es-CO', {
          hour:'2-digit',
          minute:'2-digit'
        })}</text>
      `;
    }

  } else {
    html += `
      <text
        x="405"
        y="136"
        text-anchor="middle"
        fill="#90a2b8"
        font-size="15"
      >Esperando registros reales de AWS...</text>
    `;
  }

  svg.innerHTML = html;
}

async function refresh() {
  if (!configured || refreshing) return;

  refreshing = true;

  try {
    const response = await fetch(READINGS_API_URL, {
      method:'GET',
      cache:'no-store'
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();

    const items = Array.isArray(data)
      ? data
      : (data.lecturas || data.items);

    if (!Array.isArray(items)) {
      throw new Error('Formato de respuesta no válido');
    }

    if (
      data.dispositivo &&
      data.dispositivo !== DEVICE_ID
    ) {
      throw new Error('Dispositivo inesperado');
    }

    readings = items
      .map(parseRecord)
      .filter(Boolean)
      .sort((a,b) => a.timestamp-b.timestamp)
      .slice(-MAX_ROWS);

    $('awsState').textContent = 'Conectado';

    $('lastSync').textContent =
      'Consulta: ' + new Date().toLocaleTimeString('es-CO');

    setConnection('online', 'Datos recibidos de AWS');

    render();

  } catch (err) {
    console.error('Error consultando Lambda:', err);

    setConnection('error', 'Error al consultar API');

    $('awsState').textContent = 'Sin conexión';
    $('lastSync').textContent = err.message;

  } finally {
    refreshing = false;
  }
}

function csv() {
  if (!readings.length) return;

  const lines = [
    'timestamp,fecha_hora,deviceId,temperatura_C,humedad_pct,alerta',

    ...readings.map(r => [
      r.timestamp,
      '"' + dateText(r.timestamp).replace(/"/g, '""') + '"',
      DEVICE_ID,
      r.temperatura.toFixed(2),
      r.humedad.toFixed(2),
      r.alerta
    ].join(','))
  ];

  const blob = new Blob(
    ['\uFEFF' + lines.join('\r\n')],
    {type:'text/csv;charset=utf-8'}
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = 'cadena-frio-lecturas.csv';

  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Seguridad: la Lambda pública solamente consulta lecturas.
// Nunca enviar comandos a ella.

$('turnOn').disabled = true;
$('turnOff').disabled = true;

$('controlFeedback').textContent =
  'Control del LED pendiente: requiere una API autenticada. No se enviarán comandos.';

$('downloadCsv').addEventListener('click', csv);

if (configured) {
  refresh();
  setInterval(refresh, POLL_MS);

} else {
  setConnection('', 'API pendiente de configurar');
  $('awsState').textContent = 'Pendiente';
}

render();
