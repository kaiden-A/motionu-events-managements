/* =========================================================
   CERTIFICATE VAULT — template gallery.
   Every program owns ONE certificate template; all templates
   are shown here together, one card per program, and a new
   template can be uploaded for any program from its card.
   Issuance to participants happens on the Participants page.
   ========================================================= */

let _templateCtx = null;   // {eventId} awaiting the template file input

function renderCertificates(){
  const summary = document.getElementById('vaultSummary');
  const gallery = document.getElementById('templateGallery');
  const noneBox = document.getElementById('certNone');
  if(!summary || !gallery) return;

  if(!events.length){
    noneBox.classList.remove('hidden');
    gallery.classList.add('hidden');
    summary.innerHTML = '';
    return;
  }
  noneBox.classList.add('hidden');
  gallery.classList.remove('hidden');

  const ready = events.filter(e => e.template).length;
  const missing = events.length - ready;
  const issued = events.reduce((n, e) => n + certCountIn(e), 0);
  summary.innerHTML = `
    <span class="chip chip-muted">Programs: ${events.length}</span>
    <span class="chip chip-success"><i aria-hidden="true" class="fa-solid fa-file-circle-check mr-1"></i>Templates ready: ${ready}</span>
    ${missing ? `<span class="chip chip-muted text-gray-600">Missing template: ${missing}</span>` : ''}
    <span class="chip chip-warn"><i aria-hidden="true" class="fa-solid fa-award mr-1"></i>Certificates issued: ${issued}</span>`;

  gallery.innerHTML = [...events].sort((a,b) => new Date(a.date) - new Date(b.date)).map(ev => {
    const cat = CATEGORY_STYLES[ev.category];
    const t = ev.template;
    const issuedN = certCountIn(ev);
    const isImg = t && t.type.indexOf('image/') === 0;

    const preview = t
      ? (isImg
          ? `<img src="${t.dataUrl}" alt="template" class="w-full h-full object-cover">`
          : `<div class="flex flex-col items-center gap-1" style="color:var(--danger);"><i aria-hidden="true" class="fa-solid fa-file-pdf text-2xl"></i><span class="text-[10px] font-medium">PDF</span></div>`)
      : `<div class="flex flex-col items-center gap-1.5" style="color:var(--border-strong);"><i aria-hidden="true" class="fa-solid fa-file-circle-question text-2xl"></i><span class="text-[10px] font-medium">No template</span></div>`;

    const actions = t ? `
        <button onclick="openTemplatePreview('${ev.id}')" class="flex-1 px-3 py-2 rounded-lg text-xs font-medium border hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-eye mr-1"></i>Preview</button>
        <button onclick="downloadTemplate('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border); color:var(--info);" title="Download"><i aria-hidden="true" class="fa-solid fa-download text-xs"></i></button>
        <button onclick="chooseTemplateFile('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);" title="Replace template"><i aria-hidden="true" class="fa-solid fa-rotate text-xs"></i></button>
        <button onclick="removeTemplate('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-danger" style="border-color:var(--border); color:var(--danger);" title="Remove template"><i aria-hidden="true" class="fa-solid fa-trash text-xs"></i></button>`
      : `<button onclick="chooseTemplateFile('${ev.id}')" class="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white" style="background:var(--btn-warn);"><i aria-hidden="true" class="fa-solid fa-upload mr-1"></i>Upload template</button>`;

    return `
    <div class="surface rounded-2xl border overflow-hidden flex flex-col" style="border-color:var(--border);">
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wide font-medium" style="color:var(--ink-soft);"><i aria-hidden="true" class="fa-solid ${cat.icon} mr-1"></i>${ev.category} · ${formatDateShort(ev.date)}</p>
            <h3 class="font-display font-semibold leading-snug mt-0.5">${esc(ev.title)}</h3>
          </div>
          ${t
            ? `<span class="chip chip-success shrink-0"><span class="status-dot" style="background:currentColor"></span>Ready</span>`
            : `<span class="chip chip-muted shrink-0"><span class="status-dot" style="background:currentColor"></span>Not set</span>`}
        </div>
        <div class="rounded-xl border h-32 flex items-center justify-center overflow-hidden mb-4" style="border-color:var(--border); background:var(--surface-2);">
          ${preview}
        </div>
        <p class="text-xs leading-relaxed" style="color:var(--ink-soft);">
          ${t ? `${esc(t.fileName)}<br>${fmtBytes(t.size)} · uploaded ${formatDateShort(t.uploadedAt)}` : 'No template uploaded for this program yet.'}
        </p>
        <p class="text-[11px] mt-1.5 mb-4" style="color:var(--ink-soft);">Issued from this template: <span class="font-semibold" style="color:var(--ink);">${issuedN}</span></p>
        <div class="mt-auto flex gap-2">${actions}</div>
      </div>
    </div>`;
  }).join('');
}

