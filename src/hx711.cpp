#include "hx711.h"

HX711::HX711() : PD_SCK(0), DOUT(0), GAIN(1), OFFSET(0), SCALE(1.f) {}

HX711::~HX711() {}

void HX711::begin(uint8_t dout, uint8_t sck, uint8_t gain) {
    DOUT = dout;
    PD_SCK = sck;
    pinMode(PD_SCK, OUTPUT);
    pinMode(DOUT, INPUT);
    
    // Set gain
    if (gain == 128) GAIN = 1;
    else if (gain == 64) GAIN = 3;
    else if (gain == 32) GAIN = 2;
    
    power_up();
}

bool HX711::is_ready() {
    return digitalRead(DOUT) == LOW;
}

long HX711::read() {
    // Wait for DOUT to go LOW (data ready) with a non-blocking timeout of 100ms
    unsigned long start = millis();
    while (!is_ready()) {
        if (millis() - start > 100) {
            return 0; // Timeout
        }
        yield();
    }

    unsigned long value = 0;

    // Pulse SCK 24 times to read 24 bits
    // We disable interrupts briefly to prevent timing issues with other tasks
    portMUX_TYPE mux = SPINLOCK_INITIALIZER;
    portENTER_CRITICAL(&mux);

    for (int i = 23; i >= 0; i--) {
        digitalWrite(PD_SCK, HIGH);
        delayMicroseconds(1);
        if (digitalRead(DOUT)) {
            value |= (1UL << i);
        }
        digitalWrite(PD_SCK, LOW);
        delayMicroseconds(1);
    }

    // Set gain and channel for next reading
    for (int i = 0; i < GAIN; i++) {
        digitalWrite(PD_SCK, HIGH);
        delayMicroseconds(1);
        digitalWrite(PD_SCK, LOW);
        delayMicroseconds(1);
    }

    portEXIT_CRITICAL(&mux); // End critical section

    // Replicate sign bit for 24-bit 2's complement
    if (value & 0x800000) {
        value |= 0xFF000000;
    }

    return (long)value;
}

long HX711::read_average(uint8_t times) {
    long sum = 0;
    uint8_t successCount = 0;
    for (uint8_t i = 0; i < times; i++) {
        long val = read();
        if (val != 0) {
            sum += val;
            successCount++;
        }
        delay(2);
    }
    return successCount > 0 ? (sum / successCount) : 0;
}

double HX711::get_value(uint8_t times) {
    return (double)(read_average(times) - OFFSET);
}

float HX711::get_units(uint8_t times) {
    return (float)(get_value(times) / SCALE);
}

void HX711::tare(uint8_t times) {
    long sum = read_average(times);
    set_offset(sum);
}

void HX711::set_scale(float scale) {
    SCALE = scale;
}

float HX711::get_scale() {
    return SCALE;
}

void HX711::set_offset(long offset) {
    OFFSET = offset;
}

long HX711::get_offset() {
    return OFFSET;
}

void HX711::power_down() {
    digitalWrite(PD_SCK, LOW);
    digitalWrite(PD_SCK, HIGH);
}

void HX711::power_up() {
    digitalWrite(PD_SCK, LOW);
}
