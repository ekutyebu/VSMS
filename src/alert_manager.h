#ifndef ALERT_MANAGER_H
#define ALERT_MANAGER_H

#include "config.h"
#include "sensor_manager.h"

class AlertManager {
public:
    AlertManager();
    bool begin();
    void update(const SensorData& sensorData, const String& emergencyNumber);
    AlertLevel getAlertLevel() const { return currentLevel; }
    
    // Manual trigger for GSM test
    void sendTestSMS();

private:
    AlertLevel currentLevel;
    HardwareSerial& gsmSerial;
    bool gsmOnline;
    unsigned long lastBuzzerToggleMs;
    bool buzzerState;
    
    // Call state tracking variables
    bool callActive;
    unsigned long callStartMs;
    
    // Track if SMS has been sent for the current critical event (to prevent spamming SMS)
    bool smsSentForCurrentEvent;

    // Helper functions
    AlertLevel evaluateAlertLevel(const SensorData& d);
    void updateIndicators();
    void sendCriticalSMS(const SensorData& d, const String& emergencyNumber);
    void dialEmergencyCall(const String& emergencyNumber);
    String formatCameroonNumber(const String& rawNumber);
    bool checkGSMResponse(const char* expected, uint32_t timeoutMs);
    void writeGSMCommand(const char* cmd);
};

#endif // ALERT_MANAGER_H
