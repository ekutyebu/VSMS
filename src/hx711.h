#ifndef HX711_H
#define HX711_H

#include <Arduino.h>

class HX711 {
public:
    HX711();
    ~HX711();

    void begin(uint8_t dout, uint8_t sck, uint8_t gain = 128);
    bool is_ready();
    long read();
    long read_average(uint8_t times = 10);
    double get_value(uint8_t times = 1);
    float get_units(uint8_t times = 1);
    void tare(uint8_t times = 10);
    void set_scale(float scale = 1.f);
    float get_scale();
    void set_offset(long offset = 0);
    long get_offset();
    void power_down();
    void power_up();

private:
    uint8_t PD_SCK;    // Power Down and Serial Clock pin
    uint8_t DOUT;      // Serial Data Out pin
    uint8_t GAIN;      // Amplification gain (128, 64, or 32)
    long OFFSET;       // Tare offset value
    float SCALE;       // Calibration scale factor
};

#endif // HX711_H
