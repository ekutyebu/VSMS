#include "display_manager.h"
#include <Adafruit_GFX.h>
#include <Wire.h>

#define SSD1306_WHITE SH110X_WHITE
#define SSD1306_BLACK SH110X_BLACK

DisplayManager::DisplayManager()
    : display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, OLED_RESET),
      currentPage(0),
      lastPageTransitionMs(0),
      oledOnline(false)
{
}

bool DisplayManager::begin() {
    Serial.println("[DisplayManager] Initializing OLED display...");
    
    // Scan I2C bus to diagnose connection issues
    Serial.println("[DisplayManager] Scanning I2C bus...");
    byte error, address;
    int nDevices = 0;
    for (address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        error = Wire.endTransmission();
        if (error == 0) {
            Serial.printf("[DisplayManager] I2C device found at address 0x%02X\n", address);
            nDevices++;
        }
    }
    if (nDevices == 0) {
        Serial.println("[DisplayManager] No I2C devices found! Check your SDA/SCL wiring, pull-ups, and power.");
    } else {
        Serial.printf("[DisplayManager] Scan complete. Found %d active I2C device(s).\n", nDevices);
    }
    
    // Initialize OLED I2C display
    if (display.begin(OLED_I2C_ADDR, true)) {
        oledOnline = true;
        display.clearDisplay();
        display.setTextWrap(false);
        display.setTextColor(SSD1306_WHITE);
        
        // Show brief startup splash screen
        display.setTextSize(1);
        display.setCursor(10, 15);
        display.println("VITAL SIGNS MONITOR");
        display.drawRect(5, 5, 118, 54, SSD1306_WHITE);
        display.setCursor(20, 35);
        display.println("Initializing...");
        display.display();
        delay(1000);
        
        Serial.println("[DisplayManager] SSD1306 OLED: ONLINE");
        lastPageTransitionMs = millis();
    } else {
        Serial.println("[DisplayManager] SSD1306 OLED: OFFLINE (will log warning)");
        Serial.printf("[DisplayManager] Please check if your OLED uses address 0x3D instead of 0x3C, or if I2C wiring is disconnected.\n");
    }
    
    return oledOnline;
}

void DisplayManager::update(const SensorData& sensorData, AlertLevel systemAlertLevel, bool wifiConnected, bool sdReady) {
    if (!oledOnline) return;
    
    unsigned long currentMillis = millis();
    
    // Override page rendering if Blood Pressure Measurement is active
    if (sensorData.bpState != BP_STATE_IDLE) {
        display.clearDisplay();
        drawBPMeasurementPage(sensorData);
        display.display();
        return;
    }
    
    // Handle automatic page transitions
    if (currentMillis - lastPageTransitionMs >= OLED_PAGE_ROTATION_MS) {
        lastPageTransitionMs = currentMillis;
        currentPage = (currentPage + 1) % 5;
    }
    
    display.clearDisplay();
    
    // If critical, display flashing banner on top of the content or override the screen
    if (systemAlertLevel == STATUS_CRITICAL && (currentMillis / 500) % 2 == 0) {
        drawAlertBanner(STATUS_CRITICAL);
        display.display();
        return;
    }
    
    // Draw appropriate page
    switch (currentPage) {
        case 0:
            drawPage1(sensorData);
            break;
        case 1:
            drawPage2(sensorData);
            break;
        case 2:
            drawPage3(sensorData);
            break;
        case 3:
            drawPage4(sensorData);
            break;
        case 4:
            drawPage5(sensorData, systemAlertLevel, wifiConnected, sdReady);
            break;
    }
    
    display.display();
}

void DisplayManager::setPage(int pageIndex) {
    if (pageIndex >= 0 && pageIndex < 5) {
        currentPage = pageIndex;
        lastPageTransitionMs = millis();
    }
}

void DisplayManager::drawHeader(const char* title) {
    // Draw inverted header bar
    display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(1);
    display.setCursor(4, 3);
    display.print(title);
    
    // Draw page counter
    char pageStr[6];
    sprintf(pageStr, "%d/5", currentPage + 1);
    display.setCursor(104, 3);
    display.print(pageStr);
    
    // Reset text color for content
    display.setTextColor(SSD1306_WHITE);
}

void DisplayManager::drawPage1(const SensorData& d) {
    drawHeader("1. PULSE & OXYGEN");
    
    display.setCursor(0, 20);
    display.setTextSize(1);
    
    // Pulse section
    display.print("BPM: ");
    display.setTextSize(2);
    display.print((int)d.heartRate);
    display.setTextSize(1);
    display.println(" bpm");
    
    // Stats section
    display.setCursor(0, 38);
    display.print("Min/Max: ");
    display.print((int)d.minHeartRate);
    display.print("/");
    display.print((int)d.maxHeartRate);
    
    display.setCursor(0, 48);
    display.print("Avg: ");
    display.print((int)d.avgHeartRate);
    
    // SpO2 section
    display.setCursor(75, 48);
    display.print("O2: ");
    display.print((int)d.spo2);
    display.print("%");
}

void DisplayManager::drawPage2(const SensorData& d) {
    drawHeader("2. TEMP & PRESS");
    
    display.setTextSize(1);
    
    // Temperature
    display.setCursor(0, 20);
    display.print("Temp C: ");
    display.setTextSize(2);
    display.print(d.tempC, 1);
    display.setTextSize(1);
    display.print(" C");
    
    display.setCursor(0, 38);
    display.print("Temp F: ");
    display.print(d.tempF, 1);
    display.print(" F");
    
    // Blood Pressure
    display.setCursor(0, 50);
    display.print("BP: ");
    display.setTextSize(1);
    display.print(d.bpSystolic);
    display.print("/");
    display.print(d.bpDiastolic);
    display.print(" mmHg");
}

