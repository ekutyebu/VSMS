const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// Serve static assets from data folder
const dataPath = path.join(__dirname, '..', 'data');
app.use(express.static(dataPath));

// Active simulation states
let alertLevel = 0; // 0=normal, 1=warning, 2=critical
let simTick = 0;
let hrMin = 999;
let hrMax = 0;
let hrSum = 0;
let hrCount = 0;
let monitorMode = 0; // 0=off, 1=countdown, 2=collecting, 3=continuous
let countdownSeconds = 0;
let collectSeconds = 0;

// API: Save Patient Details
app.post('/api/save_patient', (req, res) => {
    try {
        const patientFilePath = path.join(dataPath, 'patient.json');
        fs.writeFileSync(patientFilePath, JSON.stringify(req.body, null, 2));
        console.log('[Mock Server] Updated patient details saved to patient.json.');
        res.json({ status: 'success' });
    } catch (err) {
        console.error('[Mock Server] Error saving patient file:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// API: Toggle simulation level
app.get('/api/toggle_sim', (req, res) => {
    const level = parseInt(req.query.level);
    if (!isNaN(level) && level >= 0 && level <= 2) {
        alertLevel = level;
        console.log(`[Mock Server] Vitals level toggled to: ${alertLevel}`);
        res.json({ status: 'success', level: alertLevel });
    } else {
        res.status(400).json({ status: 'error', message: 'Invalid level' });
    }
});

// API: Download historical CSV database logs
app.get('/api/logs', (req, res) => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Generate a rich set of logs to allow testing of exports and tables
    let dummyCSV = "Date,Time,BPM,SpO2,Temperature,BloodPressure,ECGStatus,GPSLocation\n";
    
    // Normal readings
    for (let i = 10; i < 45; i++) {
        dummyCSV += `${todayStr},12:${i}:00,${70 + Math.floor(Math.random()*6)},${97 + Math.floor(Math.random()*3)},${(36.4 + Math.random()*0.4).toFixed(1)},118/76,Normal,51.4687,-0.0934\n`;
    }
    // A few warning readings
    for (let i = 45; i < 48; i++) {
        dummyCSV += `${todayStr},12:${i}:00,102,94,37.8,142/92,Warning,51.4691,-0.0928\n`;
    }
    // A critical reading
    dummyCSV += `${todayStr},12:49:00,128,88,38.9,185/122,Critical,51.4695,-0.0922\n`;
    // Recovery
    dummyCSV += `${todayStr},12:50:00,82,96,37.1,128/82,Normal,51.4689,-0.0931\n`;
    
    res.type('text/csv').send(dummyCSV);
});

// API: Clear Logs
app.get('/api/clear_logs', (req, res) => {
    console.log('[Mock Server] Clear logs requested.');
    res.json({ status: 'success' });
});

// API: Start Countdown-Based Vitals Check
app.get('/api/start_single', (req, res) => {
    monitorMode = 1;
    countdownSeconds = 10;
    console.log('[Mock Server] HTTP start_single triggered. Mode: countdown.');
    res.json({ status: 'success', message: 'Single check countdown initiated' });
});

// API: Start Continuous Vitals Monitoring
app.get('/api/start_continuous', (req, res) => {
    monitorMode = 3;
    console.log('[Mock Server] HTTP start_continuous triggered. Mode: continuous.');
    res.json({ status: 'success', message: 'Continuous monitoring started' });
});

// API: Stop Vitals Monitoring
app.get('/api/stop_monitoring', (req, res) => {
    monitorMode = 0;
    countdownSeconds = 0;
    console.log('[Mock Server] HTTP stop_monitoring triggered. Mode: off.');
    res.json({ status: 'success', message: 'Monitoring stopped' });
});

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected.');
    
    // Reset stats
    hrMin = 999;
    hrMax = 0;
    hrSum = 0;
    hrCount = 0;
    
    // Send data stream every 1 second
    const intervalId = setInterval(() => {
        simTick++;
        
        // Countdown/collection state machine
        if (monitorMode === 1) {
            countdownSeconds--;
            if (countdownSeconds <= 0) {
                monitorMode = 2; // Transition to single collect
                collectSeconds = 5; // Collect for 5 seconds
                console.log('[Mock Server] Countdown finished. Collecting vitals snapshot for 5s.');
            }
        } else if (monitorMode === 2) {
            collectSeconds--;
            if (collectSeconds <= 0) {
                monitorMode = 0; // Turn monitoring off
                console.log('[Mock Server] Single vitals collection complete.');
            }
        }
        
        let hr = 72;
        let spo2 = 98.5;
        let temp = 36.6;
        let sys = 118;
        let dia = 76;
        
        // Adjust vitals based on simulation mode
        if (alertLevel === 1) {
            // Warning: high temp, low oxygen, borderline heart rate
            hr = (simTick % 2 === 0) ? 58 : 103;
            spo2 = 93.5 + Math.sin(simTick * 0.1) * 0.5;
            temp = 37.9 + Math.cos(simTick * 0.1) * 0.1;
            sys = 142 + Math.floor(Math.random()*4);
            dia = 91 + Math.floor(Math.random()*2);
        } else if (alertLevel === 2) {
            // Critical
            hr = (simTick % 2 === 0) ? 46 : 132;
            spo2 = 86.5 + Math.sin(simTick * 0.1) * 0.5;
            temp = 39.1 + Math.cos(simTick * 0.1) * 0.2;
            sys = 186 + Math.floor(Math.random()*6);
            dia = 124 + Math.floor(Math.random()*4);
        } else {
            // Normal
            hr = 72 + Math.sin(simTick * 0.1) * 2;
            spo2 = 98.2 + Math.cos(simTick * 0.05) * 0.4;
            if (spo2 > 100) spo2 = 100;
            temp = 36.7 + Math.sin(simTick * 0.05) * 0.1;
            sys = 118 + Math.floor(Math.sin(simTick * 0.1) * 3);
            dia = 76 + Math.floor(Math.cos(simTick * 0.1) * 2);
        }
        
        // Track statistics
        if (hr < hrMin) hrMin = hr;
        if (hr > hrMax) hrMax = hr;
        hrSum += hr;
        hrCount++;
        const hrAvg = hrSum / hrCount;
        
        // Map GPS Location coordinates circling King's College Hospital, London
        const baseLat = 51.4687;
        const baseLng = -0.0934;
        const angle = simTick * 0.01;
        const gpsLat = baseLat + Math.sin(angle) * 0.0008;
        const gpsLng = baseLng + Math.cos(angle) * 0.0012;
        
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];
        
        const telemetry = {
            heartRate: hr,
            avgHeartRate: hrAvg,
            minHeartRate: hrMin,
            maxHeartRate: hrMax,
            spo2: spo2,
            tempC: temp,
            tempF: (temp * 9.0 / 5.0) + 32.0,
            bpSystolic: sys,
            bpDiastolic: dia,
            ecgLeadsOff: false,
            gpsLatitude: gpsLat,
            gpsLongitude: gpsLng,
            gpsValid: true,
            gpsTimestamp: timeStr,
            datetimeStr: `${dateStr} ${timeStr}`,
            systemAlertLevel: alertLevel,
            sdReady: true,
            wifiConnected: true,
            ecgBuffer: generateEcgBuffer(hr),
            monitorMode: monitorMode,
            countdown: countdownSeconds
        };
        
        ws.send(JSON.stringify(telemetry));
    }, 1000);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[WebSocket] Client message received:', data);
            
            if (data.hasOwnProperty('requestSimLevel')) {
                alertLevel = parseInt(data.requestSimLevel);
                console.log(`[WebSocket] Simulation level changed to: ${alertLevel}`);
            }
            if (data.hasOwnProperty('resetStats')) {
                hrMin = 999;
                hrMax = 0;
                hrSum = 0;
                hrCount = 0;
                console.log('[WebSocket] Heart rate stats reset.');
            }
            if (data.hasOwnProperty('startSingle')) {
                monitorMode = 1;
                countdownSeconds = 10;
                console.log('[WebSocket] startSingle command received. Mode: countdown.');
            }
            if (data.hasOwnProperty('startContinuous')) {
                monitorMode = 3;
                console.log('[WebSocket] startContinuous command received. Mode: continuous.');
            }
            if (data.hasOwnProperty('stopMonitoring')) {
                monitorMode = 0;
                countdownSeconds = 0;
                console.log('[WebSocket] stopMonitoring command received. Mode: off.');
            }
        } catch (err) {
            console.error('[WebSocket] Error parsing client message:', err);
        }
    });
    
    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected.');
        clearInterval(intervalId);
    });
});

