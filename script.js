// ====== MAPA DE REFERENCIAS (QR → Punto de Marcación) ======
const REFERENCIA_MAP = {
  "1761055082506": "1",
  "1761055097257": "2",
  "1761055105341": "3",
  "1761055598535": "4",
  "1761055619574": "5",
  "1761055731912": "6",
  "1761055748808": "7",
  "1761055758075": "8",
  "1761055765742": "9",
  "1761056924033": "10",
  "1761056935227": "11",
  "1761056952702": "12",
  "1761056960727": "13",
  "1761056968594": "14",
  "1761056974553": "15",
  "1761058333445": "16",
  "1761058340305": "17",
  "1761058346339": "18",
  "1761058353137": "19",
  "1761058359372": "20",
  "1761058367017": "21",
  "1761058388859": "22",
  "1761058395655": "23",
  "1761058402461": "24",
  "1761058423101": "25",
  "1761058429185": "27",
  "1761058447734": "28",
  "1761058454312": "29",
  "1761058460400": "30",
  "1760037324942": "MARCACION QR"
};

// ============================
//  Firebase (compat)
// ============================
const fb = window.firebase;
// Inicializa sólo si no hay app
if (fb && !fb.apps.length) fb.initializeApp(window.firebaseConfig || {});
const db = fb?.firestore?.();
const storage = fb?.storage?.();

// Habilita persistencia (si el WebView lo permite)
if (db && db.enablePersistence) {
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
}

// ===== Colección destino en Firestore =====
const FIRE_COLLECTION = 'RONDAS';   // cámbiala si quieres otro nombre

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

/* Modal de permisos de cámara */
const cameraMsg = document.getElementById('camera-permission-msg');
const startScanCta = document.getElementById('start-scan-cta');

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
  setTimeout(hideSaving, 900);
}
function hideSaving() {
  savingOverlay?.classList.remove('active', 'success');
}

/* =============================
   ESCÁNER QR
============================= */
function startScanner() {
  currentScannedData = null;
  cameraMsg?.classList.remove('active');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => {
      stream = s;
      video.srcObject = stream;
      return video.play();
    })
    .then(() => requestAnimationFrame(tick))
    .catch(err => {
      console.error('Error de cámara:', err.name, err.message);
      cameraMsg?.classList.add('active');
      startScanCta && (startScanCta.disabled = false, startScanCta.style.opacity = '1');
    });
}

function stopScanner() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
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
    canvasElement.width  = video.videoWidth  || 640;
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
        if (userInteracted && navigator.vibrate) { try { navigator.vibrate(150); } catch {} }
        return;
      } else {
        showToast(`QR no reconocido: ${normalized}`, 'error');
      }
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

  if (state === 'scanner') {
    scannerContainer.style.display = 'block';
  } else if (state === 'options') {
    optionsContainer.style.display = 'flex';
  } else if (state === 'sin-novedad') {
    formSinNovedadContainer.style.display = 'block';
  } else if (state === 'con-novedad') {
    formConNovedadContainer.style.display = 'block';
  }
}

/* =============================
   BOTONES PRINCIPALES
============================= */
btnCancelScan.addEventListener('click', () => {
  resetEvidence(); resetQuestions();
  showUI('scanner');
  cameraMsg?.classList.add('active'); // volver a PLAY
});
btnSinNovedad.addEventListener('click', () => showUI('sin-novedad'));
btnConNovedad.addEventListener('click', () => showUI('con-novedad'));
document.querySelectorAll('.form-cancel').forEach(b => b.addEventListener('click', () => {
  resetEvidence(); resetQuestions(); showUI('options');
}));
startScanCta?.addEventListener('click', () => {
  startScanCta.disabled = true; startScanCta.style.opacity = '.7';
  showUI('scanner'); startScanner();
});

/* =============================
   EVIDENCIA (imagen)
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
function dataURLtoBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1] || 'image/jpeg';
  const bin = atob(body); const len = bin.length; const arr = new Uint8Array(len);
  for (let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function resetEvidence() {
  evidenceDataUrl = '';
  if (evidenceInput) evidenceInput.value = '';
  evidenceWrap.style.display = 'none';
  evidencePreview.src = '';
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
   ENVÍO → FIREBASE
============================= */
formSinNovedad.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  const nombre = document.getElementById('agent-name-sin-novedad').value.trim();
  if (!nombre) return showToast('Ingresa tu Nombre y Apellido.', 'error');

  const payload = buildPayload({
    nombreAgente: nombre, observacion: '', tipo: 'SIN NOVEDAD', fotoDataUrl: '', preguntas: {}
  });

  showSaving('Guardando en Firebase…');
  await sendToFirebase(payload);
  formSinNovedad.reset();
  showUI('scanner'); cameraMsg?.classList.add('active');
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

  const payload = buildPayload({
    nombreAgente: nombre,
    observacion: obs,
    tipo: 'CON NOVEDAD',
    fotoDataUrl: evidenceDataUrl,
    preguntas: { p1,p2,p3,p4,p5,p6,p6Comentario }
  });

  showSaving('Guardando en Firebase…');
  await sendToFirebase(payload);
  formConNovedad.reset(); resetEvidence(); resetQuestions();
  showUI('scanner'); cameraMsg?.classList.add('active');
});

function buildPayload({ nombreAgente, observacion, tipo, fotoDataUrl, preguntas }) {
  return {
    puntoMarcacion: currentScannedData.puntoMarcacion,
    referenciaQR: currentScannedData.referencia,
    fechaHoraISO: new Date().toISOString(),
    nombreAgente, observacion, tipo, fotoDataUrl, preguntas,
    meta: {
      ua: navigator.userAgent || '',
      platform: navigator.platform || '',
      lang: navigator.language || 'es',
    }
  };
}

async function sendToFirebase(payload) {
  if (!db) {
    hideSaving(); showToast('Firebase no inicializado.', 'error');
    return;
  }

  try {
    // 1) Subir evidencia (si hay)
    let fotoUrl = '';
    if (payload.fotoDataUrl && storage) {
      const stamp = Date.now();
      const safeName = (payload.nombreAgente || 'anon').replace(/[^\w.-]+/g, '_');
      const path = `evidencias/${payload.referenciaQR}/${stamp}_${safeName}.jpg`;
      const blob = dataURLtoBlob(payload.fotoDataUrl);
      const ref = storage.ref().child(path);
      await ref.put(blob, { contentType: blob.type });
      fotoUrl = await ref.getDownloadURL();
    }

    // 2) Guardar doc en Firestore
    const docData = {
      punto: payload.puntoMarcacion,
      referenciaQR: payload.referenciaQR,
      nombreAgente: payload.nombreAgente,
      observacion: payload.observacion,
      tipo: payload.tipo,                // "SIN NOVEDAD" | "CON NOVEDAD"
      preguntas: payload.preguntas || {},
      evidenciaUrl: fotoUrl || '',
      fechaHoraISO: payload.fechaHoraISO,
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
      meta: payload.meta || {}
    };
    await db.collection(FIRE_COLLECTION).add(docData);

    showSaved('Guardado');
    showToast('Registro guardado en Firebase.', 'success');
  } catch (err) {
    console.error(err);
    hideSaving();
    showToast('No se pudo guardar en Firebase.', 'error');
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
cameraMsg?.classList.add('active');  // Mostrar “INICIAR RONDAS”
