'use client';

import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function Dashboard() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState('home');
  
  // Settings & IP addresses
  const [esp32Ip, setEsp32Ip] = useState('192.168.4.1');
  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [wsConnected, setWsConnected] = useState(false);
  
  // Patient details state
  const [patient, setPatient] = useState({
    name: 'Loading...',
    age: 0,
    gender: 'Male',
    idNumber: 'Loading...',
    emergencyContact: 'Loading...'
  });
  
  // Real-time telemetry state
  const [telemetry, setTelemetry] = useState({
    heartRate: 0,
    avgHeartRate: 0,
    minHeartRate: 0,
    maxHeartRate: 0,
    spo2: 0,
    tempC: 0,
    tempF: 0,
    bpSystolic: 120,
    bpDiastolic: 80,
    ecgLeadsOff: true,
    gpsLatitude: 0,
    gpsLongitude: 0,
    gpsValid: false,
    gpsTimestamp: '--:--:--',
    datetimeStr: '2026-06-02 12:00:00',
    systemAlertLevel: 0,
    sdReady: false,
    wifiConnected: false
  });
  
  // Logs & reports state
  const [historicalLogs, setHistoricalLogs] = useState([]);
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [saveMessage, setSaveMessage] = useState({ text: '', type: '' });
  
  // Alert banner state
  const [showAlertBanner, setShowAlertBanner] = useState(false);

  // Patient list & Mobile drawer state
  const [patientsList, setPatientsList] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // References
  const wsRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastAlertPlayedMsRef = useRef(0);
  
  // Chart Canvas refs
  const hrCanvasRef = useRef(null);
  const spo2CanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const bpCanvasRef = useRef(null);
  const miniEcgCanvasRef = useRef(null);
  const largeEcgCanvasRef = useRef(null);

  // Native Chart.js instances
  const chartsRef = useRef({
    hr: null,
    spo2: null,
    temp: null,
    bp: null,
    miniEcg: null,
    largeEcg: null
  });

  // ECG high-frequency queues
  const ecgQueueRef = useRef([]);
  const MAX_ECG_POINTS = 200;
  const VITAL_HISTORY_LIMIT = 30;

  // 1. Fetch Patient Info on Mount
  useEffect(() => {
    fetchPatientInfo();
    fetchPatientsList();
    fetchLogs();
  }, []);

  const fetchPatientInfo = async () => {
    try {
      const res = await fetch('/api/patient');
      const data = await res.json();
      setPatient(data);
    } catch (e) {
      console.warn("Error fetching patient details, using placeholder.");
    }
  };

  const fetchPatientsList = async () => {
    try {
      const res = await fetch('/api/patient?list=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPatientsList(data);
      }
    } catch (e) {
      console.warn("Error fetching patients list.");
    }
  };

  const activatePatient = async (idNumber) => {
    try {
      const res = await fetch('/api/patient', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber })
      });
      const data = await res.json();
      if (data.status === 'success') {
        await fetchPatientInfo();
        await fetchPatientsList();
        await fetchLogs();
        
        // Push full patient info to ESP32 device if online so OLED syncs
        const activePat = patientsList.find(p => p.idNumber === idNumber);
        if (activePat && wsConnected && wsRef.current) {
          wsRef.current.send(JSON.stringify({ syncPatient: activePat }));
        }
      }
    } catch (e) {
      console.error("Failed to activate patient:", e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setHistoricalLogs(data);
    } catch (e) {
      console.error("Error fetching historical logs:", e);
    }
  };

  // 2. Leaflet Map Initialization (Client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && !mapRef.current) {
      const L = require('leaflet');
      
      // Fix default marker path resolution in Next.js bundle
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const mapInstance = L.map('home-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([51.4687, -0.0934], 15);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
      const marker = L.marker([51.4687, -0.0934]).addTo(mapInstance);
      marker.bindPopup("<b>Patient Location</b>").openPopup();
      
      mapRef.current = mapInstance;
      markerRef.current = marker;
    }
  }, []);

  // Update map marker positions
  useEffect(() => {
    if (mapRef.current && markerRef.current && telemetry.gpsValid) {
      const L = require('leaflet');
      const pos = new L.LatLng(telemetry.gpsLatitude, telemetry.gpsLongitude);
      markerRef.current.setLatLng(pos);
      mapRef.current.panTo(pos);
    }
  }, [telemetry.gpsLatitude, telemetry.gpsLongitude, telemetry.gpsValid]);

  // 3. Native Chart.js setups
  useEffect(() => {
    if (typeof window !== 'undefined') {
      
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

      // HR
      if (hrCanvasRef.current && !chartsRef.current.hr) {
        chartsRef.current.hr = new Chart(hrCanvasRef.current, {
          type: 'line',
          data: { labels: [], datasets: [{ data: [], borderColor: '#ef4444', borderWidth: 2, fill: false }] },
          options: baseOptions
        });
      }

      // SpO2
      if (spo2CanvasRef.current && !chartsRef.current.spo2) {
        chartsRef.current.spo2 = new Chart(spo2CanvasRef.current, {
          type: 'line',
          data: { labels: [], datasets: [{ data: [], borderColor: '#3b82f6', borderWidth: 2, fill: false }] },
          options: baseOptions
        });
      }

      // Temp
      if (tempCanvasRef.current && !chartsRef.current.temp) {
        chartsRef.current.temp = new Chart(tempCanvasRef.current, {
          type: 'line',
          data: { labels: [], datasets: [{ data: [], borderColor: '#f59e0b', borderWidth: 2, fill: false }] },
          options: baseOptions
        });
      }

      // BP
      if (bpCanvasRef.current && !chartsRef.current.bp) {
        chartsRef.current.bp = new Chart(bpCanvasRef.current, {
          type: 'line',
          data: { 
            labels: [], 
            datasets: [
              { data: [], borderColor: '#10b981', borderWidth: 2, label: 'Systolic', fill: false },
              { data: [], borderColor: '#059669', borderWidth: 1.5, label: 'Diastolic', fill: false }
            ] 
          },
          options: { ...baseOptions, plugins: { legend: { display: true, labels: { color: textColor, font: { size: 8 } } } } }
        });
      }

      // Mini ECG
      if (miniEcgCanvasRef.current && !chartsRef.current.miniEcg) {
        chartsRef.current.miniEcg = new Chart(miniEcgCanvasRef.current, {
          type: 'line',
          data: { labels: Array(MAX_ECG_POINTS).fill(""), datasets: [{ data: Array(MAX_ECG_POINTS).fill(300), borderColor: '#ef4444', borderWidth: 1.5, fill: false }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, min: 100, max: 900 } },
            elements: { point: { radius: 0 }, line: { tension: 0.1 } }
          }
        });
      }

      // Large ECG
      if (largeEcgCanvasRef.current && !chartsRef.current.largeEcg) {
        chartsRef.current.largeEcg = new Chart(largeEcgCanvasRef.current, {
          type: 'line',
          data: { labels: Array(MAX_ECG_POINTS).fill(""), datasets: [{ data: Array(MAX_ECG_POINTS).fill(300), borderColor: '#ef4444', borderWidth: 2, fill: false }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { grid: { color: 'rgba(239, 68, 68, 0.08)' }, ticks: { color: '#ef4444', font: { size: 8 } }, min: 100, max: 900 } },
            elements: { point: { radius: 0 }, line: { tension: 0.05 } }
          }
        });
      }
    }
  }, [activeTab]);

  // 4. Telemetry data processor helper
  const processTelemetryPayload = (payload) => {
    // 4.1 Update telemetry state
    setTelemetry(payload);
    
    if (payload.noData) return;
    
    // 4.2 Play audibles for critical statuses
    if (payload.systemAlertLevel === 2) {
      setShowAlertBanner(true);
      playAlarmBeeps();
    } else if (payload.systemAlertLevel === 1) {
      setShowAlertBanner(true);
    } else {
      setShowAlertBanner(false);
    }

    // 4.3 Update native graphs
    const label = new Date().toLocaleTimeString().split(' ')[0];
    appendChartData(chartsRef.current.hr, label, payload.heartRate);
    appendChartData(chartsRef.current.spo2, label, payload.spo2);
    appendChartData(chartsRef.current.temp, label, payload.tempC);
    appendChartData(chartsRef.current.bp, label, payload.bpSystolic, payload.bpDiastolic);

    // 4.4 Push ECG points to queue
    if (!payload.ecgLeadsOff && payload.ecgBuffer && payload.ecgBuffer.length > 0) {
      ecgQueueRef.current.push(...payload.ecgBuffer);
    } else if (payload.ecgLeadsOff) {
      ecgQueueRef.current = [];
    }
  };

  // 4.1 WebSocket connection lifecycle
  useEffect(() => {
    let socketUrl = `ws://${esp32Ip}/ws`;
    // If the inputted IP is localhost or 127.0.0.1, connect to the local mock/development server
    if (esp32Ip === 'localhost' || esp32Ip === '127.0.0.1' || esp32Ip.startsWith('localhost:')) {
      socketUrl = `ws://localhost:3000/ws`;
    }

    // HTTPS Mixed Content Check: Insecure ws:// connections to local IPs are blocked on HTTPS hosts
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      if (socketUrl.startsWith('ws://')) {
        console.log(`[WebSocket] Insecure connection to ${socketUrl} skipped on HTTPS origin. Telemetry fallback is active.`);
        setWsStatus('Offline (HTTPS Blocked)');
        setWsConnected(false);
        return; // Skip connecting
      }
    }

    console.log(`Connecting WebSocket to ${socketUrl}...`);
    const ws = new WebSocket(socketUrl);
    wsRef.current = ws;
    setWsStatus('Connecting...');

    ws.onopen = () => {
      setWsStatus('Online');
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsStatus('Offline');
      setWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        processTelemetryPayload(payload);
      } catch (err) {
        console.error("Error parsing WS packet:", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [esp32Ip]);

  // 4.2 Database polling fallback when WebSocket is offline
  useEffect(() => {
    if (wsConnected) return;

    console.log("WebSocket is offline. Starting database telemetry polling fallback...");

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/vitals');
        if (res.ok) {
          const payload = await res.json();
          processTelemetryPayload(payload);
        }
      } catch (err) {
        console.warn("Telemetry database polling failed:", err);
      }
    }, 3000); // Poll database every 3 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [wsConnected]);


  // 5. 50Hz ECG sweep loop (plots points from queue)
  useEffect(() => {
    const sweep = setInterval(() => {
      if (ecgQueueRef.current.length === 0) return;
      const point = ecgQueueRef.current.shift();
      
      if (chartsRef.current.miniEcg) {
        chartsRef.current.miniEcg.data.datasets[0].data.push(point);
        chartsRef.current.miniEcg.data.datasets[0].data.shift();
        chartsRef.current.miniEcg.update('none');
      }

      if (chartsRef.current.largeEcg && activeTab === 'ecg') {
        chartsRef.current.largeEcg.data.datasets[0].data.push(point);
        chartsRef.current.largeEcg.data.datasets[0].data.shift();
        chartsRef.current.largeEcg.update('none');
      }
    }, 20);

    return () => clearInterval(sweep);
  }, [activeTab]);

  // Chart data appender helper
  const appendChartData = (chart, label, val1, val2 = null) => {
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
    chart.update('none');
  };

  // Reset ECG coordinates and queue
  const resetECGDisplay = () => {
    if (chartsRef.current.largeEcg) {
      chartsRef.current.largeEcg.data.datasets[0].data.fill(300);
      chartsRef.current.largeEcg.update();
    }
    if (chartsRef.current.miniEcg) {
      chartsRef.current.miniEcg.data.datasets[0].data.fill(300);
      chartsRef.current.miniEcg.update();
    }
    ecgQueueRef.current = [];
  };

  // 6. Play Browser alarms for critical triggers
  const playAlarmBeeps = () => {
    const now = Date.now();
    if (now - lastAlertPlayedMsRef.current >= 3000) {
      lastAlertPlayedMsRef.current = now;
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        setTimeout(() => osc.stop(), 300);
        
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(950, ctx.currentTime);
          osc2.connect(gain);
          osc2.start();
          setTimeout(() => osc2.stop(), 300);
        }, 500);
      } catch (e) {
        console.warn("Speaker blocked by user permissions.");
      }
    }
  };

  // 7. Form Operations (Patient details save)
  const savePatientInfo = async (e) => {
    e.preventDefault();
    const data = {
      name: e.target.pName.value,
      age: parseInt(e.target.pAge.value),
      gender: e.target.pGender.value,
      idNumber: e.target.pId.value,
      emergencyContact: e.target.pContact.value
    };

    try {
      const res = await fetch('/api/patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resJson = await res.json();
      if (resJson.status === 'success') {
        setPatient(data);
        fetchPatientsList(); // Refresh list to reflect updates
        setSaveMessage({ text: 'Patient records successfully written to PostgreSQL.', type: 'success' });
        setTimeout(() => setSaveMessage({ text: '', type: '' }), 4000);
        
        // Push update to ESP32 device if online so OLED syncs
        if (wsConnected && wsRef.current) {
          wsRef.current.send(JSON.stringify({ syncPatient: data }));
        }
      }
    } catch (err) {
      setSaveMessage({ text: 'Failed to connect. Using mockup state.', type: 'error' });
      setPatient(data);
      setTimeout(() => setSaveMessage({ text: '', type: '' }), 4000);
    }
  };

  // DB Truncate helper
  const clearDatabaseLogs = async () => {
    if (confirm("Are you sure you want to permanently erase all vital signs entries in the PostgreSQL database?")) {
      try {
        const res = await fetch('/api/logs', { method: 'DELETE' });
        const resJson = await res.json();
        if (resJson.status === 'success') {
          setHistoricalLogs([]);
          alert("Database vital logs cleared successfully.");
        }
      } catch (e) {
        alert("Erase operation failed.");
      }
    }
  };

  // 8. Client-side compiled clinical report exports
  const handleReportGeneration = (e) => {
    e.preventDefault();
    if (historicalLogs.length === 0) {
      alert("No patient logs found in the database.");
      return;
    }

    const filtered = filterLogs(historicalLogs, reportPeriod);
    
    if (reportFormat === 'csv') {
      exportToCSV(filtered);
    } else if (reportFormat === 'xlsx') {
      exportToExcel(filtered);
    } else if (reportFormat === 'pdf') {
      exportToPDF(filtered);
    }
  };

  const filterLogs = (logs, period) => {
    if (period === 'daily') return logs.slice(0, 100);
    if (period === 'weekly') return logs.slice(0, 500);
    return logs;
  };

  const exportToCSV = (rows) => {
    let csv = "PatientName,PatientID,Date,Time,HeartRate(BPM),SpO2(%),Temperature(C),BloodPressure,ECGStatus,GPSLocation\n";
    rows.forEach(r => {
      csv += `"${r.patientName || 'Unknown'}",${r.patientId || '--'},${r.date},${r.time},${r.hr},${r.spo2},${r.temp},${r.bp},${r.ecg},"${r.gps}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `VitalGuard_Report_${reportPeriod}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToExcel = (rows) => {
    const XLSX = require('xlsx');
    const data = [
      ["Patient Name", "Patient ID", "Date", "Time", "Heart Rate (BPM)", "SpO2 (%)", "Temperature (C)", "Blood Pressure", "ECG Status", "GPS Location"]
    ];
    rows.forEach(r => {
      data.push([r.patientName || 'Unknown', r.patientId || '--', r.date, r.time, parseInt(r.hr), parseInt(r.spo2), parseFloat(r.temp), r.bp, r.ecg, r.gps]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Vitals Logs");
    XLSX.writeFile(wb, `VitalGuard_Report_${reportPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = (rows) => {
    const { jsPDF } = require('jspdf');
    require('jspdf-autotable');
    
    const doc = new jsPDF();
    
    // Page Header banner
    doc.setFillColor(11, 15, 25);
    doc.rect(0, 0, 210, 38, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("VITALGUARD MEDICAL REPORT", 14, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}  |  Period: ${reportPeriod.toUpperCase()} (PostgreSQL backed)`, 14, 28);
    
    // Patient Details
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PATIENT BIODATA", 14, 48);
    doc.line(14, 50, 196, 50);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Full Name: ${patient.name}`, 14, 57);
    doc.text(`Age / Gender: ${patient.age} years / ${patient.gender}`, 14, 63);
    doc.text(`ID Number: ${patient.idNumber}`, 110, 57);
    doc.text(`Emergency Contact: ${patient.emergencyContact}`, 110, 63);
    
    // Vitals summaries
    const hrs = rows.map(r => parseInt(r.hr)).filter(v => !isNaN(v));
    const spo2s = rows.map(r => parseInt(r.spo2)).filter(v => !isNaN(v));
    const temps = rows.map(r => parseFloat(r.temp)).filter(v => !isNaN(v));
    
    const meanHR = hrs.length ? (hrs.reduce((a,b)=>a+b, 0)/hrs.length).toFixed(1) : "N/A";
    const maxHR = hrs.length ? Math.max(...hrs) : "N/A";
    const minHR = hrs.length ? Math.min(...hrs) : "N/A";
    const meanSpO2 = spo2s.length ? (spo2s.reduce((a,b)=>a+b, 0)/spo2s.length).toFixed(1) : "N/A";
    
    doc.setFont("helvetica", "bold");
    doc.text("PHYSIOLOGICAL DATA SUMMARY", 14, 76);
    doc.line(14, 78, 196, 78);
    
    doc.autoTable({
      startY: 82,
      head: [['Vital Parameter', 'Minimum Value', 'Maximum Value', 'Mean Summary']],
      body: [
        ['Heart Rate (BPM)', minHR, maxHR, meanHR],
        ['Oxygen Saturation (SpO2)', `${spo2s.length ? Math.min(...spo2s) : 'N/A'}%`, '100%', `${meanSpO2}%`],
        ['Temperature (C)', `${temps.length ? Math.min(...temps).toFixed(1) : 'N/A'}C`, `${temps.length ? Math.max(...temps).toFixed(1) : 'N/A'}C`, `${temps.length ? (temps.reduce((a,b)=>a+b, 0)/temps.length).toFixed(1) : 'N/A'} C`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });
    
    // Logs table
    doc.setFont("helvetica", "bold");
    doc.text("HISTORICAL OBSERVATION RECORDS", 14, doc.lastAutoTable.finalY + 12);
    
    const tableRows = [];
    rows.forEach(r => {
      tableRows.push([r.date, r.time, `${r.patientName || 'Unknown'} (${r.patientId || '--'})`, r.hr, `${r.spo2}%`, `${r.temp}C`, r.bp, r.ecg, r.gps]);
    });
    
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 16,
      head: [['Date', 'Time', 'Patient Name & ID', 'HR', 'SpO2', 'Temp', 'BP', 'ECG Status', 'GPS Coordinates']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`VitalGuard_Report_${reportPeriod}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // 9. Simulation controls to update active levels on ESP32
  const triggerESP32SimLevel = (level) => {
    console.log(`Setting ESP32 Simulator status to alert level: ${level}`);
    fetch(`/api/toggle_sim?level=${level}`) // Update mock server state
      .catch(() => {});
      
    if (wsConnected && wsRef.current) {
      wsRef.current.send(JSON.stringify({ requestSimLevel: level }));
    }
  };

  // Reset statistical counters
  const resetStatsOnDevice = () => {
    if (wsConnected && wsRef.current) {
      wsRef.current.send(JSON.stringify({ resetStats: true }));
    }
  };

  const isOnline = wsConnected || telemetry.deviceOnline;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-bgMain text-text-primary overflow-x-hidden">
      
      {/* Mobile Sticky Top Header */}
      <header className="lg:hidden flex items-center justify-between p-4 bg-bgSidebar border-b border-border-color sticky top-0 z-30 backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-red-500 to-blue-500 w-[36px] h-[36px] rounded-lg flex items-center justify-center">
            <i className="fa-solid fa-heart-pulse text-white text-base animate-pulse"></i>
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">VitalGuard</h2>
            <span className="text-[10px] text-text-secondary block -mt-0.5">Health Monitor</span>
          </div>
        </div>
        
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-text-secondary hover:text-white transition-all rounded-lg hover:bg-white/5 focus:outline-none"
        >
          <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'} text-lg`}></i>
        </button>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 w-[260px] bg-bgSidebar border-r border-border-color flex flex-col p-6 transition-transform duration-300 transform lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} shrink-0 h-full`}>
        <div className="hidden lg:flex items-center gap-3 pb-8 border-b border-border-color">
          <div className="bg-gradient-to-br from-red-500 to-blue-500 w-[42px] h-[42px] rounded-lg flex items-center justify-center">
            <i className="fa-solid fa-heart-pulse text-white text-xl animate-pulse"></i>
          </div>
          <div>
            <h2 className="text-[1.15rem] font-bold tracking-tight">VitalGuard</h2>
            <span className="text-[0.75rem] text-text-secondary">IoT Health Monitor</span>
          </div>
        </div>
        
        <nav className="flex flex-col gap-2 mt-8 lg:mt-6 grow">
          <button 
            onClick={() => { setActiveTab('home'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'home' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-house w-5 text-center"></i> <span>Home</span>
          </button>
          <button 
            onClick={() => { setActiveTab('patient'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'patient' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-user-injured w-5 text-center"></i> <span>Patient Info</span>
          </button>
          <button 
            onClick={() => { setActiveTab('live'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'live' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-chart-line w-5 text-center"></i> <span>Live Monitoring</span>
          </button>
          <button 
            onClick={() => { setActiveTab('ecg'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'ecg' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-wave-square w-5 text-center"></i> <span>ECG Monitor</span>
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'history' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-database w-5 text-center"></i> <span>Historical Data</span>
          </button>
          <button 
            onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'reports' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-file-invoice w-5 text-center"></i> <span>Reports</span>
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all w-full text-left ${activeTab === 'settings' ? 'text-white bg-gradient-to-r from-blue-500/15 to-blue-500/0 border-l-[3px] border-colorBlue' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-sliders w-5 text-center"></i> <span>Settings</span>
          </button>
        </nav>
        
        <div className="pt-6 border-t border-border-color">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${wsConnected ? 'bg-colorNormal shadow-[0_0_8px_#10b981]' : 'bg-gray-500'}`}></span>
            <span>WebSocket: {wsStatus}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Dashboard Area */}
      <main className="grow p-4 md:p-8 overflow-y-auto max-h-screen">
        
        {/* Top Header */}
        <header className="flex justify-between items-center mb-8 gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight capitalize">
              {activeTab === 'home' ? 'Dashboard Overview' : `${activeTab} Management`}
            </h1>
            <p className="text-sm text-text-secondary">
              {activeTab === 'home' && 'Real-time patient diagnostics board'}
              {activeTab === 'patient' && 'Update patient metadata indices in PostgreSQL'}
              {activeTab === 'live' && 'Continuous physiological graphs console'}
              {activeTab === 'ecg' && 'High-speed analog cardiac wave scope'}
              {activeTab === 'history' && 'Erase or query vital parameters from PostgreSQL'}
              {activeTab === 'reports' && 'Export professional clinical logs (PDF, Excel)'}
              {activeTab === 'settings' && 'Test hardware alarms and buzzer signals'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex items-center gap-2 bg-bgSidebar border border-border-color px-4 py-2 rounded-lg text-xs font-semibold ${
              telemetry.systemAlertLevel === 2 ? 'border-colorCritical bg-colorCritical text-white' : 
              telemetry.systemAlertLevel === 1 ? 'border-colorWarning bg-colorWarning text-black' : 'text-colorNormal'
            }`}>
              <i className={`fa-solid ${telemetry.systemAlertLevel === 2 ? 'fa-triangle-exclamation animate-pulse' : 'fa-shield-heart'}`}></i>
              <span>{telemetry.systemAlertLevel === 2 ? 'CRITICAL ALARM' : telemetry.systemAlertLevel === 1 ? 'WARNING STATE' : 'SYSTEM NORMAL'}</span>
            </div>
            <div className={`flex items-center gap-2 bg-bgSidebar border border-border-color px-4 py-2 rounded-lg text-xs font-semibold ${
              isOnline ? (wsConnected && !telemetry.wifiConnected ? 'text-colorBlue' : 'text-colorNormal') : 'text-text-muted'
            }`}>
              <i className={`fa-solid fa-wifi ${!isOnline ? 'opacity-55' : ''}`}></i>
              <span>
                {isOnline ? (wsConnected && !telemetry.wifiConnected ? 'ESP32 AP Active' : 'Device Online') : 'Device Offline'}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-bgSidebar border border-border-color px-4 py-2 rounded-lg text-xs font-semibold text-text-primary">
              <i className={`fa-solid fa-sd-card ${telemetry.sdReady ? 'text-colorNormal' : 'text-text-muted'}`}></i>
              <span>SD Card: {telemetry.sdReady ? 'Ready' : 'Offline'}</span>
            </div>
          </div>
        </header>

        {/* High Priority Critical Alert Banner */}
        {showAlertBanner && (
          <div className={`mb-8 border-l-4 flex justify-between items-center p-4 rounded-lg shadow-lg ${
            telemetry.systemAlertLevel === 2 ? 'bg-colorCritical/10 border-colorCritical border text-colorCritical shadow-red-500/5' : 'bg-colorWarning/10 border-colorWarning border text-colorWarning shadow-amber-500/5'
          }`}>
            <div className="flex items-center gap-4">
              <i className={`fa-solid fa-circle-exclamation text-2xl ${telemetry.systemAlertLevel === 2 ? 'animate-pulse' : ''}`}></i>
              <div>
                <h4 className="font-bold text-sm">{telemetry.systemAlertLevel === 2 ? 'PATIENT EMERGENCY ALARM' : 'PHYSIOLOGICAL STATE ALERT'}</h4>
                <p className="text-xs text-text-secondary mt-1">
                  {telemetry.systemAlertLevel === 2 ? 'Patient vital indices have exceeded safe medical boundaries. Investigate immediately.' : 'Parameters are bordering critical values.'}
                </p>
              </div>
            </div>
            <button onClick={() => setShowAlertBanner(false)} className="text-text-secondary hover:text-white"><i class="fa-solid fa-xmark"></i></button>
          </div>
        )}

        {/* Tab content router */}
        
        {/* 1. HOME SECTION */}
        {activeTab === 'home' && (
          <div className="flex flex-col gap-6">
            
            {/* Active patient overview tracking banner */}
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-colorBlue/20 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-colorNormal opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-colorNormal"></span>
                </span>
                <div>
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Currently Monitoring Patient</span>
                  <h3 className="text-sm md:text-base font-extrabold text-text-primary">{patient.name} <span className="text-xs text-text-muted font-normal">({patient.idNumber})</span></h3>
                </div>
              </div>
              <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-start">
                <span className="text-[11px] text-text-secondary font-semibold flex items-center gap-1"><i className="fa-solid fa-clock-rotate-left"></i> Live</span>
                <select
                  value={patient.idNumber}
                  onChange={(e) => activatePatient(e.target.value)}
                  className="bg-slate-900/80 border border-border-color text-xs rounded-lg px-3 py-1.5 focus:border-colorBlue focus:outline-none text-white font-semibold cursor-pointer max-w-[200px] sm:max-w-none truncate hover:bg-slate-800 transition-all"
                >
                  {patientsList.length === 0 ? (
                    <option value={patient.idNumber}>Monitor: {patient.name}</option>
                  ) : (
                    patientsList.map((p) => (
                      <option key={p.idNumber} value={p.idNumber}>
                        Monitor: {p.name} ({p.idNumber})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Demographics */}
              <div className="sm:col-span-2 lg:col-span-2 bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl hover:border-border-hover transition-all">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[1.05rem] font-semibold flex items-center gap-2"><i className="fa-solid fa-id-card text-colorBlue"></i> Patient Overview</h3>
                  <button onClick={() => setActiveTab('patient')} className="text-xs text-colorBlue hover:underline">Modify</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[0.7rem] uppercase text-text-muted font-bold tracking-wider">Patient Name</span>
                    <span className="text-sm font-medium mt-0.5 text-text-primary">{patient.name}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.7rem] uppercase text-text-muted font-bold tracking-wider">Age / Gender</span>
                    <span className="text-sm font-medium mt-0.5 text-text-primary">{patient.age} yrs / {patient.gender}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.7rem] uppercase text-text-muted font-bold tracking-wider">ID Number</span>
                    <span className="text-sm font-medium mt-0.5 text-text-primary">{patient.idNumber}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[0.7rem] uppercase text-text-muted font-bold tracking-wider">Emergency Contact</span>
                    <span className="text-sm font-medium mt-0.5 text-text-primary">{patient.emergencyContact}</span>
                  </div>
                </div>
              </div>

              {/* Vitals overview row */}
              <div className={`bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl flex items-center justify-between gap-4 transition-all ${!isOnline ? 'opacity-65 saturate-50' : ''}`}>
                <div className="flex items-center gap-4">
                  <i className="fa-solid fa-heartbeat text-colorCritical text-2xl animate-pulse"></i>
                  <div>
                    <span className="text-xs text-text-secondary flex items-center gap-1.5">
                      Pulse Rate {!isOnline && <span className="px-1.5 py-0.2 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}
                    </span>
                    <h2 className="text-2xl font-bold mt-0.5">{telemetry.heartRate ? Math.round(telemetry.heartRate) : '--'} <span className="text-xs text-text-muted font-medium">BPM</span></h2>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <i className="fa-solid fa-droplet text-colorBlue text-2xl"></i>
                  <div>
                    <span className="text-xs text-text-secondary flex items-center gap-1.5">
                      SpO2 {!isOnline && <span className="px-1.5 py-0.2 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}
                    </span>
                    <h2 className="text-2xl font-bold mt-0.5">{telemetry.spo2 ? Math.round(telemetry.spo2) : '--'} <span className="text-xs text-text-muted font-medium">%</span></h2>
                  </div>
                </div>
              </div>

              <div className={`bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl flex items-center justify-between gap-4 transition-all ${!isOnline ? 'opacity-65 saturate-50' : ''}`}>
                <div className="flex items-center gap-4">
                  <i className="fa-solid fa-thermometer-half text-colorWarning text-2xl"></i>
                  <div>
                    <span className="text-xs text-text-secondary flex items-center gap-1.5">
                      Body Temp {!isOnline && <span className="px-1.5 py-0.2 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}
                    </span>
                    <h2 className="text-2xl font-bold mt-0.5">{telemetry.tempC ? telemetry.tempC.toFixed(1) : '--'} <span className="text-xs text-text-muted font-medium">°C</span></h2>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <i className="fa-solid fa-gauge-simple-high text-colorNormal text-2xl"></i>
                  <div>
                    <span className="text-xs text-text-secondary flex items-center gap-1.5">
                      BP Pressure {!isOnline && <span className="px-1.5 py-0.2 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}
                    </span>
                    <h2 className="text-lg font-bold mt-1">{telemetry.bpSystolic}/{telemetry.bpDiastolic} <span className="text-[10px] text-text-muted font-normal block">mmHg</span></h2>
                  </div>
                </div>
              </div>
            </div>

            {/* GPS Map and ECG preview */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Map */}
              <div className="lg:col-span-2 bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl hover:border-border-hover transition-all">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[1.05rem] font-semibold flex items-center gap-2"><i className="fa-solid fa-map-location-dot text-colorBlue"></i> Patient Location</h3>
                  <span className={`badge px-2 py-0.5 text-[10px] font-semibold rounded ${telemetry.gpsValid ? 'text-colorNormal bg-colorNormal/10' : 'text-text-muted bg-white/5'}`}>
                    {telemetry.gpsValid ? 'Active' : 'Searching Fix...'}
                  </span>
                </div>
                <div id="home-map" className="h-[180px] rounded-lg border border-border-color overflow-hidden bg-slate-900 mb-3"></div>
                <div className="flex justify-between text-[11px] text-text-secondary">
                  <p><i className="fa-solid fa-location-crosshairs mr-1"></i> Lat: {telemetry.gpsLatitude.toFixed(6)}, Lon: {telemetry.gpsLongitude.toFixed(6)}</p>
                  <p><i className="fa-solid fa-clock mr-1"></i> Time: {telemetry.gpsTimestamp}</p>
                </div>
              </div>

              {/* Sparkline ECG */}
              <div className="lg:col-span-2 bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl hover:border-border-hover transition-all flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[1.05rem] font-semibold flex items-center gap-2"><i className="fa-solid fa-wave-square text-colorCritical animate-pulse"></i> Real-time ECG Trace</h3>
                  <span className={`badge px-2 py-0.5 text-[10px] font-semibold rounded ${telemetry.ecgLeadsOff ? 'text-colorCritical bg-colorCritical/10' : 'text-colorNormal bg-colorNormal/10'}`}>
                    {telemetry.ecgLeadsOff ? 'Leads Off' : 'Connected'}
                  </span>
                </div>
                <div className="grow h-[135px] relative">
                  <canvas ref={miniEcgCanvasRef}></canvas>
                </div>
                <button onClick={() => setActiveTab('ecg')} className="btn-primary w-full mt-4 text-xs font-semibold py-2.5 rounded-lg bg-colorBlue hover:bg-blue-600 text-white transition-all shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                  Open ECG Monitor
                </button>
              </div>

            </div>

            {/* 3. System Connection Statuses Panel */}
            <div className="bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl hover:border-border-hover transition-all">
              <h3 className="text-[1.05rem] font-semibold flex items-center gap-2 mb-4">
                <i className="fa-solid fa-network-wired text-colorBlue"></i> System Connection & Sync Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
                
                {/* WebSocket status */}
                <div className="flex items-center gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-border-color">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${wsConnected ? 'bg-colorNormal/10 text-colorNormal' : 'bg-gray-500/10 text-gray-500'}`}>
                    <i className="fa-solid fa-plug-circle-check text-base"></i>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted font-bold block uppercase tracking-wider">WebSocket Stream</span>
                    <strong className={wsConnected ? 'text-colorNormal' : 'text-text-muted'}>
                      {wsConnected ? 'Connected (1s Vitals)' : 'Offline / Reconnecting'}
                    </strong>
                  </div>
                </div>

                {/* WiFi Mode status */}
                <div className="flex items-center gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-border-color">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOnline ? 'bg-colorBlue/10 text-colorBlue' : 'bg-gray-500/10 text-gray-500'}`}>
                    <i className="fa-solid fa-wifi text-base"></i>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted font-bold block uppercase tracking-wider">ESP32 WiFi Mode</span>
                    <strong className={isOnline ? 'text-text-primary' : 'text-text-muted'}>
                      {isOnline ? (telemetry.wifiConnected ? 'STA Client Mode' : 'Access Point Mode') : 'Offline'}
                    </strong>
                  </div>
                </div>

                {/* PostgreSQL Database status */}
                <div className="flex items-center gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-border-color">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-colorNormal/10 text-colorNormal">
                    <i className="fa-solid fa-database text-base"></i>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted font-bold block uppercase tracking-wider">PostgreSQL (Render)</span>
                    <strong className="text-colorNormal">Connected & Active</strong>
                  </div>
                </div>

                {/* Local Backup storage status */}
                <div className="flex items-center gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-border-color">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOnline && telemetry.sdReady ? 'bg-colorNormal/10 text-colorNormal' : 'bg-gray-500/10 text-gray-500'}`}>
                    <i className="fa-solid fa-sd-card text-base"></i>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted font-bold block uppercase tracking-wider">Backup Local SD</span>
                    <strong className={isOnline && telemetry.sdReady ? 'text-colorNormal' : 'text-text-muted'}>
                      {isOnline ? (telemetry.sdReady ? 'Ready (Logging)' : 'Card Offline / Error') : 'Device Offline'}
                    </strong>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* 2. PATIENT INFO SECTION */}
        {activeTab === 'patient' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left side: Registered Patients Directory */}
            <div className="lg:col-span-2 bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl flex flex-col gap-4 animate-fade-in">
              <h3 className="text-[1.05rem] font-semibold flex items-center gap-2 mb-2">
                <i className="fa-solid fa-address-book text-colorBlue"></i> Registered Patients Directory
              </h3>
              
              <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                {patientsList.length === 0 ? (
                  <div className="p-8 text-center text-text-muted border border-dashed border-border-color rounded-xl">
                    No registered patients. Use the form to add a patient.
                  </div>
                ) : (
                  patientsList.map((item, idx) => {
                    const isActive = patient.idNumber === item.idNumber;
                    return (
                      <div key={idx} className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isActive ? 'border-colorNormal/30 bg-colorNormal/5' : 'border-border-color hover:border-border-hover bg-slate-950/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-colorNormal/10 text-colorNormal' : 'bg-slate-900 text-text-secondary'}`}>
                            <i className="fa-solid fa-user text-sm"></i>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-text-primary">{item.name}</span>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded bg-colorNormal/12 border border-colorNormal/20 text-[9px] font-bold text-colorNormal flex items-center gap-1 uppercase tracking-wider animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-colorNormal inline-block"></span>
                                  Monitoring Active
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-text-muted font-medium">
                              MRN: {item.idNumber} | {item.age} yrs | {item.gender}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-border-color">
                          <span className="text-[10px] text-text-muted font-medium block sm:hidden">Action:</span>
                          {isActive ? (
                            <span className="text-xs font-bold text-colorNormal px-2 py-1"><i className="fa-solid fa-circle-check mr-1"></i> Active</span>
                          ) : (
                            <button 
                              onClick={() => activatePatient(item.idNumber)} 
                              className="px-3.5 py-1.5 bg-slate-900 border border-border-color hover:bg-slate-800 transition-all text-xs font-semibold rounded-lg text-white"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side: Register / Edit Form */}
            <div className="bg-bgCard backdrop-blur border border-border-color rounded-2xl p-6 shadow-xl animate-fade-in">
              <h3 className="text-[1.05rem] font-semibold mb-6 flex items-center gap-2"><i className="fa-solid fa-id-card text-colorBlue"></i> Register / Edit Patient</h3>
              <form onSubmit={savePatientInfo} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Patient Full Name</label>
                  <input type="text" name="pName" placeholder="e.g. Alice Smith" className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">Age</label>
                    <input type="number" name="pAge" placeholder="30" min="1" max="120" className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">Gender</label>
                    <select name="pGender" className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" required>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Patient MRN / ID Number</label>
                  <input type="text" name="pId" placeholder="e.g. PT-2026-1024" className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" required />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Emergency Mobile Line</label>
                  <input type="text" name="pContact" placeholder="e.g. +1987654321" className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" required />
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button type="submit" className="px-5 py-2.5 bg-colorBlue hover:bg-blue-600 transition-all font-semibold rounded-lg text-sm text-white w-full">
                    Save Demographic File
                  </button>
                </div>
              </form>
              {saveMessage.text && (
                <div className={`mt-4 p-3 rounded-lg text-xs font-semibold ${saveMessage.type === 'success' ? 'bg-colorNormal/12 border border-colorNormal/20 text-colorNormal' : 'bg-colorCritical/12 border border-colorCritical/20 text-colorCritical'}`}>
                  {saveMessage.text}
                </div>
              )}
            </div>

          </div>
        )}

        {/* 3. LIVE VITAL SIGNS */}
        {activeTab === 'live' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* HR */}
            <div className={`bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col h-[320px] transition-all ${
              !isOnline ? 'opacity-65 saturate-50' : ''
            } ${
              isOnline && telemetry.systemAlertLevel === 2 && (telemetry.heartRate < 50 || telemetry.heartRate > 120) ? 'card-glow-red' : 
              isOnline && telemetry.systemAlertLevel === 1 && (telemetry.heartRate < 60 || telemetry.heartRate > 100) ? 'card-glow-yellow' : ''
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm flex items-center gap-2 text-text-secondary"><i className="fa-solid fa-heartbeat text-colorCritical animate-pulse"></i> Heart Rate {!isOnline && <span className="px-1.5 py-0.5 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  !isOnline ? 'bg-gray-500/15 text-text-muted' :
                  (telemetry.heartRate < 50 || telemetry.heartRate > 120) ? 'bg-colorCritical/15 text-colorCritical' : 
                  (telemetry.heartRate < 60 || telemetry.heartRate > 100) ? 'bg-colorWarning/15 text-colorWarning' : 'bg-colorNormal/15 text-colorNormal'
                }`}>
                  {!isOnline ? 'Offline' : ((telemetry.heartRate < 50 || telemetry.heartRate > 120) ? 'Critical' : (telemetry.heartRate < 60 || telemetry.heartRate > 100) ? 'Warning' : 'Normal')}
                </span>
              </div>
              <div className="my-2">
                <span className="text-4xl font-extrabold tracking-tight">{telemetry.heartRate ? Math.round(telemetry.heartRate) : '--'}</span>
                <span className="text-xs text-text-muted ml-1.5 font-semibold">BPM</span>
              </div>
              <div className="flex gap-4 border-b border-border-color pb-3 mb-4 text-[10px]">
                <div><span className="text-text-muted">Min:</span> <strong className="ml-0.5">{telemetry.minHeartRate ? Math.round(telemetry.minHeartRate) : '--'}</strong></div>
                <div><span className="text-text-muted">Max:</span> <strong className="ml-0.5">{telemetry.maxHeartRate ? Math.round(telemetry.maxHeartRate) : '--'}</strong></div>
                <div><span className="text-text-muted">Avg:</span> <strong className="ml-0.5">{telemetry.avgHeartRate ? Math.round(telemetry.avgHeartRate) : '--'}</strong></div>
              </div>
              <div className="grow relative">
                <canvas ref={hrCanvasRef}></canvas>
              </div>
            </div>

            {/* SpO2 */}
            <div className={`bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col h-[320px] transition-all ${
              !isOnline ? 'opacity-65 saturate-50' : ''
            } ${
              isOnline && telemetry.systemAlertLevel === 2 && telemetry.spo2 < 90 ? 'card-glow-red' : 
              isOnline && telemetry.systemAlertLevel === 1 && telemetry.spo2 < 95 ? 'card-glow-yellow' : ''
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm flex items-center gap-2 text-text-secondary"><i className="fa-solid fa-droplet text-colorBlue"></i> Blood Oxygen (SpO2) {!isOnline && <span className="px-1.5 py-0.5 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  !isOnline ? 'bg-gray-500/15 text-text-muted' :
                  telemetry.spo2 < 90 ? 'bg-colorCritical/15 text-colorCritical' : 
                  telemetry.spo2 < 95 ? 'bg-colorWarning/15 text-colorWarning' : 'bg-colorNormal/15 text-colorNormal'
                }`}>
                  {!isOnline ? 'Offline' : (telemetry.spo2 < 90 ? 'Hypoxia' : telemetry.spo2 < 95 ? 'Warning' : 'Normal')}
                </span>
              </div>
              <div className="my-2">
                <span className="text-4xl font-extrabold tracking-tight">{telemetry.spo2 ? Math.round(telemetry.spo2) : '--'}</span>
                <span className="text-xs text-text-muted ml-1.5 font-semibold">%</span>
              </div>
              <div className="pb-3 border-b border-border-color mb-4 text-[10px] text-colorNormal">Normal physiological zone: 95% - 100%</div>
              <div className="grow relative">
                <canvas ref={spo2CanvasRef}></canvas>
              </div>
            </div>

            {/* Temperature */}
            <div className={`bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col h-[320px] transition-all ${
              !isOnline ? 'opacity-65 saturate-50' : ''
            } ${
              isOnline && telemetry.tempC > 38.5 ? 'card-glow-red' : 
              isOnline && telemetry.tempC > 37.5 ? 'card-glow-yellow' : ''
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm flex items-center gap-2 text-text-secondary"><i className="fa-solid fa-thermometer-half text-colorWarning"></i> Temperature {!isOnline && <span className="px-1.5 py-0.5 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  !isOnline ? 'bg-gray-500/15 text-text-muted' :
                  telemetry.tempC > 38.5 ? 'bg-colorCritical/15 text-colorCritical' : 
                  telemetry.tempC > 37.5 ? 'bg-colorWarning/15 text-colorWarning' : 'bg-colorNormal/15 text-colorNormal'
                }`}>
                  {!isOnline ? 'Offline' : (telemetry.tempC > 38.5 ? 'Fever' : telemetry.tempC > 37.5 ? 'Feverish' : 'Normal')}
                </span>
              </div>
              <div className="my-2">
                <span className="text-4xl font-extrabold tracking-tight">{telemetry.tempC ? telemetry.tempC.toFixed(1) : '--'}</span>
                <span className="text-xs text-text-muted ml-1.5 font-semibold">°C</span>
              </div>
              <div className="pb-3 border-b border-border-color mb-4 text-[10px] text-text-secondary">Fahrenheit Value: {telemetry.tempF ? telemetry.tempF.toFixed(1) : '--'} °F</div>
              <div className="grow relative">
                <canvas ref={tempCanvasRef}></canvas>
              </div>
            </div>

            {/* BP */}
            <div className={`bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col h-[320px] transition-all ${
              !isOnline ? 'opacity-65 saturate-50' : ''
            } ${
              isOnline && telemetry.systemAlertLevel === 2 && (telemetry.bpSystolic >= 180 || telemetry.bpDiastolic >= 120) ? 'card-glow-red' : 
              isOnline && telemetry.systemAlertLevel === 1 && (telemetry.bpSystolic >= 140 || telemetry.bpDiastolic >= 90) ? 'card-glow-yellow' : ''
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm flex items-center gap-2 text-text-secondary"><i className="fa-solid fa-gauge-simple-high text-colorNormal"></i> Blood Pressure {!isOnline && <span className="px-1.5 py-0.5 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  !isOnline ? 'bg-gray-500/15 text-text-muted' :
                  (telemetry.bpSystolic >= 180 || telemetry.bpDiastolic >= 120) ? 'bg-colorCritical/15 text-colorCritical' : 
                  (telemetry.bpSystolic >= 140 || telemetry.bpDiastolic >= 90) ? 'bg-colorWarning/15 text-colorWarning' : 'bg-colorNormal/15 text-colorNormal'
                }`}>
                  {!isOnline ? 'Offline' : ((telemetry.bpSystolic >= 180 || telemetry.bpDiastolic >= 120) ? 'Hypertensive' : (telemetry.bpSystolic >= 140 || telemetry.bpDiastolic >= 90) ? 'Borderline' : 'Normal')}
                </span>
              </div>
              <div className="my-2">
                <span className="text-4xl font-extrabold tracking-tight">{telemetry.bpSystolic}/{telemetry.bpDiastolic}</span>
                <span className="text-xs text-text-muted ml-1.5 font-semibold">mmHg</span>
              </div>
              <div className="flex gap-4 pb-3 border-b border-border-color mb-4 text-[10px]">
                <div><span className="text-text-muted">Systolic:</span> <strong>{telemetry.bpSystolic}</strong></div>
                <div><span className="text-text-muted">Diastolic:</span> <strong>{telemetry.bpDiastolic}</strong></div>
              </div>
              <div className="grow relative">
                <canvas ref={bpCanvasRef}></canvas>
              </div>
            </div>

          </div>
        )}

        {/* 4. LARGE ECG MONITOR */}
        {activeTab === 'ecg' && (
          <div className={`bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl transition-all ${!isOnline ? 'opacity-65 saturate-50' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[1.05rem] font-bold flex items-center gap-2 text-text-primary">
                <i className="fa-solid fa-wave-square text-colorCritical animate-pulse"></i> Real-time Electrocardiogram (ECG) {!isOnline && <span className="px-1.5 py-0.5 text-[8px] bg-white/10 text-text-muted rounded uppercase font-bold">Cached</span>}
              </h3>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${!isOnline ? 'bg-gray-500/10 text-text-muted' : (telemetry.ecgLeadsOff ? 'bg-colorCritical/10 text-colorCritical' : 'bg-colorNormal/10 text-colorNormal')}`}>
                  {!isOnline ? 'Device Offline' : (telemetry.ecgLeadsOff ? 'Leads: OFF / DETACHED' : 'Leads: CONNECTED')}
                </span>
                <button onClick={resetECGDisplay} disabled={!isOnline} className="px-3.5 py-1.5 text-xs bg-slate-900 border border-border-color hover:bg-slate-800 disabled:opacity-50 transition-all font-semibold rounded-lg text-white">
                  Reset Trace
                </button>
              </div>
            </div>
            <div className="h-[380px] w-full border border-border-color rounded-xl p-3 bg-[#0a0f1c]/70 relative">
              <canvas ref={largeEcgCanvasRef}></canvas>
            </div>
            <div className="mt-6">
              <h4 className="text-sm font-bold flex items-center gap-1.5 text-text-primary"><i className="fa-solid fa-circle-info text-colorBlue"></i> ECG Waveform Acquisition details</h4>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                The waveform shown above represents raw analog signals captured from the AD8232 module on GPIO 34. Digital noise filtering is applied on the board to isolate cardiac electrical activity. In simulation mode, the output runs a scaled P-Q-R-S-T wave generator locked to the current simulated pulse rate.
              </p>
            </div>
          </div>
        )}

        {/* 5. HISTORICAL logs */}
        {activeTab === 'history' && (
          <div className="bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[1.05rem] font-bold flex items-center gap-2"><i className="fa-solid fa-database text-colorBlue"></i> Vital Logs Database (PostgreSQL)</h3>
              <div className="flex gap-2">
                <button onClick={clearDatabaseLogs} className="px-3.5 py-1.5 bg-colorCritical/15 text-colorCritical border border-colorCritical/20 hover:bg-colorCritical/25 transition-all text-xs font-semibold rounded-lg">
                  Erase DB Logs
                </button>
                <button onClick={fetchLogs} className="px-3.5 py-1.5 bg-slate-900 border border-border-color hover:bg-slate-800 transition-all text-xs font-semibold rounded-lg text-white">
                  Refresh Database
                </button>
              </div>
            </div>
            <div className="overflow-x-auto border border-border-color rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-border-color text-text-secondary">
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold">Time</th>
                    <th className="p-4 font-semibold">Patient</th>
                    <th className="p-4 font-semibold">Pulse (BPM)</th>
                    <th className="p-4 font-semibold">SpO2 (%)</th>
                    <th className="p-4 font-semibold">Temperature</th>
                    <th className="p-4 font-semibold">Blood Pressure</th>
                    <th className="p-4 font-semibold">ECG Status</th>
                    <th className="p-4 font-semibold">GPS Coordinates</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalLogs.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="p-8 text-center text-text-muted">No database logs indexed. Run simulation or connect device to populate PostgreSQL.</td>
                    </tr>
                  ) : (
                    historicalLogs.map((row, idx) => (
                      <tr key={idx} className="border-b border-border-color hover:bg-white/5 transition-all">
                        <td className="p-4">{row.date}</td>
                        <td className="p-4">{row.time}</td>
                        <td className="p-4">
                          <div className="font-bold text-text-primary">{row.patientName || 'Unknown'}</div>
                          <div className="text-[10px] text-text-muted">{row.patientId || '--'}</div>
                        </td>
                        <td className="p-4 font-bold">{row.hr}</td>
                        <td className="p-4 font-bold">{row.spo2}%</td>
                        <td className="p-4">{row.temp}°C</td>
                        <td className="p-4">{row.bp}</td>
                        <td className="p-4">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${
                            row.ecg === 'Critical' ? 'bg-colorCritical shadow-[0_0_8px_#ef4444]' : 
                            row.ecg === 'Warning' ? 'bg-colorWarning shadow-[0_0_8px_#f59e0b]' : 'bg-colorNormal shadow-[0_0_8px_#10b981]'
                          }`}></span>
                          {row.ecg}
                        </td>
                        <td className="p-4 text-text-muted">{row.gps}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. REPORTS SECTION */}
        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* config */}
            <div className="bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl">
              <h3 className="text-[1.05rem] font-bold mb-6 flex items-center gap-2"><i className="fa-solid fa-file-invoice text-colorBlue"></i> Export Report Worksheets</h3>
              <form onSubmit={handleReportGeneration} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Select Query Range</label>
                  <select 
                    value={reportPeriod} 
                    onChange={(e) => setReportPeriod(e.target.value)} 
                    className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none"
                  >
                    <option value="daily">Daily Report (Past 24 Hours)</option>
                    <option value="weekly">Weekly Report (Past 7 Days)</option>
                    <option value="monthly">Monthly Report (Past 30 Days)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Export Document Format</label>
                  <select 
                    value={reportFormat} 
                    onChange={(e) => setReportFormat(e.target.value)} 
                    className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none"
                  >
                    <option value="pdf">PDF Document (*.pdf)</option>
                    <option value="csv">Comma-Separated Values (*.csv)</option>
                    <option value="xlsx">Excel Spreadsheet (*.xlsx)</option>
                  </select>
                </div>
                <button type="submit" className="w-full mt-4 py-2.5 bg-colorBlue hover:bg-blue-600 transition-all font-semibold rounded-lg text-sm text-white">
                  Generate and Download
                </button>
              </form>
            </div>

            {/* info */}
            <div className="bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col justify-center">
              <h3 className="text-[1.05rem] font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-file-export text-colorBlue"></i> Clinical Export details</h3>
              <div className="text-xs text-text-secondary leading-relaxed space-y-3">
                <p>
                  <strong>PDF Compiler:</strong> Aggregates historical vital lines, runs Mean/Max/Min mathematical ranges, and builds layout grids formatted with patient metadata.
                </p>
                <p>
                  <strong>Excel/CSV Sheets:</strong> Extracts structured database rows for clinical researchers and medical teams to build models or trace records on third-party analytical programs.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* 7. SETTINGS & SIM */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Calibration simulation */}
            <div className="bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl">
              <h3 className="text-[1.05rem] font-bold mb-3 flex items-center gap-2"><i className="fa-solid fa-flask text-colorWarning"></i> Vital limits Simulator</h3>
              <p className="text-xs text-text-secondary mb-6 leading-relaxed">
                Manually push vital values into warning or critical status limits. This verifies OLED warnings, buzzer sound alerts, dashboard alarm overlays, and emergency contact SMS triggers.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => triggerESP32SimLevel(0)} className="w-full py-3 bg-colorNormal/10 border border-colorNormal/20 hover:bg-colorNormal hover:text-black font-semibold rounded-lg text-sm text-colorNormal transition-all flex items-center justify-center gap-2">
                  <i className="fa-solid fa-circle-check"></i> Trigger NORMAL Limits
                </button>
                <button onClick={() => triggerESP32SimLevel(1)} className="w-full py-3 bg-colorWarning/10 border border-colorWarning/20 hover:bg-colorWarning hover:text-black font-semibold rounded-lg text-sm text-colorWarning transition-all flex items-center justify-center gap-2">
                  <i className="fa-solid fa-circle-exclamation"></i> Trigger WARNING Limits
                </button>
                <button onClick={() => triggerESP32SimLevel(2)} className="w-full py-3 bg-colorCritical/10 border border-colorCritical/20 hover:bg-colorCritical hover:text-white font-semibold rounded-lg text-sm text-colorCritical transition-all flex items-center justify-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation"></i> Trigger CRITICAL Limits
                </button>
              </div>
            </div>

            {/* device IP configuration */}
            <div className="bg-bgCard border border-border-color rounded-2xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-[1.05rem] font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-sliders text-text-primary"></i> System Configuration</h3>
                <div className="flex flex-col gap-1.5 mb-4">
                  <label className="text-xs font-bold text-text-secondary font-sans">ESP32 Receiver IP Address</label>
                  <input 
                    type="text" 
                    value={esp32Ip} 
                    onChange={(e) => setEsp32Ip(e.target.value)} 
                    className="bg-slate-900/60 border border-border-color rounded-lg px-4 py-2.5 text-sm focus:border-colorBlue focus:outline-none" 
                  />
                  <span className="text-[10px] text-text-muted mt-1">If the Next.js app is hosted on a PC, input the ESP32 Local IP address (e.g. 192.168.4.1 or router allocated IP) to open WebSocket telemetry routing.</span>
                </div>
              </div>
              
              <div className="border-t border-border-color pt-4 flex gap-2">
                <button onClick={resetStatsOnDevice} className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white border border-border-color rounded-lg transition-all">
                  Reset BPM Stats
                </button>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
