// ====== MAPA DE REFERENCIAS (QR → Punto de Marcación) ======
const REFERENCIA_MAP = {
  "1758633979512": "VICTOR II-VEHICULAR",
  "1758634547775": "VICTOR II-PEATONAL",
  "1758634571039": "INFORMALES",
  "1758634596499": "P10-RED3",
  "1758634650734": "P10-RED2",
  "1758634677927": "P10-RED1",
  "1758634692534": "ESTACIONAMIENTO ECO1",
  "1758634711326": "VICTOR I-PEATONAL",
  "1758634732877": "VICTOR I-VEHICULAR",
  "1758634750504": "CANTINA",
  "1758634764633": "COMEDOR",
  "1758634775499": "INICIO BOULEVARD",
  "1758634791404": "MEDIO BOULEVARD",
  "1758634808441": "VICTOR LIMA ALPHA",
  "1758634821245": "VICTOR LIMA BRAVO",
  "1758634836852": "VICTOR LIMA",
  "1758634868639": "ESTACIONAMIENTO ECO5",
  "1758634887708": "ESTACIONAMIENTO ECO6",
  "1758634953827": "P10-PUERTA1 HOTEL",
  "1758634974952": "P10-PUERTA2 HOTEL",
  "1758635030343": "P10-PUERTA3 HOTEL",
  "1758635054185": "P20-PUERTA 4 Y 5 HOTEL",
  "1758635081197": "P20-ALPHA 7 (I) HOTEL",
  "1758635116434": "P20-ALPHA 7 (II) HOTEL",
  "1758635142271": "P30-PUERTA3 HOTEL",
  "1758635169121": "P30-PUERTA2 HOTEL",
  "1758635190385": "P30-PUERTA1 HOTEL",
  "1758635230959": "P30-ISLA A HOTEL",
  "1758635256761": "P30-ISLA B y C HOTEL",
  "1758635292030": "P30-ISLA D HOTEL",
  "1758635331905": "P30-TUA (NACIONALES) HOTEL",
  "1758635371580": "P30-TUA (INTERNACIONALES) HOTEL",
  "1758635415717": "P30-ISLA E HOTEL",
  "1758635484558": "P30-ISLA F HOTEL",
  "1758635502407": "P30-TUA EXTERNO HOTEL",
  "1758635526689": "P30-TUA INTERNO HOTEL",
  "1758635580421": "FOX TROP GARITA",
  "1758635601061": "FOX TROP ALPHA",
  "1758635623478": "FOX TROP CHARLIE",
  "1758635647457": "FOX TROP BRAVO",
  "1758635664054": "PORTON EXTERNO-PAPA GOLF",
  "1758635691328": "CONTROL VEHICULAR-PAPA GOLF",
  "1758635714137": "CONTROL VEHICULAR (CIEGO 3)",
  "1758635746578": "PAPAMAYO-CONTROL VEHICULAR",
  "1758635774350": "PAPA SIERRA",
  "1758635791581": "TANGO ALPHA",
  "1760037324942": "MARCACION QR"
};

// ====== URL DE TU WEB APP (Google Apps Script) ======
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysgEDh5D8QcRv7qFnQJKsScB1OoV63KEehL5fNsJ2-OhLYq7XKmhz9bhi73IjbbK_y/exec";

/* =============================
   ELEMENTOS DE UI
============================= */
const scannerContainer = document.getElementById('scanner-container');
const optionsContainer = document.getElementById('options-container');
const formSinNovedadContainer = document.getElementById('form-sin-novedad-container');
const formConNovedadContainer = document.getElementById('form-con-novedad-container');
const video = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvas = canvasElement.getContext('2d', { willReadFrequently: true });
const scannedPointName = document.getElementById('scanned-point-name');
const btnSinNovedad = document.getElementById('btn-sin-novedad');
const btnConNovedad = document.getElementById('btn-con-novedad');
const btnCancelScan = document.getElementById('btn-cancel-scan');
const formSinNovedad = document.getElementById('form-sin-novedad');
const formConNovedad = document.getElementById('form-con-novedad');
const statusToast = document.getElementById('status-toast');
const pointNameSin = document.getElementById('point-name-sin-novedad');
const pointNameCon = document.getElementById('point-name-con-novedad');
const savingOverlay = document.getElementById('saving-overlay');
const savingMsg = document.getElementById('saving-msg');
const evidenceInput = document.getElementById('evidence-input');
const evidencePreview = document.getElementById('evidence-preview');
const evidenceWrap = document.getElementById('evidence-preview-wrap');
const evidenceBtn = document.getElementById('btn-evidencia');
const evidenceRemove = document.getElementById('evidence-remove');
const q6Radios = document.querySelectorAll('input[name="q6"]');
const q6Comment = document.getElementById('q6-comment');
const cameraMsg = document.getElementById('camera-permission-msg');