/* ---------- upload / replace / remove template ---------- */
function chooseTemplateFile(eventId){
  _templateCtx = { eventId };
  document.getElementById('certFileInput').click();
}

function onCertFileChosen(){
  const input = document.getElementById('certFileInput');
  const file = input.files && input.files[0];
  input.value = '';
  if(!file || !_templateCtx) return;
  const allowed = ['application/pdf','image/png','image/jpeg','image/webp','image/svg+xml'];
  const okType = allowed.includes(file.type) || /\.(pdf|png|jpe?g|webp|svg)$/i.test(file.name);
  if(!okType){ showToast('Only PDF or image files are allowed.', 'error'); return; }
  if(file.size > 8 * 1024 * 1024){ showToast('File is larger than 8 MB.', 'error'); return; }

  const ctx = _templateCtx; _templateCtx = null;
  const reader = new FileReader();
  reader.onload = function(e){
    const ev = eventById(ctx.eventId);
    if(!ev) return;
    const wasReplace = !!ev.template;
    ev.template = {
      fileName: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: TODAY.toISOString().slice(0,10),
      dataUrl: e.target.result,
    };
    logActivity('cert', (wasReplace ? 'Certificate template replaced for ' : 'Certificate template uploaded for ') + ev.title);
    showToast('Template saved for ' + ev.title + '.');
    closeModal('modalTemplatePreview');
    renderCertificates();
    if(currentPage === 'dashboard') renderDashboard();
  };
  reader.readAsDataURL(file);
}

function downloadTemplate(eventId){
  const ev = eventById(eventId);
  if(!ev || !ev.template) return;
  const a = document.createElement('a');
  a.href = ev.template.dataUrl;
  a.download = ev.template.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function removeTemplate(eventId){
  const ev = eventById(eventId);
  if(!ev || !ev.template) return;
  askConfirm('Remove the certificate template for "' + ev.title + '"? Issued certificates keep their records, but no new ones can be issued until a template is set.', function(){
    ev.template = null;
    showToast('Template removed.', 'info');
    closeModal('modalTemplatePreview');
    renderCertificates();
    if(currentPage === 'dashboard') renderDashboard();
  });
}

function openTemplatePreview(eventId){
  const ev = eventById(eventId);
  if(!ev || !ev.template) return;
  const t = ev.template;
  const isImg = t.type.indexOf('image/') === 0;
  const isPdf = t.type === 'application/pdf';
  const inner = isImg
    ? `<img src="${t.dataUrl}" alt="template" class="mx-auto max-h-[430px] rounded-lg border" style="border-color:var(--border);">`
    : isPdf
      ? `<iframe src="${t.dataUrl}" class="w-full h-[430px] rounded-lg border" style="border-color:var(--border);"></iframe>`
      : `<p class="text-center text-sm py-16" style="color:var(--ink-soft);">This file type can not be previewed here — use Download instead.</p>`;
  document.getElementById('templatePreviewBody').innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h3 class="font-display font-semibold">${esc(t.fileName)}</h3>
        <p class="text-xs mt-0.5" style="color:var(--ink-soft);">Certificate template · ${esc(ev.title)} · ${fmtBytes(t.size)}</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button onclick="downloadTemplate('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border); color:var(--info);" title="Download"><i aria-hidden="true" class="fa-solid fa-download text-xs"></i></button>
        <button onclick="chooseTemplateFile('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);" title="Replace template"><i aria-hidden="true" class="fa-solid fa-rotate text-xs"></i></button>
        <button onclick="removeTemplate('${ev.id}')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-danger" style="border-color:var(--border); color:var(--danger);" title="Remove template"><i aria-hidden="true" class="fa-solid fa-trash text-xs"></i></button>
        <button onclick="closeModal('modalTemplatePreview')" class="w-9 h-9 rounded-lg border flex items-center justify-center hover-soft" style="border-color:var(--border);"><i aria-hidden="true" class="fa-solid fa-xmark text-xs"></i></button>
      </div>
    </div>
    ${inner}`;
  openModal('modalTemplatePreview');
}