// Arma el video final a partir de lo grabado por record.mjs (raw/).
// Enfoque por escena, sin adornos: solo las vistas reales que se usan.
//
//   Escena 1  Panel Admin (pasajero, vehículo, asignación y viaje)
//   Escena 2  Pasajero + Conductor lado a lado (Admin oculto)
//   Escena 3  Panel Admin › Auditoría (móviles ocultos)
//
// Cada escena se recorta de los videos crudos según raw/timeline.json, en
// tramos acelerados (formularios, esperas y recorrido) para que el video dure
// como máximo MAX_SECONDS, con un rótulo de la vista y un subtítulo del paso.
// Salida: demo/demo-flujo-auditoria.mp4 (H.264, 1920x1080, 30 fps).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW = join(HERE, 'raw')
const WORK = join(RAW, 'segments')
const OUTPUT = join(HERE, 'demo-flujo-auditoria.mp4')

const W = 1920
const H = 1080
const FPS = 30
const BG = '0x0b1d3a'
const FONT = 'C\\:/Windows/Fonts/segoeui.ttf'
const FONT_BOLD = 'C\\:/Windows/Fonts/segoeuib.ttf'
const FADE = 0.4
const MAX_SECONDS = 88

const timeline = JSON.parse(readFileSync(join(RAW, 'timeline.json'), 'utf8'))
const markAt = name => {
  const t = timeline.marks.find(m => m.name === name)?.t
  if (t === undefined) throw new Error(`Falta la marca "${name}" en el timeline (¿la grabación se cortó?)`)
  return t
}
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

/** Ruta apta para filtros de ffmpeg (barras normales y ":" escapado). */
const fpath = p => p.replace(/\\/g, '/').replace(/:/g, '\\:')

function run(args) {
  const res = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
  if (res.status !== 0) throw new Error(`ffmpeg falló (${res.status})`)
}

let textN = 0
const textFile = text => {
  const file = join(WORK, `text-${++textN}.txt`)
  writeFileSync(file, text, 'utf8')
  return fpath(file)
}

/** Subtítulos del tramo [from, to] (ms del timeline), en segundos del video acelerado. */
function captionFilters(from, to, speed) {
  const all = timeline.marks.filter(m => m.caption && m.t < to)
  const carried = [...all].reverse().find(m => m.t <= from)
  const caps = [...(carried ? [carried] : []), ...all.filter(m => m.t > from)]
  const out = (to - from) / 1000 / speed
  return caps.map((m, i) => {
    const start = Math.max(0, (m.t - from) / 1000 / speed)
    const end = i + 1 < caps.length ? (caps[i + 1].t - from) / 1000 / speed : out
    return `drawtext=fontfile='${FONT}':textfile='${textFile(m.caption)}':fontsize=34:fontcolor=white:` +
      `box=1:boxcolor=0x000000@0.6:boxborderw=18:x=(w-text_w)/2:y=h-84:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`
  })
}

const label = (text, x, y, size = 26) =>
  `drawtext=fontfile='${FONT_BOLD}':textfile='${textFile(text)}':fontsize=${size}:fontcolor=0x62e7bd:x=${x}:y=${y}`

/** Recorta [from, to] (ms del timeline) del video de un rol. */
function input(role, from, to) {
  const v = timeline.videos[role]
  if (!v?.file || !existsSync(v.file)) throw new Error(`Falta el video de ${role}`)
  const offset = Math.max(0, (from - v.start) / 1000)
  return ['-ss', offset.toFixed(3), '-t', ((to - from) / 1000).toFixed(3), '-i', v.file]
}

function encode(name, inputs, filter, duration, { fadeIn, fadeOut }) {
  const out = join(WORK, `${name}.mp4`)
  const fades = [
    fadeIn ? `fade=t=in:st=0:d=${FADE}` : null,
    fadeOut ? `fade=t=out:st=${Math.max(0, duration - FADE).toFixed(2)}:d=${FADE}` : null,
  ].filter(Boolean)
  const script = join(WORK, `${name}.filter`)
  writeFileSync(script, `${filter}${fades.length ? `,${fades.join(',')}` : ''},format=yuv420p[out]`, 'utf8')
  run([
    '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${duration.toFixed(3)}`,
    ...inputs,
    '-filter_complex_script', script, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-an', out,
  ])
  return out
}

