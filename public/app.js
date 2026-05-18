// ===== CONFIG =====
const API_BASE = 'https://api.openweathermap.org/data/2.5';
const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';
const BACKEND_BASE = window.location.origin;
let apiKey = localStorage.getItem('owm_api_key') || '';
let isCelsius = true;
let currentData = null;
let currentForecast = null;
let particleArr = [];
let animFrame = null;
let currentUser = null;
let favoriteCities = [];

// ===== DOM =====
const $ = id => document.getElementById(id);
const cityInput = $('cityInput');
const searchBtn = $('searchBtn');
const gpsBtn = $('gpsBtn');
const clearBtn = $('clearBtn');
const suggestions = $('suggestions');
const loadingState = $('loadingState');
const errorState = $('errorState');
const welcomeState = $('welcomeState');
const weatherDashboard = $('weatherDashboard');
const apiModal = $('apiModal');
const apiKeyInput = $('apiKeyInput');
const unitToggle = $('unitToggle');
const themeToggle = $('themeToggle');
const canvas = $('weatherCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const particleCanvas = $('particleCanvas');
const pCtx = particleCanvas ? particleCanvas.getContext('2d') : null;

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  initParticles();
  updateClock();
  setInterval(updateClock, 1000);
  checkAuth();
  if (!apiKey) showModal();
  document.querySelectorAll('.city-chip').forEach(chip => {
    chip.addEventListener('click', () => searchCity(chip.dataset.city));
  });
  cityInput.addEventListener('input', onInput);
  cityInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  searchBtn.addEventListener('click', doSearch);
  gpsBtn.addEventListener('click', getGPS);
  clearBtn.addEventListener('click', clearSearch);
  unitToggle.addEventListener('click', toggleUnit);
  themeToggle.addEventListener('click', toggleTheme);
  $('retryBtn').addEventListener('click', () => { showState('welcome'); cityInput.value = ''; });
  $('saveApiKey').addEventListener('click', saveKey);
  $('showKeyBtn').addEventListener('click', toggleKeyVis);
  apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });

  // Auth & UI Listeners
  $('loginBtn').addEventListener('click', () => showAuthModal('login'));
  $('signupBtn').addEventListener('click', () => showAuthModal('signup'));
  $('logoutBtn').addEventListener('click', logout);
  document.querySelector('.close-modal-btn').addEventListener('click', closeAuthModal);
  $('switchToSignup').addEventListener('click', (e) => { e.preventDefault(); showAuthModal('signup'); });
  $('switchToLogin').addEventListener('click', (e) => { e.preventDefault(); showAuthModal('login'); });
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('favoriteBtn').addEventListener('click', toggleFavorite);

  // AI Assistant listeners
  $('aiChatBubble').addEventListener('click', toggleAiChat);
  $('closeAiChat').addEventListener('click', toggleAiChat);
  $('aiChatForm').addEventListener('submit', handleAiChatSubmit);
  document.querySelectorAll('.chat-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('aiChatInput').value = btn.textContent;
      $('aiChatForm').dispatchEvent(new Event('submit'));
    });
  });
});

// ===== STATES =====
function showState(state) {
  loadingState.style.display = 'none';
  errorState.style.display = 'none';
  welcomeState.style.display = 'none';
  weatherDashboard.style.display = 'none';
  if (state === 'loading') loadingState.style.display = 'block';
  else if (state === 'error') errorState.style.display = 'block';
  else if (state === 'welcome') welcomeState.style.display = 'block';
  else if (state === 'weather') weatherDashboard.style.display = 'flex';
}

