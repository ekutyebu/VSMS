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

bool postTelemetry(const String& serverUrl, const String& jsonPayload) {
    ParsedUrl url = parseUrl(serverUrl);
    bool success = false;
    String statusLine = "";
    String responseBody = "";
    
    if (url.isHttps) {
        bool connected = false;
        WiFiClientSecure clientSecure;
        clientSecure.setTimeout(10000);        // 10-second timeout
        
        time_t now = time(nullptr);
        if (now > 1000000000) { // If NTP time is synchronized (greater than year 2001)
            clientSecure.setCACert(rootCACertificate);
            Serial.printf("[DB Sync] Secure TLS: Attempting verified connection to %s\n", url.host.c_str());
            if (clientSecure.connect(url.host.c_str(), url.port)) {
                connected = true;
                
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
                while (clientSecure.connected() && millis() - startTime < 3000) {
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
                Serial.println("[DB Sync] Secure TLS: Root CA validation failed. Retrying with setInsecure()...");
            }
        }
        
        if (!connected) {
            WiFiClientSecure clientInsecure;
            clientInsecure.setInsecure();
            clientInsecure.setTimeout(10000);        // 10-second timeout
            Serial.printf("[DB Sync] Secure TLS: Attempting unverified connection to %s\n", url.host.c_str());
            if (clientInsecure.connect(url.host.c_str(), url.port)) {
                connected = true;
                Serial.println("[DB Sync] Secure TLS: Connected using setInsecure() fallback.");
                
                // Send raw HTTP POST request
                clientInsecure.printf("POST %s HTTP/1.1\r\n", url.path.c_str());
                clientInsecure.printf("Host: %s\r\n", url.host.c_str());
                clientInsecure.println("User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                clientInsecure.println("Content-Type: application/json");
                clientInsecure.printf("Content-Length: %d\r\n", jsonPayload.length());
                clientInsecure.println("Connection: close");
                clientInsecure.println();
                clientInsecure.print(jsonPayload);
                
                // Read HTTP status line
                statusLine = clientInsecure.readStringUntil('\n');
                
                // Read HTTP Headers response
                long startTime = millis();
                while (clientInsecure.connected() && millis() - startTime < 3000) {
                    String line = clientInsecure.readStringUntil('\n');
                    if (line == "\r" || line == "") {
                        break;
                    }
                }
                
                // Read body
                responseBody = clientInsecure.readString();
                success = true;
                clientInsecure.stop();
            }
        }
        
        if (!connected) {
            Serial.printf("[DB Sync] Secure TCP connection to %s failed!\n", url.host.c_str());
        }
    } else {
        WiFiClient client;
        client.setTimeout(2000);       // 2-second timeout
        Serial.printf("[DB Sync] Plain HTTP: Attempting connection to %s\n", url.host.c_str());
        
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
            while (client.connected() && millis() - startTime < 3000) {
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
            Serial.printf("[DB Sync] Plain TCP connection to %s failed!\n", url.host.c_str());
        }
    }
    
    if (success) {
        statusLine.replace("\r", "");
        statusLine.replace("\n", "");
        Serial.printf("[DB Sync] Success! Status: %s, Response: %s\n", statusLine.c_str(), responseBody.c_str());
    } else {
        Serial.printf("[DB Sync] Sync attempt to %s failed.\n", serverUrl.c_str());
    }
    
    return success;
}

struct SyncPayload {
    float heartRate;
    float spo2;
    float tempC;
    int bpSystolic;
    int bpDiastolic;
    char ecgStatus[16];
    double gpsLatitude;
    double gpsLongitude;
    char gpsTimestamp[16];
    bool gpsValid;
    char localUrl[128];
};

SyncPayload nextSyncPayload;
SemaphoreHandle_t syncSemaphore = NULL;
SemaphoreHandle_t syncMutex = NULL;

void dbSyncTask(void *pvParameters) {
    while (true) {
        // Block until loop() triggers a sync
        if (xSemaphoreTake(syncSemaphore, portMAX_DELAY) == pdTRUE) {
            SyncPayload payload;
            
            // Safe copy of the payload
            if (xSemaphoreTake(syncMutex, portMAX_DELAY) == pdTRUE) {
                payload = nextSyncPayload;
                xSemaphoreGive(syncMutex);
            }
            
            // Now perform HTTP sync using the copied payload (outside the mutex)
            if (WiFi.status() == WL_CONNECTED) {
                // Print diagnostics
                time_t now = time(nullptr);
                struct tm timeinfo;
                gmtime_r(&now, &timeinfo);
                Serial.printf("[DB Sync] System Time (UTC): %04d-%02d-%02d %02d:%02d:%02d\n",
                              timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                              timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
                Serial.printf("[DB Sync] Free Heap: %u bytes, Max Alloc Block: %u bytes\n", ESP.getFreeHeap(), ESP.getMaxAllocHeap());
                
                StaticJsonDocument<512> doc;
                doc["patientId"] = "PT-2026-9841";
                doc["heartRate"] = payload.heartRate;
                doc["spo2"] = payload.spo2;
                doc["tempC"] = payload.tempC;
                doc["bpSystolic"] = payload.bpSystolic;
                doc["bpDiastolic"] = payload.bpDiastolic;
                doc["ecgStatus"] = payload.ecgStatus;
                
                if (payload.gpsValid) {
                    doc["latitude"] = payload.gpsLatitude;
                    doc["longitude"] = payload.gpsLongitude;
                    doc["gpsTimestamp"] = payload.gpsTimestamp;
                }
                
                String jsonPayload;
                serializeJson(doc, jsonPayload);
                
                // 1. Sync to hosted server
                Serial.printf("[DB Sync] Destination 1: %s\n", HOSTED_SERVER_URL);
                postTelemetry(HOSTED_SERVER_URL, jsonPayload);
                
                // 2. Sync to local dev server (auto-discovered IP if client connected, otherwise default LOCAL_SERVER_URL)
                Serial.printf("[DB Sync] Destination 2: %s\n", payload.localUrl);
                postTelemetry(payload.localUrl, jsonPayload);
            } else {
                Serial.println("[DB Sync] Offline (WiFi not connected). Saved locally on MicroSD card.");
            }
        }
    }
}

void triggerDatabaseSync(const SensorData& d, AlertLevel alert) {
    if (syncMutex == NULL || syncSemaphore == NULL) return;
    
    if (xSemaphoreTake(syncMutex, 0) == pdTRUE) {
        nextSyncPayload.heartRate = d.heartRate;
        nextSyncPayload.spo2 = d.spo2;
        nextSyncPayload.tempC = d.tempC;
        nextSyncPayload.bpSystolic = d.bpSystolic;
        nextSyncPayload.bpDiastolic = d.bpDiastolic;
        
        String statusStr = "Normal";
        if (alert == STATUS_WARNING) {
            statusStr = "Warning";
        } else if (alert == STATUS_CRITICAL) {
            statusStr = "Critical";
        }
        strncpy(nextSyncPayload.ecgStatus, statusStr.c_str(), sizeof(nextSyncPayload.ecgStatus) - 1);
        nextSyncPayload.ecgStatus[sizeof(nextSyncPayload.ecgStatus) - 1] = '\0';
        
        nextSyncPayload.gpsLatitude = d.gpsLatitude;
        nextSyncPayload.gpsLongitude = d.gpsLongitude;
        nextSyncPayload.gpsValid = d.gpsValid;
        
        strncpy(nextSyncPayload.gpsTimestamp, d.gpsTimestamp.c_str(), sizeof(nextSyncPayload.gpsTimestamp) - 1);
        nextSyncPayload.gpsTimestamp[sizeof(nextSyncPayload.gpsTimestamp) - 1] = '\0';
        
        // Resolve local URL using detected server IP
        String localIp = webServerManager.getDetectedServerIP();
        String localUrl = LOCAL_SERVER_URL;
        if (localIp.length() > 0) {
            localUrl = "http://" + localIp + ":3000/api/vitals";
        }
        strncpy(nextSyncPayload.localUrl, localUrl.c_str(), sizeof(nextSyncPayload.localUrl) - 1);
        nextSyncPayload.localUrl[sizeof(nextSyncPayload.localUrl) - 1] = '\0';
        
        xSemaphoreGive(syncMutex);
        xSemaphoreGive(syncSemaphore); // Wake up background task
    } else {
        Serial.println("[DB Sync] Warning: Previous sync still active, skipping this interval.");
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

    // Initialize Synchronization Semaphore and Mutex
    syncSemaphore = xSemaphoreCreateBinary();
    syncMutex = xSemaphoreCreateMutex();

    // Spawn background database sync task on Core 0 (priority 1, stack size 8192)
    xTaskCreatePinnedToCore(
        dbSyncTask,
        "dbSyncTask",
        8192,
        NULL,
        1,
        NULL,
        0
    );

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
        
        // Trigger non-blocking database sync on Core 0
        triggerDatabaseSync(sensorManager.getData(), alertManager.getAlertLevel());
    }
}
