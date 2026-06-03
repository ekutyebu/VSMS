#ifndef WEB_SERVER_MANAGER_H
#define WEB_SERVER_MANAGER_H

#include "config.h"
#include "sensor_manager.h"
#include "storage_manager.h"
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>

class WebServerManager {
public:
    WebServerManager();
    bool begin(StorageManager* storageMgr, SensorManager* sensorMgr);
    void update(AlertLevel activeAlertLevel);
    void pushEcgSample(int ecgVal);
    bool isWifiConnected() const { return wifiConnected; }
    String getDetectedServerIP() const { return detectedServerIP; }

private:
    AsyncWebServer server;
    AsyncWebSocket ws;
    
    StorageManager* storage;
    SensorManager* sensors;
    
    bool wifiConnected;
    unsigned long lastBroadcastMs;
    
    String detectedServerIP;
    
    // ECG Buffer for 1-second WebSocket batch transmission
    int ecgBuffer[60];
    int ecgBufferIdx;
    
    void setupRoutes();
    void setupWebSocket();
    void broadcastTelemetry();
    void handleWebSocketMessage(void *arg, uint8_t *data, size_t len, AsyncWebSocketClient *client);
};

#endif // WEB_SERVER_MANAGER_H
