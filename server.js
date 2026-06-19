const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const multer = require('multer');
const fs = require('fs');

// ── Database ──────────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const db = new Database('./data/nobexio.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS station (
    id INTEGER PRIMARY KEY,
    name TEXT DEFAULT 'My Radio Station',
    slogan TEXT DEFAULT 'Live 24/7',
    stream_url TEXT DEFAULT 'http://usa8.fastcast4u.com:26054/;',
    stream_type TEXT DEFAULT 'shoutcast',
    logo_url TEXT DEFAULT '',
    color_primary TEXT DEFAULT '#6C63FF',
    color_secondary TEXT DEFAULT '#FF6B6B',
    color_bg TEXT DEFAULT '#0A0A1A',
    website TEXT DEFAULT '',
    facebook TEXT DEFAULT '',
    twitter TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    push_enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE,
    p256dh TEXT,
    auth TEXT,
    device TEXT DEFAULT 'Web',
    subscribed_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS push_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    icon TEXT DEFAULT '',
    url TEXT DEFAULT '',
    sent_to INTEGER DEFAULT 0,
    sent_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS podcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    audio_url TEXT,
    image_url TEXT DEFAULT '',
    duration TEXT DEFAULT '00:00',
    published_at TEXT DEFAULT (datetime('now')),
    plays INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    host TEXT DEFAULT '',
    day_of_week TEXT DEFAULT 'Monday',
    start_time TEXT DEFAULT '09:00',
    end_time TEXT DEFAULT '11:00',
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS analytics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    listeners INTEGER DEFAULT 0,
    peak_listeners INTEGER DEFAULT 0,
    total_plays INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    avg_session_minutes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT,
    data TEXT,
    user_agent TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS widgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT DEFAULT 'player',
    config TEXT DEFAULT '{}',
    embed_code TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT DEFAULT 'banner',
    content TEXT,
    schedule TEXT DEFAULT 'always',
    active INTEGER DEFAULT 1,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0
  );
