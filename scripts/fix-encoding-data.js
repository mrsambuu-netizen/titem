const { Pool } = require('pg');
require('dotenv').config();

const rawDatabaseUrl = process.env.DATABASE_URL || '';
if (!rawDatabaseUrl) {
  console.error('DATABASE_URL олдсонгүй. .env файлаа шалгана уу.');
  process.exit(1);
}

const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=(require|prefer|verify-ca)(&|$)/i, (match, _mode, tail) => {
  if (match.startsWith('?') && tail === '&') return '?';
  if (match.startsWith('?')) return '';
  return tail === '&' ? '&' : '';
});
const needsSsl = process.env.NODE_ENV === 'production' || /sslmode=require/i.test(rawDatabaseUrl) || /neon\.tech/i.test(rawDatabaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false
});

const cp1252 = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E],
  [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F]
]);
const suspiciousCodes = new Set([0x00d0, 0x00d1, 0x00e2, 0x00f0, 0x00c3, 0x00c2]);

function isSuspicious(value) {
  if (typeof value !== 'string') return false;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (suspiciousCodes.has(code) || code === 0xfffd) return true;
  }
  return false;
}

function repair(value) {
  if (!isSuspicious(value)) return value;
  const bytes = [];
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (cp1252.has(code)) bytes.push(cp1252.get(code));
    else if (code <= 0xff) bytes.push(code);
    else bytes.push(...Buffer.from(ch, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8').replaceAll('\uFFFD', '-');
}

const tables = [
  ['branches', ['name', 'location']],
  ['users', ['full_name']],
  ['categories', ['name']],
  ['products', ['name', 'description']],
  ['product_variants', ['color', 'size']],
  ['suppliers', ['name']]
];

async function main() {
  let total = 0;
  for (const [table, columns] of tables) {
    const result = await pool.query(`SELECT id, ${columns.map(col => `"${col}"`).join(', ')} FROM ${table} ORDER BY id`);
    for (const row of result.rows) {
      const updates = [];
      const values = [];
      for (const col of columns) {
        const fixed = repair(row[col]);
        if (fixed !== row[col]) {
          values.push(fixed);
          updates.push(`"${col}" = $${values.length}`);
        }
      }
      if (updates.length) {
        values.push(row.id);
        await pool.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
        total += updates.length;
      }
    }
  }
  console.log(`Encoding засвар дууслаа. Зассан талбар: ${total}`);
}

main().catch(err => {
  console.error('Encoding засварын алдаа:', err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
