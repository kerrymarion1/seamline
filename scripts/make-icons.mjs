// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// The letters in icon.svg are Fredoka outlines, so no font is needed here.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const dir = new URL('../public/icons/', import.meta.url)
const svg = readFileSync(new URL('icon.svg', dir), 'utf8')
// Maskable and iOS icons are full-bleed squares; the OS applies its own mask.
const square = svg.replace('rx="112"', 'rx="0"')
// Android's round mask keeps only the middle 80%, so the mark shrinks to fit.
const maskable = square.replace('<g id="mark">', '<g id="mark" transform="translate(256 256) scale(0.8) translate(-256 -256)">')

const out = (name) => new URL(name, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1')

await sharp(Buffer.from(svg)).resize(192).png().toFile(out('icon-192.png'))
await sharp(Buffer.from(svg)).resize(512).png().toFile(out('icon-512.png'))
await sharp(Buffer.from(maskable)).resize(512).png().toFile(out('maskable-512.png'))
await sharp(Buffer.from(square)).resize(180).png().toFile(out('apple-touch-icon.png'))
console.log('icons written')
