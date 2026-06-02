# Advanced IoT Vital Signs Health Monitoring System Using ESP32

A complete, professional-grade IoT Health Monitoring System capable of measuring, displaying, storing, and remotely monitoring multiple patient vital signs in real time. The system uses an **ESP32** microcontroller running modular C++ firmware, connected to local medical sensors, a rotating OLED display, a MicroSD logger, and a SIM800L cellular shield. Remote monitoring is provided via a premium, responsive **Next.js** dashboard styled with **Tailwind CSS** and backed by a **PostgreSQL** database.

---

## 1. System Architecture

The system employs a hybrid communication model to optimize data integrity, latency, and cloud database efficiency:
1. **Real-time Telemetry (WebSockets)**: The client browser connects directly to the ESP32’s WebSocket server (`ws://esp32-ip/ws`) for sub-second vital values and high-frequency ECG streaming. This prevents the PostgreSQL database from being overloaded with high-speed data.
2. **Persistent Logs (HTTP Client)**: The ESP32 periodically (every 5 seconds) uploads vital signs log summaries to the Next.js API `/api/vitals` via HTTP POST, which writes the records to a cloud **PostgreSQL** database.
3. **Local Fail-safe Logging**: If the Next.js server goes offline, the ESP32 continues logging formatted CSV data locally to a **MicroSD** card.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              ESP32 MCU                                 │
│  (Samples ECG at 50Hz, runs OLED rotate, checks threshold limits)     │
└───────────┬──────────────────────────────────────────────────┬─────────┘
            │                                                  │
            │ (WS Vitals 1Hz + ECG Buffer 50Hz)                │ (HTTP POST Vitals 0.2Hz)
            ▼                                                  ▼
┌───────────────────────────┐                      ┌─────────────────────┐
│    Next.js Web Browser    │                      │  Next.js API Route  │
│ (Tailwind CSS, Chart.js,  │                      │   (/api/vitals)     │
│  Leaflet Map Tracking)    │                      └───────────┬─────────┘
└───────────────────────────┘                                  │
                                                               │ (SQL inserts)
                                                               ▼
                                                   ┌─────────────────────┐
                                                   │ PostgreSQL Database │
                                                   │  (Render Cloud)     │
                                                   └─────────────────────┘
```

---

## 2. Hardware Connections & Pinout

Below is the recommended GPIO configuration for the ESP32 board:

| Component | Protocol / Interface | ESP32 GPIO Pin(s) | Notes |
| :--- | :--- | :--- | :--- |
| **OLED Display (SSD1306)** | I2C | SDA (GPIO 21), SCL (GPIO 22) | Local visual console |
| **MAX30102 Oximeter** | I2C | SDA (GPIO 21), SCL (GPIO 22) | Heart Rate (BPM) & SpO₂ |
| **MLX90614 Temp Sensor** | I2C | SDA (GPIO 21), SCL (GPIO 22) | Non-contact body temperature |
| **DS3231 RTC Module** | I2C | SDA (GPIO 21), SCL (GPIO 22) | Real-time timestamps |
| **AD8232 ECG Module** | Analog / Digital Input | Output -> GPIO 34 (ADC1)<br>SDN -> GPIO 25 (Leads Off -)<br>LOD -> GPIO 26 (Leads Off +) | High-speed cardiac traces |
| **NEO-6M GPS Module** | UART (Serial2) | RX -> GPIO 16 (RX2), TX -> GPIO 17 (TX2) | Patient location tracking |
| **SIM800L GSM Shield** | UART (Serial1) | RX -> GPIO 27, TX -> GPIO 14 | Emergency SMS alert lines |
| **MicroSD Card Module** | SPI | CS (GPIO 5), SCK (GPIO 18), MISO (GPIO 19), MOSI (GPIO 23) | Local backup logging |
| **Status LEDs** | GPIO Output | Green (Normal) -> GPIO 12<br>Yellow (Warning) -> GPIO 13<br>Red (Critical) -> GPIO 15 | Visual alert lights |
| **Active Buzzer** | GPIO Output | GPIO 2 | Audible status sirens |

---

## 3. Firmware Features (PlatformIO)

The firmware is located in `src/` and compiled with the Arduino framework:
- **I2C Bus Optimization**: Throttles slow sensor reads (RTC, MLX90614, Blood Pressure) to 1 Hz to prevent I2C bus congestion. ECG and GPS serial stream buffers are checked at 50 Hz.
- **Dynamic WiFi AP/STA**: Checks for local router credentials. If connection fails or is disabled in `config.h`, it automatically launches its own local Access Point (`ESP32-VitalSigns-AP`) hosting the WebSocket service.
- **Non-blocking Sirens**: Sounds warning beeps (short toggle every 3s) and critical sirens (continuous toggle every 400ms) without using blocking `delay()`, ensuring the server runs smoothly.
- **Fail-safe Simulation Mode**: If any sensor is missing on boot, the system activates a mathematical simulator for that sensor, enabling you to test display outputs, dashboard charts, and alerts without physical hardware.

---

## 4. Web Dashboard Features (Next.js, Tailwind, PostgreSQL)

The dashboard is located in `dashboard/` and built with Next.js App Router:
- **Glassmorphism Dark UI**: A responsive layout built using Tailwind CSS utilities, featuring blur backdrops, modern slate gradients, and typography using Google Fonts Inter.
- **Pulsating Alert Glows**: Vitals cards dynamically display orange warning boundaries or red pulsing glows and sound alarms through browser speakers when critical thresholds are crossed.
- **50Hz ECG Sweep Chart**: The frontend buffers high-frequency ECG values and plots one point every 20ms using a smooth animation loop to replicate real clinical patient monitors.
- **Map Location Sync**: A Leaflet.js widget showing patient coordinates on an OpenStreetMap frame.
- **Auto-Schema Initializer**: Connects to your PostgreSQL database (with auto SSL verification for cloud instances like Render or Neon) and builds the required tables and insert values automatically on the first page load.
- **Local Document Compilers**: Compiles custom PDF summaries (with stats aggregates), Excel spreadsheets, or raw CSV logs in the browser using jsPDF and SheetJS.

---

## 5. PostgreSQL Database Schema

The database uses two primary tables defined in `dashboard/init.sql`:

### Patients Table
```sql
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INTEGER NOT NULL,
    gender VARCHAR(20) NOT NULL,
    id_number VARCHAR(50) UNIQUE NOT NULL,
    emergency_contact VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Vital Logs Table
