#include "storage_manager.h"

StorageManager::StorageManager()
    : sdReady(false),
      logFilename("/vitals_log.csv")
{
}

bool StorageManager::begin() {
    Serial.println("[StorageManager] Initializing MicroSD card...");
    
    // Explicit SPI pin initialization
    SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
    
    if (SD.begin(SD_CS_PIN)) {
        sdReady = true;
        Serial.println("[StorageManager] MicroSD Card: ONLINE");
        writeHeader();
    } else {
        sdReady = false;
        Serial.println("[StorageManager] MicroSD Card: OFFLINE (will simulate logs)");
    }
    
    return sdReady;
}

void StorageManager::writeHeader() {
    if (!sdReady) return;
    
    if (!SD.exists(logFilename)) {
        File file = SD.open(logFilename, FILE_WRITE);
        if (file) {
            file.println("PatientID,Date,Time,BPM,SpO2,Temperature,BloodPressure,ECGStatus,GPSLocation");
            file.close();
            Serial.println("[StorageManager] Log file created with CSV header.");
        } else {
            Serial.println("[StorageManager] Failed to create log file header.");
        }
    }
}

bool StorageManager::logData(const SensorData& sensorData, AlertLevel status, const String& patientId) {
    // Parse Date and Time from datetimeStr (Format: YYYY-MM-DD HH:MM:SS)
    String datePart = sensorData.datetimeStr.substring(0, 10);
    String timePart = sensorData.datetimeStr.substring(11);
    
    String patId = patientId;
    if (patId.length() == 0) patId = "PT-2026-9841";
    
    String statusStr = "Normal";
    if (status == STATUS_WARNING) {
        statusStr = "Warning";
    } else if (status == STATUS_CRITICAL) {
        statusStr = "Critical";
    }
    
    char gpsStr[40];
    if (sensorData.gpsValid) {
        sprintf(gpsStr, "%.4f,%.4f", sensorData.gpsLatitude, sensorData.gpsLongitude);
    } else {
        strcpy(gpsStr, "None");
    }
    
    char bpStr[32];
    if (sensorData.bpState != BP_STATE_IDLE && sensorData.bpState != BP_STATE_COMPLETE) {
        sprintf(bpStr, "Cuff:%d", (int)sensorData.bpCuffPressure);
    } else {
        sprintf(bpStr, "%d/%d/%d", sensorData.bpSystolic, sensorData.bpDiastolic, sensorData.bpMAP);
    }
    
    char logLine[220];
    sprintf(logLine, "%s,%s,%s,%d,%d,%.1f,%s,%s,%s",
            patId.c_str(),
            datePart.c_str(),
            timePart.c_str(),
            (int)sensorData.heartRate,
            (int)sensorData.spo2,
            sensorData.tempC,
            bpStr,
            statusStr.c_str(),
            gpsStr);
            
    if (sdReady) {
        File file = SD.open(logFilename, FILE_APPEND);
        if (file) {
            file.println(logLine);
            file.close();
            return true;
        } else {
            Serial.println("[StorageManager] Error opening log file for append.");
            return false;
        }
    } else {
        // Mock logging
        Serial.printf("[StorageManager] [LOG SIM] %s\n", logLine);
        return true;
    }
}

File StorageManager::getLogFile() {
    if (sdReady && SD.exists(logFilename)) {
        return SD.open(logFilename, FILE_READ);
    }
    return File(); // Returns empty file object if not found
}

void StorageManager::clearLogs() {
    if (sdReady) {
        SD.remove(logFilename);
        writeHeader();
        Serial.println("[StorageManager] Log file has been cleared.");
    }
}
