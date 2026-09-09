/* =========================================================
   DASHBOARD
   ========================================================= */

let _feedListener = false;

function renderDashboard(){
  const ongoing = events.filter(e => getEventStatus(e) === 'ongoing');
  const upcoming = events.filter(e => getEventStatus(e) === 'upcoming').sort((a,b)=> new Date(a.date) - new Date(b.date));
  const spotlight = ongoing[0] || upcoming[0];

  const spotEl = document.getElementById('dashboardSpotlight');
  if(spotlight){
    const status = getEventStatus(spotlight);
    const stats = rosterStats(spotlight);
    const pct = Math.min(100, Math.round((stats.total / spotlight.capacity) * 100));
    const daysAway = Math.round((dateOnly(new Date(spotlight.date+'T00:00:00')) - dateOnly(TODAY)) / 86400000);
    const sent = spotlight.participants.filter(p => p.qrSentAt).length;
    spotEl.innerHTML = `
      <div class="rounded-2xl p-6 md:p-8 text-white relative overflow-hidden" style="background:linear-gradient(120deg, var(--primary-dark), var(--primary) 58%, var(--energy-dark));">
        <div class="absolute inset-0 opacity-20" style="background:radial-gradient(circle at 85% 15%, var(--energy), transparent 45%);"></div>
        <div class="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          <div class="flex-1 min-w-0">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/15">
              <i aria-hidden="true" class="fa-solid ${status==='ongoing' ? 'fa-bolt' : 'fa-clock'}"></i>
              ${status === 'ongoing' ? 'Happening today' : 'In ' + daysAway + ' day' + (daysAway===1?'':'s')}
            </span>
            <h2 class="font-display text-2xl md:text-3xl font-semibold mt-3 leading-tight">${esc(spotlight.title)}</h2>
            <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-white/85">
              <span><i aria-hidden="true" class="fa-regular fa-calendar mr-1.5"></i>${formatDate(spotlight.date)}</span>
              <span><i aria-hidden="true" class="fa-regular fa-clock mr-1.5"></i>${to12h(spotlight.start)} – ${to12h(spotlight.end)}</span>
              <span><i aria-hidden="true" class="fa-solid fa-location-dot mr-1.5"></i>${esc(spotlight.location)}</span>
            </div>
            <div class="mt-4 max-w-xs">
              <div class="flex justify-between text-xs text-white/70 mb-1">
                <span>${stats.total} of ${spotlight.capacity} in roster</span><span class="num">${pct}%</span>
              </div>
              <div class="progress-track h-1.5 bg-white/20"><div class="progress-fill bg-white" style="width:${pct}%"></div></div>
            </div>
          </div>
          <div class="flex md:flex-col gap-2 shrink-0">
            <button onclick="openEventDetail('${spotlight.id}')" class="px-4 py-2.5 rounded-lg text-sm font-medium bg-white whitespace-nowrap" style="color:var(--primary-dark)">View program</button>
            ${status==='ongoing' ? `<button onclick="goToPage('checkin','${spotlight.id}')" class="px-4 py-2.5 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 whitespace-nowrap">QR check-in</button>` : ''}
            <button onclick="goToPage('participants','${spotlight.id}')" class="px-4 py-2.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 whitespace-nowrap">Roster (${stats.total})</button>
          </div>
        </div>
      </div>
      ${status==='ongoing' && sent > 0 ? `
      <div class="mt-3 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-xl surface border" style="border-color:var(--border);">
        <i aria-hidden="true" class="fa-solid fa-qrcode" style="color:var(--primary)"></i>
        <span>QR passes emailed to ${sent} of ${stats.total} roster members.</span>
        <button onclick="goToPage('checkin','${spotlight.id}')" class="ml-auto text-xs font-semibold underline" style="color:var(--primary)">Go to check-in</button>
      </div>` : ''}`;
  } else {
    spotEl.innerHTML = `
      <div class="rounded-2xl p-8 text-center border-2 border-dashed surface" style="border-color:var(--border);">
        <p class="text-sm" style="color:var(--ink-soft);">No programs yet. Create one and build its roster with QR passes.</p>
      </div>`;
  }

  const allP = events.flatMap(e => e.participants);
  const marked = allP.filter(p => p.attended !== null);
  const attendanceRate = marked.length ? Math.round((marked.filter(p => p.attended === true).length / marked.length) * 100) : 0;
  const vaultCount = events.reduce((n, e) => n + certCountIn(e), 0);

  document.getElementById('dashboardStats').innerHTML = [
    {label:'Total programs', value: events.length, icon:'fa-calendar-days', color:'var(--primary)'},
    {label:'Participants across rosters', value: allP.length, icon:'fa-users', color:'var(--energy)'},
    {label:'Certificates issued', value: vaultCount, icon:'fa-award', color:'var(--warn)'},
    {label:'Attendance rate', value: attendanceRate + '%', icon:'fa-chart-simple', color:'var(--success)'},
  ].map(s => `
    <div class="surface rounded-2xl border p-4" style="border-color:var(--border);">
      <div class="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style="background:color-mix(in srgb, ${s.color} 14%, transparent); color:${s.color};">
        <i aria-hidden="true" class="fa-solid ${s.icon} text-sm"></i>
      </div>
      <p class="font-display text-2xl font-semibold leading-none num">${s.value}</p>
      <p class="text-xs mt-1.5" style="color:var(--ink-soft);">${s.label}</p>
    </div>`).join('');

  renderActivityFeed();
  if(!_feedListener){
    _feedListener = true;
    document.addEventListener('mu:activity', function(){
      if(currentPage === 'dashboard') renderActivityFeed();
    });
  }
}

function renderActivityFeed(){
  const icons = {register:'fa-user-plus', join:'fa-clipboard-check', cert:'fa-award', qr:'fa-qrcode', 'no-show':'fa-user-xmark'};
  const colors = {register:'var(--primary)', join:'var(--success)', cert:'var(--warn)', qr:'var(--info)', 'no-show':'var(--danger)'};
  const feed = document.getElementById('activityFeed');
  if(!feed) return;
  feed.innerHTML = activityLog.slice(0, 8).map(a => `
    <div class="flex items-start gap-3">
      <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style="background:color-mix(in srgb, ${colors[a.type] || 'var(--primary)'} 14%, transparent); color:${colors[a.type] || 'var(--primary)'};">
        <i aria-hidden="true" class="fa-solid ${icons[a.type] || 'fa-circle'} text-xs"></i>
      </div>
      <div class="min-w-0">
        <p class="text-sm leading-snug">${esc(a.text)}</p>
        <p class="text-xs mt-0.5" style="color:var(--ink-soft);">${a.time}</p>
      </div>
    </div>`).join('');
}
