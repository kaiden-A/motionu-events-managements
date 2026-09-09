/* =========================================================
   QR — render passes (qrcodejs) + camera scanning (jsQR)
   QR payload scheme (matches a future real backend):
     MOTIONU|{eventId}|{participantId}|{random}
   ========================================================= */

function qrLibAvailable(){ return typeof QRCode !== 'undefined'; }
function scanLibAvailable(){ return typeof jsQR !== 'undefined'; }

function renderQr(container, token, px){
  if(!container) return;
  container.innerHTML = '';
  if(!qrLibAvailable()){ container.innerHTML = '<p class="text-xs" style="color:var(--ink-soft)">QR library unavailable (offline?).</p>'; return; }
  const dark = '#14142B', light = '#FFFFFF';
  new QRCode(container, { text: token, width: px, height: px, colorDark: dark, colorLight: light, correctLevel: QRCode.CorrectLevel.M });
}

function qrImageSrc(container){
  const img = container.querySelector('img');
  return img ? img.src : null;
}

function downloadQrPng(token, fileName){
  if(!qrLibAvailable()){ showToast('QR library unavailable.', 'error'); return; }
  const host = document.createElement('div');
  host.style.position = 'fixed'; host.style.left = '-9999px';
  document.body.appendChild(host);
  new QRCode(host, { text: token, width: 512, height: 512, colorDark: '#14142B', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
  const img = host.querySelector('img');
  if(img && img.src){
    const a = document.createElement('a');
    a.href = img.src;
    a.download = fileName || 'qr-pass.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    showToast('Could not generate QR image.', 'error');
  }
  host.remove();
}

/* split + validate the payload; null when malformed */
function parseToken(token){
  if(typeof token !== 'string') return null;
  const parts = token.trim().split('|');
  if(parts.length !== 4 || parts[0] !== 'MOTIONU') return null;
  return { eventId: parts[1], participantId: parts[2], rand: parts[3] };
}

/* ---------- live camera scanning ---------- */
var camRunning = false;
var camStream = null;
var camMode = null; // 'video' | 'image'
var _camEls = { video:null, canvas:null, ctx:null };
var decodeCooldownUntil = 0;

function ensureCamEls(){
  if(!_camEls.video){
    _camEls.video = document.getElementById('scanVideo');
    _camEls.canvas = document.getElementById('scanCanvas');
    _camEls.ctx = _camEls.canvas ? _camEls.canvas.getContext('2d') : null;
  }
}

function startCamera(){
  ensureCamEls();
  if(camRunning || !_camEls.video) return;
  if(!scanLibAvailable()){ showToast('jsQR scanner not loaded — use simulate scan.', 'error'); return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    setScanStatus('Camera not supported here — use simulate scan below.', 'error');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 960 } }, audio: false })
    .then(stream => {
      camStream = stream;
      camRunning = true;
      camMode = 'video';
      _camEls.video.srcObject = stream;
      _camEls.video.setAttribute('playsinline', 'true');
      _camEls.video.play();
      document.getElementById('scanStage').classList.remove('off');
      document.getElementById('scanStartBtn').classList.add('hidden');
      document.getElementById('scanStopBtn').classList.remove('hidden');
      setScanStatus('Point the camera at a participant QR pass.', 'ok');
      requestAnimationFrame(scanFrame);
    })
    .catch(err => {
      console.warn('Camera denied:', err);
      camRunning = false;
      setScanStatus('Camera unavailable or permission denied — use the simulate scan panel below.', 'error');
    });
}

function stopCamera(){
  if(camStream){
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  camRunning = false;
  camMode = null;
  ensureCamEls();
  if(_camEls.video){ _camEls.video.srcObject = null; }
  const stage = document.getElementById('scanStage');
  if(stage) stage.classList.add('off');
  const startBtn = document.getElementById('scanStartBtn');
  const stopBtn = document.getElementById('scanStopBtn');
  if(startBtn) startBtn.classList.remove('hidden');
  if(stopBtn) stopBtn.classList.add('hidden');
}

function scanFrame(){
  if(!camRunning || camMode !== 'video') return;
  ensureCamEls();
  const v = _camEls.video;
  if(v.readyState === v.HAVE_ENOUGH_DATA){
    try {
      _camEls.canvas.width = v.videoWidth;
      _camEls.canvas.height = v.videoHeight;
      _camEls.ctx.drawImage(v, 0, 0);
      const img = _camEls.ctx.getImageData(0, 0, v.videoWidth, v.videoHeight);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if(code && code.data){
        const now = Date.now();
        if(now >= decodeCooldownUntil){
          decodeCooldownUntil = now + 2200;
          handleScanResult(code.data);
        }
      }
    } catch(e){ /* frame skip */ }
  }
  requestAnimationFrame(scanFrame);
}

function handleScanResult(raw){
  const parsed = parseToken(raw);
  if(!parsed){
    pushScanLog('Unrecognised code scanned — not a Motion-U pass.', 'error');
    showToast('Not a valid Motion-U QR pass.', 'error');
    return;
  }
  const selEv = eventById(contextEventId);
  if(!selEv || parsed.eventId !== contextEventId){
    const other = eventById(parsed.eventId);
    pushScanLog('Pass belongs to "' + (other ? other.title : 'another program') + '" — switch the event selector first.', 'error');
    showToast('This QR is for another program: ' + (other ? other.title : 'unknown') + '.', 'error');
    return;
  }
  const p = participantById(parsed.eventId, parsed.participantId);
  if(!p){
    pushScanLog('Code not found in this program roster.', 'error');
    showToast('No roster match for this code.', 'error');
    return;
  }
  if(p.attended === true){
    pushScanLog(p.name + ' is already joined.', 'info');
    showToast(p.name + ' already joined this program.', 'info');
    return;
  }
  setAttendance(contextEventId, p.id, true, 'qr');
}

/* simulate scan — same code path as a real camera hit */
function simulateScanToken(raw){
  if(!raw){ return; }
  handleScanResult(raw);
  stopCamera();
}

var scanLogEntries = [];
function pushScanLog(text, kind){
  const time = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  scanLogEntries.unshift({ text, kind, time });
  scanLogEntries = scanLogEntries.slice(0, 8);
  const box = document.getElementById('scanLogBox');
  if(box){
    const colors = { ok:'var(--success)', error:'var(--danger)', info:'var(--info)' };
    box.innerHTML = scanLogEntries.map(e => `
      <div class="flex items-start gap-2 py-1.5 px-3 text-xs rounded-lg" style="background:var(--surface-2);">
        <i aria-hidden="true" class="fa-solid ${e.kind==='ok'?'fa-circle-check':e.kind==='error'?'fa-circle-xmark':'fa-circle-info'} mt-0.5" style="color:${colors[e.kind]}"></i>
        <span class="flex-1">${esc(e.text)}</span>
        <span class="shrink-0" style="color:var(--ink-soft)">${e.time}</span>
      </div>`).join('');
  }
}
