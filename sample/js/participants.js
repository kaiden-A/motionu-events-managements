/* =========================================================
   PARTICIPANTS — per-program roster, add/edit, QR pass email,
   certificate issuance (from the program's vault template).
   Row actions live behind a single three-dot menu.
   ========================================================= */

let participantEditId = null;
let _fromDetail = false;      // add modal opened from program detail hub
let _emailCtx = null;         // {eventId, participantId, source} for compose modal
let _passCtx = null;          // {eventId, participantId} for the QR pass modal

/* ---------- page render ---------- */
function currentRosterEvent(){
  if(!events.length) return null;
  if(!contextEventId || !eventById(contextEventId)) contextEventId = defaultEventId();
  return eventById(contextEventId);
}

function renderParticipants(){
  const ev = currentRosterEvent();
  const select = document.getElementById('participantEventSelect');
  const sorted = [...events].sort((a,b) => new Date(a.date) - new Date(b.date));
  select.innerHTML = sorted.map(e => `<option value="${e.id}">${esc(e.title)} — ${formatDateShort(e.date)}</option>`).join('');
  if(ev) select.value = ev.id;

  const wrap = document.getElementById('rosterArea');
  const statsEl = document.getElementById('participantsChips');
  if(!ev){
    statsEl.innerHTML = '';
    wrap.innerHTML = `
      <div class="surface rounded-2xl border border-dashed text-center py-16" style="border-color:var(--border);">
        <i aria-hidden="true" class="fa-solid fa-calendar-plus text-3xl mb-3" style="color:var(--border-strong)"></i>
        <p class="text-sm font-medium">No programs yet</p>
        <p class="text-xs mt-1 mb-4" style="color:var(--ink-soft);">Create a program first — each program owns its own independent participant roster.</p>
        <button onclick="openEventModal()" class="text-xs font-semibold px-4 py-2 rounded-lg text-white" style="background:var(--btn-primary);">Create program</button>
      </div>`;
    return;
  }

  const s = rosterStats(ev);
  const eligible = eligibleParticipants(ev).length;
  statsEl.innerHTML = `
    <span class="chip chip-muted">Roster: ${s.total}</span>
    <span class="chip chip-success">Joined: ${s.joined}</span>
    <span class="chip chip-danger">No-show: ${s.noShow}</span>
    <span class="chip chip-muted text-gray-600">Pending: ${s.pending}</span>
    ${eligible ? `<button onclick="issueAllEligible('${ev.id}')" class="text-xs font-medium px-3 py-1.5 rounded-full text-white" style="background:var(--btn-warn);"><i aria-hidden="true" class="fa-solid fa-layer-group mr-1"></i>Issue all eligible (${eligible})</button>` : ''}`;

  if(!ev.participants.length){
    wrap.innerHTML = `
      <div class="surface rounded-2xl border border-dashed text-center py-16" style="border-color:var(--border);">
        <i aria-hidden="true" class="fa-solid fa-users text-3xl mb-3" style="color:var(--border-strong)"></i>
        <p class="text-sm font-medium">"${esc(ev.title)}" has no participants yet</p>
        <p class="text-xs mt-1 mb-4" style="color:var(--ink-soft);">Add people to this program — each one automatically gets a unique QR pass for check-in.</p>
        <button onclick="openAddParticipantModal('${ev.id}')" class="text-xs font-semibold px-4 py-2 rounded-lg text-white" style="background:var(--btn-primary);"><i aria-hidden="true" class="fa-solid fa-user-plus mr-1"></i>Add participant</button>
      </div>`;
    return;
  }

  const search = (document.getElementById('participantSearch').value || '').toLowerCase();
  const list = ev.participants.filter(p => !search
    || p.name.toLowerCase().includes(search)
    || p.studentId.toLowerCase().includes(search)
    || p.email.toLowerCase().includes(search));

  const rows = list.map(p => {
    let statusBadge;
    if(p.attended === true) statusBadge = `<span class="chip chip-success">${p.joinedBy === 'qr' ? '<i aria-hidden="true" class="fa-solid fa-qrcode"></i>' : '<span class="status-dot" style="background:currentColor"></span>'}Joined</span>`;
    else if(p.attended === false) statusBadge = `<span class="chip chip-danger"><span class="status-dot" style="background:currentColor"></span>No-show</span>`;
    else statusBadge = `<span class="chip chip-muted"><span class="status-dot" style="background:currentColor"></span>Pending</span>`;

    const sentChip = p.qrSentAt ? `<span class="chip chip-info mt-1"><i aria-hidden="true" class="fa-solid fa-envelope"></i>Pass emailed</span>` : '';

    let certCell;
    if(p.cert){
      certCell = `
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:var(--warn-light); color:var(--warn);"><i aria-hidden="true" class="fa-solid fa-award text-xs"></i></div>
          <div class="min-w-0">
            <p class="text-xs font-semibold font-mono">${p.cert.certNo}</p>
            <p class="text-[11px]" style="color:var(--ink-soft);">issued ${formatDateShort(p.cert.issuedAt)}</p>
          </div>
        </div>`;
    } else if(p.attended === true){
      certCell = `<span class="chip chip-success">Eligible</span>`;
    } else {
      certCell = `<span class="text-xs" style="color:var(--ink-soft);">—</span>`;
    }

    const menuItems = `
      <button onclick="openEmailSendModal('${ev.id}','${p.id}','row')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-envelope w-4 text-center"></i>Email QR pass</button>
      <button onclick="openQrPassModal('${ev.id}','${p.id}')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-qrcode w-4 text-center"></i>View QR pass</button>
      <button onclick="editParticipant('${p.id}')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-pen w-4 text-center"></i>Edit details</button>
      ${p.attended === true && !p.cert ? `<button onclick="issueCertificate('${ev.id}','${p.id}')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-award w-4 text-center" style="color:var(--warn);"></i>Issue certificate</button>` : ''}
      ${p.cert ? `
        <button onclick="openCertPreview('${ev.id}','${p.id}')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-eye w-4 text-center"></i>View certificate</button>
        <button onclick="revokeCert('${ev.id}','${p.id}')" class="row-menu-item"><i aria-hidden="true" class="fa-solid fa-ban w-4 text-center" style="color:var(--danger);"></i>Revoke certificate</button>` : ''}
      <div class="row-menu-sep"></div>
      <button onclick="removeParticipant('${p.id}')" class="row-menu-item danger"><i aria-hidden="true" class="fa-solid fa-trash w-4 text-center"></i>Remove from roster</button>`;

    return `
      <tr>
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0" style="background:${avatarColor(p.id)}">${initials(p.name)}</div>
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">${esc(p.name)}</p>
              <p class="text-xs" style="color:var(--ink-soft);">${p.studentId}</p>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 hidden md:table-cell">
          <p class="text-xs" style="color:var(--ink-soft);">${esc(p.email)}</p>
          <p class="text-xs" style="color:var(--ink-soft);">${esc(p.phone)}</p>
        </td>
        <td class="px-5 py-3">
          ${statusBadge}
          ${sentChip}
        </td>
        <td class="px-5 py-3">${certCell}</td>
        <td class="px-5 py-3 text-right relative">
          <button onclick="toggleRowMenu(event,'${p.id}')" aria-label="Actions for ${esc(p.name)}" class="w-8 h-8 rounded-md border flex items-center justify-center hover-soft" style="border-color:var(--border);" title="Actions">
            <i aria-hidden="true" class="fa-solid fa-ellipsis-vertical text-xs"></i>
          </button>
          <div id="rowMenu-${p.id}" class="row-menu hidden absolute right-0 top-10 z-30 w-56 border rounded-xl shadow-lg py-1.5" style="border-color:var(--border);">
            ${menuItems}
          </div>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="surface rounded-2xl border overflow-hidden" style="border-color:var(--border);">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide" style="color:var(--ink-soft);">
              <th class="px-5 py-3 font-medium">Participant</th>
              <th class="px-5 py-3 font-medium hidden md:table-cell">Contact</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Certificate</th>
              <th class="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y" style="border-color:var(--border);">
            ${rows || `<tr><td colspan="5" class="px-5 py-10 text-center text-sm" style="color:var(--ink-soft);">No roster members match "${esc(search)}".</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function onParticipantsEventChange(){
  contextEventId = document.getElementById('participantEventSelect').value;
  document.getElementById('participantSearch').value = '';
  renderParticipants();
}

/* ---------- three-dot row menu ---------- */
function toggleRowMenu(evt, pid){
  if(evt) evt.stopPropagation();
  const current = document.getElementById('rowMenu-' + pid);
  document.querySelectorAll('.row-menu').forEach(m => {
    if(m !== current) m.classList.add('hidden');
  });
  if(current) current.classList.toggle('hidden');
}
document.addEventListener('click', function(){
  document.querySelectorAll('.row-menu:not(.hidden)').forEach(m => m.classList.add('hidden'));
});

/* ---------- add / edit ---------- */
function openAddParticipantModal(eventId){
  if(eventId) contextEventId = eventId;
  const ev = currentRosterEvent();
  if(!ev){ showToast('Create a program first.', 'error'); return; }
  participantEditId = null;
  _fromDetail = !document.getElementById('modalEventDetail').classList.contains('hidden');
  document.getElementById('participantModalTitle').textContent = 'Add participant';
  document.getElementById('participantForm').reset();
  const notice = document.getElementById('participantEventNotice');
  notice.textContent = 'Adding to "' + ev.title + '" (' + formatDateShort(ev.date) + '). This roster is independent — it only affects this program.';
  const qrCheckRow = document.getElementById('participantQrEmailRow');
  qrCheckRow.classList.remove('hidden');
  document.getElementById('participantQrEmailCheck').checked = true;
  closeAllModals();
  openModal('modalParticipant');
}

function editParticipant(pid){
  const ev = currentRosterEvent();
  const p = participantById(ev.id, pid);
  if(!p) return;
  participantEditId = pid;
  document.getElementById('participantModalTitle').textContent = 'Edit participant';
  document.getElementById('participantName').value = p.name;
  document.getElementById('participantStudentId').value = p.studentId;
  document.getElementById('participantEmail').value = p.email;
  document.getElementById('participantPhone').value = p.phone;
  const notice = document.getElementById('participantEventNotice');
  notice.textContent = 'Editing the record inside "' + ev.title + '" only — other programs are unaffected.';
  document.getElementById('participantQrEmailRow').classList.add('hidden');
  closeAllModals();
  openModal('modalParticipant');
}

function saveParticipant(e){
  e.preventDefault();
  const ev = currentRosterEvent();
  if(!ev){ showToast('Pick a program first.', 'error'); return; }
  const data = {
    name: document.getElementById('participantName').value.trim(),
    studentId: document.getElementById('participantStudentId').value.trim(),
    email: document.getElementById('participantEmail').value.trim(),
    phone: document.getElementById('participantPhone').value.trim(),
  };
  if(!data.name || !data.studentId || !data.email){ showToast('Name, student ID and email are required.', 'error'); return; }

  if(participantEditId){
    const p = participantById(ev.id, participantEditId);
    if(p){ Object.assign(p, data); showToast('Participant updated.'); }
    closeModal('modalParticipant');
    _fromDetail = false;
    renderParticipants();
    return;
  }

  const id = 'p' + (seq.p++);
  const p = {
    id, ...data,
    addedAt: TODAY.toISOString().slice(0,10),
    attended: null, joinedBy: null,
    qrToken: makeToken(ev.id, id),
    qrSentAt: null,
    cert: null,
  };
  ev.participants.push(p);
  logActivity('register', `${p.name} added to ${ev.title}`);
  showToast(p.name + ' added to the roster.');
  const wantQrEmail = document.getElementById('participantQrEmailCheck').checked;
  const fromDetail = _fromDetail;
  _fromDetail = false;
  closeModal('modalParticipant');
  renderParticipants();
  if(currentPage === 'dashboard') renderDashboard();
  if(wantQrEmail){
    openEmailSendModal(ev.id, id, 'onAdd');
  } else if(fromDetail){
    openEventDetail(ev.id);
  }
}

function removeParticipant(pid){
  const ev = currentRosterEvent();
  const p = participantById(ev.id, pid);
  if(!p) return;
  const hasCert = p.cert ? ' and their issued certificate' : '';
  askConfirm('Remove ' + p.name + ' from "' + ev.title + '"? Their QR pass' + hasCert + ' will be removed.', function(){
    ev.participants = ev.participants.filter(x => x.id !== pid);
    showToast('Participant removed from roster.', 'info');
    renderParticipants();
    if(currentPage === 'dashboard') renderDashboard();
  });
}

/* ---------- QR pass modal ---------- */
function openQrPassModal(eventId, pid){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p) return;
  _passCtx = { eventId, pid };
  document.getElementById('qrPassEventTitle').textContent = ev.title;
  document.getElementById('qrPassEventLine').textContent = formatDate(ev.date) + ' · ' + to12h(ev.start) + ' – ' + to12h(ev.end) + ' · ' + ev.location;
  document.getElementById('qrPassName').textContent = p.name;
  document.getElementById('qrPassStudentLine').textContent = p.studentId + ' · ' + p.email;
  renderQr(document.getElementById('qrPassBox'), p.qrToken, 176);
  openModal('modalQrPass');
}

function downloadParticipantQr(){
  if(!_passCtx) return;
  const ev = eventById(_passCtx.eventId), p = participantById(_passCtx.eventId, _passCtx.pid);
  if(!ev || !p) return;
  downloadQrPng(p.qrToken, 'QR-pass-' + _passCtx.eventId + '-' + p.studentId + '.png');
}

function openEmailSendModalFromPass(){
  if(!_passCtx) return;
  openEmailSendModal(_passCtx.eventId, _passCtx.pid, 'pass');
}

/* ---------- simulated email of the QR pass ---------- */
function openEmailSendModal(eventId, pid, source){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p) return;
  _emailCtx = { eventId, pid, source: source || 'row' };
  document.getElementById('emailToLine').textContent = p.name + ' <' + p.email + '>';
  document.getElementById('emailSubjectLine').textContent = 'Motion-U QR Pass — ' + ev.title;
  const body = document.getElementById('emailBodyPreview');
  body.innerHTML = `
    <div class="pass-card rounded-xl border p-4 flex items-center gap-4">
      <div class="shrink-0 flex flex-col items-center gap-1">
        <div id="emailPassQrBox"></div>
      </div>
      <div class="min-w-0 text-left">
        <p class="text-[10px] uppercase tracking-wider" style="color:var(--ink-soft);">Motion-U Movement &amp; Wellness Club</p>
        <p class="font-display font-semibold text-sm leading-tight mt-1">${esc(ev.title)}</p>
        <p class="text-xs mt-1">${esc(p.name)}</p>
        <p class="text-[11px]" style="color:var(--ink-soft);">${p.studentId}</p>
        <p class="text-[11px] mt-2" style="color:var(--ink-soft);">Show this QR pass at the door — a quick scan marks you as joined.</p>
      </div>
    </div>`;
  renderQr(document.getElementById('emailPassQrBox'), p.qrToken, 96);
  closeAllModals();
  openModal('modalEmailSend');
}

function doSendQrEmail(){
  if(!_emailCtx) return;
  const ev = eventById(_emailCtx.eventId), p = participantById(_emailCtx.eventId, _emailCtx.pid);
  if(!ev || !p) return;
  p.qrSentAt = TODAY.toISOString().slice(0,10);
  logActivity('qr', 'QR pass emailed to ' + p.name + ' — ' + ev.title);
  showToast('QR pass sent to ' + p.email + ' (simulated).');
  const source = _emailCtx.source;
  closeModal('modalEmailSend');
  if(source === 'pass') closeModal('modalQrPass');
  renderParticipants();
  if(currentPage === 'dashboard') renderDashboard();
  if(source === 'onAdd') openQrPassModal(ev.id, p.id);
  _emailCtx = null;
}

/* =========================================================
   CERTIFICATE ISSUANCE — from the program's vault template
   ========================================================= */
function eligibleParticipants(ev){
  return ev.participants.filter(p => p.attended === true && !p.cert);
}

function issueCertificate(eventId, pid){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p) return;
  if(!ev.template){ showToast('Set a certificate template for this program first (Certificate Vault).', 'error'); return; }
  if(p.attended !== true){ showToast('Only joined participants can receive a certificate.', 'error'); return; }
  if(p.cert){ showToast(p.name + ' already has a certificate.', 'info'); return; }
  p.cert = { certNo: 'MU-2026-' + String(seq.c++).padStart(4,'0'), issuedAt: TODAY.toISOString().slice(0,10) };
  logActivity('cert', 'Certificate issued to ' + p.name + ' — ' + ev.title);
  showToast('Certificate ' + p.cert.certNo + ' issued to ' + p.name + '.');
  renderParticipants();
  if(currentPage === 'dashboard') renderDashboard();
}

