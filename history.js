const chartCanvas = document.getElementById("historyChart");
const chartCtx = chartCanvas.getContext("2d");

function getUsers() {
  return JSON.parse(localStorage.getItem("counter_users") || "{}");
}

function getCurrentUser() {
  return localStorage.getItem("counter_current_user");
}

function goBack() {
  window.location.href = "index.html";
}

function renderHistoryPage() {
  const users = getUsers();
  const currentUser = getCurrentUser();

  if (!currentUser || !users[currentUser]) {
    alert("No logged in user found.");
    window.location.href = "index.html";
    return;
  }

  const data = users[currentUser];
  const clickHistory = data.clickHistory || {};
  const labels = Object.keys(clickHistory).sort();
  const values = labels.map(date => clickHistory[date]);

  document.getElementById("totalClicks").textContent = values.reduce((a, b) => a + b, 0);
  document.getElementById("currentCount").textContent = data.count || 0;
  document.getElementById("activeDays").textContent = labels.length;

  drawChart(labels, values);
}

function drawChart(labels, values) {
  chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  chartCtx.fillStyle = "#f8fafc";
  chartCtx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);

  if (!labels.length) {
    chartCtx.fillStyle = "#64748b";
    chartCtx.font = "20px Arial";
    chartCtx.textAlign = "center";
    chartCtx.fillText("No history yet", chartCanvas.width / 2, chartCanvas.height / 2);
    return;
  }

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 70;
  const chartWidth = chartCanvas.width - paddingLeft - paddingRight;
  const chartHeight = chartCanvas.height - paddingTop - paddingBottom;
  const maxValue = Math.max(...values, 1);
  const barCount = values.length;
  const gap = 18;
  const barWidth = Math.max(28, (chartWidth - gap * (barCount - 1)) / barCount);
  const totalBarArea = barWidth * barCount + gap * (barCount - 1);
  const startX = paddingLeft + Math.max(0, (chartWidth - totalBarArea) / 2);

  chartCtx.strokeStyle = "#94a3b8";
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(paddingLeft, paddingTop);
  chartCtx.lineTo(paddingLeft, paddingTop + chartHeight);
  chartCtx.lineTo(chartCanvas.width - paddingRight, paddingTop + chartHeight);
  chartCtx.stroke();

  chartCtx.fillStyle = "#64748b";
  chartCtx.font = "12px Arial";
  chartCtx.textAlign = "right";

  for (let i = 0; i <= 4; i++) {
    const value = Math.round((maxValue / 4) * i);
    const y = paddingTop + chartHeight - (chartHeight / 4) * i;

    chartCtx.fillText(value, paddingLeft - 10, y + 4);

    chartCtx.strokeStyle = "#e2e8f0";
    chartCtx.beginPath();
    chartCtx.moveTo(paddingLeft, y);
    chartCtx.lineTo(chartCanvas.width - paddingRight, y);
    chartCtx.stroke();
  }

  values.forEach((value, index) => {
    const x = startX + index * (barWidth + gap);
    const barHeight = (value / maxValue) * chartHeight;
    const y = paddingTop + chartHeight - barHeight;

    chartCtx.fillStyle = "#2563eb";
    chartCtx.fillRect(x, y, barWidth, barHeight);

    chartCtx.fillStyle = "#0f172a";
    chartCtx.font = "12px Arial";
    chartCtx.textAlign = "center";
    chartCtx.fillText(value, x + barWidth / 2, y - 8);

    const shortLabel = labels[index].slice(5);
    chartCtx.fillStyle = "#475569";
    chartCtx.fillText(shortLabel, x + barWidth / 2, paddingTop + chartHeight + 18);
  });
}

renderHistoryPage();