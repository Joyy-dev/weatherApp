const API_KEY = "1c258ee49ca8c8ecb7230904408d0817";

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

let currentUnit = unitSelect.value || "metric";
let forecastData = null;
let availableDays = [];

function toLocalDate(ts, tzOffsetSeconds = 0) {
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


function groupForecastByDay(list, tzOffsetSeconds = 0) {
  const map = {};
  list.forEach(item => {
    const d = toLocalDate(item.dt, tzOffsetSeconds);
    const key = d.getDay();
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  Object.keys(map).forEach(k => {
    map[k].sort((a, b) => a.dt - b.dt);
  });
  return map;
}

function getDailySummary(map, tzOffsetSeconds = 0) {
  const todayIdx = toLocalDate(Math.floor(Date.now() / 1000), tzOffsetSeconds).getDay();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const idx = (todayIdx + i) % 7;
    if (map[idx]) {
      const temps = map[idx].map(it => it.main.temp);
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      const mid = map[idx][Math.floor(map[idx].length / 2)];
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

function renderMainCard(cityObj, firstEntry) {
  const tz = cityObj.timezone || 0;
  cityName.textContent = `${cityObj.name}, ${cityObj.country}`;
  dateText.textContent = toLocalDate(firstEntry.dt, tz).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  descText.textContent = firstEntry.weather[0].description;
  tempText.textContent = `${Math.round(firstEntry.main.temp)}°${currentUnit === 'metric' ? 'C' : 'F'}`;
  weatherIcon.src = iconUrl(firstEntry.weather[0].icon);

  feelsText.textContent = `${Math.round(firstEntry.main.feels_like)}°`;
  humidityText.textContent = `${firstEntry.main.humidity}%`;
  windText.textContent = `${Math.round(firstEntry.wind.speed)} ${currentUnit === 'metric' ? 'm/s' : 'mph'}`;
  const precipAmt = (firstEntry.rain && firstEntry.rain["3h"]) || (firstEntry.snow && firstEntry.snow["3h"]) || 0;
  precipText.textContent = `${precipAmt} mm`;

  const sunrise = new Date(cityObj.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(cityObj.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById("sunriseText").textContent = `🌅 ${sunrise}`;
  document.getElementById("sunsetText").textContent = `🌇 ${sunset}`;
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
      daySelect.value = s.dayIndex;
      renderHourly(s.dayIndex);
      document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
      div.classList.add('active');
    });
    dailyCards.appendChild(div);
  });
}

function populateDaySelect(summaries) {
  daySelect.innerHTML = "";
  summaries.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.dayIndex;
    opt.textContent = s.label;
    daySelect.appendChild(opt);
  });
  if (summaries.length) {
    daySelect.value = summaries[0].dayIndex;
  }
}

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


let weeklyChart = null;
function renderWeeklyChart(summaries) {
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  const labels = summaries.map(s => s.label);
  const tempsMax = summaries.map(s => s.max);
  const tempsMin = summaries.map(s => s.min);

  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Max Temp (°)",
          data: tempsMax,
          borderColor: "#ff6384",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
          tension: 0.4,
          fill: true
        },
        {
          label: "Min Temp (°)",
          data: tempsMin,
          borderColor: "#36a2eb",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#fff", font: 13 } }
      },
      scales: {
        x: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)" } },
        y: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)", lineWidth: 1 } }
      }
    }
  });
}


let forecastTimezone = 0;

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
  if (!data || !data.city || !data.list) return;
  forecastTimezone = data.city.timezone || 0;
  forecastData = groupForecastByDay(data.list, forecastTimezone);
  const summaries = getDailySummary(forecastData, forecastTimezone);
  availableDays = summaries.map(s => s.dayIndex);

  renderMainCard(data.city, data.list[0]);
  renderDailyCards(summaries);
  populateDaySelect(summaries);
  renderWeeklyChart(summaries); // ✅ NEW LINE

  const defaultDay = summaries.length ? summaries[0].dayIndex : toLocalDate(Math.floor(Date.now() / 1000), forecastTimezone).getDay();
  renderHourly(defaultDay);
  document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
  const selCard = document.querySelector(`.daily-card[data-day-index="${defaultDay}"]`) || document.querySelector('.daily-card');
  if (selCard) selCard.classList.add('active');
}


