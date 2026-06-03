#include "config.h"
#include "sensor_manager.h"
#include "display_manager.h"
#include "alert_manager.h"
#include "storage_manager.h"
#include "web_server_manager.h"
#include <WiFi.h>
#include <HTTPClient.h>

// Global instances of system managers
SensorManager sensorManager;
DisplayManager displayManager;
AlertManager alertManager;
StorageManager storageManager;
WebServerManager webServerManager;

// Timers
unsigned long lastSensorUpdateMs = 0;
unsigned long lastLogMs = 0;

// Central PostgreSQL database synchronization via Next.js REST API
#include <WiFiClientSecure.h>
void syncDatabase() {
    if (WiFi.status() == WL_CONNECTED) {
        String serverUrl = BACKEND_SERVER_URL;
        String detectedIP = webServerManager.getDetectedServerIP();
        
        // Auto-discovery: If a local dashboard client connects via WebSocket,
        // sync database records locally to that machine's dev server port 3000.
        if (detectedIP.length() > 0 && (serverUrl.indexOf("render.com") != -1 || serverUrl.indexOf("localhost") != -1)) {
            serverUrl = "http://" + detectedIP + ":3000/api/vitals";
        }
        
        HTTPClient http;
        WiFiClient client;
        WiFiClientSecure clientSecure;
        
        if (serverUrl.startsWith("https://")) {
            clientSecure.setInsecure(); // Bypass SSL certificate verification for HTTPS Render domain
            http.begin(clientSecure, serverUrl);
        } else {
            http.begin(client, serverUrl);
        }
        
        http.setTimeout(4000); // Prevent blocking the main loop for too long if the server is slow/offline
        http.addHeader("Content-Type", "application/json");
        
        StaticJsonDocument<512> doc;
        const SensorData& d = sensorManager.getData();
        
        // Populate JSON telemetry packet
        doc["patientId"] = "PT-2026-9841"; // Default patient MRN
        doc["heartRate"] = d.heartRate;
        doc["spo2"] = d.spo2;
        doc["tempC"] = d.tempC;
        doc["bpSystolic"] = d.bpSystolic;
        doc["bpDiastolic"] = d.bpDiastolic;
        
        // Resolve status string
        String statusStr = "Normal";
        AlertLevel alert = alertManager.getAlertLevel();
        if (alert == STATUS_WARNING) {
            statusStr = "Warning";
        } else if (alert == STATUS_CRITICAL) {
            statusStr = "Critical";
        }
        doc["ecgStatus"] = statusStr;
        
        // Add GPS coordinates if valid
        if (d.gpsValid) {
            doc["latitude"] = d.gpsLatitude;
            doc["longitude"] = d.gpsLongitude;
            doc["gpsTimestamp"] = d.gpsTimestamp;
        }
        
        String jsonPayload;
        serializeJson(doc, jsonPayload);
        
        int httpResponseCode = http.POST(jsonPayload);
        if (httpResponseCode > 0) {
            String response = http.getString();
            Serial.printf("[DB Sync] Success: Code %d, Response: %s\n", httpResponseCode, response.c_str());
        } else {
            Serial.printf("[DB Sync] Connection Failed: %s\n", http.errorToString(httpResponseCode).c_str());
        }
        http.end();
    } else {
        Serial.println("[DB Sync] Offline (WiFi not connected). Saved locally on MicroSD card.");
    }
}

void setup() {
    // Start serial communications
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n=================================================");
    Serial.println("  ESP32 IoT Vital Signs Health Monitor Starting  ");
    Serial.println("=================================================");

    // Initialize display first to show status to local operator
    displayManager.begin();

    // Initialize sensors
    sensorManager.begin();

    // Initialize alert systems (LEDs, Buzzer, GSM)
    alertManager.begin();

    // Initialize MicroSD logging
    storageManager.begin();

    // Initialize HTTP and WebSocket servers
    webServerManager.begin(&storageManager, &sensorManager);

    Serial.println("[System] Initialization complete. Running loops.");
    Serial.println("=================================================");
    
    lastSensorUpdateMs = millis();
    lastLogMs = millis();
}

void loop() {
    unsigned long currentMillis = millis();

    // 1. High-frequency sensor sampling and task processing loop (50 Hz / every 20ms)
    // This rates matches standard ECG sampling requirements.
    if (currentMillis - lastSensorUpdateMs >= 20) {
        lastSensorUpdateMs = currentMillis;

        // Update all sensors
        sensorManager.update();

        // Push real-time ECG signal sample to WebSocket buffer
        webServerManager.pushEcgSample(sensorManager.getData().ecgValue);
        
        // Update alert logic based on current sensor state
        alertManager.update(sensorManager.getData());

        // Update local OLED display with rotated pages and alarm overlays
        displayManager.update(
            sensorManager.getData(),
            alertManager.getAlertLevel(),
            webServerManager.isWifiConnected(),
            storageManager.isReady()
        );
    }

    // 2. Run background tasks (WebSocket cleaners, etc.)
    webServerManager.update(alertManager.getAlertLevel());

    // 3. Periodic local SD card data logging and Central PostgreSQL sync (every 5 seconds)
    if (currentMillis - lastLogMs >= SYNC_INTERVAL_MS) {
        lastLogMs = currentMillis;
        
        // Local log
        storageManager.logData(sensorManager.getData(), alertManager.getAlertLevel());
        
        // DB Sync
        syncDatabase();
    }
}