// ===== SEARCH =====
let debounceTimer;
function onInput() {
  const val = cityInput.value.trim();
  clearBtn.style.display = val ? 'block' : 'none';
  clearTimeout(debounceTimer);
  if (val.length < 2) { suggestions.style.display = 'none'; return; }
  debounceTimer = setTimeout(() => fetchSuggestions(val), 350);
}
function clearSearch() {
  cityInput.value = '';
  clearBtn.style.display = 'none';
  suggestions.style.display = 'none';
  cityInput.focus();
}
function doSearch() {
  const city = cityInput.value.trim();
  if (city) searchCity(city);
}
async function fetchSuggestions(q) {
  if (!apiKey) return;
  try {
    const res = await fetch(`${GEO_BASE}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${apiKey}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { suggestions.style.display = 'none'; return; }
    suggestions.innerHTML = data.map(c =>
      `<div class="suggestion-item" tabindex="0" data-name="${c.name}" data-country="${c.country}" data-lat="${c.lat}" data-lon="${c.lon}">
        <span>📍</span><span>${c.name}${c.state ? ', ' + c.state : ''}, ${c.country}</span>
      </div>`
    ).join('');
    suggestions.style.display = 'block';
    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        cityInput.value = el.dataset.name;
        suggestions.style.display = 'none';
        fetchWeatherByCoords(el.dataset.lat, el.dataset.lon, `${el.dataset.name}, ${el.dataset.country}`);
      });
    });
  } catch { suggestions.style.display = 'none'; }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.search-section')) suggestions.style.display = 'none';
});

async function searchCity(name) {
  if (!apiKey) { showModal(); return; }
  showState('loading');
  suggestions.style.display = 'none';
  try {
    const geoRes = await fetch(`${GEO_BASE}/direct?q=${encodeURIComponent(name)}&limit=1&appid=${apiKey}`);
    const geo = await geoRes.json();
    if (!geo.length) throw new Error('City not found');
    const { lat, lon, name: cityName, country } = geo[0];
    await fetchWeatherByCoords(lat, lon, `${cityName}, ${country}`);
  } catch (err) {
    showError(err.message || 'City not found');
  }
}

async function fetchWeatherByCoords(lat, lon, label) {
  if (!apiKey) { showModal(); return; }
  showState('loading');
  try {
    const [curRes, foreRes] = await Promise.all([
      fetch(`${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
      fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&cnt=40`)
    ]);
    if (!curRes.ok) throw new Error(curRes.status === 401 ? 'Invalid API key' : 'City not found');
    currentData = await curRes.json();
    currentForecast = await foreRes.json();
    renderWeather(currentData, currentForecast);
    showState('weather');
    if (currentUser) {
      saveSearchHistory(currentData.name);
    }
    checkWeatherAlerts(currentData, currentForecast);
  } catch (err) {
    showError(err.message || 'Failed to fetch weather');
  }
}

function showError(msg) {
  $('errorTitle').textContent = msg.includes('401') || msg.includes('key') ? 'Invalid API Key' : 'City Not Found';
  $('errorMsg').textContent = msg.includes('401') || msg.includes('key')
    ? 'Please check your API key in settings.'
    : 'Please check the spelling or try another city.';
  showState('error');
}

// ===== GPS =====
function getGPS() {
  if (!navigator.geolocation) return alert('Geolocation not supported.');
  gpsBtn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsBtn.classList.remove('loading');
      fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude, 'Your Location');
    },
    () => { gpsBtn.classList.remove('loading'); alert('Location access denied.'); }
  );
}

// ===== RENDER =====
function renderWeather(d, forecast) {
  const tz = d.timezone;
  $('cityName').textContent = d.name;
  
  // Render favorite button if logged in
  const favoriteBtn = $('favoriteBtn');
  if (currentUser) {
    favoriteBtn.style.display = 'inline-flex';
    if (favoriteCities.includes(d.name)) {
      favoriteBtn.classList.add('active');
      favoriteBtn.title = 'Remove from favorites';
    } else {
      favoriteBtn.classList.remove('active');
      favoriteBtn.title = 'Add to favorites';
    }
  } else {
    favoriteBtn.style.display = 'none';
  }

  $('countryName').textContent = `${d.sys.country} · ${d.coord.lat.toFixed(2)}°N, ${d.coord.lon.toFixed(2)}°E`;
  updateDateDisplay(tz);
  $('weatherDesc').textContent = d.weather[0].description;
  $('feelsLike').textContent = formatTemp(d.main.feels_like);
  $('tempMax').textContent = formatTemp(d.main.temp_max);
  $('tempMin').textContent = formatTemp(d.main.temp_min);
  $('humidity').textContent = d.main.humidity + '%';
  $('humidityBar').style.width = d.main.humidity + '%';
  $('windSpeed').textContent = isCelsius ? (d.wind.speed * 3.6).toFixed(1) + ' km/h' : (d.wind.speed * 2.237).toFixed(1) + ' mph';
  $('windDir').textContent = windDirection(d.wind.deg);
  $('pressure').textContent = d.main.pressure;
  $('visibility').textContent = d.visibility ? (d.visibility / 1000).toFixed(1) : '–';
  $('cloudCover').textContent = d.clouds.all + '%';
  $('cloudBar').style.width = d.clouds.all + '%';
  renderTemp(d.main.temp);
  renderSunrise(d.sys.sunrise, d.sys.sunset, tz);
  renderTodaySummary(forecast.list, tz);
  renderHourly(forecast.list, tz);
  renderDaily(forecast.list, tz);
  drawWeatherAnim(d.weather[0].id, d.sys.pod || (isDaytime(d.sys.sunrise, d.sys.sunset) ? 'd' : 'n'));
  updateMap(d.coord.lat, d.coord.lon);
}

function renderTemp(tempC) {
  const display = isCelsius ? Math.round(tempC) : Math.round(tempC * 9 / 5 + 32);
  $('tempValue').textContent = display;
  $('tempUnitDisplay').textContent = isCelsius ? '°C' : '°F';
}

function formatTemp(tempC) {
  const v = isCelsius ? Math.round(tempC) : Math.round(tempC * 9 / 5 + 32);
  return v + (isCelsius ? '°C' : '°F');
}

function updateDateDisplay(tz) {
  const now = new Date();
  $('dateTime').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function renderSunrise(rise, set, tz) {
  const fmtTime = ts => new Date(ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  $('sunrise').textContent = fmtTime(rise);
  $('sunset').textContent = fmtTime(set);
  const diffMs = (set - rise) * 1000;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  $('daylightHours').textContent = `${h}h ${m}m`;
  animateSunDot(rise, set);
}

function animateSunDot(rise, set) {
  const now = Date.now() / 1000;
  const pct = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
  const t = pct;
  const x = 10 + t * 180;
  const y = 90 - Math.sin(Math.PI * t) * 100;
  const dot = $('sunDot');
  if (dot) { dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); }
}

function renderHourly(list, tz) {
  const container = $('hourlyForecast');
  const now = Date.now() / 1000;
  const upcoming = list.filter(i => i.dt >= now).slice(0, 12);
  container.innerHTML = upcoming.map((item, idx) => {
    const time = new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const temp = isCelsius ? Math.round(item.main.temp) + '°C' : Math.round(item.main.temp * 9 / 5 + 32) + '°F';
    const icon = weatherEmoji(item.weather[0].id);
    const rain = item.pop ? Math.round(item.pop * 100) + '%' : '';
    return `<div class="hourly-item${idx === 0 ? ' active' : ''}">
      <div class="hourly-time">${idx === 0 ? 'Now' : time}</div>
      <div class="hourly-icon">${icon}</div>
      <div class="hourly-temp">${temp}</div>
      ${rain ? `<div class="hourly-rain">🌧 ${rain}</div>` : ''}
    </div>`;
  }).join('');
}

function renderTodaySummary(list, tz) {
  const now = Date.now() / 1000;
  const next24 = list.filter(i => i.dt <= now + 86400);
  
  let morn=[], day=[], eve=[], night=[];
  
  next24.forEach(item => {
    const hour = new Date((item.dt + tz) * 1000).getUTCHours();
    if (hour >= 6 && hour < 12) morn.push(item.main.temp);
    else if (hour >= 12 && hour < 17) day.push(item.main.temp);
    else if (hour >= 17 && hour < 21) eve.push(item.main.temp);
    else night.push(item.main.temp);
  });

  const getAvg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  let mA = getAvg(morn), dA = getAvg(day), eA = getAvg(eve), nA = getAvg(night);
  
  if (mA === null) mA = currentData.main.temp;
  if (dA === null) dA = currentData.main.temp;
  if (eA === null) eA = currentData.main.temp;
  if (nA === null) nA = currentData.main.temp;

  $('mornTemp').textContent = formatTemp(mA);
  $('dayTemp').textContent = formatTemp(dA);
  $('eveTemp').textContent = formatTemp(eA);
  $('nightTemp').textContent = formatTemp(nA);
}

function renderDaily(list, tz) {
  const days = {};
  list.forEach(item => {
    const localDate = new Date((item.dt + tz) * 1000);
    const daysArr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthsArr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayStr = `${daysArr[localDate.getUTCDay()]}, ${monthsArr[localDate.getUTCMonth()]} ${localDate.getUTCDate()}`;
    
    if (!days[dayStr]) days[dayStr] = { temps: [], dayTemps: [], nightTemps: [], weather: item.weather[0], pop: 0 };
    days[dayStr].temps.push(item.main.temp);
    
    const hour = localDate.getUTCHours();
    if (hour >= 6 && hour < 18) {
      days[dayStr].dayTemps.push(item.main.temp);
    } else {
      days[dayStr].nightTemps.push(item.main.temp);
    }
    days[dayStr].pop = Math.max(days[dayStr].pop, item.pop || 0);
  });
  const entries = Object.entries(days).slice(0, 6);
  
  $('dailyForecast').innerHTML = entries.map(([day, val], i) => {
    const icon = weatherEmoji(val.weather.id);
    const dayTAvg = val.dayTemps.length ? val.dayTemps.reduce((a,b)=>a+b,0)/val.dayTemps.length : val.temps[0];
    const nightTAvg = val.nightTemps.length ? val.nightTemps.reduce((a,b)=>a+b,0)/val.nightTemps.length : val.temps[0];
    
    const dayT = formatTemp(dayTAvg);
    const nightT = formatTemp(nightTAvg);
    
    return `<div class="daily-item">
      <div class="daily-left">
        <span class="daily-day">${i === 0 ? 'Today' : day.split(',')[0]}</span>
        <span class="daily-icon">${icon}</span>
      </div>
      <div class="daily-temps">
        <div class="temp-block temp-day">
          <span class="temp-label">Day</span>
          <span class="temp-val">${dayT}</span>
        </div>
        <div class="temp-block temp-night">
          <span class="temp-label">Night</span>
          <span class="temp-val">${nightT}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateMap(lat, lon) {
  const map = $('weatherMap');
  if (map && apiKey) {
    map.src = `https://openweathermap.org/weathermap?basemap=map&cities=true&layer=temperature&lat=${lat}&lon=${lon}&zoom=8`;
  }
}

// ===== UNIT TOGGLE =====
function toggleUnit() {
  isCelsius = !isCelsius;
  $('unitLabel').textContent = isCelsius ? '°C' : '°F';
  if (currentData) renderWeather(currentData, currentForecast);
}

// ===== THEME =====
function toggleTheme() {
  document.body.classList.toggle('light');
  $('themeIcon').textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
}

// ===== CLOCK =====
function updateClock() {
  const el = $('dateTime');
  if (!el || !currentData) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ===== HELPERS =====
function windDirection(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
function isDaytime(rise, set) {
  const now = Date.now() / 1000;
  return now >= rise && now <= set;
}

function weatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id === 802) return '⛅';
  if (id >= 803) return '☁️';
  return '🌡️';
}

// ===== CANVAS WEATHER ANIMATION =====
function drawWeatherAnim(id, pod) {
  if (!ctx) return;
  cancelAnimationFrame(animFrame);
  let frame = 0;
  function loop() {
    ctx.clearRect(0, 0, 200, 200);
    frame++;
    if (id === 800) drawSun(ctx, frame, pod);
    else if (id >= 801 && id <= 803) drawPartlyCloudy(ctx, frame, pod);
    else if (id > 803) drawCloudy(ctx, frame);
    else if (id >= 500 && id < 600) drawRain(ctx, frame, id);
    else if (id >= 600 && id < 700) drawSnow(ctx, frame);
    else if (id >= 200 && id < 300) drawThunder(ctx, frame);
    else if (id >= 700 && id < 800) drawFog(ctx, frame);
    else drawSun(ctx, frame, pod);
    animFrame = requestAnimationFrame(loop);
  }
  loop();
}

function drawSun(ctx, f, pod) {
  const cx = 100, cy = 100, r = 45;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.8);
  if (pod === 'n') {
    glow.addColorStop(0, 'rgba(200,210,255,0.9)');
    glow.addColorStop(1, 'rgba(100,130,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8d2ff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,230,255,0.15)'; ctx.beginPath(); ctx.arc(cx - 12, cy - 10, 18, 0, Math.PI * 2); ctx.fill();
    return;
  }
  glow.addColorStop(0, 'rgba(252,211,77,0.8)');
  glow.addColorStop(1, 'rgba(252,211,77,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(f * 0.01);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(252,211,77,0.5)';
    ctx.fillRect(-3, r + 4, 6, 16);
  }
  ctx.restore();
  ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(cx - 10, cy - 10, 16, 0, Math.PI * 2); ctx.fill();
}

function drawCloudy(ctx, f) {
  const off = Math.sin(f * 0.02) * 6;
  drawCloud(ctx, 100 + off, 100, 0.9, 'rgba(180,190,220,0.9)');
}
function drawPartlyCloudy(ctx, f, pod) {
  drawSun(ctx, f, pod);
  const off = Math.sin(f * 0.025) * 5;
  drawCloud(ctx, 110 + off, 120, 0.7, 'rgba(200,210,240,0.85)');
}
function drawCloud(ctx, cx, cy, scale, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.arc(-28, 10, 22, 0, Math.PI * 2);
  ctx.arc(28, 10, 22, 0, Math.PI * 2);
  ctx.arc(-12, -12, 20, 0, Math.PI * 2);
  ctx.arc(18, -8, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawRain(ctx, f, id) {
  drawCloud(ctx, 100, 80, 0.85, 'rgba(140,160,200,0.9)');
  const drops = id >= 502 ? 16 : 8;
  for (let i = 0; i < drops; i++) {
    const x = 60 + (i % 8) * 12;
    const y = 120 + (i * 17 + f * 4) % 60;
    ctx.strokeStyle = 'rgba(100,180,255,0.7)';
    ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 10); ctx.stroke();
  }
}
function drawSnow(ctx, f) {
  drawCloud(ctx, 100, 80, 0.85, 'rgba(200,220,255,0.9)');
  for (let i = 0; i < 10; i++) {
    const x = 65 + (i % 5) * 16;
    const y = 120 + (i * 19 + f * 2) % 65;
    ctx.fillStyle = 'rgba(220,240,255,0.9)';
    ctx.font = '14px serif'; ctx.fillText('❄', x - 6, y);
  }
}
function drawThunder(ctx, f) {
  drawCloud(ctx, 100, 75, 0.9, 'rgba(80,90,140,0.95)');
  if (Math.floor(f / 25) % 2 === 0) {
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.moveTo(105, 115); ctx.lineTo(92, 140); ctx.lineTo(100, 140); ctx.lineTo(88, 165); ctx.lineTo(112, 132); ctx.lineTo(104, 132); ctx.closePath(); ctx.fill();
  }
}
function drawFog(ctx, f) {
  for (let i = 0; i < 5; i++) {
    const y = 70 + i * 18;
    const off = Math.sin(f * 0.02 + i) * 8;
    ctx.fillStyle = `rgba(180,190,210,${0.5 - i * 0.07})`;
    ctx.beginPath(); ctx.roundRect(50 + off, y, 100, 10, 5); ctx.fill();
  }
}

// ===== PARTICLES =====
function initParticles() {
  if (!particleCanvas || !pCtx) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  particleArr = Array.from({ length: 60 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 2 + 0.5,
    dx: (Math.random() - 0.5) * 0.4,
    dy: (Math.random() - 0.5) * 0.4,
    a: Math.random() * 0.5 + 0.2
  }));
  animateParticles();
  window.addEventListener('resize', () => {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  });
}
function animateParticles() {
  if (!pCtx) return;
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  particleArr.forEach(p => {
    p.x += p.dx; p.y += p.dy;
    if (p.x < 0 || p.x > particleCanvas.width) p.dx *= -1;
    if (p.y < 0 || p.y > particleCanvas.height) p.dy *= -1;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fillStyle = `rgba(108,99,255,${p.a})`;
    pCtx.fill();
  });
  requestAnimationFrame(animateParticles);
}

// ===== API KEY MODAL =====
function showModal() {
  apiModal.style.display = 'grid';
  setTimeout(() => apiKeyInput.focus(), 300);
}
function saveKey() {
  const key = apiKeyInput.value.trim();
  if (!key || key.length < 20) { $('apiKeyError').style.display = 'block'; return; }
  $('apiKeyError').style.display = 'none';
  apiKey = key;
  localStorage.setItem('owm_api_key', key);
  apiModal.style.display = 'none';
  showState('welcome');
}
function toggleKeyVis() {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
}

// ===== AUTHENTICATION & DATABASE SYNC =====
async function checkAuth() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    updateAuthUI(null);
    return;
  }
  try {
    const res = await fetch(`${BACKEND_BASE}/api/auth/me`, {
      headers: { 'x-auth-token': token }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data;
      favoriteCities = data.favoriteCities || [];
      updateAuthUI(data);
      renderWelcomeFavorites();
    } else {
      localStorage.removeItem('auth_token');
      updateAuthUI(null);
    }
  } catch (err) {
    console.error('Auth verification failed', err);
    updateAuthUI(null);
  }
}

function updateAuthUI(user) {
  if (user) {
    $('authControls').style.display = 'none';
    $('userProfile').style.display = 'flex';
    $('userNameDisplay').textContent = `Hi, ${user.username}`;
    if (currentData) {
      $('favoriteBtn').style.display = 'inline-flex';
    }
  } else {
    $('authControls').style.display = 'flex';
    $('userProfile').style.display = 'none';
    $('favoriteBtn').style.display = 'none';
  }
}

function showAuthModal(type) {
  $('authModal').style.display = 'grid';
  if (type === 'login') {
    $('loginFormContainer').style.display = 'block';
    $('signupFormContainer').style.display = 'none';
    $('loginError').style.display = 'none';
  } else {
    $('loginFormContainer').style.display = 'none';
    $('signupFormContainer').style.display = 'block';
    $('signupError').style.display = 'none';
  }
}

function closeAuthModal() {
  $('authModal').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value.trim();
  const errDiv = $('loginError');
  errDiv.style.display = 'none';

  try {
    const res = await fetch(`${BACKEND_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('auth_token', data.token);
      currentUser = data.user;
      favoriteCities = data.favoriteCities || [];
      await checkAuth(); // Re-verify and set state
      closeAuthModal();
    } else {
      errDiv.textContent = data.message || 'Login failed';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = 'Server error. Please try again.';
    errDiv.style.display = 'block';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const username = $('signupUsername').value.trim();
  const email = $('signupEmail').value.trim();
  const password = $('signupPassword').value.trim();
  const errDiv = $('signupError');
  errDiv.style.display = 'none';

  try {
    const res = await fetch(`${BACKEND_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('auth_token', data.token);
      currentUser = data.user;
      favoriteCities = [];
      await checkAuth();
      closeAuthModal();
    } else {
      errDiv.textContent = data.message || 'Signup failed';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = 'Server error. Please try again.';
    errDiv.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('auth_token');
  currentUser = null;
  favoriteCities = [];
  updateAuthUI(null);
  renderWelcomeFavorites(); // Re-render default chips
}

// ===== FAVORITE CITIES & SEARCH HISTORY SYNC =====
async function toggleFavorite() {
  if (!currentUser || !currentData) return;
  const city = currentData.name;
  const token = localStorage.getItem('auth_token');
  const btn = $('favoriteBtn');

  const isFav = favoriteCities.includes(city);
  const url = `${BACKEND_BASE}/api/user/favorites${isFav ? '/' + encodeURIComponent(city) : ''}`;
  const method = isFav ? 'DELETE' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: isFav ? null : JSON.stringify({ city })
    });

    if (res.ok) {
      favoriteCities = await res.json();
      if (favoriteCities.includes(city)) {
        btn.classList.add('active');
        btn.title = 'Remove from favorites';
      } else {
        btn.classList.remove('active');
        btn.title = 'Add to favorites';
      }
      renderWelcomeFavorites();
    }
  } catch (err) {
    console.error('Failed to toggle favorite', err);
  }
}

async function saveSearchHistory(city) {
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  try {
    await fetch(`${BACKEND_BASE}/api/user/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify({ city })
    });
  } catch (err) {
    console.error('Failed to save search history', err);
  }
}

function renderWelcomeFavorites() {
  const container = document.querySelector('.popular-cities');
  if (!container) return;

  if (currentUser && favoriteCities.length > 0) {
    const chipsHtml = favoriteCities.map(city => 
      `<button class="city-chip" role="listitem" data-city="${city}">❤️ ${city}</button>`
    ).join('');
    
    container.innerHTML = `
      <p class="popular-label">Your Favorite Cities</p>
      <div class="city-chips" role="list">
        ${chipsHtml}
      </div>
    `;
  } else {
    // Standard default cities
    container.innerHTML = `
      <p class="popular-label">Popular cities</p>
      <div class="city-chips" role="list">
        <button class="city-chip" role="listitem" data-city="London">🇬🇧 London</button>
        <button class="city-chip" role="listitem" data-city="New York">🇺🇸 New York</button>
        <button class="city-chip" role="listitem" data-city="Tokyo">🇯🇵 Tokyo</button>
        <button class="city-chip" role="listitem" data-city="Dubai">🇦🇪 Dubai</button>
        <button class="city-chip" role="listitem" data-city="Hyderabad">🇮🇳 Hyderabad</button>
        <button class="city-chip" role="listitem" data-city="Paris">🇫🇷 Paris</button>
      </div>
    `;
  }

  // Re-attach listeners to dynamically generated chips
  container.querySelectorAll('.city-chip').forEach(chip => {
    chip.addEventListener('click', () => searchCity(chip.dataset.city));
  });
}

// ===== WEATHER ALERTS (BROWSER NOTIFICATIONS API) =====
let lastNotifiedCity = '';
function checkWeatherAlerts(d, forecast) {
  if (lastNotifiedCity === d.name) return;
  lastNotifiedCity = d.name;

  if (typeof Notification === 'undefined') return;

  if (Notification.permission === 'granted') {
    triggerAlerts(d, forecast);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        triggerAlerts(d, forecast);
      }
    });
  }
}

function triggerAlerts(d, forecast) {
  // 1. Storm Warning
  const isStorm = d.weather.some(w => w.id >= 200 && w.id < 300);
  if (isStorm) {
    showNotification('⛈️ Storm Warning', `Thunderstorms detected in ${d.name}. Stay safe indoors!`);
  }

  // 2. High UV Alert (simulated check based on current weather/clouds)
  // Since OWM free standard UV requires secondary call, we look at sunny sky and cloud cover
  const isSunnyClear = d.weather.some(w => w.id === 800);
  if (isSunnyClear && d.clouds.all < 10) {
    showNotification('☀️ High UV Alert', `High UV index expected under clear skies in ${d.name}. Apply sunscreen!`);
  }

  // 3. Rain Warning (next 3 hours)
  const nextForecast = forecast.list[0];
  if (nextForecast && (nextForecast.weather.some(w => w.id >= 500 && w.id < 600) || nextForecast.pop > 0.4)) {
    showNotification('🌧️ Precipitation Alert', `Rain expected soon in ${d.name}. Carry an umbrella!`);
  }
}

function showNotification(title, body) {
  try {
    new Notification(title, {
      body,
      icon: '🌤️'
    });
  } catch (err) {
    console.error('Failed to show notification', err);
  }
}

// ===== AI WEATHER ASSISTANT CHAT LOGIC =====
function toggleAiChat() {
  const container = $('aiChatContainer');
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) {
    $('aiChatInput').focus();
    scrollChatToBottom();
  }
}

async function handleAiChatSubmit(e) {
  e.preventDefault();
  const inputEl = $('aiChatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  // Append user message
  appendChatMessage('user', text);
  inputEl.value = '';

  // Append loading indicator
  const loadingId = appendChatMessage('bot', '🤖 SkyPulse AI is thinking...');

  try {
    const res = await fetch(`${BACKEND_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: text,
        weatherData: currentData
      })
    });
    
    // Remove loading indicator
    $(loadingId).remove();

    if (res.ok) {
      const data = await res.json();
      appendChatMessage('bot', data.response);
    } else {
      appendChatMessage('bot', 'Sorry, I hit a server snag trying to think. 🤖💔');
    }
  } catch (err) {
    $(loadingId).remove();
    appendChatMessage('bot', 'Network error. Please make sure your server is running! 🌐❌');
  }
}

let messageCounter = 0;
function appendChatMessage(sender, text) {
  messageCounter++;
  const id = `msg-${messageCounter}`;
  const logContainer = $('aiChatLogs');

  // Hide initial chips when conversation starts
  const chips = logContainer.querySelector('.chat-chips');
  if (chips) chips.style.display = 'none';

  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = `chat-message ${sender}`;
  msgDiv.textContent = text;
  
  logContainer.appendChild(msgDiv);
  scrollChatToBottom();
  return id;
}

function scrollChatToBottom() {
  const logContainer = $('aiChatLogs');
  logContainer.scrollTop = logContainer.scrollHeight;
}
