import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

const source = new URL('../node_modules/three/', import.meta.url);
const destination = new URL('../dist/vendor/three/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('package.json', destination), '{"type":"module","private":true}\n');
for (const name of ['three.module.js', 'three.core.js']) {
  await copyFile(new URL(`build/${name}`, source), new URL(name, destination));
}
const controls = await readFile(new URL('examples/jsm/controls/OrbitControls.js', source), 'utf8');
await writeFile(new URL('OrbitControls.js', destination), controls.replace("from 'three'", "from './three.module.js'"));
await copyFile(new URL('LICENSE', source), new URL('LICENSE', destination));
const { version } = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
await writeFile(new URL('VERSION', destination), `three@${version}\nOrbitControls: import mapped to the local module.\n`);
console.log(`Three.js ${version} preparado em dist/vendor/three/`);
