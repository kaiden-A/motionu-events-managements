/* =========================================================
   CHECK-IN — camera QR scanning (jsQR) + manual fallback
   The QR payload carries event + participant, so a scan can
   only ever join the right roster.
   ========================================================= */

let checkinMode = 'scan';

function checkinEvent(){
  if(!events.length) return null;
  if(!contextEventId || !eventById(contextEventId)) contextEventId = defaultEventId();
  return eventById(contextEventId);
}

function renderCheckin(){
  const ev = checkinEvent();
  const select = document.getElementById('checkinEventSelect');
  const sorted = [...events].sort((a,b) => new Date(a.date) - new Date(b.date));
  select.innerHTML = sorted.map(e => `<option value="${e.id}">${esc(e.title)} — ${formatDateShort(e.date)}</option>`).join('');
  if(ev) select.value = ev.id;

  const noneBox = document.getElementById('checkinNone');
  const body = document.getElementById('checkinBody');
  if(!ev){
    noneBox.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }
  noneBox.classList.add('hidden');
  body.classList.remove('hidden');

  const s = rosterStats(ev);
  document.getElementById('checkinStats').innerHTML = `
    <span class="chip chip-muted">Roster: ${s.total}</span>
    <span class="chip chip-success">Joined: ${s.joined}</span>
    <span class="chip chip-danger">No-show: ${s.noShow}</span>
    <span class="chip chip-muted text-gray-600">Pending: ${s.pending}</span>`;

  setCheckinMode(checkinMode, true);
  renderScanSide(ev);
  renderManualTable(ev);
}

function onCheckinEventChange(){
  stopCamera();
  contextEventId = document.getElementById('checkinEventSelect').value;
  scanLogEntries = [];
  renderCheckin();
}

function setCheckinMode(mode, silent){
  checkinMode = mode;
  const tabs = document.querySelectorAll('#checkinModeTabs .mode-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  const scanPanel = document.getElementById('scanPanel');
  const manualPanel = document.getElementById('manualPanel');
  if(scanPanel) scanPanel.classList.toggle('hidden', mode !== 'scan');
  if(manualPanel) manualPanel.classList.toggle('hidden', mode !== 'manual');
  if(mode !== 'scan') stopCamera();
  else if(!silent){ setScanStatus('Ready — press Start camera or use simulate scan.', 'ok'); }
}

function setScanStatus(msg, kind){
  const el = document.getElementById('scanStatus');
  if(!el) return;
  const color = kind === 'error' ? 'var(--danger)' : kind === 'ok' ? 'var(--success)' : 'var(--ink-soft)';
  const icon = kind === 'error' ? 'fa-triangle-exclamation' : kind === 'ok' ? 'fa-circle-check' : 'fa-circle-info';
  el.innerHTML = `<i aria-hidden="true" class="fa-solid ${icon} mr-1.5"></i><span>${esc(msg)}</span>`;
  el.style.color = color;
}

function renderScanSide(ev){
  const list = document.getElementById('simulateList');
  if(!list) return;
  const pending = ev.participants.filter(p => p.attended === null);
  if(!pending.length){
    list.innerHTML = `<p class="text-xs px-3 py-4 text-center" style="color:var(--ink-soft);">Everyone on this roster has been processed — nothing left to scan.</p>`;
    return;
  }
  list.innerHTML = pending.map(p => `
    <div class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover-soft">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style="background:${avatarColor(p.id)}">${initials(p.name)}</div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium truncate">${esc(p.name)} <span class="font-normal" style="color:var(--ink-soft);">${p.studentId}</span></p>
        <p class="code-str" style="color:var(--ink-soft);">${p.qrToken}</p>
      </div>
      <button onclick="simulateScanToken('${p.qrToken}')" class="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-md text-white" style="background:var(--btn-primary);"><i aria-hidden="true" class="fa-solid fa-qrcode mr-1"></i>Scan</button>
    </div>`).join('');
}

function toggleSimulate(){
  document.getElementById('simulateArea').classList.toggle('hidden');
}

function runSimulateToken(){
  const raw = document.getElementById('simulateTokenInput').value.trim();
  if(!raw) return;
  simulateScanToken(raw);
  document.getElementById('simulateTokenInput').value = '';
}

function renderManualTable(ev){
  const body = document.getElementById('checkinTableBody');
  const regs = ev.participants;
  if(!regs.length){
    body.innerHTML = `<tr><td colspan="4" class="px-5 py-10 text-center text-sm" style="color:var(--ink-soft);">No one is on the roster for "${esc(ev.title)}" yet.</td></tr>`;
    return;
  }
  body.innerHTML = regs.map(p => {
    let badge;
    if(p.attended === true) badge = `<span class="chip chip-success">${p.joinedBy === 'qr' ? '<i aria-hidden="true" class="fa-solid fa-qrcode text-[10px]"></i>' : '<span class="status-dot" style="background:currentColor"></span>'}Joined</span>`;
    else if(p.attended === false) badge = `<span class="chip chip-danger"><span class="status-dot" style="background:currentColor"></span>No-show</span>`;
    else badge = `<span class="chip chip-muted"><span class="status-dot" style="background:currentColor"></span>Pending</span>`;
    return `
      <tr>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style="background:${avatarColor(p.id)}">${initials(p.name)}</div>
            <p class="text-sm font-medium">${esc(p.name)}</p>
          </div>
        </td>
        <td class="px-5 py-3 hidden sm:table-cell text-sm" style="color:var(--ink-soft);">${p.studentId}</td>
        <td class="px-5 py-3">${badge}</td>
        <td class="px-5 py-3 text-right">
          <div class="inline-flex items-center gap-1.5">
            <button onclick="setAttendance('${ev.id}','${p.id}',true,'manual')" class="px-3 py-1.5 rounded-md border text-xs font-medium hover-success" style="border-color:var(--border); color:var(--success);">Join</button>
            <button onclick="setAttendance('${ev.id}','${p.id}',false)" class="px-3 py-1.5 rounded-md border text-xs font-medium hover-danger" style="border-color:var(--border); color:var(--danger);">No-show</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function quickCheckin(){
  const input = document.getElementById('quickCheckinInput');
  const query = input.value.trim().toLowerCase();
  if(!query) return;
  const ev = checkinEvent();
  if(!ev){ showToast('Pick a program first.', 'error'); return; }
  const match = ev.participants.find(p => p.name.toLowerCase().includes(query) || p.studentId.toLowerCase().includes(query));
  if(!match){ showToast('No roster member matches that name or ID.', 'error'); return; }
  if(match.attended === true){ showToast(match.name + ' has already joined.', 'info'); input.value = ''; return; }
  setAttendance(ev.id, match.id, true, 'manual');
  input.value = '';
}

/* ---------- shared attendance mutator ---------- */
function setAttendance(eventId, pid, attended, via){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p) return;
  p.attended = attended;
  p.joinedBy = attended ? (via || 'manual') : null;
  if(attended){
    logActivity('join', `${p.name} joined ${ev.title}` + (via === 'qr' ? ' via QR scan' : ''));
  } else {
    logActivity('no-show', `${p.name} marked as no-show for ${ev.title}`);
  }
  showToast(p.name + (attended ? ' joined.' : ' marked as no-show.'));
  if(currentPage === 'checkin') renderCheckin();
  if(currentPage === 'participants') renderParticipants();
}
