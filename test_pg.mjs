import { Client } from 'pg';

const connectionString = 'postgresql://postgres:postgres@db.plyqpmrucbsyxybmkoeg.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

client.connect()
  .then(() => {
    console.log('Connected!');
    client.end();
  })
  .catch(err => {
    console.error('Connection error', err.message);
  });
