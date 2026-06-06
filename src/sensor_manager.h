#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include "config.h"
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <MAX30105.h>
#include <RTClib.h>
#include <TinyGPS++.h>

struct SensorData {
    // Heart Rate
    float heartRate;
    float avgHeartRate;
    float minHeartRate;
    float maxHeartRate;
    
    // SpO2
    float spo2;
    
    // Temperature
    float tempC;
    float tempF;
    
    // Blood Pressure
    int bpSystolic;
    int bpDiastolic;
    int bpMAP;
    float bpCuffPressure;
    int bpState;
    
    // ECG
    int ecgValue;
    bool ecgLeadsOff;
    
    // GPS
    double gpsLatitude;
    double gpsLongitude;
    String gpsTimestamp;
    bool gpsValid;
    
    // RTC Date & Time
    String datetimeStr;
    uint32_t epochTime;
};

#include "hx711.h"

class SensorManager {
public:
    SensorManager();
    bool begin();
    void update();
    const SensorData& getData() const { return data; }
    
    // Methods to interact/change simulated state for testing
    void toggleSimulatedAlert(AlertLevel level);
    void resetStats();
    
    // Blood Pressure triggers
    void startBPMeasurement();
    void cancelBPMeasurement();

    // Monitoring mode triggers and patient biodata setters
    void setPatientInfo(const String& name, const String& id, const String& contact);
    void startSingleCheck();
    void startContinuousMonitoring();
    void stopMonitoring();
    
    MonitoringMode getMonitoringMode() const { return monitorMode; }
    int getCountdownSeconds() const { return countdownSeconds; }
    String getActivePatientId() const { return activePatientId; }
    String getActivePatientName() const { return activePatientName; }
    String getActivePatientEmergencyContact() const { return activePatientEmergencyContact; }
    
    bool checkAndClearSingleCollectFlag() {
        if (singleCollectCompleteFlag) {
            singleCollectCompleteFlag = false;
            return true;
        }
        return false;
    }

private:
    // Monitoring Mode State Variables
    MonitoringMode monitorMode;
    int countdownSeconds;
    unsigned long lastCountdownSecondMs;
    unsigned long collectStartMs;
    bool singleCollectCompleteFlag;
    
    String activePatientName;
    String activePatientId;
    String activePatientEmergencyContact;
    SensorData data;
    
    // Hardware sensor instances
    OneWire oneWire;
    DallasTemperature tempSensor;
    MAX30105 particleSensor;
    RTC_DS3231 rtc;
    TinyGPSPlus gps;
    HardwareSerial& gpsSerial;
    HX711 pressureSensor;

    // Status flags
    bool dsOnline;
    bool maxOnline;
    bool rtcOnline;
    bool gpsOnline;
    bool hxOnline;

    // Blood Pressure State Machine variables
    BPState bpCurrentState;
    unsigned long bpStateChangeMs;
    unsigned long lastBPSampleMs;
    bool bpMeasurementTriggered;
    float bpRawBaseCuffPressure;
    float bpLastCuffPressure;
    
    // Oscillometric Data Buffers (fixed-size to avoid dynamic allocations)
    static const int MAX_BP_OSC_SAMPLES = 300;
    float bpOscPressures[MAX_BP_OSC_SAMPLES];
    float bpOscAmplitudes[MAX_BP_OSC_SAMPLES];
    int bpOscCount;
    
    // Simple filter variables
    float bpFilterStateLow;
    float bpFilterStateHigh;

    // HR Statistics counters
    unsigned long hrSampleCount;
    float hrSum;

    // Simulation counters / state
    unsigned long simTick;
    AlertLevel simAlertLevel;
    
    // Internal sensor read helpers
    void readMAX30102();
    void readDS18B20();
    void readAD8232();
    void readBloodPressure();
    void readGPS();
    void readRTC();

    // Internal simulation helpers
    void simulateMAX30102();
    void simulateDS18B20();
    void simulateAD8232();
    void simulateBloodPressure();
    void simulateGPS();
    void simulateRTC();
    
    // Oscillometric Processing Helper
    void processOscillometricBP();
    
    void updateHRStats(float currentHR);
};

#endif // SENSOR_MANAGER_H
