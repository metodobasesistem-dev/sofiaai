import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function runBackup() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const tables = ['profiles', 'agents', 'contacts', 'threads', 'messages', 'appointments', 'availability', 'quick_replies'];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(process.cwd(), `supabase_backup_${timestamp}.sql`);

  let sqlContent = `-- WppAi Super Backup\n-- Generated on ${new Date().toLocaleString()}\n\n`;

  console.log('Starting backup of tables:', tables.join(', '));

  for (const table of tables) {
    console.log(`Backing up table: ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    
    if (error) {
      console.warn(`Warning: Could not backup table ${table}: ${error.message}`);
      sqlContent += `-- Error backing up table ${table}: ${error.message}\n\n`;
      continue;
    }

    if (data && data.length > 0) {
      sqlContent += `-- Data for ${table} (${data.length} rows)\n`;
      // We don't have the table creation SQL easily via API, but we save the data as comments/inserts
      data.forEach(row => {
        const columns = Object.keys(row).join(', ');
        const values = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return v;
        }).join(', ');
        sqlContent += `INSERT INTO public.${table} (${columns}) VALUES (${values});\n`;
      });
      sqlContent += '\n';
    } else {
      sqlContent += `-- Table ${table} is empty.\n\n`;
    }
  }

  fs.writeFileSync(backupFile, sqlContent);
  console.log(`\n✅ Backup completed successfully!\nFile: ${backupFile}`);
}

runBackup();
