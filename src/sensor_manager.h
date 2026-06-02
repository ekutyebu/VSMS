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

class SensorManager {
public:
    SensorManager();
    bool begin();
    void update();
    const SensorData& getData() const { return data; }
    
    // Methods to interact/change simulated state for testing
    void toggleSimulatedAlert(AlertLevel level);
    void resetStats();

private:
    SensorData data;
    
    // Hardware sensor instances
    OneWire oneWire;
    DallasTemperature tempSensor;
    MAX30105 particleSensor;
    RTC_DS3231 rtc;
    TinyGPSPlus gps;
    HardwareSerial& gpsSerial;

    // Status flags
    bool dsOnline;
    bool maxOnline;
    bool rtcOnline;
    bool gpsOnline;

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
    
    void updateHRStats(float currentHR);
};

#endif // SENSOR_MANAGER_H
