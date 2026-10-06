// Genera los íconos PWA / favicon desde los assets oficiales de Designinspo.
// Uso: node scripts/generate-icons.mjs
import sharp from "sharp";

const SRC = "Designinspo/Icono Rendicion de Gastos.png";
const M = "Designinspo/icono M.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Recorta el margen blanco exterior (el ícono ocupa ~70..1180 px de 1254)
const cropped = () =>
  sharp(SRC).extract({ left: 55, top: 55, width: 1144, height: 1144 });

for (const size of [192, 512]) {
  await cropped().resize(size, size).png().toFile(`public/icons/icon-${size}x${size}.png`);
}

// Maskable: ícono con ~12% de padding sobre fondo blanco (zona segura Android)
const inner = await cropped().resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: WHITE } })
  .composite([{ input: inner, gravity: "centre" }])
  .png()
  .toFile("public/icons/icon-maskable-512x512.png");

// iOS no admite transparencia
await cropped().resize(180, 180).flatten({ background: WHITE }).png().toFile("public/icons/apple-touch-icon.png");

// Favicon desde la "M" naranja (src/app/icon.png lo detecta Next automáticamente)
await sharp(M)
  .resize(256, 256, { fit: "contain", background: WHITE })
  .png()
  .toFile("src/app/icon.png");
await sharp(SRC).extract({ left: 55, top: 55, width: 1144, height: 1144 }).resize(180, 180).png().toFile("src/app/apple-icon.png");
console.log("Íconos generados");
