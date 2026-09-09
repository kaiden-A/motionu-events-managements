/* =========================================================
   THEME — light/dark toggle, persistence, system sync
   The no-flash initial attribute is set by a tiny inline
   script in <head>; this module owns the toggle + meta.
   ========================================================= */

(function(){
  const KEY = 'mu-theme';
  const COLORS = { light: '#F4F6FB', dark: '#0B1220' };
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  function systemTheme(){ return mql.matches ? 'dark' : 'light'; }
  function currentTheme(){ return document.documentElement.getAttribute('data-theme') || systemTheme(); }

  function syncUi(){
    const t = currentTheme();
    const icon = document.getElementById('themeIcon');
    if(icon){
      icon.className = 'fa-solid ' + (t === 'dark' ? 'fa-sun' : 'fa-moon');
    }
    const meta = document.getElementById('themeColorMeta');
    if(meta) meta.setAttribute('content', COLORS[t]);
  }

  window.toggleTheme = function(){
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch(e){}
    syncUi();
  };

  mql.addEventListener('change', function(e){
    if(localStorage.getItem(KEY)) return;
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    syncUi();
  });

  syncUi();
})();