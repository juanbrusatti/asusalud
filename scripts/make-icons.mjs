/**
 * Genera los iconos PNG de la PWA desde un SVG.
 * Se corre a mano cuando cambia la marca: `node scripts/make-icons.mjs`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const PAPER = "#f5f3ee";
const INK = "#0a0a0a";
const ACCENT = "#3e3fe0";

/** @param {{bg:string, pad:number}} opts */
const markSvg = ({ bg, pad }) => {
  const inner = 512 - pad * 2;
  const scale = inner / 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})" fill="none"
     stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 6.5c0 9 .2 18 0 27 5.6.4 11.4.3 14.8-3.9 3.6-4.4 3.5-14.4-.4-18.6C22.1 6.9 16.4 6.2 11 6.5Z" stroke="${INK}"/>
    <path d="M5.4 20.1c1.9-.2 3.8-.2 5.6 0" stroke="${INK}"/>
    <path d="M30.6 31.4a3 3 0 1 1 .1 0Z" fill="${ACCENT}" stroke="${ACCENT}"/>
  </g>
</svg>`;
};

await mkdir("public/icons", { recursive: true });

// Icono normal: márgenes justos.
const normal = Buffer.from(markSvg({ bg: PAPER, pad: 96 }));
// Maskable: el sistema recorta hasta un 20% de cada borde, así que la marca
// tiene que vivir dentro del 60% central.
const maskable = Buffer.from(markSvg({ bg: PAPER, pad: 150 }));

await sharp(normal).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(normal).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(maskable).resize(512, 512).png().toFile("public/icons/maskable-512.png");
await sharp(normal).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
await writeFile("public/icons/icon.svg", markSvg({ bg: PAPER, pad: 96 }));

console.log("Iconos generados en public/icons/");
