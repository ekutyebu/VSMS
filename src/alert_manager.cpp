#include "alert_manager.h"

AlertManager::AlertManager()
    : currentLevel(STATUS_NORMAL),
      gsmSerial(Serial1),
      gsmOnline(false),
      lastBuzzerToggleMs(0),
      buzzerState(false),
      callActive(false),
      callStartMs(0),
      smsSentForCurrentEvent(false)
{
}

bool AlertManager::begin() {
    Serial.println("[AlertManager] Initializing alerts and indicators...");
    
    // Set LED and Buzzer pins as OUTPUT
    pinMode(LED_GREEN_PIN, OUTPUT);
    pinMode(LED_YELLOW_PIN, OUTPUT);
    pinMode(LED_RED_PIN, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    
    // Test indicators (brief boot sequence)
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_YELLOW_PIN, HIGH);
    digitalWrite(LED_RED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    // Initialize GSM SIM800L Serial connection
    gsmSerial.begin(GSM_BAUD_RATE, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);
    Serial.println("[AlertManager] SIM800L GSM (Serial1): INITIALIZED");
    
    // Test AT communication with GSM module
    writeGSMCommand("AT");
    if (checkGSMResponse("OK", 1000)) {
        gsmOnline = true;
        Serial.println("[AlertManager] SIM800L GSM Module: ONLINE");
        
        // Configure SMS text mode
        writeGSMCommand("AT+CMGF=1");
        checkGSMResponse("OK", 1000);
    } else {
        Serial.println("[AlertManager] SIM800L GSM Module: OFFLINE (will simulate SMS logs)");
    }
    
    return true;
}

void AlertManager::update(const SensorData& sensorData, const String& emergencyNumber) {
    // 1. Evaluate current vital ranges
    AlertLevel newLevel = evaluateAlertLevel(sensorData);
    
    if (newLevel != currentLevel) {
        Serial.printf("[AlertManager] Transitioned: %d -> %d\n", currentLevel, newLevel);
        
        // If transitioning away from critical and a call is active, hang up immediately
        if (currentLevel == STATUS_CRITICAL && newLevel != STATUS_CRITICAL && callActive) {
            if (gsmOnline) {
                Serial.println("[AlertManager] Emergency resolved, hanging up call...");
                writeGSMCommand("ATH");
                checkGSMResponse("OK", 2000);
            } else {
                Serial.println("[AlertManager] Emergency resolved, GSM MOCK: Hanging up call.");
            }
            callActive = false;
        }
        
        currentLevel = newLevel;
        
        // If critical, trigger SMS and voice call dial (once per event)
        if (currentLevel == STATUS_CRITICAL) {
            if (!smsSentForCurrentEvent) {
                sendCriticalSMS(sensorData, emergencyNumber);
                dialEmergencyCall(emergencyNumber);
                smsSentForCurrentEvent = true;
            }
        } else {
            // Reset SMS latch when returning to normal/warning
            smsSentForCurrentEvent = false;
        }
    }
    
    // Automatic hang up after 25 seconds of ringing to prevent credit drainage
    if (callActive && (millis() - callStartMs >= 25000)) {
        if (gsmOnline) {
            Serial.println("[AlertManager] 25s ring limit reached, hanging up call...");
            writeGSMCommand("ATH");
            checkGSMResponse("OK", 2000);
        } else {
            Serial.println("[AlertManager] 25s ring limit reached, GSM MOCK: Hanging up call.");
        }
        callActive = false;
    }
    
    // 2. Drive LEDs and buzzer non-blockingly
    updateIndicators();
}

AlertLevel AlertManager::evaluateAlertLevel(const SensorData& d) {
    // Evaluate CRITICAL first (any critical sensor reading forces system alert to critical)
    if (d.heartRate > 0 && (d.heartRate < HR_CRITICAL_MIN || d.heartRate > HR_CRITICAL_MAX)) {
        return STATUS_CRITICAL;
    }
    if (d.spo2 > 0 && d.spo2 < SPO2_WARNING_MIN) {
        return STATUS_CRITICAL;
    }
    if (d.tempC > 0 && d.tempC > TEMP_WARNING_MAX) {
        return STATUS_CRITICAL;
    }
    // Only check blood pressure alerts if not in active measurement state (idle or completed)
    if (d.bpState == BP_STATE_IDLE || d.bpState == BP_STATE_COMPLETE) {
        if (d.bpSystolic >= BP_SYS_CRITICAL || d.bpDiastolic >= BP_DIA_CRITICAL) {
            return STATUS_CRITICAL;
        }
    }

    // Evaluate WARNING second (any warning sensor reading forces system alert to warning)
    if (d.heartRate > 0 && (d.heartRate < HR_NORMAL_MIN || d.heartRate > HR_NORMAL_MAX)) {
        return STATUS_WARNING;
    }
    if (d.spo2 > 0 && d.spo2 < SPO2_NORMAL_MIN) {
        return STATUS_WARNING;
    }
    if (d.tempC > 0 && d.tempC > TEMP_NORMAL_MAX) {
        return STATUS_WARNING;
    }
    // Only check blood pressure alerts if not in active measurement state (idle or completed)
    if (d.bpState == BP_STATE_IDLE || d.bpState == BP_STATE_COMPLETE) {
        if (d.bpSystolic >= BP_SYS_WARNING || d.bpDiastolic >= BP_DIA_WARNING) {
            return STATUS_WARNING;
        }
    }

    // Default to Normal
    return STATUS_NORMAL;
}

void AlertManager::updateIndicators() {
    unsigned long now = millis();
    
    switch (currentLevel) {
        case STATUS_NORMAL:
            // Normal: Green LED, no buzzer
            digitalWrite(LED_GREEN_PIN, HIGH);
            digitalWrite(LED_YELLOW_PIN, LOW);
            digitalWrite(LED_RED_PIN, LOW);
            digitalWrite(BUZZER_PIN, LOW);
            buzzerState = false;
            break;
            
        case STATUS_WARNING:
            // Warning: Yellow LED, intermittent buzzer (short beep every 3 seconds)
            digitalWrite(LED_GREEN_PIN, LOW);
            digitalWrite(LED_YELLOW_PIN, HIGH);
            digitalWrite(LED_RED_PIN, LOW);
            
            // Beep for 100ms every 3000ms
            if (buzzerState) {
                if (now - lastBuzzerToggleMs >= 100) {
                    digitalWrite(BUZZER_PIN, LOW);
                    buzzerState = false;
                    lastBuzzerToggleMs = now;
                }
            } else {
                if (now - lastBuzzerToggleMs >= 2900) {
                    digitalWrite(BUZZER_PIN, HIGH);
                    buzzerState = true;
                    lastBuzzerToggleMs = now;
                }
            }
            break;
            
        case STATUS_CRITICAL:
            // Critical: Red LED, fast continuous buzzer (siren effect: 400ms ON, 400ms OFF)
            digitalWrite(LED_GREEN_PIN, LOW);
            digitalWrite(LED_YELLOW_PIN, LOW);
            digitalWrite(LED_RED_PIN, HIGH);
            
            if (now - lastBuzzerToggleMs >= 400) {
                buzzerState = !buzzerState;
                digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
                lastBuzzerToggleMs = now;
            }
            break;
    }
}

void AlertManager::sendCriticalSMS(const SensorData& d, const String& emergencyNumber) {
    char smsText[160];
    sprintf(smsText, 
        "CRITICAL HEALTH ALERT!\nHR: %.1f BPM\nSpO2: %.1f%%\nTemp: %.1f C\nBP: %d/%d mmHg\nGPS: %.6f,%.6f\nTime: %s",
        d.heartRate, d.spo2, d.tempC, d.bpSystolic, d.bpDiastolic, d.gpsLatitude, d.gpsLongitude, d.datetimeStr.c_str()
    );

    String formattedNum = formatCameroonNumber(emergencyNumber);

    if (gsmOnline) {
        Serial.printf("[AlertManager] Directing SIM800L to send SMS to %s...\n", formattedNum.c_str());
        
        char phoneCmd[40];
        sprintf(phoneCmd, "AT+CMGS=\"%s\"", formattedNum.c_str());
        writeGSMCommand(phoneCmd);
        
        // Wait for prompt '>'
        if (checkGSMResponse(">", 2000)) {
            gsmSerial.print(smsText);
            gsmSerial.write(26); // Ctrl+Z character to send
            
            if (checkGSMResponse("OK", 5000)) {
                Serial.println("[AlertManager] Critical SMS successfully sent.");
            } else {
                Serial.println("[AlertManager] Critical SMS send failed or timed out.");
            }
        } else {
            Serial.println("[AlertManager] GSM did not return '>' prompt.");
        }
    } else {
        // GSM Mock Simulation output
        Serial.println("=================================================");
        Serial.println("[ALERT SENSOR WARNING SIMULATOR - SMS ALERT]");
        Serial.printf("TO: %s\n", formattedNum.c_str());
        Serial.println("MESSAGE:");
        Serial.println(smsText);
        Serial.println("=================================================");
    }
}

void AlertManager::dialEmergencyCall(const String& emergencyNumber) {
    String formattedNum = formatCameroonNumber(emergencyNumber);
    if (gsmOnline) {
        Serial.printf("[AlertManager] Directing SIM800L to place voice call to %s...\n", formattedNum.c_str());
        char phoneCmd[40];
        sprintf(phoneCmd, "ATD%s;", formattedNum.c_str());
        writeGSMCommand(phoneCmd);
        if (checkGSMResponse("OK", 3000)) {
            callActive = true;
            callStartMs = millis();
            Serial.println("[AlertManager] Voice call placed successfully, dialing...");
        } else {
            Serial.println("[AlertManager] Voice call dialing failed.");
        }
    } else {
        Serial.println("=================================================");
        Serial.println("[ALERT SENSOR WARNING SIMULATOR - VOICE DIAL]");
        Serial.printf("DIALING: %s (ringing for 25s max)...\n", formattedNum.c_str());
        Serial.println("=================================================");
        callActive = true;
        callStartMs = millis();
    }
}

String AlertManager::formatCameroonNumber(const String& rawNumber) {
    String phone = rawNumber;
    phone.trim();
    if (phone.length() == 0) return EMERGENCY_PHONE_NUMBER;
    
    // If it starts with '+', keep it
    if (phone.startsWith("+")) {
        return phone;
    }
    // If it starts with '237' and has 12 digits total
    if (phone.startsWith("237") && phone.length() == 12) {
        return "+" + phone;
    }
    // If it is 9 digits starting with 6 or 2, prepend "+237"
    if (phone.length() == 9 && (phone.startsWith("6") || phone.startsWith("2"))) {
        return "+237" + phone;
    }
    return phone;
}

void AlertManager::sendTestSMS() {
    if (gsmOnline) {
        writeGSMCommand("AT+CMGS=\"" EMERGENCY_PHONE_NUMBER "\"");
        if (checkGSMResponse(">", 2000)) {
            gsmSerial.print("ESP32 Vital Signs Monitor: SIM800L connection test message.");
            gsmSerial.write(26);
            checkGSMResponse("OK", 5000);
        }
    } else {
        Serial.println("[AlertManager] GSM offline. Cannot send test SMS.");
    }
}

void AlertManager::writeGSMCommand(const char* cmd) {
    gsmSerial.println(cmd);
}

bool AlertManager::checkGSMResponse(const char* expected, uint32_t timeoutMs) {
    unsigned long start = millis();
    String response = "";
    
    while (millis() - start < timeoutMs) {
        while (gsmSerial.available() > 0) {
            char c = gsmSerial.read();
            response += c;
            
            // Immediately check if expected substring is in the response
            if (response.indexOf(expected) != -1) {
                return true;
            }
        }
        delay(10);
    }
    
    Serial.printf("[AlertManager] GSM Timeout. Expected: '%s'. Got:\n%s\n", expected, response.c_str());
    return false;
}
