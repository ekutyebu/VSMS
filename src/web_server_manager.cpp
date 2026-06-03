#include "web_server_manager.h"
#include <WiFi.h>

WebServerManager::WebServerManager()
    : server(80),
      ws("/ws"),
      storage(nullptr),
      sensors(nullptr),
      wifiConnected(false),
      lastBroadcastMs(0),
      ecgBufferIdx(0),
      detectedServerIP("")
{
    memset(ecgBuffer, 0, sizeof(ecgBuffer));
}

bool WebServerManager::begin(StorageManager* storageMgr, SensorManager* sensorMgr) {
    storage = storageMgr;
    sensors = sensorMgr;
    
    Serial.println("[WebServerManager] Initializing WiFi & Web Server...");
    
    // 1. Configure Wi-Fi Mode
    if (WIFI_IS_AP) {
        WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
        IPAddress ip = WiFi.softAPIP();
        Serial.printf("[WebServerManager] Access Point started.\nSSID: %s\nIP: %s\n", WIFI_SSID, ip.toString().c_str());
        wifiConnected = false;
    } else {
        Serial.printf("[WebServerManager] Connecting to SSID: %s...\n", LOCAL_SSID);
        WiFi.begin(LOCAL_SSID, LOCAL_PASSWORD);
        
        int retries = 0;
        while (WiFi.status() != WL_CONNECTED && retries < 20) {
            delay(500);
            Serial.print(".");
            retries++;
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            Serial.printf("\n[WebServerManager] Connected to Wi-Fi. IP: %s\n", WiFi.localIP().toString().c_str());
            // Sync time with NTP server for secure SSL/TLS handshakes (offset by 3600 seconds for GMT+1)
            configTime(3600, 0, "pool.ntp.org", "time.nist.gov");
            Serial.println("[WebServerManager] NTP Time Sync configured for GMT+1.");
        } else {
            Serial.println("\n[WebServerManager] Wi-Fi connection failed. Falling back to AP mode...");
            WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
            IPAddress ip = WiFi.softAPIP();
            Serial.printf("[WebServerManager] Access Point started.\nSSID: %s\nIP: %s\n", WIFI_SSID, ip.toString().c_str());
            wifiConnected = false;
        }
    }
    
    // 2. Initialize SPIFFS
    if (SPIFFS.begin(true)) {
        Serial.println("[WebServerManager] SPIFFS Mounted Successfully");
        
        // Write default patient profile if not existing
        if (!SPIFFS.exists("/patient.json")) {
            File f = SPIFFS.open("/patient.json", FILE_WRITE);
            if (f) {
                f.println("{\"name\":\"John Doe\",\"age\":45,\"gender\":\"Male\",\"idNumber\":\"PT-2026-9841\",\"emergencyContact\":\"+1234567890\"}");
                f.close();
                Serial.println("[WebServerManager] Created default patient.json");
            }
        }
    } else {
        Serial.println("[WebServerManager] Error mounting SPIFFS!");
    }
    
    // 3. Setup Routes and WebSocket
    setupWebSocket();
    setupRoutes();
    
    // Start server
    server.begin();
    Serial.println("[WebServerManager] HTTP Server started on port 80");
    
    lastBroadcastMs = millis();
    return true;
}

void WebServerManager::setupRoutes() {
    // Serve static dashboard pages from SPIFFS
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/index.html", "text/html");
    });
    
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/style.css", "text/css");
    });
    
    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/script.js", "application/javascript");
    });
    
    server.on("/patient.json", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/patient.json", "application/json");
    });
    
    // API: Download historical CSV records
    server.on("/api/logs", HTTP_GET, [this](AsyncWebServerRequest *request) {
        if (storage->isReady()) {
            request->send(SD, "/vitals_log.csv", "text/csv");
        } else {
            // If SD card is not present, serve simulated sample data so UI can be fully demonstrated
            String dummyCSV = "Date,Time,BPM,SpO2,Temperature,BloodPressure,ECGStatus,GPSLocation\n"
                              "2026-06-02,12:10:00,72,98,36.6,118/76,Normal,51.4687,-0.0934\n"
                              "2026-06-02,12:11:00,74,99,36.7,120/78,Normal,51.4689,-0.0931\n"
                              "2026-06-02,12:12:00,75,98,36.5,119/77,Normal,51.4691,-0.0928\n"
                              "2026-06-02,12:13:00,73,98,36.8,122/80,Normal,51.4693,-0.0925\n"
                              "2026-06-02,12:13:47,75,98,36.7,118/76,Normal,51.4695,-0.0922\n";
            request->send(200, "text/csv", dummyCSV);
        }
    });
    
    // API: Clear logs
    server.on("/api/clear_logs", HTTP_GET, [this](AsyncWebServerRequest *request) {
        storage->clearLogs();
        request->send(200, "application/json", "{\"status\":\"success\"}");
    });
    
    // API: Save patient metadata to LittleFS/SPIFFS
    server.on("/api/save_patient", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            File file = SPIFFS.open("/patient.json", FILE_WRITE);
            if (file) {
                file.write(data, len);
                file.close();
                request->send(200, "application/json", "{\"status\":\"success\"}");
            } else {
                request->send(500, "application/json", "{\"status\":\"error\",\"message\":\"Failed to write config file\"}");
            }
        }
    );
    
    // API: Adjust simulation alert states for debugging
    server.on("/api/toggle_sim", HTTP_GET, [this](AsyncWebServerRequest *request) {
        if (request->hasParam("level")) {
            int levelVal = request->getParam("level")->value().toInt();
            sensors->toggleSimulatedAlert((AlertLevel)levelVal);
            request->send(200, "application/json", "{\"status\":\"success\",\"level\":" + String(levelVal) + "}");
        } else {
            request->send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing level query parameter\"}");
        }
    });

    // 404 Handler
    server.onNotFound([](AsyncWebServerRequest *request) {
        request->send(404, "text/plain", "404: Not Found");
    });
}

