/**
 * Derives the TRON master wallet address from an EXISTING MASTER_MNEMONIC
 * you already have — this does NOT generate a new mnemonic and never
 * prints the mnemonic itself, only the resulting address.
 *
 * Usage (run locally, never paste the mnemonic anywhere else):
 *   set MASTER_MNEMONIC="your twelve word phrase here" (PowerShell: $env:MASTER_MNEMONIC="...")
 *   node backend/scripts/derive-master-address.js
 */

const bip39 = require('bip39');
const HDKey = require('hdkey');
const bs58checkPkg = require('bs58check');
const bs58check = bs58checkPkg.default || bs58checkPkg;
const { keccak256 } = require('js-sha3');

function pubKeyToTronAddress(pubKeyBuffer) {
  const pubKey = pubKeyBuffer.length === 65 ? pubKeyBuffer.slice(1) : pubKeyBuffer;
  const hash = keccak256(pubKey);
  const addressBytes = Buffer.from(hash, 'hex').slice(-20);
  const tronBytes = Buffer.concat([Buffer.from([0x41]), addressBytes]);
  return bs58check.encode(tronBytes);
}

async function main() {
  const mnemonic = process.env.MASTER_MNEMONIC;
  if (!mnemonic) {
    console.error('Set MASTER_MNEMONIC as an environment variable first (do not hardcode it in a file).');
    process.exit(1);
  }
  if (!bip39.validateMnemonic(mnemonic)) {
    console.error('That does not look like a valid BIP39 mnemonic — double-check it.');
    process.exit(1);
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive("m/44'/195'/0'/0/0");
  const address = pubKeyToTronAddress(child.publicKey);

  console.log('\nMASTER TRON ADDRESS (this is public, safe to share/set as MASTER_ADDRESS):');
  console.log(`\n  ${address}\n`);
  console.log('Set this as MASTER_ADDRESS in Render\'s environment variables, alongside');
  console.log('your existing MASTER_MNEMONIC. Do not paste the mnemonic itself anywhere.\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
