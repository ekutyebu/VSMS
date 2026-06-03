import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';

// POST: Add vital signs telemetry entry from ESP32
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      patientId = 'PT-2026-9841',
      heartRate,
      spo2,
      tempC,
      bpSystolic,
      bpDiastolic,
      ecgStatus = 'Normal',
      latitude,
      longitude,
      gpsTimestamp
    } = body;

    // Validate request inputs
    if (heartRate === undefined || spo2 === undefined || tempC === undefined) {
      return NextResponse.json(
        { error: 'Missing vital metrics fields (heartRate, spo2, tempC)' },
        { status: 400 }
      );
    }

    // 1. Fetch currently active patient from the database
    const activePatientResult = await db.query(
      'SELECT id_number FROM patients WHERE is_active = true LIMIT 1'
    );
    
    let targetPatientId = patientId; // Fallback to provided patient ID
    
    if (activePatientResult.rows.length > 0) {
      targetPatientId = activePatientResult.rows[0].id_number;
    } else {
      // If no patient is active, verify/create placeholder
      const patientCheck = await db.query(
        'SELECT id_number FROM patients WHERE id_number = $1',
        [targetPatientId]
      );

      if (patientCheck.rows.length === 0) {
        console.log(`[API Vitals] Patient ID ${targetPatientId} not found. Creating placeholder record...`);
        await db.query(
          `INSERT INTO patients (name, age, gender, id_number, emergency_contact, is_active) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ['Unknown Patient', 0, 'Other', targetPatientId, 'None', true]
        );
      }
    }

    // 2. Insert vitals entry
    const insertQuery = `
      INSERT INTO vitals (
        patient_id, heart_rate, spo2, temperature, systolic, diastolic, ecg_status, latitude, longitude, gps_time
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING id, recorded_at
    `;
    
    const params = [
      targetPatientId,
      parseFloat(heartRate),
      parseFloat(spo2),
      parseFloat(tempC),
      parseInt(bpSystolic) || 120,
      parseInt(bpDiastolic) || 80,
      ecgStatus,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      gpsTimestamp || null
    ];

    const result = await db.query(insertQuery, params);
    
    return NextResponse.json({
      status: 'success',
      logId: result.rows[0].id,
      timestamp: result.rows[0].recorded_at
    });

  } catch (err) {
    console.error('[API Vitals] POST error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}

// GET: Fetch the most recent vital log entry
export async function GET() {
  try {
    const sqlQuery = `
      SELECT 
        v.heart_rate AS "heartRate",
        v.spo2 AS "spo2",
        v.temperature AS "tempC",
        (v.temperature * 9.0 / 5.0) + 32.0 AS "tempF",
        v.systolic AS "bpSystolic",
        v.diastolic AS "bpDiastolic",
        CASE WHEN v.ecg_status = 'Critical' THEN 2 WHEN v.ecg_status = 'Warning' THEN 1 ELSE 0 END AS "systemAlertLevel",
        v.latitude AS "gpsLatitude",
        v.longitude AS "gpsLongitude",
        CASE WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN true ELSE false END AS "gpsValid",
        v.gps_time AS "gpsTimestamp",
        TO_CHAR(v.recorded_at, 'YYYY-MM-DD HH24:MI:SS') AS "datetimeStr",
        v.recorded_at AS "recordedAt"
      FROM vitals v
      ORDER BY v.recorded_at DESC
      LIMIT 1
    `;
    const result = await db.query(sqlQuery);
    if (result.rows.length > 0) {
      const lastRecord = result.rows[0];
      const recordedAt = new Date(lastRecord.recordedAt);
      const diffMs = Date.now() - recordedAt.getTime();
      const isOnline = diffMs <= 15000; // 15 seconds
      return NextResponse.json({
        ...lastRecord,
        ecgLeadsOff: !isOnline,
        sdReady: isOnline,
        wifiConnected: isOnline,
        deviceOnline: isOnline
      });
    } else {
      return NextResponse.json({
        noData: true,
        heartRate: 0,
        spo2: 0,
        tempC: 0,
        tempF: 0,
        bpSystolic: 120,
        bpDiastolic: 80,
        systemAlertLevel: 0,
        gpsLatitude: 0,
        gpsLongitude: 0,
        gpsValid: false,
        gpsTimestamp: '--:--:--',
        datetimeStr: '',
        ecgLeadsOff: true,
        sdReady: true,
        wifiConnected: false,
        deviceOnline: false
      });
    }
  } catch (err) {
    console.error('[API Vitals] GET error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}