`);

// Seed station if not exists
const stationExists = db.prepare('SELECT id FROM station WHERE id=1').get();
if (!stationExists) {
  db.prepare(`INSERT INTO station (id,name,slogan,stream_url,stream_type) VALUES (1,'My Radio Station','Live 24/7','http://usa8.fastcast4u.com:26054/;','shoutcast')`).run();
}

// Seed demo analytics
const analyticsCount = db.prepare('SELECT COUNT(*) as c FROM analytics_daily').get();
if (analyticsCount.c === 0) {
  const days = ['2026-06-12','2026-06-13','2026-06-14','2026-06-15','2026-06-16','2026-06-17','2026-06-18'];
  const stmt = db.prepare('INSERT INTO analytics_daily (date,listeners,peak_listeners,total_plays,unique_visitors,avg_session_minutes) VALUES (?,?,?,?,?,?)');
  days.forEach((d, i) => {
    stmt.run(d, 80+i*12, 120+i*15, 300+i*40, 60+i*8, 18+i*2);
  });
}

// Seed demo shows
const showsCount = db.prepare('SELECT COUNT(*) as c FROM shows').get();
if (showsCount.c === 0) {
  const shows = [
    ['Morning Drive','DJ Shark','Monday,Tuesday,Wednesday,Thursday,Friday','06:00','09:00','Wake up and ride with the best beats'],
    ['Midday Mix','DJ Storm','Monday,Wednesday,Friday','12:00','14:00','Keeping you energized through lunch'],
    ['Evening Chill','DJ Wave','Tuesday,Thursday','18:00','20:00','Smooth vibes to end your day'],
    ['Weekend Party','DJ Blaze','Saturday,Sunday','20:00','23:00','Turn it up for the weekend']
  ];
  const stmt = db.prepare('INSERT INTO shows (title,host,day_of_week,start_time,end_time,description) VALUES (?,?,?,?,?,?)');
  shows.forEach(s => stmt.run(...s));
}

// ── Express App ───────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ secret: 'nobexio-secret-2026', resave: false, saveUninitialized: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: './public/uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

// ── WebSocket Live Stats ───────────────────────────────────────────────────────
let currentListeners = Math.floor(Math.random() * 40) + 60;
let nowPlaying = { title: 'Loading...', artist: '', album: '', artwork: '' };

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'stats', listeners: currentListeners, nowPlaying }));
});

function broadcastStats() {
  currentListeners = Math.max(20, currentListeners + Math.floor(Math.random() * 7) - 3);
  const payload = JSON.stringify({ type: 'stats', listeners: currentListeners, nowPlaying });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
}
setInterval(broadcastStats, 5000);

// ── Now Playing from Shoutcast ─────────────────────────────────────────────────
async function fetchNowPlaying() {
  try {
    const station = db.prepare('SELECT stream_url FROM station WHERE id=1').get();
    const base = station.stream_url.replace(/;.*$/, '').replace(/\/$/, '');
    const res = await fetch(`${base}/7.html`, { timeout: 4000 });
    const text = await res.text();
    const match = text.match(/<body[^>]*>(.*?)<\/body>/i);
    if (match) {
      const parts = match[1].split(',');
      if (parts.length >= 7) {
        const song = parts[6] || '';
        const [artist, title] = song.includes(' - ') ? song.split(' - ') : ['', song];
        nowPlaying = { title: title?.trim() || song, artist: artist?.trim() || '', album: '', artwork: '' };
        currentListeners = parseInt(parts[0]) || currentListeners;
      }
    }
  } catch (e) {
    // Stream unreachable — keep last known
  }
}
fetchNowPlaying();
setInterval(fetchNowPlaying, 15000);

// ── API Routes ────────────────────────────────────────────────────────────────

// Station
app.get('/api/station', (req, res) => {
  res.json(db.prepare('SELECT * FROM station WHERE id=1').get());
});
app.put('/api/station', (req, res) => {
  const fields = ['name','slogan','stream_url','stream_type','logo_url','color_primary','color_secondary','color_bg','website','facebook','twitter','instagram','push_enabled'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (Object.keys(updates).length === 0) return res.json({ success: true });
  const setClauses = Object.keys(updates).map(k => `${k}=?`).join(', ');
  db.prepare(`UPDATE station SET ${setClauses} WHERE id=1`).run(...Object.values(updates));
  res.json({ success: true });
});

// Now Playing
app.get('/api/nowplaying', (req, res) => {
  res.json({ ...nowPlaying, listeners: currentListeners });
});

// Analytics
app.get('/api/analytics', (req, res) => {
  const daily = db.prepare('SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 30').all();
  const totalListeners = daily.reduce((s, d) => s + d.listeners, 0);
  const peakListeners = Math.max(...daily.map(d => d.peak_listeners));
  const totalPlays = daily.reduce((s, d) => s + d.total_plays, 0);
  const avgSession = Math.round(daily.reduce((s, d) => s + d.avg_session_minutes, 0) / (daily.length || 1));
  res.json({ daily, totalListeners, peakListeners, totalPlays, avgSession, currentListeners });
});
app.post('/api/analytics/event', (req, res) => {
  const { event_type, data } = req.body;
  db.prepare('INSERT INTO analytics_events (event_type,data,user_agent,ip) VALUES (?,?,?,?)').run(
    event_type, JSON.stringify(data), req.headers['user-agent'] || '', req.ip
  );
  res.json({ success: true });
});

// Push Notifications
app.get('/api/push/vapid', (req, res) => {
  res.json({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' });
});
app.post('/api/push/subscribe', (req, res) => {
  const { endpoint, keys, device } = req.body;
  try {
    db.prepare('INSERT OR REPLACE INTO subscribers (endpoint,p256dh,auth,device) VALUES (?,?,?,?)').run(
      endpoint, keys?.p256dh || '', keys?.auth || '', device || 'Web'
    );
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});
app.post('/api/push/send', (req, res) => {
  const { title, body, icon, url } = req.body;
  const subscribers = db.prepare('SELECT * FROM subscribers WHERE active=1').all();
  db.prepare('INSERT INTO push_notifications (title,body,icon,url,sent_to) VALUES (?,?,?,?,?)').run(
    title, body, icon || '', url || '/', subscribers.length
  );
  res.json({ success: true, sent_to: subscribers.length, message: `Push notification queued for ${subscribers.length} subscriber(s)` });
});
app.get('/api/push/subscribers', (req, res) => {
  const subs = db.prepare('SELECT id,device,subscribed_at,active FROM subscribers ORDER BY subscribed_at DESC').all();
  res.json({ subscribers: subs, count: subs.length });
});
app.get('/api/push/history', (req, res) => {
  res.json(db.prepare('SELECT * FROM push_notifications ORDER BY sent_at DESC LIMIT 50').all());
});

// Podcasts
app.get('/api/podcasts', (req, res) => {
  res.json(db.prepare('SELECT * FROM podcasts ORDER BY published_at DESC').all());
});
app.post('/api/podcasts', (req, res) => {
  const { title, description, audio_url, image_url, duration } = req.body;
  const result = db.prepare('INSERT INTO podcasts (title,description,audio_url,image_url,duration) VALUES (?,?,?,?,?)').run(
    title, description, audio_url, image_url || '', duration || '00:00'
  );
  res.json({ success: true, id: result.lastInsertRowid });
});
app.delete('/api/podcasts/:id', (req, res) => {
  db.prepare('DELETE FROM podcasts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
app.post('/api/podcasts/:id/play', (req, res) => {
  db.prepare('UPDATE podcasts SET plays=plays+1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Shows / Schedule
app.get('/api/shows', (req, res) => {
  res.json(db.prepare('SELECT * FROM shows WHERE active=1 ORDER BY start_time').all());
});
app.post('/api/shows', (req, res) => {
  const { title, host, day_of_week, start_time, end_time, description, image_url } = req.body;
  const result = db.prepare('INSERT INTO shows (title,host,day_of_week,start_time,end_time,description,image_url) VALUES (?,?,?,?,?,?,?)').run(
    title, host, day_of_week, start_time, end_time, description, image_url || ''
  );
  res.json({ success: true, id: result.lastInsertRowid });
});
app.delete('/api/shows/:id', (req, res) => {
  db.prepare('UPDATE shows SET active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Widgets
app.get('/api/widgets', (req, res) => {
  res.json(db.prepare('SELECT * FROM widgets ORDER BY created_at DESC').all());
});
app.post('/api/widgets', (req, res) => {
  const { name, type, config } = req.body;
  const station = db.prepare('SELECT * FROM station WHERE id=1').get();
  const id = uuidv4().substring(0, 8);
  const embedCode = generateEmbedCode(type, config, station, id);
  const result = db.prepare('INSERT INTO widgets (name,type,config,embed_code) VALUES (?,?,?,?)').run(
    name, type, JSON.stringify(config), embedCode
  );
  res.json({ success: true, id: result.lastInsertRowid, embed_code: embedCode });
});

function generateEmbedCode(type, config, station, id) {
  const baseUrl = 'http://localhost:3000';
  if (type === 'player') {
    return `<iframe src="${baseUrl}/widget/player?id=${id}&color=${encodeURIComponent(station.color_primary)}" width="${config.width||300}" height="${config.height||120}" frameborder="0" allow="autoplay"></iframe>`;
  }
  if (type === 'schedule') {
    return `<iframe src="${baseUrl}/widget/schedule?id=${id}" width="${config.width||400}" height="${config.height||300}" frameborder="0"></iframe>`;
  }
  return `<iframe src="${baseUrl}/widget/${type}?id=${id}" width="300" height="200" frameborder="0"></iframe>`;
}

// Ads / Monetization
app.get('/api/ads', (req, res) => {
  res.json(db.prepare('SELECT * FROM ads ORDER BY id DESC').all());
});
app.post('/api/ads', (req, res) => {
  const { name, type, content, schedule } = req.body;
  const result = db.prepare('INSERT INTO ads (name,type,content,schedule) VALUES (?,?,?,?)').run(
    name, type, content, schedule || 'always'
  );
  res.json({ success: true, id: result.lastInsertRowid });
});
app.delete('/api/ads/:id', (req, res) => {
  db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// RSS Podcast Feed
app.get('/feed/podcasts.xml', (req, res) => {
  const station = db.prepare('SELECT * FROM station WHERE id=1').get();
  const podcasts = db.prepare('SELECT * FROM podcasts ORDER BY published_at DESC').all();
  const items = podcasts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <description><![CDATA[${p.description}]]></description>
      <enclosure url="${p.audio_url}" type="audio/mpeg"/>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <itunes:duration>${p.duration}</itunes:duration>
    </item>`).join('');
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${station.name}</title>
    <description>${station.slogan}</description>
    <link>${station.website || 'http://localhost:3000'}</link>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`);
});

// Widget pages
app.get('/widget/player', (req, res) => {
  const station = db.prepare('SELECT * FROM station WHERE id=1').get();
  const color = req.query.color || station.color_primary;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
body{background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.player{width:100%;padding:12px 16px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(255,255,255,.1)}
.btn{width:44px;height:44px;border-radius:50%;background:${color};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;transition:.2s}
.btn:hover{transform:scale(1.1)}
.info{flex:1;overflow:hidden}
.title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:11px;opacity:.6;margin-top:2px}
.dot{width:8px;height:8px;border-radius:50%;background:#2ecc71;display:inline-block;margin-right:4px;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style></head><body>
<div class="player">
  <button class="btn" id="playBtn" onclick="togglePlay()">▶</button>
  <div class="info">
    <div class="title" id="songTitle">${station.name}</div>
    <div class="sub"><span class="dot"></span>LIVE</div>
  </div>
</div>
<audio id="audio" src="${station.stream_url}"></audio>
<script>
let playing=false;
const audio=document.getElementById('audio');
const btn=document.getElementById('playBtn');
const title=document.getElementById('songTitle');
function togglePlay(){
  if(playing){audio.pause();btn.textContent='▶';playing=false;}
  else{audio.play();btn.textContent='⏸';playing=true;}
}
setInterval(()=>fetch('/api/nowplaying').then(r=>r.json()).then(d=>{if(d.title)title.textContent=d.title+(d.artist?' — '+d.artist:'');}),10000);
</script></body></html>`);
});

// File upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url, originalName: req.file.originalname });
});

// Main app
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎙️  NobexIO running → http://localhost:${PORT}`));
