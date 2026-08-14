import { hashPassword } from '../src/security.js';

const password = process.argv[2];
if (!password || password.length < 8 || password.length > 128) {
  console.error('Usage: npm run credential -- <password with 8-128 characters>');
  process.exit(1);
}

console.log(await hashPassword(password));
