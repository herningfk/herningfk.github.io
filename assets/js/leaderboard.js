// Leaderboard ("Årets springere"): the ticker under the home page's header
// image and the podium on /rangliste/. Fills in the sections rendered by
// layouts/_partials/leaderboard.html.
//
// Fails silently by design: if the service is down, slow, blocked by CORS or
// returns anything unexpected, the section keeps its `hidden` attribute and
// visitors see nothing at all.

const PATH = '/itadvice.leaderboard.v1alpha1.LeaderboardService/GetLeaderboard';
const TIMEOUT_MS = 5000;
// More than the top ten, so a tie for tenth place is not cut off.
const PAGE_SIZE = 20;
// Keep showing last year's leaderboard until the new year has this many jumpers.
const MIN_JUMPERS = 3;
// The ticker and the /rangliste/ page show ranks 1-10: the podium 1-3, the table 4-10.
const TOP_RANKS = 10;
const PODIUM_RANKS = 3;
const TICKER_SPEED = 40; // pixels per second
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const updatedFormat = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Copenhagen',
});

async function fetchYear(api, dropzoneId, year, signal) {
  const res = await fetch(api.replace(/\/+$/, '') + PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dropzoneId, year, pageSize: PAGE_SIZE }),
    signal,
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  // Proto3 JSON leaves out empty fields, so an empty leaderboard comes back as {}.
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  return { entries, refreshTime: data && data.refreshTime };
}

