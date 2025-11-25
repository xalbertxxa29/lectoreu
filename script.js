// ====== MAPA DE REFERENCIAS (QR → Punto de Marcación) ======
const REFERENCIA_MAP = {
  "1761055082506": "Main Entrance",
  "1761055097257": "Everglades Conf.Rm",
  "1761055105341": "Alligator Alley",
  "1761055598535": "N.W. Entrance (Lab)",
  "1761055619574": "Warehouse Offices (S.W.)",
  "1761055731912": "Loading Dock",
  "1761055748808": "Penthouse Stairwell",
  "1761055758075": "Circulation Area",
  "1761055765742": "Women's Lockers (S.E.)",
  "1761056924033": "Men's Lockers (S. E.)",
  "1761056935227": "Conf. Rm.1062 (S.E.)",
  "1761056952702": "Break Room",
  "1761056960727": "Document Control Rm",
  "1761056968594": "The Beach Lobby (N.E)",
  "1761056974553": "Executive Offices (N.E.)",
  "1761058333445": "Hallway 121",
  "1761058340305": "Hallway 122",
  "1761058346339": "Hallway 123",
  "1761058353137": "Hallway 124",
  "1761058359372": "Hallway 125",
  "1761058367017": "Hallway 126",
  "1761058388859": "Hallway 127",
  "1761058395655": "Hallway 128",
  "1761058402461": "Hallway 129",
  "1761058423101": "Hallway 130",
  "1761058429185": "Hallway 132",
  "1761058447734": "Hallway 133",
  "1761058454312": "Hallway 134",
  "1761058460400": "Hallway 135",
  "1760037324942": "MARCACION QR"
};

// ============================
//  Firebase (compat) — inicialización segura
// ============================
const fb = window.firebase || self.firebase;
if (fb && !fb.apps.length) {
  if (!window.firebaseConfig || !window.firebaseConfig.projectId) {
    console.error('Falta window.firebaseConfig o projectId');
    alert('No se encontró la configuración de Firebase. Verifica que "firebase-config.js" cargue antes que "script.js".');
    throw new Error('Firebase config ausente');
  }
  fb.initializeApp(window.firebaseConfig);
  console.log('Firebase listo →', fb.app().options.projectId);
}
const db = fb?.firestore?.();
const storage = fb?.storage?.();

// Habilita persistencia (si el WebView lo permite)
if (db?.enablePersistence) {
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
}

// ===== Colección destino en Firestore =====
const FIRE_COLLECTION = 'RONDAS';

// =============================
// ELEMENTOS DE UI
// =============================
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

// Evidencia
const evidenceInput = document.getElementById('evidence-input'); // cámara (con capture)
const evidencePreview = document.getElementById('evidence-preview');
const evidenceWrap = document.getElementById('evidence-preview-wrap');
const evidenceBtn = document.getElementById('btn-evidencia');
const evidenceRemove = document.getElementById('evidence-remove');

// === Sheet evidencia (Cámara / Galería) ===
const sheetEvid = document.getElementById('sheet-evidencia');
const optCam = document.getElementById('opt-cam');
const optGal = document.getElementById('opt-gal');
const optCancelar = document.getElementById('opt-cancelar');
const evidenceInputGallery = document.getElementById('evidence-input-gallery');

function openSheet()  { sheetEvid?.classList.remove('hidden'); }
function closeSheet() { sheetEvid?.classList.add('hidden'); }
optCancelar?.addEventListener('click', closeSheet);
sheetEvid?.addEventListener('click', (e)=>{ if(e.target === sheetEvid) closeSheet(); });
evidenceBtn?.addEventListener('click', (e)=>{ e.preventDefault(); openSheet(); });
optCam?.addEventListener('click', ()=>{ evidenceInput?.click(); closeSheet(); });
optGal?.addEventListener('click', ()=>{ evidenceInputGallery?.click(); closeSheet(); });

// === Pregunta 6 ===
const q6Radios = document.querySelectorAll('input[name="q6"]');
const q6Comment = document.getElementById('q6-comment');

// Modal de permisos de cámara
const cameraMsg = document.getElementById('camera-permission-msg');
const startScanCta = document.getElementById('start-scan-cta');

// =============================
// ESTADO
// =============================
let stream = null;
let currentScannedData = null;
let evidenceDataUrl = '';
let userInteracted = false;
window.addEventListener('pointerdown', () => (userInteracted = true), { once: true });

