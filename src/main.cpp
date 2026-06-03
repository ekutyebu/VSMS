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
#include <time.h>

const char* rootCACertificate = \
"-----BEGIN CERTIFICATE-----\n" \
"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\n" \
"-----END CERTIFICATE-----\n";

struct ParsedUrl {
    bool isHttps;
    String host;
    int port;
    String path;
};

ParsedUrl parseUrl(String url) {
    ParsedUrl parsed;
    parsed.isHttps = url.startsWith("https://");
    
    int startIdx = parsed.isHttps ? 8 : 7;
    int slashIdx = url.indexOf('/', startIdx);
    
    String hostPortStr;
    if (slashIdx == -1) {
        hostPortStr = url.substring(startIdx);
        parsed.path = "/";
    } else {
        hostPortStr = url.substring(startIdx, slashIdx);
        parsed.path = url.substring(slashIdx);
    }
    
    int colonIdx = hostPortStr.indexOf(':');
    if (colonIdx == -1) {
        parsed.host = hostPortStr;
        parsed.port = parsed.isHttps ? 443 : 80;
    } else {
        parsed.host = hostPortStr.substring(0, colonIdx);
        parsed.port = hostPortStr.substring(colonIdx + 1).toInt();
    }
    
    return parsed;
}

void syncDatabase() {
    if (WiFi.status() == WL_CONNECTED) {
        String serverUrl = BACKEND_SERVER_URL;
        String detectedIP = webServerManager.getDetectedServerIP();
        
        // Auto-discovery: If a local dashboard client connects via WebSocket,
        // sync database records locally to that machine's dev server port 3000.
        if (detectedIP.length() > 0 && (serverUrl.indexOf("render.com") != -1 || serverUrl.indexOf("localhost") != -1)) {
            serverUrl = "http://" + detectedIP + ":3000/api/vitals";
        }
        
        ParsedUrl url = parseUrl(serverUrl);
        
        // Print diagnostics
        time_t now = time(nullptr);
        struct tm timeinfo;
        gmtime_r(&now, &timeinfo);
        Serial.printf("[DB Sync] Syncing to URL: %s\n", serverUrl.c_str());
        Serial.printf("[DB Sync] System Time (UTC): %04d-%02d-%02d %02d:%02d:%02d\n",
                      timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
        Serial.printf("[DB Sync] Free Heap: %u bytes, Max Alloc Block: %u bytes\n", ESP.getFreeHeap(), ESP.getMaxAllocHeap());
        
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
        
        bool success = false;
        String statusLine = "";
        String responseBody = "";
        
        if (url.isHttps) {
            WiFiClientSecure clientSecure;
            bool connected = false;
            if (now > 1000000000) { // If NTP time is synchronized (greater than year 2001)
                clientSecure.setCACert(rootCACertificate);
                Serial.println("[DB Sync] Secure TLS: Using Let's Encrypt Root CA Certificate verification");
                clientSecure.setTimeout(4000); // 4-second timeout
                if (clientSecure.connect(url.host.c_str(), url.port)) {
                    connected = true;
                } else {
                    Serial.println("[DB Sync] Secure TLS: Root CA validation failed. Retrying with setInsecure()...");
                }
            }
            
            if (!connected) {
                // Reinitialize client or reset certificate requirements
                clientSecure.stop();
                clientSecure.setInsecure();
                clientSecure.setTimeout(4000);
                if (clientSecure.connect(url.host.c_str(), url.port)) {
                    connected = true;
                    Serial.println("[DB Sync] Secure TLS: Connected using setInsecure() fallback.");
                }
            }
            
            if (connected) {
                // Send raw HTTP POST request
                clientSecure.printf("POST %s HTTP/1.1\r\n", url.path.c_str());
                clientSecure.printf("Host: %s\r\n", url.host.c_str());
                clientSecure.println("User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                clientSecure.println("Content-Type: application/json");
                clientSecure.printf("Content-Length: %d\r\n", jsonPayload.length());
                clientSecure.println("Connection: close");
                clientSecure.println();
                clientSecure.print(jsonPayload);
                
                // Read HTTP status line
                statusLine = clientSecure.readStringUntil('\n');
                
                // Read HTTP Headers response
                long startTime = millis();
                while (clientSecure.connected() && millis() - startTime < 4000) {
                    String line = clientSecure.readStringUntil('\n');
                    if (line == "\r" || line == "") {
                        break;
                    }
                }
                
                // Read body
                responseBody = clientSecure.readString();
                success = true;
                clientSecure.stop();
            } else {
                Serial.println("[DB Sync] Secure TCP socket connection failed!");
            }
        } else {
            WiFiClient client;
            client.setTimeout(4000); // 4-second timeout
            
            if (client.connect(url.host.c_str(), url.port)) {
                // Send raw HTTP POST request
                client.printf("POST %s HTTP/1.1\r\n", url.path.c_str());
                client.printf("Host: %s\r\n", url.host.c_str());
                client.println("User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                client.println("Content-Type: application/json");
                client.printf("Content-Length: %d\r\n", jsonPayload.length());
                client.println("Connection: close");
                client.println();
                client.print(jsonPayload);
                
                // Read HTTP status line
                statusLine = client.readStringUntil('\n');
                
                // Read HTTP Headers response
                long startTime = millis();
                while (client.connected() && millis() - startTime < 4000) {
                    String line = client.readStringUntil('\n');
                    if (line == "\r" || line == "") {
                        break;
                    }
                }
                
                // Read body
                responseBody = client.readString();
                success = true;
                client.stop();
            } else {
                Serial.println("[DB Sync] TCP socket connection failed!");
            }
        }
        
        if (success) {
            statusLine.replace("\r", "");
            statusLine.replace("\n", "");
            Serial.printf("[DB Sync] Success! Status: %s, Response: %s\n", statusLine.c_str(), responseBody.c_str());
        } else {
            Serial.println("[DB Sync] Sync attempt failed.");
        }
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
