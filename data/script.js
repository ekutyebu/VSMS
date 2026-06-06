// Global variables
let gateway = `ws://${window.location.hostname}/ws`;
// Fallback for local desktop mock server testing
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname) {
    gateway = `ws://${window.location.host || 'localhost:3000'}/ws`;
}

let websocket;
let patientInfo = {};
let map = null;
let mapMarker = null;
let historicalLogs = [];

// Chart instances
let hrChart = null;
let spo2Chart = null;
let tempChart = null;
let bpChart = null;
let miniEcgChart = null;
let largeEcgChart = null;

// ECG Drawing Queues
let ecgQueue = [];
const MAX_ECG_POINTS = 200; // 4 seconds at 50Hz
const VITAL_HISTORY_LIMIT = 30; // Store last 30 points of vitals (approx 30s)

// State tracking
let activeSection = 'home';
let currentAlertLevel = 0;
let lastAlertPlayedMs = 0;

// Initialize on page load
window.addEventListener('load', () => {
    initNavigation();
    initCharts();
    initMap();
    fetchPatientInfo();
    connectWebSocket();
    
    // Restore active tab from localStorage on page load
    const savedTab = localStorage.getItem('activeTab') || 'home';
    switchSection(savedTab);
    
    // Connect form listener
    document.getElementById('patient-form').addEventListener('submit', savePatientInfo);
    document.getElementById('report-form').addEventListener('submit', generateReport);
    
    // Start ECG sweep loop (plots one buffered ECG point every 20ms to achieve a smooth 50Hz trace)
    setInterval(updateECGTrace, 20);
    
    // Update header time
    setInterval(updateHeaderTime, 1000);
});

// Update the clock in the top header
function updateHeaderTime() {
    const clockText = document.getElementById('header-time');
    const now = new Date();
    clockText.innerText = now.toTimeString().split(' ')[0];
}

// 1. NAVIGATION TAB CONTROL
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            switchSection(target);
        });
    });
}

function switchSection(targetId) {
    activeSection = targetId;
    localStorage.setItem('activeTab', targetId);
    
    // Update active nav class
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-target') === targetId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Toggle section visibility
    document.querySelectorAll('.content-section').forEach(sec => {
        if (sec.id === `sec-${targetId}`) {
            sec.classList.remove('hidden');
        } else {
            sec.classList.add('hidden');
        }
    });
    
    // Update Header Text
    const titleText = document.getElementById('page-title');
    const subtitleText = document.getElementById('page-subtitle');
    
    switch (targetId) {
        case 'home':
            titleText.innerText = "Dashboard Overview";
            subtitleText.innerText = "Real-time health status indicator";
            if (map) map.invalidateSize(); // Force leaflet redraw
            break;
        case 'patient':
            titleText.innerText = "Patient Information";
            subtitleText.innerText = "Manage patient identifiers and emergency lines";
            break;
        case 'live':
            titleText.innerText = "Live Telemetry Vitals";
            subtitleText.innerText = "Real-time parameters with history charts";
            break;
        case 'ecg':
            titleText.innerText = "ECG Waveform Monitor";
            subtitleText.innerText = "High-frequency visual cardiac signal";
            break;
        case 'history':
            titleText.innerText = "System Event Database";
            subtitleText.innerText = "Review vital logs from MicroSD storage";
            fetchLogs();
            break;
        case 'reports':
            titleText.innerText = "Medical Report Generator";
            subtitleText.innerText = "Export compiled diagnostics (PDF, CSV, Excel)";
            fetchLogs(); // Ensure data is loaded
            break;
        case 'settings':
            titleText.innerText = "System Settings";
            subtitleText.innerText = "Calibrate devices and simulate alarm triggers";
            break;
    }
}

