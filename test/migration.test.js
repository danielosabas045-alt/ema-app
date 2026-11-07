'use strict';

const assert = require('node:assert/strict');
const { it } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

it('upgrades the original SQL schema without losing users, records or invitation history', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { initializeDatabase, loadConfig } = require('../server');
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const schema = `ema_migration_${process.pid}_${Date.now()}`;
  const maintenance = new Pool({ connectionString: databaseUrl });
  let pool;
  try {
    await maintenance.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    // These definitions match the original application's persisted schema.
    await pool.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password_hash TEXT, role TEXT NOT NULL CHECK(role IN ('admin','moderator','user')),
        status TEXT NOT NULL DEFAULT 'pending', invite_token_hash TEXT, invite_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ
      );
      CREATE TABLE records (
        id BIGSERIAL PRIMARY KEY, owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE invitations (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ, last_error TEXT
      );
    `);
    const originalHash = await bcrypt.hash('OriginalAdminPassword123!', 4);
    await pool.query("INSERT INTO users(email,name,password_hash,role,status,accepted_at) VALUES('admin@example.test','Existing Admin',$1,'admin','active',NOW())", [originalHash]);
    await pool.query("INSERT INTO users(email,name,role,status) VALUES('pending@example.test','Existing Pending','user','pending')");
    await pool.query("INSERT INTO records(owner_user_id,title,description) VALUES(1,'Existing record','Must survive migration')");
    await pool.query("INSERT INTO invitations(user_id,email,role,token_hash,accepted_at) VALUES(1,'admin@example.test','admin','acceptedhash',NOW())");
    await pool.query("INSERT INTO invitations(user_id,email,role,token_hash,last_error) VALUES(2,'pending@example.test','user','failedhash','SMTP refused')");
    const config = {
      ...loadConfig({ DATABASE_URL: databaseUrl, BASE_URL: 'http://localhost:3000', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'DifferentBootstrapPassword123!' }),
      bcryptRounds: 4,
    };
    await initializeDatabase(pool, config);
    await initializeDatabase(pool, config);
    const users = (await pool.query('SELECT email,name,password_hash,status FROM users ORDER BY id')).rows;
    assert.equal(users.length, 2);
    assert.equal(users[0].name, 'Existing Admin');
    assert.equal(users[0].password_hash, originalHash);
    assert.equal(users[1].status, 'pending');
    const records = (await pool.query('SELECT title,description,updated_at FROM records')).rows;
    assert.equal(records.length, 1);
    assert.equal(records[0].description, 'Must survive migration');
    assert.ok(records[0].updated_at);
    const invitations = (await pool.query('SELECT status FROM invitations ORDER BY id')).rows;
    assert.deepEqual(invitations.map(value => value.status), ['accepted', 'failed']);
  } finally {
    if (pool) await pool.end();
    await maintenance.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await maintenance.end();
  }
});
