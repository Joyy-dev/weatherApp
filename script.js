/* ------------- CONFIG -------------- */
/* Replace with your OpenWeather API key */
const API_KEY = "1c258ee49ca8c8ecb7230904408d0817";

/* Elements */
const unitSelect = document.getElementById("unitSelect");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");

const cityName = document.getElementById("cityName");
const dateText = document.getElementById("dateText");
const descText = document.getElementById("descText");
const tempText = document.getElementById("tempText");
const weatherIcon = document.getElementById("weatherIcon");

const feelsText = document.getElementById("feelsText");
const humidityText = document.getElementById("humidityText");
const windText = document.getElementById("windText");
const precipText = document.getElementById("precipText");

const dailyCards = document.getElementById("dailyCards");
const daySelect = document.getElementById("daySelect");
const hourlyList = document.getElementById("hourlyList");

/* runtime state */
let currentUnit = unitSelect.value || "metric";
let forecastData = null; // raw API data grouped by dayIndex -> array of entries
let availableDays = [];  // ordered dayIndices shown in UI

/* ---------- helpers ---------- */
function toLocalDate(ts, tzOffsetSeconds = 0) {
  // ts is Unix seconds; tzOffsetSeconds from API (city.timezone)
  return new Date((ts + tzOffsetSeconds) * 1000);
}
function weekdayName(dateObj) {
  return dateObj.toLocaleDateString(undefined, { weekday: "short" });
}
function hourLabel(dateObj) {
  return dateObj.getHours() + ":00";
}
function iconUrl(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

/* ---------- data processing ---------- */
function groupForecastByDay(list, tzOffsetSeconds = 0) {
  // returns map: dayIndex (0..6 relative to local week day) -> array of items
  const map = {};
  list.forEach(item => {
    const d = toLocalDate(item.dt, tzOffsetSeconds);
    const key = d.getDay(); // 0..6
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  // sort each day's entries by dt ascending
  Object.keys(map).forEach(k => {
    map[k].sort((a,b) => a.dt - b.dt);
  });
  return map;
}

function getDailySummary(map, tzOffsetSeconds = 0) {
  // return an array of summaries ordered by nearest day first (today -> next)
  const todayIdx = toLocalDate(Math.floor(Date.now()/1000), tzOffsetSeconds).getDay();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const idx = (todayIdx + i) % 7;
    if (map[idx]) {
      // compute min/max from that day's entries
      const temps = map[idx].map(it => it.main.temp);
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      // pick mid-day icon from the middle item
      const mid = map[idx][Math.floor(map[idx].length/2)];
      days.push({
        dayIndex: idx,
        label: weekdayName(toLocalDate(mid.dt, tzOffsetSeconds)),
        min: Math.round(min),
        max: Math.round(max),
        icon: mid.weather[0].icon
      });
    }
  }
  return days;
}

/* ---------- UI renderers ---------- */
function renderMainCard(cityObj, firstEntry) {
  const tz = cityObj.timezone || 0;
  cityName.textContent = `${cityObj.name}, ${cityObj.country}`;
  dateText.textContent = toLocalDate(firstEntry.dt, tz).toLocaleString(undefined, { weekday: 'long', month:'short', day:'numeric', year:'numeric' });
  descText.textContent = firstEntry.weather[0].description;
  tempText.textContent = `${Math.round(firstEntry.main.temp)}°${currentUnit === 'metric' ? 'C' : 'F'}`;
  weatherIcon.src = iconUrl(firstEntry.weather[0].icon);

  feelsText.textContent = `${Math.round(firstEntry.main.feels_like)}°`;
  humidityText.textContent = `${firstEntry.main.humidity}%`;
  windText.textContent = `${Math.round(firstEntry.wind.speed)} ${currentUnit === 'metric' ? 'm/s' : 'mph'}`;
  // precipitation: openweather forecast gives pop (probability); precipitation amount may be in rain or snow fields
  const precipAmt = (firstEntry.rain && firstEntry.rain["3h"]) || (firstEntry.snow && firstEntry.snow["3h"]) || 0;
  precipText.textContent = `${precipAmt} mm`;
}

function renderDailyCards(summaries) {
  dailyCards.innerHTML = "";
  summaries.forEach(s => {
    const div = document.createElement("div");
    div.className = "daily-card";
    div.dataset.dayIndex = s.dayIndex;
    div.innerHTML = `
      <div class="day">${s.label}</div>
      <div class="icon"><img src="${iconUrl(s.icon)}" width="36" height="36" alt=""></div>
      <div class="temps">${s.max}° / ${s.min}°</div>
    `;
    div.addEventListener("click", () => {
      // switch day in dropdown and render hourly
      daySelect.value = s.dayIndex;
      renderHourly(s.dayIndex);
      // highlight clicked card
      document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
      div.classList.add('active');
    });
    dailyCards.appendChild(div);
  });
}

/* populate daySelect options (ordered) */
function populateDaySelect(summaries) {
  daySelect.innerHTML = "";
  summaries.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.dayIndex;
    opt.textContent = s.label;
    daySelect.appendChild(opt);
  });
  // set value to first day's index by default
  if (summaries.length) {
    daySelect.value = summaries[0].dayIndex;
  }
}

