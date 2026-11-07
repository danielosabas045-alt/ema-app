'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function initializeDatabase(pool, config) {
  const sql = await fs.readFile(path.join(__dirname, '../migrations/001_workspace.sql'), 'utf8');
  await transaction(pool, async client => {
    // Serializes initial schema setup when multiple instances start together.
    await client.query('SELECT pg_advisory_xact_lock(945202611)');
    await client.query(sql);
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [config.adminEmail]);
    if (!existing.rowCount) {
      if (!config.adminPassword) throw new Error('Falta ADMIN_PASSWORD para crear el administrador inicial (mínimo 12 caracteres).');
      const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptRounds || 12);
      await client.query("INSERT INTO users(email,name,password_hash,role,status,accepted_at) VALUES($1,$2,$3,'admin','active',NOW()) ON CONFLICT(email) DO NOTHING", [config.adminEmail, config.adminName, passwordHash]);
    }
    // Existing admin passwords are intentionally never changed on restart.
    await client.query('DELETE FROM sessions WHERE expires_at < NOW()');
    await client.query('DELETE FROM password_resets WHERE expires_at < NOW()');
  });
}

module.exports = { initializeDatabase, transaction };
