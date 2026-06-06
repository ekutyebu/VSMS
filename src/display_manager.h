#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include "config.h"
#include "sensor_manager.h"
#include <Adafruit_SH110X.h>

class DisplayManager {
public:
    DisplayManager();
    bool begin();
    void update(const SensorData& sensorData, AlertLevel systemAlertLevel, bool wifiConnected, bool sdReady, int monitorMode = 0, int countdownSeconds = 0, const String& activePatientName = "");
    void setPage(int pageIndex);
    int getCurrentPage() const { return currentPage; }

private:
    Adafruit_SH1106G display;
    int currentPage;
    unsigned long lastPageTransitionMs;
    bool oledOnline;

    void drawPage1(const SensorData& d);
    void drawPage2(const SensorData& d);
    void drawPage3(const SensorData& d);
    void drawPage4(const SensorData& d);
    void drawPage5(const SensorData& d, AlertLevel alert, bool wifi, bool sd);
    void drawAlertBanner(AlertLevel alert);
    void drawHeader(const char* title);
    void drawBPMeasurementPage(const SensorData& d);
    void drawCountdownPage(const String& name, int seconds);
    void drawCollectingPage(const String& name);
};

#endif // DISPLAY_MANAGER_H