// 2. WEBSOCKET CONNECTION AND PROCESSOR
function connectWebSocket() {
    console.log(`Connecting WebSocket to ${gateway}...`);
    websocket = new WebSocket(gateway);
    
    const statusDot = document.getElementById('ws-dot');
    const statusText = document.getElementById('ws-status');
    
    websocket.onopen = () => {
        console.log("WebSocket connected.");
        statusDot.className = "status-dot green";
        statusText.innerText = "WebSocket: Online";
        const startBtn = document.getElementById('btn-start-bp');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = "1";
            startBtn.style.pointerEvents = "auto";
        }
    };
    
    websocket.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 2 seconds...");
        statusDot.className = "status-dot gray";
        statusText.innerText = "WebSocket: Offline (Retrying...)";
        const startBtn = document.getElementById('btn-start-bp');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.style.opacity = "0.5";
            startBtn.style.pointerEvents = "none";
        }
        setTimeout(connectWebSocket, 2000);
    };
    
    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleTelemetry(data);
    };
    
    websocket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };
}

// 3. TELEMETRY HANDLER
function handleTelemetry(t) {
    // 3.1 Update General widgets and state
    document.getElementById('header-time').innerText = t.datetimeStr.split(' ')[1] || "12:00:00";
    
    // Status Pill
    const statusPill = document.getElementById('system-status-pill');
    currentAlertLevel = t.systemAlertLevel;
    
    if (t.systemAlertLevel === 2) {
        statusPill.className = "widget shadow-card border-critical bg-critical text-white";
        statusPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation animate-pulse"></i> <span>CRITICAL ALARM</span>`;
        triggerBannerAlert(true, "CRITICAL PARAMETERS EXCEEDED!", "Patient vital signs are currently beyond safe physiological limits. Immediate assistance required.");
        playAlarmSound();
    } else if (t.systemAlertLevel === 1) {
        statusPill.className = "widget shadow-card border-warning bg-warning text-black";
        statusPill.innerHTML = `<i class="fa-solid fa-circle-exclamation text-black"></i> <span>WARNING ACTIVE</span>`;
        triggerBannerAlert(true, "Warning Limits Met", "Some vitals are hovering in warning thresholds. Please monitor carefully.");
    } else {
        statusPill.className = "widget shadow-card border-normal text-green";
        statusPill.innerHTML = `<i class="fa-solid fa-shield-heart text-green"></i> <span>SYSTEM NORMAL</span>`;
        triggerBannerAlert(false);
    }
    
    // WiFi Status
    const wifiPillText = document.getElementById('wifi-pill-text');
    wifiPillText.innerText = t.wifiConnected ? "WiFi Connected" : "Access Point Mode";
    
    // SD Card Status
    const sdPillText = document.getElementById('sd-pill-text');
    const sdPillIcon = document.getElementById('sd-pill-icon');
    if (t.sdReady) {
        sdPillText.innerText = "SD Card: Ready";
        sdPillIcon.className = "fa-solid fa-sd-card text-green";
    } else {
        sdPillText.innerText = "SD Card: Error";
        sdPillIcon.className = "fa-solid fa-sd-card text-muted";
    }
    
    // 3.2 Update Home View Vitals
    document.getElementById('home-hr').innerText = Math.round(t.heartRate) || "--";
    document.getElementById('home-spo2').innerText = Math.round(t.spo2) || "--";
    document.getElementById('home-temp').innerText = t.tempC ? t.tempC.toFixed(1) : "--";
    document.getElementById('home-bp').innerText = `${t.bpSystolic}/${t.bpDiastolic}${t.bpMAP ? ' (' + t.bpMAP + ')' : ''}`;
    
    // 3.3 Update Live View Panels & Glows
    updateVitalCard('hr', Math.round(t.heartRate), t.systemAlertLevel);
    updateVitalCard('spo2', Math.round(t.spo2), t.systemAlertLevel);
    updateVitalCard('temp', t.tempC, t.systemAlertLevel);
    updateVitalCard('bp', `${t.bpSystolic}/${t.bpDiastolic}`, t.systemAlertLevel);
    
    // Specific vital labels and averages
    document.getElementById('live-hr').innerText = Math.round(t.heartRate) || "--";
    document.getElementById('live-hr-min').innerText = Math.round(t.minHeartRate) || "--";
    document.getElementById('live-hr-max').innerText = Math.round(t.maxHeartRate) || "--";
    document.getElementById('live-hr-avg').innerText = Math.round(t.avgHeartRate) || "--";
    
    document.getElementById('live-spo2').innerText = Math.round(t.spo2) || "--";
    document.getElementById('live-temp').innerText = t.tempC ? t.tempC.toFixed(1) : "--";
    document.getElementById('live-temp-f').innerText = t.tempF ? t.tempF.toFixed(1) + " °F" : "--";
    
    // Blood Pressure states toggling and data values
    const bpIdleView = document.getElementById('bp-idle-view');
    const bpActiveView = document.getElementById('bp-active-view');
    
    if (t.bpState > 0 && t.bpState < 4) {
        // Active measurement view
        if (bpIdleView) bpIdleView.classList.add('hidden');
        if (bpActiveView) bpActiveView.classList.remove('hidden');
        
        document.getElementById('cuff-pressure').innerText = Math.round(t.bpCuffPressure || 0);
        
        let statusText = "Inflating Cuff...";
        let progress = 0;
        
        if (t.bpState === 1) { // INFLATING
            statusText = `<i class="fa-solid fa-arrow-trend-up text-orange animate-bounce"></i> Inflating Cuff...`;
            progress = Math.round(Math.min(100, ((t.bpCuffPressure || 0) / 160) * 100));
        } else if (t.bpState === 2) { // DEFLATING
            statusText = `<i class="fa-solid fa-arrow-trend-down text-blue animate-pulse"></i> Deflating & Reading Pulses...`;
            progress = Math.round(Math.min(100, Math.max(0, ((160 - (t.bpCuffPressure || 0)) / 135) * 100)));
        } else if (t.bpState === 3) { // PROCESSING
            statusText = `<i class="fa-solid fa-arrows-spin text-red animate-spin"></i> Processing...`;
            progress = 100;
        }
        
        document.getElementById('cuff-status-text').innerHTML = statusText;
        document.getElementById('cuff-progress-text').innerText = progress + '%';
        document.getElementById('cuff-progress-bar').style.width = progress + '%';
    } else {
        // Idle view
        if (bpIdleView) bpIdleView.classList.remove('hidden');
        if (bpActiveView) bpActiveView.classList.add('hidden');
        
        document.getElementById('live-bp').innerText = `${t.bpSystolic}/${t.bpDiastolic}`;
        document.getElementById('live-bp-sys').innerText = t.bpSystolic;
        document.getElementById('live-bp-dia').innerText = t.bpDiastolic;
        document.getElementById('live-bp-map').innerText = t.bpMAP ? t.bpMAP : "--";
        
        // Enable start button since we are connected and idle
        const startBtn = document.getElementById('btn-start-bp');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = "1";
            startBtn.style.pointerEvents = "auto";
        }
    }
    
    // 3.4 Append Vitals Chart Data
    const label = new Date().toLocaleTimeString().split(' ')[0];
    appendChartData(hrChart, label, t.heartRate);
    appendChartData(spo2Chart, label, t.spo2);
    appendChartData(tempChart, label, t.tempC);
    appendChartData(bpChart, label, t.bpSystolic, t.bpDiastolic);
    
    // 3.5 Update GPS location
    if (t.gpsValid) {
        document.getElementById('gps-status-badge').className = "badge text-green";
        document.getElementById('gps-status-badge').innerText = "GPS Fix: Active";
        document.getElementById('map-lat').innerText = t.gpsLatitude.toFixed(6);
        document.getElementById('map-lng').innerText = t.gpsLongitude.toFixed(6);
        document.getElementById('map-gps-time').innerText = t.gpsTimestamp;
        
        updateMapMarker(t.gpsLatitude, t.gpsLongitude);
    } else {
        document.getElementById('gps-status-badge').className = "badge text-muted";
        document.getElementById('gps-status-badge').innerText = "Searching Fix...";
    }
    
    // 3.6 Queue ECG points
    if (!t.ecgLeadsOff && t.ecgBuffer && t.ecgBuffer.length > 0) {
        ecgQueue.push(...t.ecgBuffer);
        document.getElementById('ecg-status-text').className = "indicator-lead";
        document.getElementById('ecg-status-text').innerText = "Leads Status: OK";
        document.getElementById('ecg-leads-badge').className = "badge text-green";
        document.getElementById('ecg-leads-badge').innerText = "CONNECTED";
    } else if (t.ecgLeadsOff) {
        document.getElementById('ecg-status-text').className = "indicator-lead off";
        document.getElementById('ecg-status-text').innerText = "Leads Status: OFF / DETACHED";
        document.getElementById('ecg-leads-badge').className = "badge text-red";
        document.getElementById('ecg-leads-badge').innerText = "LEADS OFF";
        ecgQueue = []; // Clear queue
    }
}