void DisplayManager::drawPage3(const SensorData& d) {
    drawHeader("3. CLOCK & TIME");
    
    // Display parsed parts of date and time
    // Expected format: YYYY-MM-DD HH:MM:SS
    String datePart = d.datetimeStr.substring(0, 10);
    String timePart = d.datetimeStr.substring(11);
    
    display.setTextSize(1);
    display.setCursor(15, 24);
    display.print("DATE: ");
    display.println(datePart);
    
    display.setCursor(15, 42);
    display.print("TIME: ");
    display.setTextSize(2);
    display.println(timePart);
}

void DisplayManager::drawPage4(const SensorData& d) {
    drawHeader("4. GPS TRACKER");
    
    display.setTextSize(1);
    
    if (d.gpsValid) {
        display.setCursor(0, 20);
        display.print("LAT: ");
        display.print(d.gpsLatitude, 6);
        
        display.setCursor(0, 34);
        display.print("LON: ");
        display.print(d.gpsLongitude, 6);
        
        display.setCursor(0, 48);
        display.print("FIX TIME: ");
        display.print(d.gpsTimestamp);
    } else {
        display.setCursor(10, 30);
        display.setTextSize(1);
        display.println("Searching GPS...");
        display.drawRect(5, 45, 118, 8, SSD1306_WHITE);
        // Simple loading bar animation
        int progress = (millis() / 200) % 110;
        display.fillRect(9, 47, progress, 4, SSD1306_WHITE);
    }
}

void DisplayManager::drawPage5(const SensorData& d, AlertLevel alert, bool wifi, bool sd) {
    drawHeader("5. SYSTEM HEALTH");
    
    display.setTextSize(1);
    
    // Status
    display.setCursor(0, 20);
    display.print("Alert Level: ");
    if (alert == STATUS_CRITICAL) {
        display.print("CRITICAL");
    } else if (alert == STATUS_WARNING) {
        display.print("WARNING");
    } else {
        display.print("NORMAL");
    }
    
    // Network status
    display.setCursor(0, 34);
    display.print("WiFi Mode: ");
    display.print(wifi ? "STA (Client)" : "AP (Host)");
    
    // Storage status
    display.setCursor(0, 48);
    display.print("SD Card: ");
    display.print(sd ? "READY" : "ERROR");
}

void DisplayManager::drawAlertBanner(AlertLevel alert) {
    display.clearDisplay();
    display.fillRect(0, 0, 128, 64, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    
    display.setTextSize(2);
    display.setCursor(16, 12);
    display.println("!! ALERT !!");
    
    display.setTextSize(1);
    display.setCursor(12, 38);
    if (alert == STATUS_CRITICAL) {
        display.println("CRITICAL CONDITION");
        display.setCursor(8, 48);
        display.println("Check Dashboard / Patient");
    } else {
        display.println("WARNING LIMITS MET");
    }
    
    display.setTextColor(SSD1306_WHITE); // Reset
}

void DisplayManager::drawBPMeasurementPage(const SensorData& d) {
    // Custom header
    display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(1);
    display.setCursor(4, 3);
    display.print("BP MONITORING");
    display.setTextColor(SSD1306_WHITE);
    
    display.setCursor(0, 20);
    display.setTextSize(1);
    
    if (d.bpState == BP_STATE_INFLATING) {
        display.println("INFLATING CUFF...");
        display.setCursor(0, 32);
        display.setTextSize(2);
        display.print((int)d.bpCuffPressure);
        display.setTextSize(1);
        display.println(" mmHg");
        
        // Progress bar
        display.drawRect(5, 52, 118, 8, SSD1306_WHITE);
        int w = (int)((d.bpCuffPressure / (float)BP_INFLATION_TARGET) * 110.0f);
        if (w < 0) w = 0;
        if (w > 110) w = 110;
        display.fillRect(9, 54, w, 4, SSD1306_WHITE);
    }
    else if (d.bpState == BP_STATE_DEFLATING) {
        display.println("DEFLATING CUFF...");
        display.setCursor(0, 32);
        display.setTextSize(2);
        display.print((int)d.bpCuffPressure);
        display.setTextSize(1);
        display.println(" mmHg");
        
        // Progress bar (deflation)
        display.drawRect(5, 52, 118, 8, SSD1306_WHITE);
        float progress = (d.bpCuffPressure - (float)BP_DEFLATION_COMPLETE_LIMIT) / 
                         ((float)BP_INFLATION_TARGET - (float)BP_DEFLATION_COMPLETE_LIMIT);
        int w = (int)(progress * 110.0f);
        if (w < 0) w = 0;
        if (w > 110) w = 110;
        display.fillRect(9, 54, w, 4, SSD1306_WHITE);
    }
    else if (d.bpState == BP_STATE_PROCESSING) {
        display.println("ANALYZING PULSES...");
        display.setCursor(15, 36);
        display.setTextSize(1);
        display.println("Processing...");
        display.setCursor(15, 48);
        display.println("Do not move.");
    }
    else if (d.bpState == BP_STATE_COMPLETE) {
        display.println("MEASURE COMPLETE");
        display.setCursor(0, 32);
        display.setTextSize(2);
        display.print(d.bpSystolic);
        display.print("/");
        display.print(d.bpDiastolic);
        display.setTextSize(1);
        display.println(" mmHg");
        
        display.setCursor(0, 52);
        display.print("MAP: ");
        display.print(d.bpMAP);
        display.print(" mmHg");
    }
}