```sql
CREATE TABLE vitals (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id_number) ON DELETE CASCADE,
    heart_rate REAL NOT NULL,
    spo2 REAL NOT NULL,
    temperature REAL NOT NULL,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    ecg_status VARCHAR(20) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    gps_time VARCHAR(30),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Installation & Deployment Guide

### Prerequisites
- Node.js (v18.x or later)
- PlatformIO IDE (VS Code extension)
- PostgreSQL Database Instance (e.g. hosted on **Render** or locally)

---

### Step 1: Initialize the PostgreSQL Database
If you are using **Render**:
1. Create a new **PostgreSQL** instance on [Render](https://render.com/).
2. Select the **Free** tier, name the database `VSMS`, and set the region.
3. Once deployed, copy the **External Database URL**.
4. Open the [dashboard/.env.local](file:///c:/Users/ekuty/Desktop/VSMS/dashboard/.env.local) file and paste the copied URL:
   ```text
   DATABASE_URL=postgresql://user:password@host-name.oregon-postgres.render.com/vitalguard
   ```
*(Note: When Next.js starts up, it automatically builds the SQL schemas in the cloud. You do not need to run `psql` manually).*

---

### Step 2: Start the Next.js Dashboard
1. Open a terminal in the `dashboard` folder:
   ```powershell
   cd c:\Users\ekuty\Desktop\VSMS\dashboard
   ```
2. Install the node packages:
   ```powershell
   npm install
   ```
3. Start the Next.js app in development mode:
   ```powershell
   npm run dev
   ```
4. Access the dashboard console at: **`http://localhost:3000`**

---

### Step 3: Flash the ESP32 Firmware
1. Open `src/config.h` in VS Code.
2. Update the `BACKEND_SERVER_URL` with your computer's local IP address (port `3000`):
   ```cpp
   #define BACKEND_SERVER_URL "http://192.168.1.100:3000/api/vitals"
   ```
3. Edit your Wi-Fi credentials under `LOCAL_SSID` and `LOCAL_PASSWORD` if you want the ESP32 to connect to your home router.
4. Plug in your ESP32 board.
5. Click **PlatformIO: Build** and then **PlatformIO: Upload** to flash the code.
6. Open the serial monitor (115200 baud). Once connected, the ESP32 will immediately start transmitting logs to PostgreSQL.

---

## 7. Vital Sign Threshold Reference

| Alert State | Heart Rate (BPM) | Oxygen (SpO₂ %) | Temperature (°C) | Blood Pressure (mmHg) | indicators |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal** | 60 – 100 | 95% – 100% | 36.0°C – 37.5°C | < 140 / 90 | Green LED (Solid) |
| **Warning** | 50-59 or 101-120 | 90% – 94% | 37.6°C – 38.5°C | ≥ 140 / 90 | Yellow LED, short beeps (3s) |
| **Critical** | < 50 or > 120 | < 90% | > 38.5°C | ≥ 180 / 120 | Red LED, siren (400ms), SMS sent |
