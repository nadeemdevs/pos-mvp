// NOTE: this provider is UNTESTED against real ESC/POS hardware — it has
// only been exercised by constructing buffers and connecting to a local
// echo/dummy TCP listener. Byte-level details (which control codes a given
// printer model actually honors, codepage, cut command) may need tweaking
// once it's run against a physical network printer.
const net = require('node:net');
const PrinterProvider = require('../PrinterProvider');

const ESC = '\x1b';
const GS = '\x1d';

function buildTicket(payload = {}) {
  const { title = '', meta = [], lines = [], footer = '' } = payload;
  const chunks = [];

  chunks.push(`${ESC}@`); // initialize printer
  chunks.push(`${ESC}a1`); // center align
  chunks.push(`${ESC}E1`); // bold on
  if (title) chunks.push(`${title}\n`);
  chunks.push(`${ESC}E0`); // bold off
  chunks.push(`${ESC}a0`); // left align

  for (const [key, value] of meta) {
    chunks.push(`${key}: ${value}\n`);
  }
  if (meta.length) chunks.push('--------------------------------\n');

  for (const line of lines) {
    const { qty, name, note } = line;
    chunks.push(`${qty} x ${name}\n`);
    if (note) chunks.push(`   (${note})\n`);
  }

  if (footer) {
    chunks.push('--------------------------------\n');
    chunks.push(`${footer}\n`);
  }

  chunks.push('\n\n\n');
  chunks.push(`${GS}V\x00`); // partial cut (ignored by printers with no cutter)

  return Buffer.from(chunks.join(''), 'binary');
}

class EscPosNetworkProvider extends PrinterProvider {
  async print(payload, config = {}) {
    const host = config.host;
    const port = config.port || 9100;

    if (!host) {
      const err = new Error('ESC/POS printer host is not configured');
      err.status = 502;
      throw err;
    }

    const buffer = buildTicket(payload);

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const fail = (message) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        const err = new Error(message);
        err.status = 502;
        reject(err);
      };

      socket.setTimeout(3000);
      socket.once('timeout', () => fail('Timed out connecting to network printer'));
      socket.once('error', (err) => fail(err.message));

      socket.connect(port, host, () => {
        socket.write(buffer, () => {
          if (settled) return;
          settled = true;
          socket.end();
          resolve({ printed: true });
        });
      });
    });
  }
}

module.exports = EscPosNetworkProvider;
