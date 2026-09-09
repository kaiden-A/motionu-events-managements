/* =========================================================
   UTILITIES — dates, format helpers, UI primitives
   ========================================================= */

const TODAY = new Date(2026, 8, 6);

const CATEGORY_STYLES = {
  'Wellness':     {chip:'cat-wellness',    solid:'var(--cat-well)',    icon:'fa-spa'},
  'Dance':        {chip:'cat-dance',       solid:'var(--cat-dance)',   icon:'fa-music'},
  'Fitness':      {chip:'cat-fitness',     solid:'var(--cat-fit)',     icon:'fa-dumbbell'},
  'Martial Arts': {chip:'cat-martial',     solid:'var(--cat-martial)', icon:'fa-hand-fist'},
};

const STATUS_STYLES = {
  upcoming: {label:'Upcoming',           chip:'chip-info'},
  ongoing:  {label:'Happening today',    chip:'chip-success'},
  past:     {label:'Past',               chip:'chip-muted'},
};

function dateOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function getEventStatus(ev){
  const evDate = dateOnly(new Date(ev.date + 'T00:00:00'));
  const today = dateOnly(TODAY);
  if(evDate.getTime() === today.getTime()) return 'ongoing';
  return evDate < today ? 'past' : 'upcoming';
}

function formatDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
function formatDateShort(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function to12h(t){
  let [h,m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if(hh === 0) hh = 12;
  return hh + ':' + String(m).padStart(2,'0') + ' ' + ap;
}

function initials(name){
  return name.split(' ').filter(w => w.length && !['Binti','Bin','A/P','A/L','Anak'].includes(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase();
}
function avatarColor(id){
  const colors = ['var(--info)','#0E7490','#2563EB','#0891B2','#4338CA','#0369A1'];
  const n = parseInt(id.replace(/\D/g,'')) || 0;
  return colors[n % colors.length];
}

function esc(str){
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtBytes(bytes){
  if(bytes == null) return '—';
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

/* ---------- modal + toast primitives ---------- */
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
function closeAllModals(){
  document.querySelectorAll('[id^="modal"]').forEach(m => m.classList.add('hidden'));
}

function showToast(message, type){
  type = type || 'success';
  const styles = {
    success: {bg:'var(--success-light)', border:'var(--success)', text:'var(--success)', icon:'fa-circle-check'},
    error:   {bg:'var(--danger-light)',  border:'var(--danger)',  text:'var(--danger)',  icon:'fa-circle-exclamation'},
    info:    {bg:'var(--info-light)',    border:'var(--info)',    text:'var(--info)',    icon:'fa-circle-info'},
  };
  const s = styles[type];
  const div = document.createElement('div');
  div.className = 'toast rounded-lg border px-4 py-3 text-sm shadow-sm flex items-start gap-2';
  div.style.background = s.bg; div.style.borderColor = s.border; div.style.color = s.text;
  div.innerHTML = '<i aria-hidden="true" class="fa-solid ' + s.icon + ' mt-0.5"></i><span>' + message + '</span>';
  document.getElementById('toastContainer').appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .25s'; setTimeout(()=>div.remove(), 250); }, 3200);
}

let confirmCallback = null;
function askConfirm(message, onConfirm){
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  const btn = document.getElementById('confirmActionBtn');
  btn.onclick = function(){ if(confirmCallback) confirmCallback(); closeModal('modalConfirm'); };
  openModal('modalConfirm');
}
