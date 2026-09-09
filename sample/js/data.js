/* =========================================================
   DATA — event-owned rosters (mock of future database)
   Each event owns an independent participant roster. Every
   roster record carries an unguessable QR token that a real
   backend would emit at registration time.
   ========================================================= */

function makeToken(eventId, pid){
  const bytes = new Uint8Array(8);
  if(window.crypto && window.crypto.getRandomValues){ window.crypto.getRandomValues(bytes); }
  else { for(let i=0;i<8;i++) bytes[i] = Math.floor(Math.random()*256); }
  const rand = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,8);
  return 'MOTIONU|' + eventId + '|' + pid + '|' + rand;
}

/* reusable "people" (student IDs shared across events on purpose:
   the same student can join several programs — each program keeps
   its own independent record, dedupe is a backend concern later) */
const PS = [
  {n:'Nur Aisyah Binti Ahmad',  su:'SU21001', em:'aisyah.ahmad@student.edu.my',   ph:'012-345 6701'},
  {n:'Tan Wei Jian',            su:'SU21014', em:'weijian.tan@student.edu.my',    ph:'012-345 6702'},
  {n:'Priya A/P Raman',         su:'SU21027', em:'priya.raman@student.edu.my',    ph:'012-345 6703'},
  {n:'Muhammad Haziq Bin Zulkifli', su:'SU21033', em:'haziq.zulkifli@student.edu.my', ph:'012-345 6704'},
  {n:'Chong Mei Ling',          su:'SU21048', em:'meiling.chong@student.edu.my',  ph:'012-345 6705'},
  {n:'Arjun Kumar',             su:'SU21052', em:'arjun.kumar@student.edu.my',    ph:'012-345 6706'},
  {n:'Siti Nurhaliza Binti Yusof', su:'SU21061', em:'nurhaliza.yusof@student.edu.my', ph:'012-345 6707'},
  {n:'Lim Jia Hao',             su:'SU21070', em:'jiahao.lim@student.edu.my',     ph:'012-345 6708'},
  {n:'Farah Adilla Binti Rashid', su:'SU21083', em:'farah.rashid@student.edu.my', ph:'012-345 6709'},
  {n:'Kevin Anak Simon',        su:'SU21091', em:'kevin.simon@student.edu.my',    ph:'012-345 6710'},
  {n:'Nurul Izzah Binti Kamal', su:'SU21105', em:'izzah.kamal@student.edu.my',    ph:'012-345 6711'},
  {n:'Ong Zi Xuan',             su:'SU21118', em:'zixuan.ong@student.edu.my',     ph:'012-345 6712'},
  {n:'Dinesh Waran',            su:'SU21126', em:'dinesh.waran@student.edu.my',   ph:'012-345 6713'},
  {n:'Aina Sofea Binti Hassan', su:'SU21134', em:'aina.hassan@student.edu.my',    ph:'012-345 6714'},
];

let _pid = 0;
function mkPerson(pi, attended){
  _pid++;
  const base = PS[pi];
  return {
    id: 'p' + _pid,
    name: base.n,
    studentId: base.su,
    email: base.em,
    phone: base.ph,
    addedAt: null,          // filled in seed phase
    attended: attended === undefined ? null : attended, // null = pending, true = joined, false = no-show
    joinedBy: null,         // 'qr' | 'manual'
    qrToken: null,
    qrSentAt: null,         // when the QR pass email was (simulated) sent
    cert: null,             // certificate vault entry
  };
}

/* placeholder certificate TEMPLATE rendered as an SVG (mock upload)
   — one template per program, with merge placeholders that a real
   backend would fill per participant ({name}, {event}, {date}, {certno}) */