// 4. DYNAMIC CARD LIGHTING GLOWS
function updateVitalCard(id, val, overallAlert) {
    const card = document.getElementById(`vital-card-${id}`);
    const pill = document.getElementById(`${id}-status-pill`);
    if (!card || !pill) return;
    
    let stateClass = "normal-glow";
    let pillText = "Normal";
    let pillClass = "status-indicator-pill normal";
    
    // Map individual warning limits
    if (id === 'hr') {
        const hr = parseFloat(val);
        if (hr < 50 || hr > 120) { stateClass = "critical-glow"; pillText = "Critical"; pillClass = "status-indicator-pill critical"; }
        else if (hr < 60 || hr > 100) { stateClass = "warning-glow"; pillText = "Warning"; pillClass = "status-indicator-pill warning"; }
    } else if (id === 'spo2') {
        const spo2 = parseFloat(val);
        if (spo2 < 90) { stateClass = "critical-glow"; pillText = "Critical"; pillClass = "status-indicator-pill critical"; }
        else if (spo2 < 95) { stateClass = "warning-glow"; pillText = "Warning"; pillClass = "status-indicator-pill warning"; }
    } else if (id === 'temp') {
        const tc = parseFloat(val);
        if (tc > 38.5) { stateClass = "critical-glow"; pillText = "Critical"; pillClass = "status-indicator-pill critical"; }
        else if (tc > 37.5) { stateClass = "warning-glow"; pillText = "Warning"; pillClass = "status-indicator-pill warning"; }
    } else if (id === 'bp') {
        const parts = val.split('/');
        const sys = parseInt(parts[0]);
        const dia = parseInt(parts[1]);
        if (sys >= 180 || dia >= 120) { stateClass = "critical-glow"; pillText = "Critical"; pillClass = "status-indicator-pill critical"; }
        else if (sys >= 140 || dia >= 90) { stateClass = "warning-glow"; pillText = "Warning"; pillClass = "status-indicator-pill warning"; }
    }
    
    card.className = `glass-card vital-card ${stateClass}`;
    pill.className = pillClass;
    pill.innerText = pillText;
}