/* =============================
   ESTADO
============================= */
let stream = null;
let currentScannedData = null;
let evidenceDataUrl = '';
let userInteracted = false;
window.addEventListener('pointerdown', () => (userInteracted = true), { once: true });

/* =============================
   SERVICE WORKER
============================= */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

/* =============================
   OVERLAY DE GUARDADO
============================= */
function showSaving(msg = 'Guardando…') {
  savingOverlay?.classList.add('active');
  savingMsg.textContent = msg;
}
function showSaved(msg = 'Guardado') {
  savingOverlay?.classList.add('success');
  savingMsg.textContent = msg;
  setTimeout(hideSaving, 1000);
}
function hideSaving() {
  savingOverlay?.classList.remove('active', 'success');
}

/* =============================
   ESCÁNER QR
============================= */
function startScanner() {
  currentScannedData = null;
  if (cameraMsg) cameraMsg.classList.remove('active');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => {
      stream = s;
      video.srcObject = stream;
      return video.play();
    })
    .then(() => requestAnimationFrame(tick))
    .catch(err => {
      console.error('Error de cámara:', err.name, err.message);
      if (cameraMsg) cameraMsg.classList.add('active');
      addStartButtonIfNeeded();
    });
}

function stopScanner() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function addStartButtonIfNeeded() {
  if (document.getElementById('start-scan-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'start-scan-btn';
  btn.textContent = 'Iniciar cámara';
  Object.assign(btn.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    padding: '12px 18px', borderRadius: '10px',
    background: '#3b82f6', color: '#fff', fontWeight: '600', cursor: 'pointer'
  });
  btn.onclick = () => { btn.remove(); startScanner(); };
  scannerContainer.appendChild(btn);
}

function drawPath(loc) {
  const p = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
  canvas.beginPath();
  canvas.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) canvas.lineTo(p[i].x, p[i].y);
  canvas.closePath();
  canvas.lineWidth = 4;
  canvas.strokeStyle = 'rgba(0,200,0,0.9)';
  canvas.stroke();
}

function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.height = video.videoHeight || 480;
    canvasElement.width = video.videoWidth || 640;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    const imgData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const code = (typeof jsQR === 'function') ? jsQR(imgData.data, imgData.width, imgData.height) : null;

    if (code && code.data) {
      if (code.location) drawPath(code.location);
      const normalized = String(code.data).trim().replace(/\s+/g, '');
      const punto = REFERENCIA_MAP[normalized];
      if (punto) {
        stopScanner();
        currentScannedData = { referencia: normalized, puntoMarcacion: punto };
        scannedPointName.textContent = punto;
        scannerContainer.style.display = 'none';
        optionsContainer.style.display = 'flex';
        if (userInteracted && navigator.vibrate) try { navigator.vibrate(150); } catch {}
        return;
      } else showToast(`QR no reconocido: ${normalized}`, 'error');
    }
  }
  requestAnimationFrame(tick);
}

/* =============================
   UI STATES
============================= */
function showUI(state) {
  [scannerContainer, optionsContainer, formSinNovedadContainer, formConNovedadContainer]
    .forEach(el => (el.style.display = 'none'));
  const point = currentScannedData?.puntoMarcacion || '';
  if (pointNameSin) pointNameSin.textContent = point;
  if (pointNameCon) pointNameCon.textContent = point;

  if (state === 'scanner') startScanner(), scannerContainer.style.display = 'block';
  else if (state === 'options') optionsContainer.style.display = 'flex';
  else if (state === 'sin-novedad') formSinNovedadContainer.style.display = 'block';
  else if (state === 'con-novedad') formConNovedadContainer.style.display = 'block';
}

/* =============================
   BOTONES PRINCIPALES
============================= */
btnCancelScan.addEventListener('click', () => { resetEvidence(); resetQuestions(); showUI('scanner'); });
btnSinNovedad.addEventListener('click', () => showUI('sin-novedad'));
btnConNovedad.addEventListener('click', () => showUI('con-novedad'));
document.querySelectorAll('.form-cancel').forEach(b => b.addEventListener('click', () => { resetEvidence(); resetQuestions(); showUI('options'); }));