function issueAllEligible(eventId){
  const ev = eventById(eventId);
  if(!ev) return;
  const list = eligibleParticipants(ev);
  if(!list.length) return;
  if(!ev.template){ showToast('Set a certificate template for this program first (Certificate Vault).', 'error'); return; }
  askConfirm('Issue certificates to all ' + list.length + ' eligible participants of "' + ev.title + '"?', function(){
    list.forEach(p => {
      p.cert = { certNo: 'MU-2026-' + String(seq.c++).padStart(4,'0'), issuedAt: TODAY.toISOString().slice(0,10) };
      logActivity('cert', 'Certificate issued to ' + p.name + ' — ' + ev.title);
    });
    showToast(list.length + ' certificates issued.');
    renderParticipants();
    if(currentPage === 'dashboard') renderDashboard();
  });
}

function revokeCert(eventId, pid){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p || !p.cert) return;
  askConfirm('Revoke certificate ' + p.cert.certNo + ' for ' + p.name + '?', function(){
    p.cert = null;
    showToast('Certificate revoked.', 'info');
    closeModal('modalCertPreview');
    renderParticipants();
    if(currentPage === 'dashboard') renderDashboard();
  });
}

/* ---------- personalised certificate preview ---------- */
function svgFromDataUrl(dataUrl){
  if(!dataUrl || dataUrl.indexOf('charset=utf-8,') !== -1){
    try { return dataUrl ? decodeURIComponent(dataUrl.split(',')[1]) : null; } catch(err){ return null; }
  }
  if(dataUrl && dataUrl.indexOf('base64,') !== -1){
    try {
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch(err){ return null; }
  }
  return null;
}

function personalizeTemplate(ev, p){
  const t = ev.template;
  if(!t || t.type !== 'image/svg+xml' || !p.cert) return null;
  const svg = svgFromDataUrl(t.dataUrl);
  if(!svg || svg.indexOf('{name}') === -1) return null;
  const merged = svg.split('{name}').join(p.name)
                    .split('{event}').join(ev.title)
                    .split('{date}').join(formatDate(ev.date))
                    .split('{certno}').join(p.cert.certNo);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(merged);
}

function openCertPreview(eventId, pid){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p || !p.cert) return;
  const t = ev.template;
  let body;
  if(!t){
    body = `<p class="text-center text-sm py-16" style="color:var(--ink-soft);">The certificate template for this program was removed. Re-upload it to render copies.</p>`;
  } else {
    const personalized = personalizeTemplate(ev, p);
    if(personalized){
      body = `
        <div class="relative">
          <img src="${personalized}" alt="certificate for ${esc(p.name)}" class="mx-auto max-h-[440px] rounded-lg border" style="border-color:var(--border);">
        </div>`;
    } else if(t.type.indexOf('image/') === 0){
      body = `
        <div class="relative">
          <img src="${t.dataUrl}" alt="template" class="mx-auto max-h-[440px] rounded-lg border" style="border-color:var(--border);">
          <div class="absolute bottom-3 left-1/2 -translate-x-1/2 w-full max-w-sm cert-chip border rounded-lg px-4 py-2.5 text-center shadow-sm" style="border-color:var(--border);">
            <p class="text-sm font-semibold">${esc(p.name)}</p>
            <p class="text-[11px] font-mono mt-0.5" style="color:var(--ink-soft);">${p.cert.certNo} · issued ${formatDateShort(p.cert.issuedAt)}</p>
          </div>
        </div>`;
    } else if(t.type === 'application/pdf'){
      body = `
        <iframe src="${t.dataUrl}" class="w-full h-[440px] rounded-lg border" style="border-color:var(--border);"></iframe>
        <div class="mx-auto mt-3 w-full max-w-sm cert-chip border rounded-lg px-4 py-2.5 text-center shadow-sm" style="border-color:var(--border);">
          <p class="text-sm font-semibold">${esc(p.name)}</p>
          <p class="text-[11px] font-mono mt-0.5" style="color:var(--ink-soft);">${p.cert.certNo} · issued ${formatDateShort(p.cert.issuedAt)} · merged server-side in the real system</p>
        </div>`;
    } else {
      body = `<p class="text-center text-sm py-16" style="color:var(--ink-soft);">This template type can not be rendered here — use Download instead.</p>`;
    }
  }

  document.getElementById('certPreviewBody').innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h3 class="font-display font-semibold">Certificate — ${esc(p.name)}</h3>
        <p class="text-xs mt-0.5" style="color:var(--ink-soft);">${esc(ev.title)} · ${p.cert.certNo} · issued ${formatDateShort(p.cert.issuedAt)}</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button onclick="downloadIssuedCert('${ev.id}','${p.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border); color:var(--info);" title="Download copy"><i aria-hidden="true" class="fa-solid fa-download text-xs"></i></button>
        <button onclick="revokeCert('${ev.id}','${p.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-danger" style="border-color:var(--border); color:var(--danger);" title="Revoke"><i aria-hidden="true" class="fa-solid fa-trash text-xs"></i></button>
        <button onclick="closeModal('modalCertPreview')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-xmark text-xs"></i></button>
      </div>
    </div>
    ${body}`;
  openModal('modalCertPreview');
}

function downloadIssuedCert(eventId, pid){
  const ev = eventById(eventId), p = participantById(eventId, pid);
  if(!ev || !p || !p.cert) return;
  const personalized = personalizeTemplate(ev, p);
  if(personalized){
    const a = document.createElement('a');
    a.href = personalized;
    a.download = 'MotionU-' + p.studentId + '-certificate.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if(ev.template){
    downloadTemplate(eventId);
  }
}