async function load(api, dropzoneId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const thisYear = new Date().getFullYear();
    for (const year of [thisYear, thisYear - 1]) {
      const { entries, refreshTime } = await fetchYear(api, dropzoneId, year, controller.signal);
      if (entries.length >= MIN_JUMPERS) return { year, entries, refreshTime };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Everyone ranked 1..maxRank. Ties share a rank, so this can be more than maxRank people.
function topOf(entries, maxRank) {
  const top = [];
  for (const e of entries) {
    const rank = Number(e && e.rank);
    if (!(rank >= 1 && rank <= maxRank)) continue;
    const name = typeof e.displayName === 'string' ? e.displayName.trim() : '';
    const jumps = Number(e.jumpCount);
    if (!Number.isInteger(rank) || !name || !Number.isInteger(jumps) || jumps < 1) {
      throw new Error('unexpected entry');
    }
    top.push({ rank, name, jumps });
  }
  if (top.length === 0) throw new Error('nobody ranked');
  return top.sort((a, b) => a.rank - b.rank);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function medal(rank) {
  const node = el('span', 'hfk-lb__medal', MEDALS[rank]);
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', rank + '. plads');
  return node;
}

const jumpsText = (n) => n + ' spring';

function renderTicker(section, { entries }) {
  const list = el('ul', 'hfk-ticker__list');
  for (const e of topOf(entries, TOP_RANKS)) {
    const rank = e.rank <= PODIUM_RANKS ? medal(e.rank) : el('span', 'hfk-ticker__rank', e.rank + '.');
    const item = el('li', 'hfk-ticker__item');
    item.append(rank, el('span', 'hfk-ticker__name', e.name), el('span', 'hfk-lb__count', jumpsText(e.jumps)));
    list.append(item);
  }
  section.querySelector('[data-lb-track]').append(list);
}

// Runs once the ticker is visible, since it has to measure itself. Repeats the
// list until half the track is at least as wide as the viewport and adds an
// identical second half, so moving the track by -50% loops without a gap.
// With reduced motion the list just stands still.
function startTicker(section) {
  if (reducedMotion()) return;
  const viewport = section.querySelector('[data-lb-viewport]');
  const track = section.querySelector('[data-lb-track]');
  const list = track.firstElementChild;
  let copiesPerHalf = 0;

  const layout = () => {
    const listWidth = list.getBoundingClientRect().width;
    if (!listWidth) return;
    const needed = Math.max(1, Math.ceil(viewport.clientWidth / listWidth));
    if (needed === copiesPerHalf) return;
    copiesPerHalf = needed;
    track.replaceChildren(list);
    for (let i = 1; i < needed * 2; i++) {
      const copy = list.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.append(copy);
    }
    track.style.animationDuration = (needed * listWidth) / TICKER_SPEED + 's';
    track.classList.add('is-moving');
  };

  layout();
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(viewport);
}

function renderPodium(section, { entries, refreshTime }) {
  const stand = section.querySelector('[data-lb-podium]');
  const byRank = new Map();
  for (const e of topOf(entries, PODIUM_RANKS)) {
    if (!byRank.has(e.rank)) byRank.set(e.rank, []);
    byRank.get(e.rank).push(e);
  }
  // DOM order is 1, 2, 3 for screen readers; CSS puts the winner in the middle.
  for (const [rank, group] of byRank) {
    const place = el('div', 'hfk-lb__place hfk-lb__place--' + rank);
    const names = el('ul', 'hfk-lb__names');
    for (const e of group) names.append(el('li', '', e.name));
    const step = el('div', 'hfk-lb__step', String(rank));
    step.setAttribute('aria-hidden', 'true');
    place.append(medal(rank), names, el('p', 'hfk-lb__count', jumpsText(group[0].jumps)), step);
    stand.append(place);
  }

  renderTable(section, entries);

  const updated = section.querySelector('[data-lb-updated]');
  const when = new Date(refreshTime);
  if (updated && refreshTime && !Number.isNaN(when.getTime())) {
    const time = updated.querySelector('time');
    time.dateTime = when.toISOString();
    time.textContent = updatedFormat.format(when);
    updated.hidden = false;
  }
}

// Places 4-10 under the podium. The podium can stand on its own, so if these
// entries are missing or malformed the table just stays hidden.
function renderTable(section, entries) {
  const table = section.querySelector('[data-lb-table]');
  if (!table) return;
  let rest;
  try {
    rest = topOf(entries, TOP_RANKS).filter((e) => e.rank > PODIUM_RANKS);
  } catch {
    return;
  }
  if (rest.length === 0) return;
  const body = table.tBodies[0];
  for (const e of rest) {
    const row = body.insertRow();
    row.append(el('td', 'hfk-lb__rank', e.rank + '.'), el('td', 'hfk-lb__name', e.name), el('td', 'hfk-lb__jumps', String(e.jumps)));
  }
  table.hidden = false;
}

// One burst from each bottom corner of the screen. Purely decorative.
function confetti() {
  const canvas = el('canvas', 'hfk-lb__confetti');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.append(canvas);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#d4a72c', '#f2d16b', '#c3c8cf', '#c27c45', '#137752', '#19a974'];
  const gravity = 0.3;
  const pieces = [];
  for (let i = 0; i < 160; i++) {
    const fromLeft = i % 2 === 0;
    const speed = Math.sqrt(2 * gravity * h * 0.85) * (0.6 + Math.random() * 0.4);
    const angle = (fromLeft ? -1 : 1) * (0.15 + Math.random() * 0.35); // radians off vertical
    pieces.push({
      x: fromLeft ? 0 : w,
      y: h,
      vx: -Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
    });
  }

  const duration = 3500;
  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
    for (const p of pieces) {
      p.vy += gravity;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

const requests = new Map();

for (const section of document.querySelectorAll('[data-hfk-leaderboard]')) {
  // Each section includes this script, so it can run more than once per page.
  if (section.dataset.lbStarted) continue;
  section.dataset.lbStarted = 'true';
  const view = section.dataset.hfkLeaderboard;
  const api = section.dataset.api;
  const dropzoneId = Number(section.dataset.dropzone);
  if (!api || !Number.isInteger(dropzoneId)) continue;

  // Sections on the same page share one request.
  const key = api + '|' + dropzoneId;
  if (!requests.has(key)) requests.set(key, load(api, dropzoneId));

  requests
    .get(key)
    .then((data) => {
      if (!data) return;
      section.querySelectorAll('[data-lb-year]').forEach((n) => (n.textContent = data.year));
      if (view === 'ticker') renderTicker(section, data);
      else renderPodium(section, data);
      section.hidden = false;
      if (view === 'ticker') startTicker(section);
      else if (!reducedMotion()) setTimeout(confetti, 600);
    })
    .catch(() => {
      // Intentionally silent: the section stays hidden.
    });
}
