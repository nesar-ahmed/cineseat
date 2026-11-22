// Runs before the test suite. NestJS 12 ships ESM-only packages, and Jest can
// only load them from our CommonJS specs on Node 24.9+; on older versions every
// suite fails with a cryptic "Must use import to load ES Module" error.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 9)) {
  console.error(
    `\n✖ The API tests need Node 24.9 or newer — this shell runs ${process.version}.\n` +
      '  Switch with `nvm use` (see .nvmrc) or put Node 24 first on your PATH.\n',
  );
  process.exit(1);
}
