// Generate the lightweight, screen-swappable GLB used by Campaign LP heroes.
// Re-run after changing the geometry:
//   node labs/campaign/scripts/generate-device-model.mjs

import fs from "node:fs";
import path from "node:path";
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }

  async readAsDataURL(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString("base64")}`;
    this.onloadend?.();
  }
}

globalThis.FileReader = NodeFileReader;

const scene = new Scene();
scene.name = "CampaignDeviceDuoV1";

const aluminum = new MeshStandardMaterial({
  name: "Aluminum",
  color: new Color("#aeb4bc"),
  metalness: 0.78,
  roughness: 0.24,
});
const edge = new MeshStandardMaterial({
  name: "Graphite",
  color: new Color("#16191f"),
  metalness: 0.55,
  roughness: 0.3,
});
const keyboard = new MeshStandardMaterial({
  name: "Keyboard",
  color: new Color("#272b32"),
  metalness: 0.1,
  roughness: 0.72,
});
const laptopScreen = new MeshStandardMaterial({
  name: "LaptopScreen",
  color: new Color("#5b35f5"),
  metalness: 0,
  roughness: 0.58,
});
const phoneScreen = new MeshStandardMaterial({
  name: "PhoneScreen",
  color: new Color("#5b35f5"),
  metalness: 0,
  roughness: 0.58,
});

// Screen planes carry the screenshot / canvas texture. Their vertical
// orientation is still wrong in model-viewer (docs/device-mockup-fixes.md).
// Flipping the V coordinate here was tried and did not correct it, which
// points at the texture-upload side (createCanvasTexture vs createTexture)
// rather than the geometry — fix it there, with a rendered check, before
// changing these UVs again.
function screenPlane(width, height) {
  return new PlaneGeometry(width, height);
}

function mesh(geometry, material, name, position) {
  const item = new Mesh(geometry, material);
  item.name = name;
  item.position.set(...position);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

const laptop = new Group();
laptop.name = "Laptop";
laptop.rotation.y = -0.12;
laptop.position.set(-0.35, -0.2, 0);

laptop.add(
  mesh(new RoundedBoxGeometry(3.7, 0.15, 2.25, 5, 0.08), aluminum, "LaptopBase", [0, 0, 0.25]),
  mesh(new RoundedBoxGeometry(3.38, 0.035, 1.42, 3, 0.035), keyboard, "KeyboardDeck", [0, 0.095, 0.02]),
  mesh(new RoundedBoxGeometry(0.94, 0.024, 0.58, 3, 0.03), edge, "Trackpad", [0, 0.118, 0.76]),
  mesh(new RoundedBoxGeometry(3.7, 2.32, 0.12, 5, 0.1), edge, "LaptopDisplayBack", [0, 1.18, -0.86])
);

const laptopDisplay = mesh(
  screenPlane(3.42, 2.03),
  laptopScreen,
  "LaptopDisplay",
  [0, 1.18, -0.792]
);
laptop.add(laptopDisplay);

for (let row = 0; row < 5; row += 1) {
  laptop.add(
    mesh(new RoundedBoxGeometry(2.66, 0.035, 0.13, 2, 0.025), edge, `KeyRow_${row}`, [
      0,
      0.135,
      -0.48 + row * 0.21,
    ])
  );
}
scene.add(laptop);

const phone = new Group();
// Up and to the front-right of the laptop. The phone is 2.22 tall, so its
// bottom edge sits at y = 1.32 - 1.11 = 0.21 — clear of the laptop base top
// (y = -0.125). Lowering this back below ~1.24 makes the phone intersect the
// laptop body again, which reads as "stuck into the keyboard" at every angle.
phone.name = "Phone";
phone.position.set(1.98, 1.32, 1.02);
phone.rotation.y = -0.24;
phone.rotation.z = -0.025;
phone.add(
  mesh(new RoundedBoxGeometry(1.06, 2.22, 0.14, 6, 0.14), edge, "PhoneShell", [0, 0, 0])
);
const phoneDisplay = mesh(
  screenPlane(0.92, 2.02),
  phoneScreen,
  "PhoneDisplay",
  [0, 0, 0.076]
);
phone.add(phoneDisplay);
scene.add(phone);

const exporter = new GLTFExporter();

async function writeGlb(input, filename) {
  const result = await exporter.parseAsync(input, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  const output = path.join(process.cwd(), "public", "models", filename);
  const buffer = Buffer.from(result);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buffer);
  console.log(`${output} (${buffer.byteLength} bytes)`);
}

const laptopOnly = laptop.clone(true);
laptopOnly.name = "CampaignDeviceLaptopV1";
laptopOnly.position.x = 0;
const phoneOnly = phone.clone(true);
phoneOnly.name = "CampaignDeviceMobileV1";
phoneOnly.position.set(0, 0.78, 0);

await writeGlb(laptopOnly, "device-laptop-v1.glb");
await writeGlb(phoneOnly, "device-mobile-v1.glb");
await writeGlb(scene, "device-duo-v1.glb");
