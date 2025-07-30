console.log("DASHBOARD.JS IS RUNNING");

// ----------- CHART SETUP -----------
const usageLabels = Array(6).fill(""); // Will update with timestamps if available
let usageData = Array(6).fill(0);
let odorHistory = Array(20).fill(0);
let tempHistory = Array(20).fill(0);
let humHistory = Array(20).fill(0);

const usageCtx = document.getElementById('usageChart').getContext('2d');
const odorCtx = document.getElementById('odorChart').getContext('2d');
const historyCtx = document.getElementById('historyChart').getContext('2d');
const tempCtx = document.getElementById('tempChart').getContext('2d');
const humCtx = document.getElementById('humChart').getContext('2d');
const logTable = document.getElementById('logTable');
const aiAlert = document.getElementById('aiCleaningAlert');
const sensorAlert = document.getElementById('sensorAlert'); // NEW

// ----------- CHARTS SETUP -----------
const usageChart = new Chart(usageCtx, {
  type: 'line',
  data: {
    labels: usageLabels,
    datasets: [{
      label: 'Usage Count',
      data: usageData,
      fill: false,
      borderColor: 'blue',
      tension: 0.1
    }]
  }
});

const odorChart = new Chart(odorCtx, {
  type: 'bar',
  data: {
    labels: ['Odor Level'],
    datasets: [{
      label: 'Odor (PPM)',
      data: [0],
      backgroundColor: ['green']
    }]
  },
  options: {
    scales: {
      y: { beginAtZero: true, suggestedMax: 500 }
    }
  }
});

const historyChart = new Chart(historyCtx, {
  type: 'line',
  data: {
    labels: Array.from({length: 20}, (_, i) => `-${20 - i}s`),
    datasets: [{
      label: 'Odor History',
      data: odorHistory,
      borderColor: 'orange',
      fill: false,
      tension: 0.2
    }]
  }
});

const tempChart = new Chart(tempCtx, {
  type: 'line',
  data: {
    labels: Array.from({length: 20}, (_, i) => `-${20-i}s`),
    datasets: [{
      label: 'Temp (°C)',
      data: tempHistory,
      borderColor: 'red',
      fill: false,
      tension: 0.2
    }]
  }
});

const humChart = new Chart(humCtx, {
  type: 'line',
  data: {
    labels: Array.from({length: 20}, (_, i) => `-${20-i}s`),
    datasets: [{
      label: 'Humidity (%)',
      data: humHistory,
      borderColor: 'blue',
      fill: false,
      tension: 0.2
    }]
  }
});