const speedUp = speed => `setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=${FPS}`

/** Tramo de la vista web (Admin): 1440x900 a tamaño real, rótulo encima. */
function adminPiece(name, { from, to, speed, title, fadeIn, fadeOut }) {
  const duration = (to - from) / 1000 / speed
  const caps = captionFilters(from, to, speed)
  const x = (W - 1440) / 2
  const y = 64
  const filter = [
    `[1:v]${speedUp(speed)}[a]`,
    `[0:v][a]overlay=x=${x}:y=${y}:shortest=1,` +
      `drawbox=x=${x - 3}:y=${y - 3}:w=1446:h=906:color=0x2b405b:t=3,` +
      label(title, x, 20) +
      (caps.length ? `,${caps.join(',')}` : ''),
  ].join(';')
  return encode(name, input('admin', from, to), filter, duration, { fadeIn, fadeOut })
}

/** Tramo de los dos teléfonos lado a lado: 390x844 → 416x900. */
function mobilePiece(name, { from, to, speed, fadeIn, fadeOut }) {
  const duration = (to - from) / 1000 / speed
  const pw = 416
  const ph = 900
  const gap = 140
  const xl = W / 2 - gap / 2 - pw
  const xr = W / 2 + gap / 2
  const y = 72
  const caps = captionFilters(from, to, speed)
  const filter = [
    `[1:v]${speedUp(speed)},scale=${pw}:${ph}:flags=lanczos[p]`,
    `[2:v]${speedUp(speed)},scale=${pw}:${ph}:flags=lanczos[d]`,
    `[0:v][p]overlay=x=${xl}:y=${y}:shortest=1[bp]`,
    `[bp][d]overlay=x=${xr}:y=${y}:shortest=1,` +
      `drawbox=x=${xl - 3}:y=${y - 3}:w=${pw + 6}:h=${ph + 6}:color=0x2b405b:t=3,` +
      `drawbox=x=${xr - 3}:y=${y - 3}:w=${pw + 6}:h=${ph + 6}:color=0x2b405b:t=3,` +
      `${label('Pasajero · app móvil', xl, 22)},${label('Conductor · app móvil', xr, 22)}` +
      (caps.length ? `,${caps.join(',')}` : ''),
  ].join(';')
  return encode(name, [...input('pasajero', from, to), ...input('conductor', from, to)], filter, duration, { fadeIn, fadeOut })
}

// ── Plan de escenas (velocidades base) ─────────────────────────────────────────

const plan = [
  { kind: 'admin', title: 'Panel Admin · web', from: markAt('admin:start') - 300, to: markAt('admin:end') + 300, speed: 1.4 },
  { kind: 'mobile', from: markAt('mobile:start') - 300, to: markAt('pax:started'), speed: 1.0 },
  { kind: 'mobile', from: markAt('pax:started'), to: markAt('tracking'), speed: 1.0 },
  { kind: 'mobile', from: markAt('tracking'), to: markAt('drv:finish'), speed: 14.0 },
  { kind: 'mobile', from: markAt('drv:finish'), to: markAt('mobile:end'), speed: 1.0 },
  { kind: 'admin', title: 'Panel Admin · Auditoría', from: markAt('audit:list') - 300, to: markAt('audit:end') + 300, speed: 1.2 },
]

// Si el total pasa del máximo, todo se acelera en la misma proporción.
const total = plan.reduce((s, p) => s + (p.to - p.from) / 1000 / p.speed, 0)
const factor = total > MAX_SECONDS ? total / MAX_SECONDS : 1
plan.forEach((p, i) => {
  p.speed *= factor
  // Fundido solo al cambiar de escena (Admin ↔ móviles).
  p.fadeIn = i === 0 || plan[i - 1].kind !== p.kind
  p.fadeOut = i === plan.length - 1 || plan[i + 1].kind !== p.kind
})
console.log(`Duración estimada: ${(total / factor).toFixed(1)} s (aceleración extra x${factor.toFixed(2)})`)

const segments = plan.map((p, i) =>
  p.kind === 'admin' ? adminPiece(`${i}-admin`, p) : mobilePiece(`${i}-moviles`, p))

const list = join(WORK, 'concat.txt')
writeFileSync(list, segments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'), 'utf8')
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUTPUT])
console.log(`Video listo: ${OUTPUT}`)