searchBtn.addEventListener('click', async () => {
  const val = cityInput.value.trim();
  if (!val) return;
  try {
    const data = await fetchForecastByCity(val, currentUnit);
    await loadForecast(data);
  } catch (e) {
    alert('City not found or API error');
  }
});

unitSelect.addEventListener('change', async () => {
  currentUnit = unitSelect.value;
  const cityText = cityName.textContent.split(',')[0];
  if (cityText && cityText !== "Loading...") {
    const data = await fetchForecastByCity(cityText, currentUnit);
    await loadForecast(data);
  }
});

daySelect.addEventListener('change', () => {
  const idx = parseInt(daySelect.value, 10);
  renderHourly(idx);
  document.querySelectorAll('.daily-card').forEach(c => c.classList.remove('active'));
  const clicked = document.querySelector(`.daily-card[data-day-index="${idx}"]`);
  if (clicked) clicked.classList.add('active');
});


async function initByGeolocation() {
  if (!navigator.geolocation) {
    const data = await fetchForecastByCity('Berlin', currentUnit);
    return loadForecast(data);
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    const data = await fetchForecastByCoords(latitude, longitude, currentUnit);
    await loadForecast(data);
  }, async () => {
    const data = await fetchForecastByCity('Berlin', currentUnit);
    await loadForecast(data);
  });
}

window.addEventListener('load', () => {
  currentUnit = unitSelect.value || 'metric';
  initByGeolocation();
});

document.addEventListener("DOMContentLoaded", () => {
  const chatbotIcon = document.getElementById("chatbot-icon");
  const chatbotWindow = document.getElementById("chatbot-window");
  const chatbotMessages = document.getElementById("chatbot-messages");
  const chatbotInput = document.getElementById("chatbot-input");
  const chatbotSend = document.getElementById("chatbot-send");

  chatbotIcon.addEventListener("click", () => {
    chatbotWindow.style.display = chatbotWindow.style.display === "none" ? "block" : "none";
  });

  chatbotSend.addEventListener("click", sendMessage);
  chatbotInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  function appendMessage(sender, text) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chatbot-message");
    messageDiv.classList.add(sender === "You" ? "user" : "bot");
    messageDiv.innerHTML = `<p>${text}</p>`;
    chatbotMessages.appendChild(messageDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  async function sendMessage() {
    const userMessage = chatbotInput.value.trim();
    if (!userMessage) return;

    appendMessage("You", userMessage);
    chatbotInput.value = "";

    const botReply = await generateBotReply(userMessage);
    appendMessage("Weather Assistance", botReply);
  }
});

async function generateBotReply(message) {
  const cityMatch = message.match(/in\s([a-zA-Z\s]+)/i);
  const city = cityMatch ? cityMatch[1].trim() : null;

  if (message.toLowerCase().includes("what should i wear")) {
    return "If it's sunny, wear light clothes. If it's raining, grab a jacket 🌦️";
  }

  if (city) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.cod !== 200) return `Sorry, I couldn't find weather info for ${city}.`;

      const desc = data.weather[0].description;
      const temp = data.main.temp;

      if (temp > 30) return `It's ${temp}°C and ${desc} in ${city}. Stay cool 😎`;
      if (temp < 15) return `It's ${temp}°C and ${desc} in ${city}. You should wear something warm 🧥`;
      return `In ${city}, it's ${temp}°C with ${desc}.`;
    } catch {
      return "Sorry, I had trouble fetching the weather data.";
    }
  }

  return "Ask me about the weather! For example: 'What's the weather in Berlin?'";
}