// ----------- NOTIFICATION -----------
function showNotification(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// ----------- MAINTENANCE LOG -----------
function logMaintenance(action) {
  const row = logTable.insertRow(1);
  row.insertCell(0).textContent = new Date().toLocaleString();
  row.insertCell(1).textContent = action;
}

// ----------- FETCH & UPDATE DASHBOARD -----------
function updateDashboardData() {
  fetch('http://localhost:5000/api/sensor')
    .then(res => res.json())
    .then(data => {
      if (!data || data.length === 0) return;

      const latest = data[data.length - 1];

      // Usage data (last 6 points)
      usageData = data.slice(-6).map(x => x.usageCount || 0);
      const usageTimestamps = data.slice(-6).map(x => {
        let t = x.timestamp ? new Date(x.timestamp) : new Date();
        return t.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      });
      usageChart.data.labels = usageTimestamps;
      usageChart.data.datasets[0].data = usageData;
      usageChart.update();

      // Odor level
      const odorLevel = latest.odor || 0;
      odorChart.data.datasets[0].data = [odorLevel];
      odorChart.update();

      // Odor history (last 20)
      odorHistory.push(odorLevel);
      if (odorHistory.length > 20) odorHistory.shift();
      historyChart.data.datasets[0].data = odorHistory;
      historyChart.update();

      // Temp & humidity
      const temperature = latest.temperature || 0;
      const humidity = latest.humidity || 0;
      tempHistory.push(temperature);
      if (tempHistory.length > 20) tempHistory.shift();
      humHistory.push(humidity);
      if (humHistory.length > 20) humHistory.shift();
      tempChart.data.datasets[0].data = tempHistory;
      tempChart.update();
      humChart.data.datasets[0].data = humHistory;
      humChart.update();

      // Update info cards
      document.getElementById('tempBox').textContent = `Temperature: ${temperature.toFixed(1)}°C`;
      document.getElementById('humBox').textContent = `Humidity: ${humidity.toFixed(0)}%`;

      // ----------- SENSOR ALERT (Manual Thresholds + LED Control) -----------
      const usageThreshold = 6;
      const odorThreshold = 5;
      const humidityThreshold = 50;
      const lastUsage = usageData[usageData.length-1];

      let sensorNeedsCleaning = false;
      if (
        (lastUsage > usageThreshold) &&
        (odorLevel > odorThreshold) &&
        (humidity > humidityThreshold)
      ) {
        sensorNeedsCleaning = true;
      }

      if (sensorAlert) {
        if (sensorNeedsCleaning) {
          sensorAlert.textContent = "Sensor Alert: Needs Cleaning! (Threshold crossed)";
          sensorAlert.classList.remove('manual-alert-clean');
          sensorAlert.classList.add('manual-alert-needs');
          // Tell backend to turn ON LED
          fetch('http://localhost:5000/api/sensor_alert_led', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({led: true})
          });
        } else {
          sensorAlert.textContent = "Sensor Alert: Cleaned";
          sensorAlert.classList.remove('manual-alert-needs');
          sensorAlert.classList.add('manual-alert-clean');
          // Tell backend to turn OFF LED
          fetch('http://localhost:5000/api/sensor_alert_led', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({led: false})
          });
        }
      }
    })
    .catch((err) => {
      console.error("Failed to fetch sensor data:", err);
    });

  fetchCleaningAlert();
}

// ----------- FETCH AI/ML CLEANING ALERT (AI Status Only) -----------
let lastStatus = "Clean";

function fetchCleaningAlert() {
  fetch('http://localhost:5000/api/command')
    .then(res => res.json())
    .then(cmd => {
      const needsCleaning = cmd.needs_cleaning === true || cmd.needs_cleaning === "true";
      if (!aiAlert) return;

      if (needsCleaning) {
        aiAlert.textContent = "AI Model: Needs Cleaning!";
        aiAlert.classList.remove('ai-alert-clean');
        aiAlert.classList.add('ai-alert-needs');
        if (lastStatus !== "Needs Cleaning") {
          logMaintenance("Needs Cleaning detected (AI)");
          showNotification("Alert: Needs Cleaning! (AI Model)");
          lastStatus = "Needs Cleaning";
        }
      } else {
        aiAlert.textContent = "AI Model: Clean";
        aiAlert.classList.remove('ai-alert-needs');
        aiAlert.classList.add('ai-alert-clean');
        if (lastStatus !== "Clean") {
          logMaintenance("Returned to Clean (AI)");
          showNotification("Toilet is Clean Again. (AI Model)");
          lastStatus = "Clean";
        }
      }
    })
    .catch(() => {
      if (aiAlert) aiAlert.textContent = "AI status: (offline)";
    });
}

// ----------- INITIAL MAINTENANCE LOG ENTRY -----------
logMaintenance("Dashboard started");

// ----------- AUTO REFRESH EVERY 5 SEC -----------
setInterval(updateDashboardData, 5000);
updateDashboardData(); // Initial call

// ----------- DARK MODE TOGGLE AND RESET BUTTON -----------
document.addEventListener('DOMContentLoaded', function () {
  const darkBtn = document.querySelector('.dark-mode-toggle');
  const resetBtn = document.querySelector('.reset-btn');

  if (darkBtn) {
    darkBtn.addEventListener('click', function () {
      document.body.classList.toggle('dark-mode');
      darkBtn.textContent = document.body.classList.contains('dark-mode') ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      fetch('http://localhost:5000/api/reset', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          alert("Reset sent to backend!");
          logMaintenance("Manual Reset performed");
          updateDashboardData(); // Force immediate update after reset
        })
        .catch(() => alert("Failed to send reset command."));
    });
  }
});