// =============================
// SERVICE WORKER (idempotente)
// =============================
if ('serviceWorker' in navigator) {
  // Si ya está registrado, esto no rompe nada.
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

// =============================
// OVERLAY DE GUARDADO
// =============================
function showSaving(msg = 'Guardando…') {
  savingOverlay?.classList.add('active');
  if (savingMsg) savingMsg.textContent = msg;
}
function showSaved(msg = 'Guardado') {
  savingOverlay?.classList.add('success');
  if (savingMsg) savingMsg.textContent = msg;
  setTimeout(hideSaving, 900);
}
function hideSaving() {
  savingOverlay?.classList.remove('active', 'success');
}

// =============================
// ESCÁNER QR
// =============================
function startScanner() {
  currentScannedData = null;
  cameraMsg?.classList.remove('active');

  // Aumentar resolución y optimizar constraints
  const constraints = {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      focusMode: 'continuous' // algunos navegadores soportan esto
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(s => {
      stream = s;
      video.srcObject = stream;
      // Esperar a que el video tenga datos suficientes
      return new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });
    })
    .then(() => requestAnimationFrame(tickEnhanced))
    .catch(err => {
      console.error('Error de cámara:', err.name, err.message);
      cameraMsg?.classList.add('active');
      if (startScanCta) { startScanCta.disabled = false; startScanCta.style.opacity = '1'; }
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

// Escaneo mejorado: más frames, mayor resolución, reintentos
let scanAttempts = 0;
const MAX_ATTEMPTS = 30;
function tickEnhanced() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    // Usar la máxima resolución disponible
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvasElement.width = w;
    canvasElement.height = h;
    canvas.drawImage(video, 0, 0, w, h);

    // Mejorar contraste y brillo si es posible
    // (opcional: se puede agregar procesamiento de imagen aquí)

    const imgData = canvas.getImageData(0, 0, w, h);
    const code = (typeof jsQR === 'function') ? jsQR(imgData.data, imgData.width, imgData.height) : null;

    if (code && code.data) {
      if (code.location) drawPath(code.location);
      const normalized = String(code.data).trim().replace(/\s+/g, '');
      const punto = REFERENCIA_MAP[normalized];

      if (punto) {
        stopScanner();
        currentScannedData = { referencia: normalized, puntoMarcacion: punto };
        if (scannedPointName) scannedPointName.textContent = punto;
        scannerContainer.style.display = 'none';
        optionsContainer.style.display = 'flex';
        if (userInteracted && navigator.vibrate) { try { navigator.vibrate(150); } catch {} }
        scanAttempts = 0;
        return;
      } else {
        scanAttempts++;
        if (scanAttempts > MAX_ATTEMPTS) {
          showToast(`QR no reconocido. Intenta acercar o enfocar mejor.`, 'error');
          scanAttempts = 0;
        }
      }
    } else {
      scanAttempts++;
      if (scanAttempts > MAX_ATTEMPTS) {
        showToast('No se detecta QR. Intenta mejorar la iluminación o enfocar.', 'error');
        scanAttempts = 0;
      }
    }
  }
  requestAnimationFrame(tickEnhanced);
}

// =============================
// UI STATES
// =============================
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

// =============================
// BOTONES PRINCIPALES
// =============================
btnCancelScan?.addEventListener('click', () => {
  stopScanner();
  resetEvidence(); resetQuestions();
  showUI('scanner');
  cameraMsg?.classList.add('active'); // volver a PLAY
});
btnSinNovedad?.addEventListener('click', () => showUI('sin-novedad'));
btnConNovedad?.addEventListener('click', () => showUI('con-novedad'));
document.querySelectorAll('.form-cancel').forEach(b => b.addEventListener('click', () => {
  resetEvidence(); resetQuestions(); showUI('options');
}));
startScanCta?.addEventListener('click', () => {
  startScanCta.disabled = true; startScanCta.style.opacity = '.7';
  showUI('scanner'); startScanner();
});

// =============================
// EVIDENCIA (imagen)
// =============================
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
  const mime = head.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(body); const len = bin.length; const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function resetEvidence() {
  evidenceDataUrl = '';
  if (evidenceInput) evidenceInput.value = '';
  if (evidenceInputGallery) evidenceInputGallery.value = '';
  evidenceWrap.style.display = 'none';
  evidencePreview.src = '';
}

// único pipeline para ambos inputs
async function processEvidenceFile(file){
  if(!file) return;
  showSaving('Procesando evidencia…');
  try{
    evidenceDataUrl = await fileToOptimizedDataURL(file);
    evidencePreview.src = evidenceDataUrl;
    evidenceWrap.style.display = 'flex';
    hideSaving(); showToast('Evidencia lista.', 'success');
  }catch(err){
    console.error(err); hideSaving();
    resetEvidence();
    showToast('No se pudo procesar la evidencia.', 'error');
  }
}

// listeners (solo una vez; sin duplicados)
evidenceInput?.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  await processEvidenceFile(file);
});
evidenceInputGallery?.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  await processEvidenceFile(file);
});
evidenceRemove?.addEventListener('click', resetEvidence);

// =============================
// PREGUNTAS
// =============================
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
  if (isYes) { wrap?.classList.remove('hidden'); if (q6Comment) q6Comment.required = true; }
  else { wrap?.classList.add('hidden'); if (q6Comment) { q6Comment.required = false; q6Comment.value = ''; } }
}));