// 5. BANNER NOTIFICATIONS
function triggerBannerAlert(show, title = "", desc = "") {
    const banner = document.getElementById('alert-banner');
    if (show) {
        document.getElementById('alert-banner-title').innerText = title;
        document.getElementById('alert-banner-desc').innerText = desc;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

function dismissBanner() {
    document.getElementById('alert-banner').classList.add('hidden');
}

function playAlarmSound() {
    const now = Date.now();
    // Only beep browser speaker once every 3 seconds to avoid irritating sound loops
    if (now - lastAlertPlayedMs >= 3000) {
        lastAlertPlayedMs = now;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = "sine";
            osc.frequency.setValueAtTime(950, ctx.currentTime); // High pitch medical alarm
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            // Beep twice
            setTimeout(() => osc.stop(), 300);
            
            setTimeout(() => {
                const osc2 = ctx.createOscillator();
                osc2.type = "sine";
                osc2.frequency.setValueAtTime(950, ctx.currentTime);
                osc2.connect(gain);
                osc2.start();
                setTimeout(() => osc2.stop(), 300);
            }, 500);
            
        } catch (e) {
            console.warn("Audio context blocked by browser policy.");
        }
    }
}

// 6. REAL-TIME CHARTS (CHART.JS)
function initCharts() {
    const gridColor = 'rgba(255, 255, 255, 0.05)';
    const textColor = '#94a3b8';
    
    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 9 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 9 } } }
        },
        elements: { point: { radius: 0 }, line: { tension: 0.3 } }
    };

    // Heart Rate Chart
    hrChart = new Chart(document.getElementById('chart-hr'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#ef4444', borderWidth: 2, fill: false }] },
        options: baseOptions
    });

    // SpO2 Chart
    spo2Chart = new Chart(document.getElementById('chart-spo2'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#3b82f6', borderWidth: 2, fill: false }] },
        options: baseOptions
    });

    // Temp Chart
    tempChart = new Chart(document.getElementById('chart-temp'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#f59e0b', borderWidth: 2, fill: false }] },
        options: baseOptions
    });

    // BP Chart
    bpChart = new Chart(document.getElementById('chart-bp'), {
        type: 'line',
        data: { 
            labels: [], 
            datasets: [
                { data: [], borderColor: '#10b981', borderWidth: 2, label: 'Systolic', fill: false },
                { data: [], borderColor: '#059669', borderWidth: 1.5, label: 'Diastolic', fill: false }
            ] 
        },
        options: {
            ...baseOptions,
            plugins: { legend: { display: true, labels: { color: textColor, font: { size: 8 } } } }
        }
    });

    // Mini ECG Sparkline (Home page)
    miniEcgChart = new Chart(document.getElementById('mini-ecg-chart'), {
        type: 'line',
        data: { 
            labels: Array(MAX_ECG_POINTS).fill(""), 
            datasets: [{ data: Array(MAX_ECG_POINTS).fill(300), borderColor: '#ef4444', borderWidth: 1.5, fill: false }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, min: 100, max: 900 } },
            elements: { point: { radius: 0 }, line: { tension: 0.1 } }
        }
    });

    // Large ECG Chart (ECG page)
    largeEcgChart = new Chart(document.getElementById('large-ecg-chart'), {
        type: 'line',
        data: { 
            labels: Array(MAX_ECG_POINTS).fill(""), 
            datasets: [{ data: Array(MAX_ECG_POINTS).fill(300), borderColor: '#ef4444', borderWidth: 2, fill: false }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                x: { display: false }, 
                y: { 
                    grid: { color: 'rgba(239, 68, 68, 0.08)', borderWidth: 1 }, 
                    ticks: { color: '#ef4444', font: { size: 8 } },
                    min: 100, 
                    max: 900 
                } 
            },
            elements: { point: { radius: 0 }, line: { tension: 0.05 } }
        }
    });
}

