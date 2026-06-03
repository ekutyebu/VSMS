import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';

// GET: Query vital logs with time-frame filter support
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all';
    
    let intervalClause = '';
    if (period === 'daily') {
      intervalClause = "AND recorded_at >= NOW() - INTERVAL '1 day'";
    } else if (period === 'weekly') {
      intervalClause = "AND recorded_at >= NOW() - INTERVAL '7 days'";
    } else if (period === 'monthly') {
      intervalClause = "AND recorded_at >= NOW() - INTERVAL '30 days'";
    }

    // Format fields directly in PostgreSQL for smaller payloads and instant frontend mapping
    const sqlQuery = `
      SELECT 
        p.name AS "patientName",
        p.id_number AS "patientId",
        TO_CHAR(v.recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Etc/GMT-1', 'YYYY-MM-DD') AS date,
        TO_CHAR(v.recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Etc/GMT-1', 'HH24:MI:SS') AS time,
        v.heart_rate AS hr,
        v.spo2,
        v.temperature AS temp,
        CONCAT(v.systolic, '/', v.diastolic) AS bp,
        v.ecg_status AS ecg,
        CASE 
          WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL 
          THEN CONCAT(v.latitude, ',', v.longitude) 
          ELSE 'None' 
        END AS gps
      FROM vitals v
      LEFT JOIN patients p ON v.patient_id = p.id_number
      WHERE 1=1 ${intervalClause}
      ORDER BY v.recorded_at DESC
      LIMIT 1000
    `;

    const result = await db.query(sqlQuery);
    return NextResponse.json(result.rows);

  } catch (err) {
    console.error('[API Logs] GET error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}

// DELETE: Truncate logs database
export async function DELETE() {
  try {
    await db.query('TRUNCATE TABLE vitals RESTART IDENTITY');
    console.log('[API Logs] DB Logs table truncated.');
    return NextResponse.json({ status: 'success' });
  } catch (err) {
    console.error('[API Logs] DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}