void WebServerManager::setupWebSocket() {
    ws.onEvent([this](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
        switch (type) {
            case WS_EVT_CONNECT:
                Serial.printf("[WebSocket] Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
                detectedServerIP = client->remoteIP().toString();
                break;
            case WS_EVT_DISCONNECT:
                Serial.printf("[WebSocket] Client #%u disconnected\n", client->id());
                break;
            case WS_EVT_DATA:
                handleWebSocketMessage(arg, data, len, client);
                break;
            case WS_EVT_PONG:
            case WS_EVT_ERROR:
                break;
        }
    });
    server.addHandler(&ws);
}

void WebServerManager::handleWebSocketMessage(void *arg, uint8_t *data, size_t len, AsyncWebSocketClient *client) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
        data[len] = 0;
        String message = (char*)data;
        Serial.printf("[WebSocket] Received message: %s\n", message.c_str());
        
        // Handle potential client requests sent via WebSocket (e.g. toggle commands)
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, message);
        if (!err) {
            if (doc.containsKey("requestSimLevel")) {
                int level = doc["requestSimLevel"];
                sensors->toggleSimulatedAlert((AlertLevel)level);
            }
            if (doc.containsKey("resetStats")) {
                sensors->resetStats();
            }
        }
    }
}

void WebServerManager::pushEcgSample(int ecgVal) {
    // Collect ECG samples at high frequency (e.g. 50Hz) and packetize them in 1s intervals.
    // Ensure we don't overflow the buffer array.
    if (ecgBufferIdx < 60) {
        ecgBuffer[ecgBufferIdx++] = ecgVal;
    }
}

void WebServerManager::update(AlertLevel activeAlertLevel) {
    ws.cleanupClients();
    
    unsigned long now = millis();
    if (now - lastBroadcastMs >= WEBSOCKET_UPDATE_INTERVAL_MS) {
        lastBroadcastMs = now;
        
        // Only broadcast if there are connected clients to save processing
        if (ws.count() > 0) {
            StaticJsonDocument<2048> doc;
            const SensorData& d = sensors->getData();
            
            doc["heartRate"] = d.heartRate;
            doc["avgHeartRate"] = d.avgHeartRate;
            doc["minHeartRate"] = (d.minHeartRate == 999.0) ? 0.0 : d.minHeartRate;
            doc["maxHeartRate"] = d.maxHeartRate;
            doc["spo2"] = d.spo2;
            doc["tempC"] = d.tempC;
            doc["tempF"] = d.tempF;
            doc["bpSystolic"] = d.bpSystolic;
            doc["bpDiastolic"] = d.bpDiastolic;
            doc["ecgLeadsOff"] = d.ecgLeadsOff;
            doc["gpsLatitude"] = d.gpsLatitude;
            doc["gpsLongitude"] = d.gpsLongitude;
            doc["gpsValid"] = d.gpsValid;
            doc["gpsTimestamp"] = d.gpsTimestamp;
            doc["datetimeStr"] = d.datetimeStr;
            doc["systemAlertLevel"] = (int)activeAlertLevel;
            doc["sdReady"] = storage->isReady();
            doc["wifiConnected"] = wifiConnected;
            
            // Build ECG waveform buffer
            JsonArray ecgArr = doc.createNestedArray("ecgBuffer");
            for (int i = 0; i < ecgBufferIdx; i++) {
                ecgArr.add(ecgBuffer[i]);
            }
            
            // Reset buffer indices
            ecgBufferIdx = 0;
            
            String jsonOutput;
            serializeJson(doc, jsonOutput);
            ws.textAll(jsonOutput);
        } else {
            // Keep buffer index reset even if no clients are connected
            ecgBufferIdx = 0;
        }
    }
}
