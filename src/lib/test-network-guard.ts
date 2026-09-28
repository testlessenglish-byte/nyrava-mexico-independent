// Deterministic suites must never spend provider credits or reach live data.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
const blocked = (): never => { throw new Error('DETERMINISTIC_TEST_NETWORK_FORBIDDEN'); };
globalThis.fetch = blocked;
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
