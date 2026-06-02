import { Pool } from 'pg';

// Dynamic SSL configuration: Render databases require SSL connections, even in development.
const connectionString = process.env.DATABASE_URL;
const useSSL = connectionString && (connectionString.includes('render.com') || connectionString.includes('neon.tech'));

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

let tablesInitialized = false;

// Auto-Schema Initializer: Builds tables in PostgreSQL automatically if they don't exist
async function ensureSchemaExists() {
  if (tablesInitialized) return;
  
  try {
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
    }
    
    // Run incremental migrations to add active tracking constraints
    await pool.query(`
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
    `);
    
    // Ensure we have at least one active patient in the system
    const activeCheck = await pool.query('SELECT 1 FROM patients WHERE is_active = true LIMIT 1');
    if (activeCheck.rows.length === 0) {
      await pool.query("UPDATE patients SET is_active = true WHERE id_number = 'PT-2026-9841'");
    }
    
    tablesInitialized = true;
  } catch (err) {
    console.error('[Database] Failed to initialize table schemas:', err);
  }
}

export const db = {
  /**
   * Executes a database query.
   * @param {string} text SQL statement
   * @param {Array} params Statement parameter arguments
   */
  async query(text, params) {
    // Run schema check before executing query
    await ensureSchemaExists();
    
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('[Database] executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (err) {
      console.error('[Database] Query Error:', err);
      throw err;
    }
  },
  
  // Expose the raw pool instance
  pool
};
