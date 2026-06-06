#ifndef STORAGE_MANAGER_H
#define STORAGE_MANAGER_H

#include "config.h"
#include "sensor_manager.h"
#include <SPI.h>
#include <SD.h>

class StorageManager {
public:
    StorageManager();
    bool begin();
    bool logData(const SensorData& sensorData, AlertLevel ecgStatus, const String& patientId = "");
    bool isReady() const { return sdReady; }
    
    // Read the log file contents and write directly to an output stream (e.g. for web downloads)
    File getLogFile();
    void clearLogs();

private:
    bool sdReady;
    const char* logFilename;
    
    void writeHeader();
};

#endif // STORAGE_MANAGER_H
