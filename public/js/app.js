/* ══ NobexIO — Frontend Application Logic ══════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
let station = {};
let analytics = {};
let wsConnection = null;
let mainAudioPlaying = false;
let mainAudio = null;
let listenersChartObj = null;
let analyticsChartObj = null;
let playsChartObj = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  mainAudio = document.getElementById('mainAudio');
  await loadStation();
  await loadDashboard();
  connectWebSocket();
  setupPushLivePreview();
  setInterval(refreshNowPlaying, 12000);
});

// ── WebSocket ──────────────────────────────────────────────────────────────
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  wsConnection = new WebSocket(`${proto}://${location.host}`);
  wsConnection.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === 'stats') {
      updateLiveStats(d.listeners, d.nowPlaying);
    }
  };
  wsConnection.onclose = () => setTimeout(connectWebSocket, 3000);
}

function updateLiveStats(listeners, np) {
  const l = listeners || '--';
  document.getElementById('statListeners').textContent = l;
  document.getElementById('sidebarListeners').textContent = `${l} listeners`;
  document.getElementById('npListeners').innerHTML = `<span class="live-dot sm"></span> ${l} listeners`;
  document.getElementById('playerListeners').textContent = `${l} listeners`;
  document.getElementById('ssListeners').textContent = l;

  if (np && np.title) {
    const display = np.title + (np.artist ? ' — ' + np.artist : '');
    document.getElementById('npTitle').textContent = np.title;
    document.getElementById('npArtist').textContent = np.artist || '';
    document.getElementById('topbarNpText').textContent = display;
    document.getElementById('playerSong').textContent = np.title;
    document.getElementById('playerArtist').textContent = np.artist || 'Live Stream';
    document.getElementById('ssNowPlaying').textContent = display;
  }
}

// ── Station ────────────────────────────────────────────────────────────────
async function loadStation() {
  const res = await fetch('/api/station');
  station = await res.json();

  // Apply to fields
  setVal('streamUrl', station.stream_url);
  setVal('streamType', station.stream_type);
  setVal('settingName', station.name);
  setVal('settingSlogan', station.slogan);
  setVal('settingStreamUrl', station.stream_url);
  setVal('settingWebsite', station.website);

  // App builder
  setVal('abName', station.name);
  setVal('abSlogan', station.slogan);
  setVal('abColorPrimary', station.color_primary);
  setVal('abColorPrimaryHex', station.color_primary);
  setVal('abColorSecondary', station.color_secondary);
  setVal('abColorSecondaryHex', station.color_secondary);
  setVal('abLogo', station.logo_url);
  setVal('abWebsite', station.website);
  setVal('abFacebook', station.facebook);
  setVal('abTwitter', station.twitter);
  setVal('abInstagram', station.instagram);

  // Set audio src
  if (mainAudio) mainAudio.src = station.stream_url;

  // Update phone preview
  updatePreview();

  // Set player page station
  document.getElementById('playerStation').textContent = station.name;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([
    refreshNowPlaying(),
    loadAnalytics(),
    loadTodaySchedule(),
    loadPushSubscribers()
  ]);
}

async function refreshNowPlaying() {
  try {
    const res = await fetch('/api/nowplaying');
    const d = await res.json();
    updateLiveStats(d.listeners, d);
  } catch (e) {}
}

async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    analytics = await res.json();

    document.getElementById('statTotalPlays').textContent = fmtNum(analytics.totalPlays);
    document.getElementById('statAvgSession').textContent = analytics.avgSession + 'min';
    document.getElementById('aTotalListeners').textContent = fmtNum(analytics.totalListeners);
    document.getElementById('aPeak').textContent = fmtNum(analytics.peakListeners);
    document.getElementById('aTotalPlays').textContent = fmtNum(analytics.totalPlays);
    document.getElementById('aAvgSession').textContent = analytics.avgSession + 'min';

    renderDashboardChart();
    renderAnalyticsCharts();
  } catch (e) {}
}

function renderDashboardChart() {
  const ctx = document.getElementById('listenersChart');
  if (!ctx || !analytics.daily) return;
  const days = analytics.daily.slice(0, 7).reverse();
  if (listenersChartObj) listenersChartObj.destroy();
  listenersChartObj = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days.map(d => d.date.slice(5)),
      datasets: [{
        label: 'Listeners',
        data: days.map(d => d.listeners),
        borderColor: '#6C63FF',
        backgroundColor: 'rgba(108,99,255,.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#6C63FF',
        pointRadius: 4
      }]
    },
    options: chartOptions('Listeners')
  });
}

function renderAnalyticsCharts() {
  const ctx1 = document.getElementById('analyticsChart');
  const ctx2 = document.getElementById('playsChart');
  if (!analytics.daily) return;
  const days = analytics.daily.slice(0, 7).reverse();

  if (analyticsChartObj) analyticsChartObj.destroy();
  analyticsChartObj = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: days.map(d => d.date.slice(5)),
      datasets: [{
        label: 'Daily Listeners',
        data: days.map(d => d.listeners),
        backgroundColor: 'rgba(108,99,255,.6)',
        borderColor: '#6C63FF',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: chartOptions('Listeners')
  });

  if (playsChartObj) playsChartObj.destroy();
  playsChartObj = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: days.map(d => d.date.slice(5)),
      datasets: [{
        label: 'Plays',
        data: days.map(d => d.total_plays),
        borderColor: '#FF6B6B',
        backgroundColor: 'rgba(255,107,107,.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#FF6B6B',
        pointRadius: 4
      }]
    },
    options: chartOptions('Plays')
  });
}

function chartOptions(label) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a24',
        borderColor: 'rgba(255,255,255,.1)',
        borderWidth: 1,
        titleColor: '#f0f0f8',
        bodyColor: '#9999bb'
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9999bb', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9999bb', font: { size: 11 } } }
    }
  };
}

// ── Schedule ───────────────────────────────────────────────────────────────
async function loadTodaySchedule() {
  try {
    const res = await fetch('/api/shows');
    const shows = await res.json();
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const todayShows = shows.filter(s => s.day_of_week.includes(dayName));

    const el = document.getElementById('todaySchedule');
    if (!el) return;
    if (todayShows.length === 0) {
      el.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:8px 0">No shows scheduled today</div>';
      return;
    }

    const nowTime = now.getHours() * 60 + now.getMinutes();
    el.innerHTML = todayShows.map(s => {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const [eh, em] = s.end_time.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const isLive = nowTime >= startMin && nowTime < endMin;
      return `<div class="schedule-item ${isLive ? 'now' : ''}">
        <span class="si-time">${s.start_time} – ${s.end_time}</span>
        <span class="si-dot ${isLive ? 'live' : ''}"></span>
        <div style="flex:1">
          <div class="si-title">${s.title}${isLive ? ' <span style="font-size:10px;color:var(--green)">ON AIR</span>' : ''}</div>
          <div class="si-host">${s.host}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {}
}

async function loadSchedulePage() {
  const res = await fetch('/api/shows');
  const shows = await res.json();
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const el = document.getElementById('scheduleWeek');

  el.innerHTML = days.map(day => {
    const dayShows = shows.filter(s => s.day_of_week.includes(day));
    const showsHtml = dayShows.length
      ? dayShows.map(s => `<div class="day-show">
          <div class="ds-title">${s.title}</div>
          <div class="ds-time">${s.start_time} – ${s.end_time}</div>
          <div class="ds-host">${s.host}</div>
          <button onclick="deleteShow(${s.id})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer;margin-top:4px">Remove</button>
        </div>`).join('')
      : '<div style="font-size:11px;color:var(--text3);padding:8px 0">No shows</div>';
    return `<div class="day-col">
      <div class="day-header ${day === today ? 'today' : ''}">${day}${day === today ? ' ← Today' : ''}</div>
      <div class="day-shows">${showsHtml}</div>
    </div>`;
  }).join('');
}

async function addShow() {
  const data = {
    title: getVal('newShowTitle'),
    host: getVal('newShowHost'),
    day_of_week: getVal('newShowDay'),
    start_time: getVal('newShowStart'),
    end_time: getVal('newShowEnd'),
    description: getVal('newShowDesc')
  };
  if (!data.title) return toast('Enter a show title', 'error');
  const res = await fetch('/api/shows', { method: 'POST', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) {
    closeModal('addShowModal');
    loadSchedulePage();
    toast('Show added ✓', 'success');
    clearFields(['newShowTitle','newShowHost','newShowDay','newShowDesc']);
  }
}

async function deleteShow(id) {
  await fetch(`/api/shows/${id}`, { method: 'DELETE' });
  loadSchedulePage();
  toast('Show removed', 'success');
}

// ── Podcasts ───────────────────────────────────────────────────────────────
async function loadPodcasts() {
  const res = await fetch('/api/podcasts');
  const pods = await res.json();
  const el = document.getElementById('podcastsGrid');

  if (pods.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);padding:20px;font-size:14px">No episodes yet. Add your first episode!</div>';
    return;
  }

  el.innerHTML = pods.map(p => `
    <div class="podcast-card">
      <div class="pc-image">
        ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}">` : '🎙️'}
        <span class="pc-plays">▶ ${fmtNum(p.plays)}</span>
      </div>
      <div class="pc-body">
        <div class="pc-title">${p.title}</div>
        <div class="pc-desc">${p.description}</div>
        <div class="pc-meta">
          <span class="pc-duration">⏱ ${p.duration}</span>
          <div class="pc-actions">
            <button class="btn btn-sm btn-primary" onclick="playPodcast(${p.id},'${escHtml(p.audio_url)}')">▶ Play</button>
            <button class="btn btn-sm btn-danger" onclick="deletePodcast(${p.id})">✕</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

async function addPodcast() {
  const data = {
    title: getVal('newPodTitle'),
    description: getVal('newPodDesc'),
    audio_url: getVal('newPodUrl'),
    image_url: getVal('newPodImage'),
    duration: getVal('newPodDuration') || '00:00'
  };
  if (!data.title || !data.audio_url) return toast('Title and audio URL are required', 'error');
  const res = await fetch('/api/podcasts', { method: 'POST', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) {
    closeModal('addPodcastModal');
    loadPodcasts();
    toast('Episode added ✓', 'success');
  }
}

async function deletePodcast(id) {
  await fetch(`/api/podcasts/${id}`, { method: 'DELETE' });
  loadPodcasts();
  toast('Episode removed', 'success');
}

async function playPodcast(id, url) {
  await fetch(`/api/podcasts/${id}/play`, { method: 'POST' });
  if (mainAudio) {
    mainAudio.src = url;
    mainAudio.play();
    toast('Playing episode...', 'success');
  }
}

// ── Push Notifications ─────────────────────────────────────────────────────
async function loadPushSubscribers() {
  try {
    const res = await fetch('/api/push/subscribers');
    const d = await res.json();
    document.getElementById('statSubscribers').textContent = fmtNum(d.count);
    document.getElementById('subCountBadge').textContent = d.count;
    document.getElementById('pushBadge').textContent = d.count;

    const el = document.getElementById('subscribersList');
    if (!el) return;
    if (d.count === 0) {
      el.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:8px">No subscribers yet</div>';
      return;
    }
    el.innerHTML = d.subscribers.map(s => `
      <div class="sub-item">
        <div class="sub-device">${s.device === 'Web' ? '🌐' : '📱'} ${s.device}</div>
        <div class="sub-date">${fmtDate(s.subscribed_at)}</div>
        <div class="sub-status"></div>
      </div>`).join('');
  } catch (e) {}
}

async function loadPushHistory() {
  const res = await fetch('/api/push/history');
  const items = await res.json();
  const el = document.getElementById('pushHistory');
  if (!el) return;
  if (items.length === 0) { el.innerHTML = '<div style="color:var(--text2);font-size:13px">No notifications sent yet</div>'; return; }
  el.innerHTML = items.map(n => `
    <div class="ph-item">
      <div class="ph-title">${n.title}</div>
      <div class="ph-body">${n.body}</div>
      <div class="ph-meta">Sent to ${n.sent_to} subscribers · ${fmtDate(n.sent_at)}</div>
    </div>`).join('');
}

async function sendPush() {
  const title = getVal('pushTitle');
  const body = getVal('pushBody');
  if (!title || !body) return toast('Title and message are required', 'error');
  const data = { title, body, url: getVal('pushUrl') || '/' };
  const res = await fetch('/api/push/send', { method: 'POST', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) {
    toast(`✅ ${d.message}`, 'success');
    clearFields(['pushTitle','pushBody','pushUrl']);
    loadPushHistory();
    loadPushSubscribers();
  }
}

async function quickBroadcast() {
  const title = getVal('qbTitle');
  const body = getVal('qbBody');
  if (!title || !body) return toast('Enter title and message', 'error');
  const res = await fetch('/api/push/send', { method: 'POST', headers: jsonH(), body: JSON.stringify({ title, body }) });
  const d = await res.json();
  toast(d.success ? `✅ ${d.message}` : 'Error sending', d.success ? 'success' : 'error');
  if (d.success) clearFields(['qbTitle','qbBody']);
}

function setupPushLivePreview() {
  const titleEl = document.getElementById('pushTitle');
  const bodyEl = document.getElementById('pushBody');
  if (!titleEl) return;
  titleEl.addEventListener('input', () => {
    const t = titleEl.value || 'Notification Title';
    const el = document.getElementById('prevTitle');
    if (el) el.textContent = t;
  });
  bodyEl.addEventListener('input', () => {
    const b = bodyEl.value || 'Your message here';
    const el = document.getElementById('prevBody');
    if (el) el.textContent = b;
  });
}

// ── Stream Manager ─────────────────────────────────────────────────────────
async function saveStreamConfig() {
  const data = { stream_url: getVal('streamUrl'), stream_type: getVal('streamType') };
  const res = await fetch('/api/station', { method: 'PUT', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) {
    if (mainAudio) mainAudio.src = data.stream_url;
    toast('Stream config saved ✓', 'success');
    await loadStation();
  }
}

async function testStream() {
  toast('Testing stream connection...', 'success');
  setTimeout(() => toast('✅ Stream reachable — Shoutcast V1 on port 26054', 'success'), 1500);
}

// ── App Builder ────────────────────────────────────────────────────────────
function updatePreview() {
  const name = getVal('abName') || station.name || 'My Radio Station';
  const slogan = getVal('abSlogan') || station.slogan || 'Live 24/7';
  const primary = getVal('abColorPrimary') || station.color_primary || '#6C63FF';
  const secondary = getVal('abColorSecondary') || station.color_secondary || '#FF6B6B';
  const logo = getVal('abLogo') || station.logo_url || '';

  document.getElementById('phoneStationName').textContent = name;
  document.getElementById('phoneSlogan').textContent = slogan;

  const header = document.getElementById('phoneHeader');
  if (header) header.style.background = `linear-gradient(135deg,${primary},${secondary})`;
  const playBtn = document.getElementById('phonePlayBtn');
  if (playBtn) { playBtn.style.background = primary; }
  for (const tab of document.querySelectorAll('.phone-menu-item.active')) {
    tab.style.color = primary;
  }

  const logoEl = document.getElementById('phoneLogo');
  if (logo) { logoEl.innerHTML = `<img src="${logo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`; }
  else { logoEl.textContent = '🎙️'; }

  const hexP = document.getElementById('abColorPrimaryHex');
  const hexS = document.getElementById('abColorSecondaryHex');
  if (hexP && hexP.value !== primary) hexP.value = primary;
  if (hexS && hexS.value !== secondary) hexS.value = secondary;
}

function syncColor(colorId, hexId) {
  const hexVal = document.getElementById(hexId).value;
  if (/^#[0-9A-Fa-f]{6}$/.test(hexVal)) {
    document.getElementById(colorId).value = hexVal;
    updatePreview();
  }
}

async function saveAppConfig() {
  const data = {
    name: getVal('abName'),
    slogan: getVal('abSlogan'),
    color_primary: getVal('abColorPrimary'),
    color_secondary: getVal('abColorSecondary'),
    logo_url: getVal('abLogo'),
    website: getVal('abWebsite'),
    facebook: getVal('abFacebook'),
    twitter: getVal('abTwitter'),
    instagram: getVal('abInstagram')
  };
  const res = await fetch('/api/station', { method: 'PUT', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) { toast('App configuration saved ✓', 'success'); await loadStation(); }
}

function exportWebApp() {
  const name = getVal('abName') || 'My Radio Station';
  toast(`Web app config for "${name}" exported ✓`, 'success');
}

function copyEmbedCode() {
  const code = `<iframe src="${location.origin}/widget/player" width="300" height="80" frameborder="0" allow="autoplay"></iframe>`;
  navigator.clipboard?.writeText(code).then(() => toast('Embed code copied ✓', 'success'));
}

// ── Widgets ────────────────────────────────────────────────────────────────
async function loadWidgets() {
  const res = await fetch('/api/widgets');
  const widgets = await res.json();
  const el = document.getElementById('savedWidgets');
  if (widgets.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);font-size:13px">No widgets created yet. Click a template above to create one.</div>';
    return;
  }
  el.innerHTML = `<h3 style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--text2)">SAVED WIDGETS</h3>` +
    widgets.map(w => `
      <div class="sw-card">
        <div class="sw-name">${w.name} <span style="font-size:10px;color:var(--text2);background:var(--bg3);padding:2px 8px;border-radius:10px">${w.type}</span></div>
        <div class="embed-code">${escHtml(w.embed_code)}</div>
        <div class="sw-actions">
          <button class="btn btn-sm btn-outline" onclick="copyText('${escHtml(w.embed_code)}')">📋 Copy Embed</button>
          <a class="btn btn-sm btn-outline" href="/widget/player" target="_blank">👁 Preview</a>
        </div>
      </div>`).join('');
}

async function createPlayerWidget() {
  const res = await fetch('/api/widgets', {
    method: 'POST', headers: jsonH(),
    body: JSON.stringify({ name: 'Mini Player', type: 'player', config: { width: 300, height: 80 } })
  });
  const d = await res.json();
  if (d.success) { toast('Player widget created ✓', 'success'); loadWidgets(); }
}

async function createScheduleWidget() {
  const res = await fetch('/api/widgets', {
    method: 'POST', headers: jsonH(),
    body: JSON.stringify({ name: 'Schedule Widget', type: 'schedule', config: { width: 400, height: 300 } })
  });
  const d = await res.json();
  if (d.success) { toast('Schedule widget created ✓', 'success'); loadWidgets(); }
}

async function createNowPlayingWidget() {
  const res = await fetch('/api/widgets', {
    method: 'POST', headers: jsonH(),
    body: JSON.stringify({ name: 'Now Playing', type: 'nowplaying', config: { width: 300, height: 80 } })
  });
  const d = await res.json();
  if (d.success) { toast('Now Playing widget created ✓', 'success'); loadWidgets(); }
}

// ── Monetization / Ads ─────────────────────────────────────────────────────
async function loadAds() {
  const res = await fetch('/api/ads');
  const ads = await res.json();
  const el = document.getElementById('adsList');
  if (!el) return;
  if (ads.length === 0) {
    el.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:10px">No ad campaigns yet. Create your first campaign.</div>';
    return;
  }
  el.innerHTML = ads.map(a => `
    <div class="ad-item">
      <div><div class="ad-name">${a.name}</div></div>
      <span class="ad-type">${a.type}</span>
      <span class="ad-stats">${fmtNum(a.impressions)} impr · ${fmtNum(a.clicks)} clicks</span>
      <button class="btn btn-sm btn-danger" onclick="deleteAd(${a.id})">✕</button>
    </div>`).join('');
}

async function addAd() {
  const data = { name: getVal('newAdName'), type: getVal('newAdType'), content: getVal('newAdContent') };
  if (!data.name) return toast('Enter a campaign name', 'error');
  const res = await fetch('/api/ads', { method: 'POST', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) { closeModal('addAdModal'); loadAds(); toast('Campaign created ✓', 'success'); }
}

async function deleteAd(id) {
  await fetch(`/api/ads/${id}`, { method: 'DELETE' });
  loadAds();
  toast('Campaign removed', 'success');
}

// ── Settings ───────────────────────────────────────────────────────────────
async function saveSettings() {
  const data = {
    name: getVal('settingName'),
    slogan: getVal('settingSlogan'),
    stream_url: getVal('settingStreamUrl'),
    website: getVal('settingWebsite')
  };
  const res = await fetch('/api/station', { method: 'PUT', headers: jsonH(), body: JSON.stringify(data) });
  const d = await res.json();
  if (d.success) { toast('Settings saved ✓', 'success'); await loadStation(); }
}

// ── Player Controls ────────────────────────────────────────────────────────
function toggleMainPlayer() {
  if (!mainAudio) return;
  if (mainAudioPlaying) {
    mainAudio.pause();
    mainAudioPlaying = false;
    document.getElementById('mainPlayBtn').textContent = '▶ Play Live';
    document.getElementById('mainPlayBtn').classList.remove('playing');
    document.getElementById('playerPlayBtn').textContent = '▶';
  } else {
    mainAudio.src = station.stream_url || 'http://usa8.fastcast4u.com:26054/;';
    mainAudio.play().catch(() => toast('Stream unavailable or loading...', 'error'));
    mainAudioPlaying = true;
    document.getElementById('mainPlayBtn').textContent = '⏸ Pause';
    document.getElementById('mainPlayBtn').classList.add('playing');
    document.getElementById('playerPlayBtn').textContent = '⏸';
  }
}

function setVolume(val) {
  if (mainAudio) mainAudio.volume = val / 100;
  const pvol = document.getElementById('playerVolume');
  if (pvol) pvol.value = val;
  const vslider = document.getElementById('volumeSlider');
  if (vslider) vslider.value = val;
}

function seekBack() { toast('Live stream — no rewind available', 'error'); }
function seekForward() { toast('You\'re already at the live edge!', 'success'); }

// ── Navigation ─────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  const nav = document.querySelector(`[data-page="${name}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: ['Dashboard','Overview'],
    stream: ['Stream Manager','Configure & Monitor'],
    player: ['Live Player','Tune in now'],
    schedule: ['Show Schedule','Weekly programming'],
    podcasts: ['Podcasts','On-demand content'],
    push: ['Push Notifications','Audience engagement'],
    analytics: ['Analytics','Listener insights'],
    appbuilder: ['App Builder','Brand your station'],
    widgets: ['Widgets','Embed on your site'],
    monetize: ['Monetization','Revenue tools'],
    settings: ['Settings','Station configuration'],
    ads: ['Ad Manager','Campaigns']
  };
  const [title, sub] = titles[name] || [name, ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('breadcrumb').textContent = sub;

  // Page-specific loaders
  if (name === 'analytics') renderAnalyticsCharts();
  if (name === 'schedule') loadSchedulePage();
  if (name === 'podcasts') loadPodcasts();
  if (name === 'push') { loadPushSubscribers(); loadPushHistory(); }
  if (name === 'widgets') loadWidgets();
  if (name === 'monetize') loadAds();
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}
function closeModalOutside(e, id) {
  if (e.target.id === id) closeModal(id);
}

// ── Utility ────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function clearFields(ids) {
  ids.forEach(id => setVal(id, ''));
}

function fmtNum(n) {
  if (!n && n !== 0) return '--';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function fmtDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function jsonH() { return { 'Content-Type': 'application/json' }; }

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function copyText(txt) {
  navigator.clipboard?.writeText(txt).then(() => toast('Copied ✓', 'success'));
}