/* hourly rows */
function renderHourly(dayIndex) {
  if (!forecastData) return;
  const items = forecastData[dayIndex] || [];
  hourlyList.innerHTML = "";
  if (!items.length) {
    hourlyList.innerHTML = `<div class="hour-row">No hourly data for this day</div>`;
    return;
  }

  items.forEach(it => {
    const d = toLocalDate(it.dt, forecastTimezone);
    const row = document.createElement("div");
    row.className = "hour-row";
    row.innerHTML = `
      <div class="left"><div class="time">${hourLabel(d)}</div></div>
      <div class="center"><img src="${iconUrl(it.weather[0].icon)}" alt="" /></div>
      <div class="temp">${Math.round(it.main.temp)}°</div>
    `;
    hourlyList.appendChild(row);
  });
}

/* ---------- API + flow ---------- */
let forecastTimezone = 0; // seconds offset from UTC (from city.timezone)

async function fetchForecastByCoords(lat, lon, unit = 'metric') {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${unit}&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch forecast");
  return res.json();
}

async function fetchForecastByCity(city, unit = 'metric') {
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=${unit}&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("City not found");
  return res.json();
}

async function loadForecast(data) {
  // data: response from forecast endpoint
  if (!data || !data.city || !data.list) return;
  forecastTimezone = data.city.timezone || 0;
  // group by day
  forecastData = groupForecastByDay(data.list, forecastTimezone);
  // produce summaries in order (today..)
  const summaries = getDailySummary(forecastData, forecastTimezone);
  availableDays = summaries.map(s => s.dayIndex);

  // render UI
  renderMainCard(data.city, data.list[0]);
  renderDailyCards(summaries);
  populateDaySelect(summaries);

  // set hourly for selected day
  const defaultDay = summaries.length ? summaries[0].dayIndex : toLocalDate(Math.floor(Date.now()/1000), forecastTimezone).getDay();
  renderHourly(defaultDay);
  // highlight corresponding daily card
  document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
  const selCard = document.querySelector(`.daily-card[data-day-index="${defaultDay}"]`) || document.querySelector('.daily-card');
  if (selCard) selCard.classList.add('active');
}

/* ---------- events ---------- */
// search
searchBtn.addEventListener('click', async () => {
  const val = cityInput.value.trim();
  if (!val) return;
  try {
    const data = await fetchForecastByCity(val, currentUnit);
    await loadForecast(data);
  } catch (e) {
    alert('City not found or API error');
    console.error(e);
  }
});

// unit toggle
unitSelect.addEventListener('change', async () => {
  currentUnit = unitSelect.value;
  // refresh with last known location/city: pick cityText
  const cityText = cityName.textContent.split(',')[0];
  try {
    if (cityText && cityText !== "Loading...") {
      const data = await fetchForecastByCity(cityText, currentUnit);
      await loadForecast(data);
    } else {
      // fallback to geolocate
      await initByGeolocation();
    }
  } catch (e) {
    console.error(e);
  }
});

