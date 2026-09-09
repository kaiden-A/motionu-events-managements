/* =========================================================
   EVENTS — program cards, create/edit/delete, detail hub
   ========================================================= */

let eventFilter = 'all';

function renderEventFilterTabs(){
  const tabs = [['all','All'],['upcoming','Upcoming'],['ongoing','Today'],['past','Past']];
  document.getElementById('eventFilterTabs').innerHTML = tabs.map(([key,label]) => `
    <button onclick="setEventFilter('${key}')" class="px-3 py-1.5 rounded-md text-xs font-medium transition ${eventFilter===key ? 'text-white' : 'hover-soft'}"
      style="${eventFilter===key ? 'background:var(--btn-primary);' : 'color:var(--ink-soft);'}">${label}</button>`).join('');
}
function setEventFilter(key){ eventFilter = key; renderEvents(); }

function renderEvents(){
  renderEventFilterTabs();
  const search = (document.getElementById('eventSearch').value || '').toLowerCase();
  const list = events.filter(e => {
    const matchesFilter = eventFilter === 'all' || getEventStatus(e) === eventFilter;
    const matchesSearch = !search || e.title.toLowerCase().includes(search) || e.category.toLowerCase().includes(search) || e.location.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));

  const grid = document.getElementById('eventsGrid');
  if(!list.length){
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-sm" style="color:var(--ink-soft);">
      No programs match this filter. Try a different search, or <button onclick="openEventModal()" class="underline font-medium" style="color:var(--primary);">create a new program</button>.</div>`;
    return;
  }

  grid.innerHTML = list.map(ev => {
    const cat = CATEGORY_STYLES[ev.category];
    const status = getEventStatus(ev);
    const st = STATUS_STYLES[status];
    const s = rosterStats(ev);
    const pct = Math.min(100, Math.round((s.total / ev.capacity) * 100));
    const vaultN = certCountIn(ev);
    return `
    <div class="surface rounded-2xl border overflow-hidden flex flex-col" style="border-color:var(--border);">
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-3">
          <span class="cat-chip ${cat.chip}">
            <i aria-hidden="true" class="fa-solid ${cat.icon}"></i>${ev.category}
          </span>
          <span class="chip ${st.chip}">
            <span class="status-dot" style="background:currentColor"></span>${st.label}
          </span>
        </div>
        <h3 class="font-display font-semibold leading-snug mb-2">${esc(ev.title)}</h3>
        <div class="space-y-1 text-xs mb-4" style="color:var(--ink-soft);">
          <p><i aria-hidden="true" class="fa-regular fa-calendar w-4"></i> ${formatDate(ev.date)}</p>
          <p><i aria-hidden="true" class="fa-regular fa-clock w-4"></i> ${to12h(ev.start)} – ${to12h(ev.end)}</p>
          <p><i aria-hidden="true" class="fa-solid fa-location-dot w-4"></i> ${esc(ev.location)}</p>
        </div>
        <div class="flex flex-wrap gap-2 mb-4 text-xs">
          <span class="chip chip-muted"><i aria-hidden="true" class="fa-solid fa-users mr-1"></i>${s.total} roster</span>
          ${status !== 'upcoming' ? `<span class="chip chip-success"><i aria-hidden="true" class="fa-solid fa-check mr-1"></i>${s.joined} joined</span>` : ''}
          <span class="chip chip-warn"><i aria-hidden="true" class="fa-solid fa-award mr-1"></i>${vaultN} issued</span>
          ${!ev.template ? `<span class="chip chip-muted"><i aria-hidden="true" class="fa-solid fa-file-circle-question mr-1"></i>No template</span>` : ''}
        </div>
        <div class="mt-auto">
          <div class="flex justify-between text-xs mb-1" style="color:var(--ink-soft);">
            <span>${s.total}/${ev.capacity} enrolled</span><span class="num">${pct}%</span>
          </div>
          <div class="progress-track h-1.5 mb-4"><div class="progress-fill" style="width:${pct}%; background:${cat.solid};"></div></div>
          <div class="flex gap-2">
            <button onclick="openEventDetail('${ev.id}')" class="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white" style="background:var(--btn-primary);">Open program</button>
            <button onclick="editEvent('${ev.id}')" aria-label="Edit program" class="w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-pen text-xs"></i></button>
            <button onclick="deleteEvent('${ev.id}')" aria-label="Delete program" class="w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center hover-danger" style="border-color:var(--border); color:var(--danger);"><i aria-hidden="true" class="fa-solid fa-trash text-xs"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openEventModal(){
  document.getElementById('eventModalTitle').textContent = 'New program';
  document.getElementById('eventForm').reset();
  document.getElementById('eventEditId').value = '';
  openModal('modalEvent');
}
function editEvent(id){
  const ev = eventById(id);
  if(!ev) return;
  document.getElementById('eventModalTitle').textContent = 'Edit program';
  document.getElementById('eventEditId').value = ev.id;
  document.getElementById('eventTitle').value = ev.title;
  document.getElementById('eventCategory').value = ev.category;
  document.getElementById('eventCapacity').value = ev.capacity;
  document.getElementById('eventDate').value = ev.date;
  document.getElementById('eventStart').value = ev.start;
  document.getElementById('eventEnd').value = ev.end;
  document.getElementById('eventLocation').value = ev.location;
  document.getElementById('eventDescription').value = ev.description;
  closeAllModals();
  openModal('modalEvent');
}
function saveEvent(e){
  e.preventDefault();
  const editId = document.getElementById('eventEditId').value;
  const data = {
    title: document.getElementById('eventTitle').value.trim(),
    category: document.getElementById('eventCategory').value,
    capacity: parseInt(document.getElementById('eventCapacity').value) || 1,
    date: document.getElementById('eventDate').value,
    start: document.getElementById('eventStart').value,
    end: document.getElementById('eventEnd').value,
    location: document.getElementById('eventLocation').value.trim(),
    description: document.getElementById('eventDescription').value.trim(),
  };
  if(editId){
    const ev = eventById(editId);
    if(ev){
      Object.assign(ev, data);
      showToast('Program updated.');
    }
  } else {
    const id = 'e' + (seq.e++);
    const participants = [];
    events.push({id, participants, ...data});
    contextEventId = id;
    showToast('Program created. Add participants to build its roster.');
  }
  closeModal('modalEvent');
  renderEvents();
  if(currentPage === 'dashboard') renderDashboard();
}

function deleteEvent(id){
  const ev = eventById(id);
  if(!ev) return;
  const n = ev.participants.length;
  const v = certCountIn(ev);
  askConfirm('Delete "' + ev.title + '"? Its ' + n + ' roster record(s), their QR passes' + (v ? ' and ' + v + ' issued certificate(s)' : '') + ' will be removed.', function(){
    events.splice(events.indexOf(ev), 1);
    showToast('Program deleted.', 'info');
    if(contextEventId === id) contextEventId = defaultEventId();
    renderEvents();
    if(currentPage === 'dashboard') renderDashboard();
  });
}

/* ---------- program detail hub ---------- */
function openEventDetail(id){
  renderEventDetail(id);
  openModal('modalEventDetail');
}

function renderEventDetail(id){
  const ev = eventById(id);
  if(!ev) return;
  const cat = CATEGORY_STYLES[ev.category];
  const status = getEventStatus(ev);
  const st = STATUS_STYLES[status];
  const s = rosterStats(ev);
  const pct = Math.min(100, Math.round((s.total / ev.capacity) * 100));
  const vaultN = certCountIn(ev);

  const rows = ev.participants.slice(0, 8).map(p => {
    const badge = p.attended === true
      ? `<span class="chip chip-success">${p.joinedBy==='qr' ? '<i aria-hidden="true" class="fa-solid fa-qrcode text-[9px]"></i>' : '<span class="status-dot" style="background:currentColor"></span>'}Joined</span>`
      : p.attended === false
        ? `<span class="chip chip-danger"><span class="status-dot" style="background:currentColor"></span>No-show</span>`
        : `<span class="chip chip-muted"><span class="status-dot" style="background:currentColor"></span>Pending</span>`;
    const certChip = p.cert
      ? `<span class="chip chip-warn" style="padding:3px 8px; font-size:10px;"><i aria-hidden="true" class="fa-solid fa-award"></i>cert</span>` : '';
    return `
      <tr>
        <td class="px-4 py-2">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style="background:${avatarColor(p.id)}">${initials(p.name)}</div>
            <div class="min-w-0"><p class="text-sm font-medium truncate">${esc(p.name)}</p><p class="text-xs" style="color:var(--ink-soft);">${p.studentId} ${p.joinedBy === 'qr' ? '· QR pass' : ''}</p></div>
          </div>
        </td>
        <td class="px-4 py-2">${badge}</td>
        <td class="px-4 py-2 text-right">${certChip}</td>
      </tr>`;
  }).join('');

  document.getElementById('eventDetailContent').innerHTML = `
    <div class="p-5 border-b" style="border-color:var(--border);">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="cat-chip ${cat.chip}"><i aria-hidden="true" class="fa-solid ${cat.icon}"></i>${ev.category}</span>
            <span class="chip ${st.chip}"><span class="status-dot" style="background:currentColor"></span>${st.label}</span>
          </div>
          <h2 class="font-display text-xl font-semibold">${esc(ev.title)}</h2>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="editEvent('${ev.id}')" aria-label="Edit program" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="closeModal('modalEventDetail')" aria-label="Close dialog" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-xmark text-xs"></i></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm" style="color:var(--ink-soft);">
        <span><i aria-hidden="true" class="fa-regular fa-calendar mr-1.5"></i>${formatDate(ev.date)}</span>
        <span><i aria-hidden="true" class="fa-regular fa-clock mr-1.5"></i>${to12h(ev.start)} – ${to12h(ev.end)}</span>
        <span><i aria-hidden="true" class="fa-solid fa-location-dot mr-1.5"></i>${esc(ev.location)}</span>
      </div>
      <p class="text-sm mt-3">${esc(ev.description)}</p>
      <div class="mt-4 max-w-sm">
        <div class="flex justify-between text-xs mb-1" style="color:var(--ink-soft);"><span>${s.total} of ${ev.capacity} enrolled</span><span>${pct}%</span></div>
        <div class="progress-track h-1.5"><div class="progress-fill" style="width:${pct}%; background:${cat.solid};"></div></div>
      </div>
    </div>

    <div class="px-5 py-4 border-b grid grid-cols-3 gap-3" style="border-color:var(--border);">
      ${[
        ['users', s.total, 'Roster members', 'participants', 'var(--energy)'],
        ['qrcode', s.joined + ' · ' + s.pending, 'Joined · pending', 'checkin', 'var(--primary)'],
        ['award', vaultN, 'Certificates issued', 'certificates', 'var(--warn)'],
      ].map(([ic, val, label, page, color]) => `
        <button onclick="goToPage('${page}','${ev.id}')" class="rounded-xl border p-3 text-left hover-soft transition" style="border-color:var(--border);">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style="background:color-mix(in srgb, ${color} 14%, transparent); color:${color};"><i aria-hidden="true" class="fa-solid fa-${ic} text-xs"></i></div>
          <p class="font-display font-semibold leading-none num">${val}</p>
          <p class="text-[11px] mt-1" style="color:var(--ink-soft);">${label}</p>
          <p class="text-[11px] mt-1 font-medium underline" style="color:var(--primary);">Open</p>
        </button>`).join('')}
    </div>

    <div class="p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-display font-semibold text-sm">Roster preview (${s.total})</h3>
        <div class="flex gap-2">
          <button onclick="openAddParticipantModal('${ev.id}')" class="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style="background:var(--btn-primary);"><i aria-hidden="true" class="fa-solid fa-user-plus mr-1"></i>Add participant</button>
          <button onclick="goToPage('participants','${ev.id}')" class="text-xs font-medium px-3 py-1.5 rounded-lg border" style="border-color:var(--border);">Manage roster</button>
        </div>
      </div>
      ${s.total ? `
      <div class="border rounded-xl overflow-hidden" style="border-color:var(--border);">
        <table class="w-full text-sm">
          <thead class="tbl-head"><tr class="text-left text-xs uppercase tracking-wide" style="color:var(--ink-soft);">
            <th class="px-4 py-2 font-medium">Participant</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 font-medium text-right">Certificate</th>
          </tr></thead>
          <tbody class="divide-y" style="border-color:var(--border);">
            ${rows}
            ${ev.participants.length > 8 ? `<tr><td colspan="3" class="px-4 py-2 text-xs text-center" style="color:var(--ink-soft);">+ ${ev.participants.length - 8} more on the roster page</td></tr>` : ''}
          </tbody>
        </table>
      </div>` : `
      <div class="text-center py-10 text-sm border-2 border-dashed rounded-xl" style="color:var(--ink-soft); border-color:var(--border);">
        No participants yet. Each person added gets their own QR pass.<br>
        <button onclick="openAddParticipantModal('${ev.id}')" class="mt-3 text-xs font-semibold px-4 py-2 rounded-lg text-white" style="background:var(--btn-primary);"><i aria-hidden="true" class="fa-solid fa-user-plus mr-1"></i>Add the first participant</button>
      </div>`}
    </div>`;
}
