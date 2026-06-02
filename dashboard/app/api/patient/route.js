import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';

// GET: Retrieve active patient or all patients list
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const listMode = searchParams.get('list') === 'true';
    
    if (listMode) {
      // Query all patients in alphabetical order for dashboard manager
      const result = await db.query(
        'SELECT id, name, age, gender, id_number as "idNumber", emergency_contact as "emergencyContact", is_active as "isActive" FROM patients ORDER BY name ASC'
      );
      return NextResponse.json(result.rows);
    }
    
    // Default: Retrieve the currently active patient
    const result = await db.query(
      'SELECT id, name, age, gender, id_number as "idNumber", emergency_contact as "emergencyContact", is_active as "isActive" FROM patients WHERE is_active = true ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      // Fallback: if no patient is explicitly active, fetch the first patient in order
      const fallbackResult = await db.query(
        'SELECT id, name, age, gender, id_number as "idNumber", emergency_contact as "emergencyContact", is_active as "isActive" FROM patients ORDER BY id ASC LIMIT 1'
      );
      
      if (fallbackResult.rows.length === 0) {
        // Return default fallback JSON state
        return NextResponse.json({
          name: "John Doe",
          age: 45,
          gender: "Male",
          idNumber: "PT-2026-9841",
          emergencyContact: "+1234567890",
          isActive: true
        });
      }
      return NextResponse.json(fallbackResult.rows[0]);
    }
    
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('[API Patient] GET error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}

// POST: Upsert patient demographics details
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, age, gender, idNumber, emergencyContact } = body;
    
    if (!name || !age || !gender || !idNumber || !emergencyContact) {
      return NextResponse.json(
        { error: 'Missing required demographic fields' },
        { status: 400 }
      );
    }
    
    const upsertQuery = `
      INSERT INTO patients (name, age, gender, id_number, emergency_contact)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id_number) 
      DO UPDATE SET 
        name = EXCLUDED.name, 
        age = EXCLUDED.age, 
        gender = EXCLUDED.gender, 
        emergency_contact = EXCLUDED.emergency_contact
      RETURNING id
    `;
    
    const params = [name, parseInt(age), gender, idNumber, emergencyContact];
    const result = await db.query(upsertQuery, params);
    
    return NextResponse.json({
      status: 'success',
      patientId: result.rows[0].id
    });
    
  } catch (err) {
    console.error('[API Patient] POST error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}

// PATCH: Select/activate a patient by id_number
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { idNumber } = body;
    
    if (!idNumber) {
      return NextResponse.json(
        { error: 'Missing patient idNumber parameter' },
        { status: 400 }
      );
    }
    
    // Deactivate all patients first
    await db.query('UPDATE patients SET is_active = false');
    
    // Activate the requested patient
    const result = await db.query(
      'UPDATE patients SET is_active = true WHERE id_number = $1 RETURNING id_number',
      [idNumber]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      status: 'success',
      activatedId: idNumber
    });
  } catch (err) {
    console.error('[API Patient] PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}
