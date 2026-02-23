const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Set it in .env or in the shell.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function reset() {
  try {
    console.log('Dropping tables...');
    await sql.unsafe(`
      DROP TABLE IF EXISTS usage_logs CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    console.log('Tables dropped. Run "npm run db:push" to recreate schema.');
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

reset();
