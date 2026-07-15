// Phase 6.4a — bootstrap a real PlatformOperator (the platform-console login
// identity, wholly separate from tenant Users). The password is ALWAYS
// prompted interactively — it must never be passed as a CLI argument, since
// argv values land in shell history / `ps` output.
//
// Usage:
//   node scripts/createOperator.js --email ops@example.com --name "Jane Ops"
//   node scripts/createOperator.js ops@example.com "Jane Ops"     (positional)
//   npm run create-operator -- --email ops@example.com --name "Jane Ops"
//
// Non-interactive automation (e.g. this phase's own verification pass) may
// pipe the password over stdin instead of a real TTY prompt; see
// promptPassword() below.
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const PlatformOperator = require('../src/modules/platform/platformOperator.model');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') {
      args.email = argv[i + 1];
      i += 1;
    } else if (arg === '--name') {
      args.name = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith('--')) {
      args._.push(arg);
    }
  }
  // Positional fallback: <email> <name>
  if (!args.email && args._[0]) args.email = args._[0];
  if (!args.name && args._[1]) args.name = args._[1];
  return args;
}

const ENTER_CODES = new Set([13, 10]);
const CTRL_C_CODE = 3;
const BACKSPACE_CODES = new Set([8, 127]);

// Prompts for a password without echoing it back to the terminal. When
// stdin is a real TTY, keystrokes are muted at the raw-input level (nothing
// is printed, not even asterisks — the simplest reliable "don't echo"
// technique achievable with zero extra dependencies). When stdin is NOT a
// TTY (piped input — used for scripted/automated runs, e.g. this phase's own
// verification pass), readline just reads the line normally; there's nothing
// to mask because there's no terminal to echo it onto in the first place.
function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (process.stdin.isTTY) {
      process.stdout.write(question);
      let password = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (chunk) => {
        const str = chunk.toString();
        const code = str.charCodeAt(0);

        if (ENTER_CODES.has(code)) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(password);
          return;
        }
        if (code === CTRL_C_CODE) {
          process.stdout.write('\n');
          process.exit(1);
        }
        if (BACKSPACE_CODES.has(code)) {
          password = password.slice(0, -1);
          return;
        }
        password += str;
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email || !/^\S+@\S+\.\S+$/.test(args.email)) {
    console.error('Usage: node scripts/createOperator.js --email <email> --name <name>');
    process.exit(1);
  }
  if (!args.name || !String(args.name).trim()) {
    console.error('Usage: node scripts/createOperator.js --email <email> --name <name>');
    process.exit(1);
  }

  const email = String(args.email).toLowerCase().trim();
  const name = String(args.name).trim();

  const password = await promptPassword('Password for new platform operator: ');
  if (!password || password.length < 8) {
    console.error('[create-operator] password must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  console.log(`[create-operator] connected: ${config.mongoUri}`);

  const existing = await PlatformOperator.findOne({ email });
  if (existing) {
    console.error(`[create-operator] an operator with email "${email}" already exists`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const operator = await PlatformOperator.create({ name, email, passwordHash, active: true });

  console.log(`[create-operator] created platform operator: ${operator.email} (${operator.name})`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[create-operator] failed:', err);
  process.exit(1);
});
