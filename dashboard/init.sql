-- PostgreSQL Schema for VitalGuard IoT Health Monitoring System

-- 1. Create Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INTEGER NOT NULL,
    gender VARCHAR(20) NOT NULL,
    id_number VARCHAR(50) UNIQUE NOT NULL,
    emergency_contact VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Vital Logs Table
CREATE TABLE IF NOT EXISTS vitals (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id_number) ON DELETE CASCADE,
    heart_rate REAL NOT NULL,
    spo2 REAL NOT NULL,
    temperature REAL NOT NULL,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    ecg_status VARCHAR(20) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    gps_time VARCHAR(30),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Insert Default Patient Record (if not exists)
INSERT INTO patients (name, age, gender, id_number, emergency_contact)
VALUES ('John Doe', 45, 'Male', 'PT-2026-9841', '+1234567890')
ON CONFLICT (id_number) DO NOTHING;
