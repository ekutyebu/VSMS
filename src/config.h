#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// Network & Wi-Fi Settings
// ==========================================
#define WIFI_SSID "Javis"
#define WIFI_PASSWORD "1234567890"
#define WIFI_IS_AP false // Set to true to start as Access Point, false to connect to local router

// Structure for multi-WiFi credentials support
struct WifiNetwork {
    const char* ssid;
    const char* password;
};

// Configurable list of Wi-Fi networks the device can connect to sequentially
#define WIFI_NETWORKS_COUNT 3
const WifiNetwork WIFI_NETWORKS[WIFI_NETWORKS_COUNT] = {
    {"Javis", "1234567890"},
    {"DarkDev", "Man2001@"},
    {"Sheilia", "123456789"}
};
#define HOSTED_SERVER_URL "https://vsms-6z4c.onrender.com/api/vitals" // Render hosted Next.js production endpoint
#define LOCAL_SERVER_URL "http://10.134.242.1:3000/api/vitals"       // Local dev server on your laptop
#define SYNC_INTERVAL_MS 5000                                // POST logs to PostgreSQL database every 5 seconds

// ==========================================
// System Parameters
// ==========================================
#define WEBSOCKET_UPDATE_INTERVAL_MS 1000 // Send data every 1 second
#define OLED_PAGE_ROTATION_MS 8000        // Rotate OLED screen pages every 8 seconds
#define SERIAL_BAUD_RATE 115200

// ==========================================
// Hardware Pin Mappings
// ==========================================

// OLED Screen (I2C)
#define OLED_SDA 21
#define OLED_SCL 22
#define OLED_SCREEN_WIDTH 128
#define OLED_SCREEN_HEIGHT 64
#define OLED_RESET -1 // Share Reset pin or set to -1 if not used
#define OLED_I2C_ADDR 0x3C

// MAX30102 Pulse Oximeter (I2C) - uses default SDA/SCL (21/22)
#define MAX30102_I2C_ADDR 0x57

// DS18B20 1-Wire Temperature Sensor
#define DS18B20_PIN 4

// AD8232 ECG Sensor
#define ECG_ANALOG_PIN 34
#define ECG_LO_MINUS_PIN 25 // Lead Off Detect -
#define ECG_LO_PLUS_PIN 26  // Lead Off Detect +

// NEO-6M GPS Module (Serial2)
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUD_RATE 9600

// SIM800L GSM Module (Serial1 / Software Serial)
#define GSM_RX_PIN 27
#define GSM_TX_PIN 14
#define GSM_BAUD_RATE 9600
#define EMERGENCY_PHONE_NUMBER "+659085520"

// MicroSD Card Module (SPI)
#define SD_CS_PIN 5
#define SD_MOSI_PIN 23
#define SD_MISO_PIN 19
#define SD_SCK_PIN 18

// MPS20N0040D Blood Pressure Sensor (via HX711)
#define HX711_DOUT_PIN 32
#define HX711_SCK_PIN 33
#define BP_CALIBRATION_FACTOR 0.000045f // Raw differential signal to mmHg scaling
#define BP_INFLATION_TARGET 160        // Target inflation pressure in mmHg
#define BP_DEFLATION_COMPLETE_LIMIT 25 // Pressure below which measurement stops

// Alert Indicators
#define LED_GREEN_PIN 12
#define LED_YELLOW_PIN 13
#define LED_RED_PIN 15
#define BUZZER_PIN 2

// ==========================================
// Vital Signs Thresholds & Alert Levels
// ==========================================

// Alert Levels
enum AlertLevel {
    STATUS_NORMAL = 0,
    STATUS_WARNING = 1,
    STATUS_CRITICAL = 2
};

// Blood Pressure States
enum BPState {
    BP_STATE_IDLE = 0,
    BP_STATE_INFLATING = 1,
    BP_STATE_DEFLATING = 2,
    BP_STATE_PROCESSING = 3,
    BP_STATE_COMPLETE = 4
};

// Vitals Monitoring Modes
enum MonitoringMode {
    MONITOR_OFF = 0,
    MONITOR_COUNTDOWN = 1,
    MONITOR_SINGLE_COLLECT = 2,
    MONITOR_CONTINUOUS = 3
};

// Heart Rate (BPM)
#define HR_NORMAL_MIN 60.0
#define HR_NORMAL_MAX 100.0
#define HR_CRITICAL_MIN 50.0
#define HR_CRITICAL_MAX 120.0

// Blood Oxygen (SpO2 %)
#define SPO2_NORMAL_MIN 95.0
#define SPO2_WARNING_MIN 90.0

// Temperature (Celsius)
#define TEMP_NORMAL_MIN 36.0
#define TEMP_NORMAL_MAX 37.5
#define TEMP_WARNING_MAX 38.5

// Blood Pressure (mmHg)
#define BP_SYS_NORMAL 120
#define BP_DIA_NORMAL 80
#define BP_SYS_WARNING 140
#define BP_DIA_WARNING 90
#define BP_SYS_CRITICAL 180
#define BP_DIA_CRITICAL 120

// ==========================================
// Simulation Toggle
// ==========================================
// If set to true, the code will simulate sensor values when hardware is not detected.
// This allows full code execution and server preview without physical components connected.
#define ALLOW_SENSOR_SIMULATION true

#endif // CONFIG_H