/* =============================
   EVIDENCIA
============================= */
function fileToOptimizedDataURL(file, max = 1280, q = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) { height *= max / width; width = max; }
        else if (height > width && height > max) { width *= max / height; height = max; }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject; img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

function resetEvidence() {
  evidenceDataUrl = ''; evidenceInput.value = '';
  evidenceWrap.style.display = 'none'; evidencePreview.src = '';
}
evidenceBtn?.addEventListener('click', () => evidenceInput?.click());
evidenceInput?.addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  showSaving('Procesando evidencia…');
  try {
    evidenceDataUrl = await fileToOptimizedDataURL(file);
    evidencePreview.src = evidenceDataUrl;
    evidenceWrap.style.display = 'flex';
    hideSaving(); showToast('Evidencia lista.', 'success');
  } catch (err) {
    console.error(err); hideSaving(); resetEvidence();
    showToast('No se pudo procesar la evidencia.', 'error');
  }
});
evidenceRemove?.addEventListener('click', resetEvidence);

/* =============================
   PREGUNTAS
============================= */
function resetQuestions() {
  ['q1','q2','q3','q4','q5','q6'].forEach(n =>
    document.querySelectorAll(`input[name="${n}"]`).forEach(r => (r.checked = false))
  );
  if (q6Comment) {
    q6Comment.value = '';
    q6Comment.closest('.q6-comment-wrap')?.classList.add('hidden');
  }
}
q6Radios.forEach(r => r.addEventListener('change', () => {
  const wrap = q6Comment?.closest('.q6-comment-wrap');
  const isYes = document.querySelector('input[name="q6"][value="SI"]')?.checked;
  if (isYes) { wrap?.classList.remove('hidden'); q6Comment.required = true; }
  else { wrap?.classList.add('hidden'); q6Comment.required = false; q6Comment.value = ''; }
}));

/* =============================
   ENVÍO
============================= */
formSinNovedad.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  const nombre = document.getElementById('agent-name-sin-novedad').value.trim();
  if (!nombre) return showToast('Ingresa tu Nombre y Apellido.', 'error');

  const payload = buildPayload({ nombreAgente: nombre, observacion: '', tipo: 'SIN NOVEDAD', fotoDataUrl: '', preguntas: {} });
  showSaving('Enviando…'); await sendToSheets(payload);
  formSinNovedad.reset(); showUI('scanner');
});

formConNovedad.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  const nombre = document.getElementById('agent-name-con-novedad').value.trim();
  const obs = document.getElementById('observation-text').value.trim();
  if (!nombre) return showToast('Ingresa tu Nombre y Apellido.', 'error');

  const getVal = n => document.querySelector(`input[name="${n}"]:checked`)?.value || '';
  const [p1,p2,p3,p4,p5,p6] = ['q1','q2','q3','q4','q5','q6'].map(getVal);
  if (![p1,p2,p3,p4,p5,p6].every(v => v === 'SI' || v === 'NO'))
    return showToast('Responde todas las preguntas (1–6).', 'error');
  const p6Comentario = (p6 === 'SI') ? q6Comment?.value.trim() : '';
  if (p6 === 'SI' && !p6Comentario)
    return showToast('Escribe el comentario de la pregunta 6.', 'error');

  const payload = buildPayload({
    nombreAgente: nombre,
    observacion: obs,
    tipo: 'CON NOVEDAD',
    fotoDataUrl: evidenceDataUrl,
    preguntas: { p1,p2,p3,p4,p5,p6,p6Comentario }
  });

  showSaving('Enviando…'); await sendToSheets(payload);
  formConNovedad.reset(); resetEvidence(); resetQuestions(); showUI('scanner');
});

function buildPayload({ nombreAgente, observacion, tipo, fotoDataUrl, preguntas }) {
  return {
    puntoMarcacion: currentScannedData.puntoMarcacion,
    fechaHora: new Date().toISOString(),
    nombreAgente, observacion, tipo, fotoDataUrl, preguntas
  };
}

async function sendToSheets(payload) {
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    showSaved(); showToast('Registro guardado.', 'success');
  } catch (err) {
    console.error(err); hideSaving(); showToast('Error al enviar registro.', 'error');
  }
}

/* =============================
   TOAST
============================= */
function showToast(msg, type = 'info') {
  if (!statusToast) return alert(msg);
  statusToast.textContent = msg;
  statusToast.className = `show ${type}`;
  setTimeout(() => (statusToast.className = statusToast.className.replace('show', '')), 3000);
}

/* =============================
   INICIO
============================= */
showUI('scanner');
