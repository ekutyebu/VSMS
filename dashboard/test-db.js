const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('.env.local file not found at:', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const connectionString = dbUrlMatch[1].trim();
console.log('Connecting using connection string:', connectionString.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000
});

async function runTest() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('CONNECTION SUCCESSFUL!');
    console.log('Current time from DB:', res.rows[0].now);

    // Run schema initializer to verify / create tables
    console.log('Verifying or creating schemas...');
    
    // Check if the patients table already exists
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'patients'
      );
    `);
    
    const schemaExists = checkResult.rows[0].exists;
    
    if (!schemaExists) {
      console.log('[Database] Table schemas not found. Building patients and vitals tables...');
      
      // Execute the database schema commands directly
      await pool.query(`
        -- Create Patients Table
        CREATE TABLE IF NOT EXISTS patients (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            age INTEGER NOT NULL,
            gender VARCHAR(20) NOT NULL,
            id_number VARCHAR(50) UNIQUE NOT NULL,
            emergency_contact VARCHAR(30) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create Vital Logs Table
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

        -- Insert default patient profile
        INSERT INTO patients (name, age, gender, id_number, emergency_contact)
        VALUES ('John Doe', 45, 'Male', 'PT-2026-9841', '+1234567890')
        ON CONFLICT (id_number) DO NOTHING;
      `);
      
      console.log('[Database] Table schemas and default patient record successfully initialized.');
    } else {
      console.log('Tables already exist.');
    }

    // Run incremental migrations to add active tracking constraints
    await pool.query(`
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
    `);
    console.log('Ensured is_active column exists.');

    // Ensure we have at least one active patient in the system
    const activeCheck = await pool.query('SELECT 1 FROM patients WHERE is_active = true LIMIT 1');
    if (activeCheck.rows.length === 0) {
      await pool.query("UPDATE patients SET is_active = true WHERE id_number = 'PT-2026-9841'");
      console.log('Set PT-2026-9841 as active patient.');
    } else {
      const activePatientRes = await pool.query("SELECT name, id_number FROM patients WHERE is_active = true LIMIT 1");
      console.log(`Active patient is: ${activePatientRes.rows[0].name} (${activePatientRes.rows[0].id_number})`);
    }

    console.log('ALL SCHEMA TESTS AND INITIALIZATIONS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('DATABASE VERIFICATION FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runTest();