function makeTemplateSvg(eventTitle, uploadedAt){
  const w = 1200, h = 848;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#FFFDF6"/>
  <rect x="26" y="26" width="${w-52}" height="${h-52}" fill="none" stroke="#C9A227" stroke-width="3"/>
  <rect x="40" y="40" width="${w-80}" height="${h-80}" fill="none" stroke="#C9A227" stroke-width="1"/>
  <circle cx="${w-90}" cy="90" r="46" fill="#6D28D9" opacity="0.85"/>
  <circle cx="${w-90}" cy="90" r="22" fill="#4D7C0F"/>
  <circle cx="110" cy="${h-70}" r="40" fill="#ECFCCB"/>
  <text x="${w/2}" y="170" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="40" fill="#5B5B76">Certificate of Participation</text>
  <text x="${w/2}" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#5B5B76">is proudly presented to</text>
  <text x="${w/2}" y="400" text-anchor="middle" font-family="Georgia, serif" font-size="58" fill="#4C1D95">{name}</text>
  <text x="${w/2}" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#14142B">for taking part in  <tspan font-weight="bold">{event}</tspan></text>
  <text x="${w/2}" y="515" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#5B5B76">held on {date}</text>
  <text x="${w/2}" y="640" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#14142B">Amirah Hashim</text>
  <line x1="${w/2-180}" y1="650" x2="${w/2+180}" y2="650" stroke="#14142B" stroke-width="1"/>
  <text x="${w/2}" y="680" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#5B5B76">Club President</text>
  <text x="${w/2}" y="790" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#5B5B76">Certificate No. {certno}  ·  MOTION-U Movement &amp; Wellness Club</text>
</svg>`;
  const slug = eventTitle.replace(/[^A-Za-z0-9]+/g,'-').toLowerCase();
  return {
    fileName: 'MotionU-' + slug + '-template.svg',
    type: 'image/svg+xml',
    size: Math.round(svg.length * 1.05),
    uploadedAt,
    dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
  };
}

const events = [
  {
    id:'e1', title:'Sunrise Yoga & Mobility Flow', category:'Wellness', date:'2026-09-10', start:'07:00', end:'08:30',
    location:'Dewan Serbaguna, Block A', capacity:40,
    description:'A gentle morning flow to open up tight hips and shoulders before the week picks up pace. Mats provided; bring water and a light jacket for the cool-down.',
    participants:[ mkPerson(3), mkPerson(4), mkPerson(8), mkPerson(9), mkPerson(12), mkPerson(0) ],
  },
  {
    id:'e2', title:'Street Dance Fundamentals: Hip-Hop Level 1', category:'Dance', date:'2026-09-13', start:'14:00', end:'16:00',
    location:'Studio 2, Activity Centre', capacity:30,
    description:'Groove basics, isolations and an 8-count combo for first-timers. No experience needed, just comfortable shoes.',
    participants:[ mkPerson(0), mkPerson(2), mkPerson(5), mkPerson(6), mkPerson(10), mkPerson(13), mkPerson(3) ],
  },
  {
    id:'e3', title:'Capoeira Open Roda', category:'Martial Arts', date:'2026-09-20', start:'17:00', end:'19:00',
    location:'Outdoor Court 3', capacity:25,
    description:'An open circle for all levels to play, sing and exchange ginga. Instructors on hand for newcomers.',
    participants:[ mkPerson(7), mkPerson(11), mkPerson(12), mkPerson(13) ],
  },
  {
    id:'e4', title:'Zumba Night: Latin Beats', category:'Fitness', date:'2026-08-22', start:'19:30', end:'20:30',
    location:'Main Hall', capacity:60,
    description:'An hour of salsa, reggaeton and cumbia-inspired cardio to close out the week.',
    participants:[ mkPerson(0,true), mkPerson(1,true), mkPerson(2,true), mkPerson(3,true), mkPerson(4,false), mkPerson(5) ],
  },
  {
    id:'e5', title:'Contemporary Dance Showcase Rehearsal', category:'Dance', date:'2026-09-27', start:'15:00', end:'18:00',
    location:'Auditorium', capacity:20,
    description:'Full run-through for members performing at the semester showcase. Costumes not required for this session.',
    participants:[ mkPerson(2), mkPerson(5), mkPerson(13) ],
  },
  {
    id:'e6', title:'5K Fun Run & Recovery Stretch', category:'Fitness', date:'2026-08-15', start:'06:30', end:'09:00',
    location:'University Track', capacity:100,
    description:'A relaxed 5K loop around campus followed by a guided stretch and light breakfast.',
    participants:[ mkPerson(1,true), mkPerson(3,true), mkPerson(6,true), mkPerson(8,true), mkPerson(7,false), mkPerson(9) ],
  },
  {
    id:'e7', title:'Breakdance Battle Workshop', category:'Dance', date:'2026-09-06', start:'10:00', end:'13:00',
    location:'Studio 1, Activity Centre', capacity:35,
    description:'Footwork, freezes and a friendly 1-on-1 battle round to close the session. QR check-in active from 9:45 AM.',
    participants:[ mkPerson(2,true), mkPerson(5), mkPerson(7), mkPerson(12), mkPerson(13), mkPerson(0), mkPerson(1) ],
  },
  {
    id:'e8', title:'Mindful Movement & Stretch Clinic', category:'Wellness', date:'2026-07-30', start:'18:00', end:'19:00',
    location:'Studio 2, Activity Centre', capacity:40,
    description:'A slower session pairing breathwork with deep stretching for recovery week.',
    participants:[ mkPerson(0,true), mkPerson(10,true), mkPerson(4,false), mkPerson(11) ],
  },
];

/* ---------- seed phase: tokens, addedAt, sent flags, templates + issued certs ---------- */
events.forEach(ev => {
  ev.template = null;
  ev.participants.forEach(p => {
    p.qrToken = makeToken(ev.id, p.id);
    const d = new Date(ev.date + 'T00:00:00');
    d.setDate(d.getDate() - 6);
    p.addedAt = d.toISOString().slice(0,10);
  });
});
/* last week the QR passes for the today-event were emailed out (mock) */
const e7Early = events.find(e => e.id==='e7').participants.slice(0,5);
e7Early.forEach(p => { p.qrSentAt = '2026-08-30'; });

/* each past program carries its own certificate template */
const TEMPLATE_SEEDS = [
  {e:'e4', uploadedAt:'2026-08-10'},
  {e:'e6', uploadedAt:'2026-08-05'},
  {e:'e8', uploadedAt:'2026-07-15'},
  {e:'e7', uploadedAt:'2026-08-28'},
];
TEMPLATE_SEEDS.forEach(s => {
  const ev = events.find(e => e.id === s.e);
  if(ev) ev.template = makeTemplateSvg(ev.title, s.uploadedAt);
});

/* certificates already issued from those templates (joined participants of past programs) */
const ISSUED_DATES = { e4:'2026-08-24', e6:'2026-08-17', e8:'2026-08-01' };
let certSeq = 1;
['e4','e6','e8'].forEach(eid => {
  const ev = events.find(e => e.id === eid);
  ev.participants.forEach(p => {
    if(p.attended === true){
      p.cert = { certNo: 'MU-2026-' + String(certSeq++).padStart(4,'0'), issuedAt: ISSUED_DATES[eid] };
    }
  });
});

let activityLog = [
  {type:'cert', text:'Certificate issued to Nur Aisyah Binti Ahmad — Zumba Night: Latin Beats', time:'3 days ago'},
  {type:'cert', text:'Certificate issued to Priya A/P Raman — Zumba Night: Latin Beats', time:'3 days ago'},
  {type:'cert', text:'Certificate template uploaded for Breakdance Battle Workshop', time:'1 week ago'},
  {type:'qr',   text:'QR pass sent to Aina Sofea Binti Hassan — Breakdance Battle Workshop', time:'1 week ago'},
  {type:'qr',   text:'QR pass sent to Nur Aisyah Binti Ahmad — Breakdance Battle Workshop', time:'1 week ago'},
  {type:'join', text:'Muhammad Haziq Bin Zulkifli joined Zumba Night: Latin Beats via QR scan', time:'2 weeks ago'},
  {type:'cert', text:'Certificate issued to Tan Wei Jian — 5K Fun Run & Recovery Stretch', time:'3 weeks ago'},
];

const seq = { e:9, p:_pid + 1, c: certSeq };

/* ---------- accessors ---------- */
function eventById(id){ return events.find(e => e.id === id); }
function evParticipants(ev){ return ev.participants; }
function participantById(eventId, pid){
  const ev = eventById(eventId);
  return ev ? ev.participants.find(p => p.id === pid) : null;
}
function rosterStats(ev){
  const total = ev.participants.length;
  const joined = ev.participants.filter(p => p.attended === true).length;
  const noShow = ev.participants.filter(p => p.attended === false).length;
  return { total, joined, noShow, pending: total - joined - noShow };
}
function certCountIn(ev){ return ev.participants.filter(p => p.cert).length; }

/* sensible default event selector: happening now, else soonest upcoming, else first */
function defaultEventId(){
  const sorted = [...events].sort((a,b) => new Date(a.date) - new Date(b.date));
  const ongoing = sorted.find(e => getEventStatus(e) === 'ongoing');
  const next = sorted.find(e => getEventStatus(e) === 'upcoming');
  if(ongoing) return ongoing.id;
  if(next) return next.id;
  return sorted.length ? sorted[0].id : null;
}

/* ---------- logging ---------- */
function logActivity(type, text){
  activityLog.unshift({type, text, time:'Just now'});
  document.dispatchEvent(new CustomEvent('mu:activity'));
}