// =============================
// OFFLINE QUEUE (IndexedDB) PARA FOTOS
// =============================
const IDB_NAME = 'offline-outbox';
const IDB_STORE = 'uploads';
const isOnline = () => navigator.onLine;

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(item){
  const dbx = await idbOpen();
  await new Promise((res, rej) => {
    const tx = dbx.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(item);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  dbx.close();
}
async function idbAll(){
  const dbx = await idbOpen();
  const items = await new Promise((res, rej) => {
    const tx = dbx.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
  dbx.close(); return items;
}
async function idbDel(id){
  const dbx = await idbOpen();
  await new Promise((res, rej) => {
    const tx = dbx.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  dbx.close();
}

// =============================
// ENVÍO → FIREBASE (OFFLINE-FIRST)
// =============================
function makeDocId(payload){
  const rnd = Math.random().toString(36).slice(2,8);
  return `${payload.referenciaQR}_${Date.now()}_${rnd}`;
}

async function uploadAndPatch(docId, path, blob){
  const ref = storage.ref().child(path);
  await ref.put(blob, { contentType: blob.type });
  const url = await ref.getDownloadURL();
  await db.collection(FIRE_COLLECTION).doc(docId).update({
    evidenciaUrl: url,
    pendingUpload: false,
    reconnectedAt: new Date().toISOString()
  });
}

async function queueUpload(docId, path, blob){
  const buff = await blob.arrayBuffer();
  await idbPut({
    id: `${docId}::${path}`,
    docId, path,
    queuedAt: new Date().toISOString(),
    blobType: blob.type,
    blobData: buff
  });
  showToast('Evidencia en cola offline.', 'offline');
}

async function processOutbox(){
  if (!storage || !db) return;
  const items = await idbAll();
  if (!items.length) return;

  showSaving('Sincronizando evidencia…');
  for (const it of items) {
    try {
      if (!isOnline()) break;
      const blob = new Blob([it.blobData], { type: it.blobType || 'image/jpeg' });
      await uploadAndPatch(it.docId, it.path, blob);
      await idbDel(it.id);
    } catch (e) {
      console.warn('Reintento pendiente:', it.id, e?.message);
      // se mantiene en cola para el próximo intento
    }
  }
  hideSaving();
}

// Disparadores de sincronización
window.addEventListener('online', () => {
  showToast('Conexión recuperada. Sincronizando…', 'success');
  processOutbox();
});
window.addEventListener('offline', () => {
  showToast('Sin conexión. Trabajando offline.', 'offline');
});
// Intento periódico por si el evento 'online' no dispara en WebView
setInterval(() => { if (isOnline()) processOutbox(); }, 30_000);

formSinNovedad?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  const nombre = document.getElementById('agent-name-sin-novedad').value.trim();
  if (!nombre) return showToast('Ingresa tu Nombre y Apellido.', 'error');

  const payload = buildPayload({
    nombreAgente: nombre, observacion: '', tipo: 'SIN NOVEDAD', fotoDataUrl: '', preguntas: {}
  });

  showSaving('Guardando…');
  await sendToFirebase(payload);
  formSinNovedad.reset();
  showUI('scanner'); cameraMsg?.classList.add('active');
});

formConNovedad?.addEventListener('submit', async e => {
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

  showSaving('Guardando…');
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

  // 0) Generar docId estable para poder actualizarlo luego
  const docId = makeDocId(payload);

  // 1) Crea el doc base (Firestore sincroniza solo cuando vuelva la red)
  const baseDoc = {
    punto: payload.puntoMarcacion,
    referenciaQR: payload.referenciaQR,
    nombreAgente: payload.nombreAgente,
    observacion: payload.observacion,
    tipo: payload.tipo,                // "SIN NOVEDAD" | "CON NOVEDAD"
    preguntas: payload.preguntas || {},
    evidenciaUrl: '',                  // se actualizará si hay imagen
    fechaHoraISO: payload.fechaHoraISO,
    createdAt: fb.firestore.FieldValue.serverTimestamp(),
    meta: payload.meta || {},
    pendingUpload: !!payload.fotoDataUrl
  };
  await db.collection(FIRE_COLLECTION).doc(docId).set(baseDoc);

  // 2) Manejo de evidencia (Storage NO es offline → usar cola)
  if (payload.fotoDataUrl && storage) {
    const stamp = Date.now();
    const safeName = (payload.nombreAgente || 'anon').replace(/[^\w.-]+/g, '_');
    const storagePath = `evidencias/${payload.referenciaQR}/${stamp}_${safeName}.jpg`;
    const blob = dataURLtoBlob(payload.fotoDataUrl);

    if (isOnline()) {
      try {
        await uploadAndPatch(docId, storagePath, blob);
      } catch (e) {
        await queueUpload(docId, storagePath, blob);
      }
    } else {
      await queueUpload(docId, storagePath, blob);
    }
  }

  showSaved('Guardado');
  showToast(isOnline() ? 'Registro guardado.' : 'Guardado offline. Se sincronizará al volver la red.', isOnline() ? 'success' : 'offline');
}

// =============================
// TOAST
// =============================
function showToast(msg, type = 'info') {
  if (!statusToast) return alert(msg);
  statusToast.textContent = msg;
  statusToast.className = `show ${type}`;
  setTimeout(() => (statusToast.className = statusToast.className.replace('show', '')), 3000);
}

// =============================
// INICIO
// =============================
showUI('scanner');
cameraMsg?.classList.add('active');  // Mostrar “INICIAR RONDAS”
processOutbox(); // intentar sincronizar al abrir, por si hay cola pendiente