function appendChartData(chart, label, val1, val2 = null) {
    if (!chart) return;
    
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(val1);
    
    if (val2 !== null && chart.data.datasets.length > 1) {
        chart.data.datasets[1].data.push(val2);
    }
    
    if (chart.data.labels.length > VITAL_HISTORY_LIMIT) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        if (val2 !== null && chart.data.datasets.length > 1) {
            chart.data.datasets[1].data.shift();
        }
    }
    chart.update('none'); // Update without default sluggish animation
}

// 50Hz ECG Queue sweep plotter
function updateECGTrace() {
    if (ecgQueue.length === 0) return;
    
    const newPoint = ecgQueue.shift();
    
    // Add point to mini ECG chart
    if (miniEcgChart) {
        miniEcgChart.data.datasets[0].data.push(newPoint);
        miniEcgChart.data.datasets[0].data.shift();
        miniEcgChart.update('none');
    }
    
    // Add point to large ECG chart
    if (largeEcgChart && activeSection === 'ecg') {
        largeEcgChart.data.datasets[0].data.push(newPoint);
        largeEcgChart.data.datasets[0].data.shift();
        largeEcgChart.update('none');
    }
}

function resetECGDisplay() {
    if (largeEcgChart) {
        largeEcgChart.data.datasets[0].data.fill(300);
        largeEcgChart.update();
    }
    ecgQueue = [];
}