// day select change
daySelect.addEventListener('change', () => {
  const idx = parseInt(daySelect.value, 10);
  renderHourly(idx);
  // highlight day card
  document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
  const clicked = document.querySelector(`.daily-card[data-day-index="${idx}"]`);
  if (clicked) clicked.classList.add('active');
});

/* ---------- geolocation / init ---------- */
async function initByGeolocation() {
  if (!navigator.geolocation) {
    // fallback: load Berlin
    try {
      const data = await fetchForecastByCity('Berlin', currentUnit);
      await loadForecast(data);
    } catch(e){ console.error(e); }
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const data = await fetchForecastByCoords(latitude, longitude, currentUnit);
      await loadForecast(data);
    } catch (e) {
      console.error(e);
    }
  }, async (err) => {
    // permission denied or other -> fallback to Berlin
    try {
      const data = await fetchForecastByCity('Berlin', currentUnit);
      await loadForecast(data);
    } catch(e){ console.error(e); }
  }, { maximumAge: 600000, timeout: 10000 });
}

/* ---------- start ---------- */
window.addEventListener('load', () => {
  // initial unit from select
  currentUnit = unitSelect.value || 'metric';
  initByGeolocation();
});

async function getWeatherReply(message) {
  try {
    const cityMatch = message.match(/in\s([a-zA-Z\s]+)/i);
    const city = cityMatch ? cityMatch[1].trim() : null;
    if (!city) return "Please ask like 'What's the weather in Berlin?' 🌦️";

    const units = (typeof currentUnit !== 'undefined') ? currentUnit : 'metric';
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || data.cod !== 200) return `I couldn't find weather info for ${city}. Try another city.`;

    const temp = data.main.temp;
    const condition = data.weather[0].description;
    const feels = data.main.feels_like;
    const unitSymbol = units === 'metric' ? '°C' : '°F';

    return `In ${city}, it's currently ${temp}${unitSymbol} with ${condition}. Feels like ${feels}${unitSymbol}. 🌤️`;
  } catch (err) {
    console.error(err);
    return "Sorry, I couldn't fetch the weather right now 😕.";
  }
}


document.addEventListener("DOMContentLoaded", () => {
  const chatbotIcon = document.getElementById("chatbot-icon");
  const chatbotWindow = document.getElementById("chatbot-window");
  const chatbotMessages = document.getElementById("chatbot-messages");
  const chatbotInput = document.getElementById("chatbot-input");
  const chatbotSend = document.getElementById("chatbot-send");

  // Toggle chatbot window
  chatbotIcon.addEventListener("click", () => {
    chatbotWindow.style.display =
      chatbotWindow.style.display === "none" ? "block" : "none";
  });

  // Send message function
  chatbotSend.addEventListener("click", sendMessage);
  chatbotInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  function sendMessage() {
    const userMessage = chatbotInput.value.trim();
    if (!userMessage) return;

    // Display user message
    appendMessage("You", userMessage);
    chatbotInput.value = "";

    // Simulate AI response
    setTimeout(() => {
      const botReply = generateBotReply(userMessage);
      appendMessage("Weather Assistance", botReply);
    }, 800);
  }

  function appendMessage(sender, text) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("chatbot-message");
  
  if (sender === "You") {
    messageDiv.classList.add("user-message");
  } else {
    messageDiv.classList.add("chatbot-message");
  }

  messageDiv.innerHTML = `<p>${text}</p>`;
  chatbotMessages.appendChild(messageDiv);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}


  function generateBotReply(message) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes("weather")) {
      return "You can search for any city above to get the latest weather 🌤️";
    } else if (lowerMsg.includes("hi") || lowerMsg.includes("hello")) {
      return "Hey there! 👋 How’s the weather looking for you today?";
    } else {
      return "I'm still learning! Try asking about the weather 😊";
    }
  }
});

