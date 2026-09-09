/* =========================================================
   NAVIGATION — sidebar pages, context event, topbar, search
   ========================================================= */

var currentPage = 'dashboard';
var contextEventId = null;

const PAGE_TITLES = {
  dashboard:    ['Dashboard', 'Overview of Motion-U programs'],
  events:       ['Events', 'Create and manage club programs'],
  participants: ['Participants', 'Roster of a selected program — each program owns its list'],
  checkin:      ['Check-in', 'Scan QR passes to join, or mark attendance manually'],
  certificates: ['Certificate Vault', 'Certificate templates for every program'],
};

function renderCurrentPage(){
  if(currentPage === 'dashboard') renderDashboard();
  if(currentPage === 'events') renderEvents();
  if(currentPage === 'participants') renderParticipants();
  if(currentPage === 'checkin') renderCheckin();
  if(currentPage === 'certificates') renderCertificates();
}

function setPage(page){
  if(currentPage === 'checkin' && typeof stopCamera === 'function') stopCamera();
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el => el.classList.add('hidden'));
  document.getElementById('page-' + page).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === page));
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page][0];
  document.getElementById('topbarSubtitle').textContent = PAGE_TITLES[page][1];
  closeSidebar();
  closeAllModals();
  renderCurrentPage();
}

/* navigate with a specific program preselected as the working context */
function goToPage(page, eventId){
  if(eventId) contextEventId = eventId;
  setPage(page);
}

function openSidebar(){
  document.getElementById('sidebar').classList.remove('-translate-x-full');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

function toggleNotifications(){ document.getElementById('notifPanel').classList.toggle('hidden'); }
document.addEventListener('click', function(e){
  const panel = document.getElementById('notifPanel');
  if(!panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('[onclick*="toggleNotifications"]')){
    panel.classList.add('hidden');
  }
});

function handleGlobalSearch(value){
  if(!value){ return; }
  const v = value.toLowerCase();
  const evMatch = events.find(e => e.title.toLowerCase().includes(v));
  let hit = null;
  for(const ev of events){
    for(const p of ev.participants){
      if(p.name.toLowerCase().includes(v) || p.studentId.toLowerCase().includes(v)){ hit = {ev, p}; break; }
    }
    if(hit) break;
  }
  if(evMatch){
    goToPage('events', evMatch.id);
    document.getElementById('eventSearch').value = value;
    renderEvents();
  } else if(hit){
    goToPage('participants', hit.ev.id);
    document.getElementById('participantSearch').value = value;
    renderParticipants();
  }
}