// 7. PATIENT INFORMATION FORM
function fetchPatientInfo() {
    fetch('/patient.json')
        .then(response => response.json())
        .then(data => {
            patientInfo = data;
            updatePatientFields(data);
        })
        .catch(err => {
            console.warn("Could not load patient.json, using defaults.");
            patientInfo = {
                name: "John Doe",
                age: 45,
                gender: "Male",
                idNumber: "PT-2026-9841",
                emergencyContact: "+1234567890"
            };
            updatePatientFields(patientInfo);
        });
}

function updatePatientFields(p) {
    // Update Home Section Text
    document.getElementById('summary-name').innerText = p.name;
    document.getElementById('summary-age-gender').innerText = `${p.age} years / ${p.gender}`;
    document.getElementById('summary-id').innerText = p.idNumber;
    document.getElementById('summary-contact').innerText = p.emergencyContact;
    
    // Fill Form inputs
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-age').value = p.age;
    document.getElementById('p-gender').value = p.gender;
    document.getElementById('p-id').value = p.idNumber;
    document.getElementById('p-contact').value = p.emergencyContact;
}

function savePatientInfo(e) {
    e.preventDefault();
    
    const info = {
        name: document.getElementById('p-name').value,
        age: parseInt(document.getElementById('p-age').value),
        gender: document.getElementById('p-gender').value,
        idNumber: document.getElementById('p-id').value,
        emergencyContact: document.getElementById('p-contact').value
    };
    
    const msgBox = document.getElementById('patient-save-msg');
    
    fetch('/api/save_patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            patientInfo = info;
            updatePatientFields(info);
            msgBox.className = "message-box success";
            msgBox.innerText = "Patient record successfully saved to ESP32 Flash Memory.";
            msgBox.classList.remove('hidden');
            setTimeout(() => msgBox.classList.add('hidden'), 4000);
        } else {
            throw new Error(data.message || "Failed to write patient file.");
        }
    })
    .catch(err => {
        msgBox.className = "message-box btn-danger";
        msgBox.innerText = `Save Failed: ${err.message}. Running in mock mode.`;
        msgBox.classList.remove('hidden');
        
        // Mock save logic (for local files preview)
        patientInfo = info;
        updatePatientFields(info);
        setTimeout(() => msgBox.classList.add('hidden'), 4000);
    });
}

function resetPatientForm() {
    updatePatientFields(patientInfo);
}

// 8. MAPS AND POSITION INTEGRATION
function initMap() {
    // Fix default marker path resolution by pointing to CDN urls
    if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
    }

    // King's College Hospital default starting center (51.4687, -0.0934)
    const lat = 51.4687;
    const lng = -0.0934;
    
    map = L.map('home-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([lat, lng], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    mapMarker = L.marker([lat, lng]).addTo(map);
    mapMarker.bindPopup("<b>Patient Location</b>").openPopup();
}

function updateMapMarker(lat, lng) {
    if (!map || !mapMarker) return;
    
    const currentLoc = new L.LatLng(lat, lng);
    mapMarker.setLatLng(currentLoc);
    map.panTo(currentLoc);
}

// 9. LOGS RETRIEVAL & HISTORICAL VIEWS
function fetchLogs() {
    const tableBody = document.getElementById('logs-table-body');
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted"><i class="fa-solid fa-spinner animate-spin"></i> Retrieving logs from ESP32 SD Card...</td></tr>`;
    
    fetch('/api/logs')
        .then(res => res.text())
        .then(csv => {
            parseCSVLogs(csv);
            renderLogsTable();
        })
        .catch(err => {
            console.error("Error reading CSV database logs:", err);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-red">Error downloading SD log file. Check connections.</td></tr>`;
        });
}

function parseCSVLogs(csvText) {
    const lines = csvText.trim().split('\n');
    historicalLogs = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const cols = lines[i].split(',');
        if (cols.length < 8) continue;
        
        historicalLogs.push({
            date: cols[0],
            time: cols[1],
            hr: cols[2],
            spo2: cols[3],
            temp: cols[4],
            bp: cols[5],
            ecg: cols[6],
            gps: cols[7]
        });
    }
    // Sort logs descending (newest first)
    historicalLogs.reverse();
}

