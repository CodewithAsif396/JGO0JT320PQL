/**
 * Run ONCE to generate your master HD wallet.
 * Save the mnemonic in .env as MASTER_MNEMONIC — never run this again.
 * node scripts/generate-master-wallet.js
 */

const bip39 = require('bip39');
const HDKey = require('hdkey');
const { ec: EC } = require('elliptic');
const bs58checkPkg = require('bs58check');
const bs58check = bs58checkPkg.default || bs58checkPkg;

// Derive TRON address from a public key buffer
function pubKeyToTronAddress(pubKeyBuffer) {
  // Remove the 04 prefix if present (uncompressed public key)
  const pubKey = pubKeyBuffer.length === 65 ? pubKeyBuffer.slice(1) : pubKeyBuffer;

  // Keccak-256 hash of public key
  const { keccak256 } = require('js-sha3');
  const hash = keccak256(pubKey);

  // Take last 20 bytes → Ethereum-style address bytes
  const addressBytes = Buffer.from(hash, 'hex').slice(-20);

  // TRON prefix: 0x41
  const tronBytes = Buffer.concat([Buffer.from([0x41]), addressBytes]);

  // Base58Check encode
  const address = bs58check.encode(tronBytes);
  return address;
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('          TRON MASTER HD WALLET GENERATOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Generate 12-word BIP39 mnemonic
  const mnemonic = bip39.generateMnemonic(128);
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // Derive master HD key
  const master = HDKey.fromMasterSeed(seed);

  // TRON derivation path — m/44'/195'/0'/0/0
  const child = master.derive("m/44'/195'/0'/0/0");

  const pubKeyBuffer = child.publicKey;
  const address = pubKeyToTronAddress(pubKeyBuffer);

  console.log('⚠️  CRITICAL SECURITY WARNING:');
  console.log('   • This mnemonic controls ALL user funds on your platform.');
  console.log('   • Write it down on paper. Store offline. Never photograph it.');
  console.log('   • Never share it. Never paste it in chat or email.');
  console.log('   • If lost → funds are unrecoverable forever.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('MASTER MNEMONIC (12 words — SAVE THIS NOW):');
  console.log(`\n  ${mnemonic}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('MASTER TRON ADDRESS (share this — it is public):');
  console.log(`\n  ${address}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('NEXT STEPS:');
  console.log('  1. Copy the 12-word mnemonic and save it OFFLINE (paper/USB).');
  console.log('  2. Open your .env file and set:');
  console.log(`     MASTER_MNEMONIC="${mnemonic}"`);
  console.log(`     MASTER_ADDRESS="${address}"`);
  console.log('  3. Paste the MASTER TRON ADDRESS back to Claude to continue.');
  console.log('  4. DELETE this terminal output / clear your screen after saving.\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