// Synthetic ECG generator (matches ESP32 mathematically)
function generateEcgBuffer(hr) {
    const samples = 50; // 50 samples per second (50Hz)
    const hz = 50;
    const cycleMs = (60 / hr) * 1000;
    const buffer = [];
    const now = Date.now();
    
    for (let i = 0; i < samples; i++) {
        // Exact timeline offset in ms for each sample point
        const tOffset = now - (samples - i) * (1000 / hz);
        const cycleTime = tOffset % cycleMs;
        const phase = cycleTime / cycleMs;
        
        let val = 300; // Baseline
        
        if (phase < 0.12) {
            // P-wave
            const pPhase = phase / 0.12;
            val = 300 + Math.round(40 * Math.sin(pPhase * Math.PI));
        } else if (phase >= 0.12 && phase < 0.22) {
            val = 300;
        } else if (phase >= 0.22 && phase < 0.25) {
            // Q-wave
            const qPhase = (phase - 0.22) / 0.03;
            val = 300 - Math.round(50 * qPhase);
        } else if (phase >= 0.25 && phase < 0.29) {
            // R-wave
            const rPhase = (phase - 0.25) / 0.04;
            if (rPhase < 0.5) {
                val = 250 + Math.round(1100 * (rPhase * 2.0));
            } else {
                val = 800 - Math.round(1100 * ((rPhase - 0.5) * 2.0));
            }
        } else if (phase >= 0.29 && phase < 0.33) {
            // S-wave
            const sPhase = (phase - 0.29) / 0.04;
            if (sPhase < 0.5) {
                val = 250 - Math.round(200 * (sPhase * 2.0));
            } else {
                val = 150 + Math.round(150 * ((sPhase - 0.5) * 2.0));
            }
        } else if (phase >= 0.33 && phase < 0.42) {
            val = 300;
        } else if (phase >= 0.42 && phase < 0.58) {
            // T-wave
            const tPhase = (phase - 0.42) / 0.16;
            val = 300 + Math.round(90 * Math.sin(tPhase * Math.PI));
        } else {
            val = 300;
        }
        
        // Add random white noise for rendering authenticity
        val += Math.floor(Math.random() * 11) - 5;
        buffer.push(val);
    }
    
    return buffer;
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`  VitalGuard Development Mock Server is Running  `);
    console.log(`  Access dashboard: http://localhost:${PORT}      `);
    console.log(`=================================================\n`);
});