function renderLogsTable() {
    const tableBody = document.getElementById('logs-table-body');
    
    if (historicalLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No vital signs logs stored in SD database.</td></tr>`;
        return;
    }
    
    let html = "";
    // Display up to 50 rows in page UI
    const renderLimit = Math.min(historicalLogs.length, 50);
    for (let i = 0; i < renderLimit; i++) {
        const row = historicalLogs[i];
        let alertBadge = "green";
        if (row.ecg === "Warning") alertBadge = "yellow";
        else if (row.ecg === "Critical") alertBadge = "red";
        
        html += `
            <tr>
                <td>${row.date}</td>
                <td>${row.time}</td>
                <td><strong>${row.hr}</strong></td>
                <td><strong>${row.spo2}%</strong></td>
                <td>${row.temp}°C</td>
                <td>${row.bp}</td>
                <td><span class="status-dot ${alertBadge}"></span> ${row.ecg}</td>
                <td><span class="text-muted" style="font-size:11px;">${row.gps}</span></td>
            </tr>
        `;
    }
    
    if (historicalLogs.length > 50) {
        html += `<tr><td colspan="8" class="text-center text-muted" style="font-size:11px;">... Showing last 50 logs. View full file in Reports section. ...</td></tr>`;
    }
    
    tableBody.innerHTML = html;
}

function clearLogs() {
    if (confirm("Are you sure you want to permanently erase the MicroSD vital signs log database?")) {
        fetch('/api/clear_logs')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    historicalLogs = [];
                    renderLogsTable();
                    alert("SD logs cleared successfully.");
                }
            })
            .catch(err => {
                console.error("Failed to delete log file:", err);
                alert("Operation failed. Ensure SD card module is online.");
            });
    }
}

// 10. CLINICAL REPORT GENERATION (PDF, CSV, EXCEL)
function generateReport(e) {
    e.preventDefault();
    
    const period = document.getElementById('r-type').value;
    const format = document.getElementById('r-format').value;
    
    if (historicalLogs.length === 0) {
        alert("No logging records found in the database. Add logs or wait for measurements.");
        return;
    }
    
    // Filter records by date/period
    // In our simplified logic, since we have the simulated date we can grab records.
    // We will generate the report for the loaded dataset.
    const filteredData = filterLogsByPeriod(period);
    
    if (filteredData.length === 0) {
        alert(`No data records fall within the selected '${period}' period.`);
        return;
    }
    
    if (format === 'csv') {
        exportCSV(filteredData, period);
    } else if (format === 'xlsx') {
        exportExcel(filteredData, period);
    } else if (format === 'pdf') {
        exportPDF(filteredData, period);
    }
}

function filterLogsByPeriod(period) {
    if (historicalLogs.length === 0) return [];
    
    // In actual setups, we compare log date against current timestamp.
    // For simulation validation, we return all logs or limit them:
    // Daily -> last 60 records, Weekly -> last 420 records, Monthly -> all records.
    if (period === 'daily') {
        return historicalLogs.slice(0, 100);
    } else if (period === 'weekly') {
        return historicalLogs.slice(0, 500);
    }
    return historicalLogs; // Monthly / All
}

function exportCSV(rows, period) {
    let csvContent = "Date,Time,HeartRate(BPM),SpO2(%),Temperature(C),BloodPressure,ECGStatus,GPSLocation\n";
    rows.forEach(r => {
        csvContent += `${r.date},${r.time},${r.hr},${r.spo2},${r.temp},${r.bp},${r.ecg},"${r.gps}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `VitalGuard_Report_${period}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportExcel(rows, period) {
    // Construct worksheet structure
    const data = [
        ["Date", "Time", "Heart Rate (BPM)", "SpO2 (%)", "Temperature (C)", "Blood Pressure", "ECG Status", "GPS Location"]
    ];
    rows.forEach(r => {
        data.push([r.date, r.time, parseInt(r.hr), parseInt(r.spo2), parseFloat(r.temp), r.bp, r.ecg, r.gps]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Vitals Logs");
    
    XLSX.writeFile(wb, `VitalGuard_Report_${period}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportPDF(rows, period) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set colors
    const primaryColor = [11, 15, 25]; // dark blue
    
    // Page Header
    doc.setFillColor(11, 15, 25);
    doc.rect(0, 0, 210, 38, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("VITALGUARD MEDICAL REPORT", 14, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}  |  Period: ${period.toUpperCase()}`, 14, 28);
    
    // Patient Metadata Block
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PATIENT BIODATA", 14, 48);
    doc.line(14, 50, 196, 50);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Full Name: ${patientInfo.name || 'John Doe'}`, 14, 57);
    doc.text(`Age / Gender: ${patientInfo.age || 45} years / ${patientInfo.gender || 'Male'}`, 14, 63);
    doc.text(`ID Number: ${patientInfo.idNumber || 'PT-2026-9841'}`, 110, 57);
    doc.text(`Emergency Line: ${patientInfo.emergencyContact || '+1234567890'}`, 110, 63);
    
    // Calculate aggregate metrics
    const hrs = rows.map(r => parseInt(r.hr)).filter(v => !isNaN(v));
    const spo2s = rows.map(r => parseInt(r.spo2)).filter(v => !isNaN(v));
    const temps = rows.map(r => parseFloat(r.temp)).filter(v => !isNaN(v));
    
    const meanHR = hrs.length ? (hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1) : "N/A";
    const maxHR = hrs.length ? Math.max(...hrs) : "N/A";
    const minHR = hrs.length ? Math.min(...hrs) : "N/A";
    
    const meanSpO2 = spo2s.length ? (spo2s.reduce((a, b) => a + b, 0) / spo2s.length).toFixed(1) : "N/A";
    const minSpO2 = spo2s.length ? Math.min(...spo2s) : "N/A";
    
    const meanTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : "N/A";
    
    // Statistics Table
    doc.setFont("helvetica", "bold");
    doc.text("PHYSIOLOGICAL STATISTICS SUMMARY", 14, 76);
    doc.line(14, 78, 196, 78);
    
    doc.autoTable({
        startY: 82,
        head: [['Vital Parameter', 'Minimum Value', 'Maximum Value', 'Mean Summary']],
        body: [
            ['Heart Rate (BPM)', minHR, maxHR, meanHR],
            ['Oxygen Saturation (SpO2)', `${minSpO2}%`, '100.0%', `${meanSpO2}%`],
            ['Body Temperature (C)', `${temps.length ? Math.min(...temps).toFixed(1) : 'N/A'} C`, `${temps.length ? Math.max(...temps).toFixed(1) : 'N/A'} C`, `${meanTemp} C`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
    });
    
    // History Table
    doc.setFont("helvetica", "bold");
    doc.text("HISTORICAL OBSERVATION RECORDS", 14, doc.lastAutoTable.finalY + 12);
    
    const tableRows = [];
    rows.forEach(r => {
        tableRows.push([r.date, r.time, r.hr, `${r.spo2}%`, `${r.temp}C`, r.bp, r.ecg, r.gps]);
    });
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 16,
        head: [['Date', 'Time', 'HR', 'SpO2', 'Temp', 'BP', 'ECG Status', 'GPS Coordinates']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
    });
    
    doc.save(`VitalGuard_Report_${period}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// 11. TESTING SIMULATION TOGGLES
function setSimLevel(level) {
    console.log(`Requesting simulator toggle to alert level: ${level}`);
    fetch(`/api/toggle_sim?level=${level}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                console.log(`Simulation level verified. Active status: ${level}`);
            }
        })
        .catch(err => {
            console.error("Local simulate set failed. Overriding WebSocket local simulation state.");
            // Send back requests over websocket if connected
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({ requestSimLevel: level }));
            }
        });
}

// 12. BLOOD PRESSURE MEASUREMENT CONTROLS
function startBPMeasurement() {
    console.log("Triggering ESP32 Blood Pressure cuff inflation...");
    fetch('/api/start_bp')
        .catch(() => {});
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ startBP: true }));
    }
}

function cancelBPMeasurement() {
    console.log("Cancelling ESP32 Blood Pressure measurement...");
    fetch('/api/cancel_bp')
        .catch(() => {});
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ cancelBP: true }));
    }
}
