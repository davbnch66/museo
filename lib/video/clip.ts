// One-click music video generator. Analyzes the song (themes, mood, lyrics,
// sections) and renders an audio-reactive clip on a canvas while recording it
// to WebM (canvas.captureStream + MediaRecorder). The clip "shoots itself" in
// real time so the user watches it being filmed.

import { timeOfStep } from "../music/engine/render";
import type { Song } from "../music/types";

export interface ClipTheme {
  scene: "starfield" | "waves" | "rain" | "neonGrid" | "embers" | "bokeh" | "rays" | "bars";
  hue: number;
  hue2: number;
  title: string;
  subtitle: string;
}

export function analyzeClipTheme(song: Song): ClipTheme {
  const t = song.mood.themes;
  const scene = t.includes("espace") || t.includes("nuit")
    ? "starfield"
    : t.includes("mer")
      ? "waves"
      : t.includes("pluie")
        ? "rain"
        : t.includes("ville") || t.includes("fête")
          ? "neonGrid"
          : t.includes("feu") || t.includes("combat")
            ? "embers"
            : t.includes("amour") || t.includes("rêve")
              ? "bokeh"
              : t.includes("été") || t.includes("liberté") || t.includes("nature")
                ? "rays"
                : "bars";
  return {
    scene,
    hue: song.mood.hue,
    hue2: (song.mood.hue + 50) % 360,
    title: song.title,
    subtitle: `${song.genreName} · Museo`,
  };
}

interface TimedLine {
  text: string;
  start: number;
  end: number;
  sylls: { text: string; start: number }[];
}

function timedLines(song: Song): TimedLine[] {
  const out: TimedLine[] = [];
  for (const sec of song.sections) {
    for (const line of sec.lyricLines) {
      out.push({
        text: line.text,
        start: timeOfStep(song, line.startStep) + 0.05,
        end: timeOfStep(song, line.endStep) + 0.4,
        sylls: line.syllables.map((s) => ({ text: s.text, start: timeOfStep(song, s.step) + 0.05 })),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
}

export class ClipRenderer {
  private cancelled = false;
  private raf = 0;
  onProgress: ((p: number) => void) | null = null;

  cancel() {
    this.cancelled = true;
  }

  /** Renders + records the clip; resolves with the WebM blob. */
  async generate(song: Song, audio: AudioBuffer, canvas: HTMLCanvasElement): Promise<Blob> {
    const W = (canvas.width = 1280);
    const H = (canvas.height = 720);
    const g = canvas.getContext("2d")!;
    const theme = analyzeClipTheme(song);
    const lines = timedLines(song);

    const actx = new AudioContext();
    if (actx.state === "suspended") await actx.resume();
    const src = actx.createBufferSource();
    src.buffer = audio;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    const recDest = actx.createMediaStreamDestination();
    src.connect(analyser);
    analyser.connect(recDest);
    analyser.connect(actx.destination); // monitor while filming

    const stream = canvas.captureStream(30);
    for (const t of recDest.stream.getAudioTracks()) stream.addTrack(t);
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const particles: Particle[] = [];
    for (let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.2 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: 1 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const duration = audio.duration;
    const startTime = actx.currentTime + 0.15;

    const done = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime ?? "video/webm" }));
      rec.onerror = () => reject(new Error("Échec de l'enregistrement vidéo"));
    });

    rec.start(500);
    src.start(startTime);

    const draw = () => {
      if (this.cancelled) {
        rec.stop();
        src.stop();
        void actx.close();
        return;
      }
      const t = actx.currentTime - startTime;
      if (t >= duration + 0.6) {
        rec.stop();
        void actx.close();
        return;
      }
      analyser.getByteFrequencyData(freq);
      const band = (a: number, b: number) => {
        let s = 0;
        for (let i = a; i < b; i++) s += freq[i];
        return s / (b - a) / 255;
      };
      const bass = band(1, 14);
      const mids = band(14, 80);
      const highs = band(80, 240);

      this.drawFrame(g, W, H, t, duration, theme, song, lines, particles, bass, mids, highs);
      this.onProgress?.(Math.min(1, t / duration));
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);

    return done;
  }

  private drawFrame(
    g: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    duration: number,
    theme: ClipTheme,
    song: Song,
    lines: TimedLine[],
    particles: Particle[],
    bass: number,
    mids: number,
    highs: number
  ) {
    const { hue, hue2 } = theme;
    // Background gradient that breathes with the bass.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `hsl(${hue}, 45%, ${6 + bass * 7}%)`);
    grad.addColorStop(1, `hsl(${hue2}, 50%, ${3 + bass * 4}%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    g.save();
    this.drawScene(g, W, H, t, theme, particles, bass, mids, highs);
    g.restore();

    // Section-aware vignette pulse.
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${0.5 - bass * 0.2})`);
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    // Title card during the intro, credits at the end.
    if (t < 4) {
      const a = t < 3 ? Math.min(1, t / 0.8) : Math.max(0, 1 - (t - 3));
      g.globalAlpha = a;
      g.fillStyle = "#fff";
      g.font = "bold 64px Georgia, serif";
      g.textAlign = "center";
      g.fillText(theme.title, W / 2, H / 2 - 10);
      g.font = "26px Georgia, serif";
      g.fillStyle = `hsl(${hue}, 80%, 75%)`;
      g.fillText(theme.subtitle, W / 2, H / 2 + 42);
      g.globalAlpha = 1;
    }
    if (t > duration - 3) {
      const a = Math.min(1, (t - (duration - 3)) / 1.2);
      g.globalAlpha = a;
      g.fillStyle = "#fff";
      g.font = "bold 40px Georgia, serif";
      g.textAlign = "center";
      g.fillText(theme.title, W / 2, H / 2);
      g.font = "22px Georgia, serif";
      g.fillText("généré par Museo", W / 2, H / 2 + 40);
      g.globalAlpha = 1;
    }

    // Karaoke lyrics.
    const line = lines.find((l) => t >= l.start - 0.3 && t <= l.end + 0.3);
    if (line && t >= 4) {
      const fadeIn = Math.min(1, (t - (line.start - 0.3)) / 0.3);
      const fadeOut = Math.min(1, (line.end + 0.3 - t) / 0.3);
      g.globalAlpha = Math.min(fadeIn, fadeOut);
      g.font = "bold 38px Georgia, serif";
      g.textAlign = "center";
      const sungCount = line.sylls.filter((s) => t >= s.start).length;
      const ratio = line.sylls.length ? sungCount / line.sylls.length : 0;
      const y = H - 90 - bass * 8;
      // Shadow + two-tone karaoke sweep.
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillText(line.text, W / 2 + 2, y + 2);
      const w = g.measureText(line.text).width;
      g.save();
      g.beginPath();
      g.rect(W / 2 - w / 2, y - 42, w * ratio, 56);
      g.clip();
      g.fillStyle = `hsl(${hue}, 95%, 70%)`;
      g.fillText(line.text, W / 2, y);
      g.restore();
      g.save();
      g.beginPath();
      g.rect(W / 2 - w / 2 + w * ratio, y - 42, w * (1 - ratio), 56);
      g.clip();
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.fillText(line.text, W / 2, y);
      g.restore();
      g.globalAlpha = 1;
    }

    // Progress hairline.
    g.fillStyle = `hsla(${hue}, 90%, 65%, 0.9)`;
    g.fillRect(0, H - 4, W * (t / duration), 4);
    void song;
  }

  private drawScene(
    g: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    theme: ClipTheme,
    ps: Particle[],
    bass: number,
    mids: number,
    highs: number
  ) {
    const { hue, hue2, scene } = theme;
    switch (scene) {
      case "starfield": {
        for (const p of ps) {
          p.x += p.vx * p.z * (1 + bass * 3);
          p.y += p.vy * p.z * 0.4;
          if (p.x < 0) p.x += W;
          if (p.x > W) p.x -= W;
          const tw = 0.5 + 0.5 * Math.sin(t * 3 + p.phase);
          g.fillStyle = `hsla(${p.phase > 3 ? hue : hue2}, 80%, ${70 + highs * 25}%, ${0.3 + 0.7 * tw * p.z})`;
          g.beginPath();
          g.arc(p.x, p.y, p.r * p.z * (1 + bass * 0.8), 0, Math.PI * 2);
          g.fill();
        }
        // glowing moon/planet
        const r = 70 + bass * 18;
        const mg = g.createRadialGradient(W * 0.78, H * 0.26, r * 0.2, W * 0.78, H * 0.26, r * 2.2);
        mg.addColorStop(0, `hsla(${hue}, 80%, 75%, 0.9)`);
        mg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = mg;
        g.beginPath();
        g.arc(W * 0.78, H * 0.26, r * 2.2, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case "waves": {
        for (let layer = 0; layer < 4; layer++) {
          g.beginPath();
          const base = H * 0.5 + layer * 60;
          g.moveTo(0, H);
          for (let x = 0; x <= W; x += 8) {
            const y =
              base +
              Math.sin(x * 0.008 + t * (0.8 + layer * 0.3)) * (18 + bass * 50) +
              Math.sin(x * 0.02 - t * 1.6) * 8 * mids;
            g.lineTo(x, y);
          }
          g.lineTo(W, H);
          g.closePath();
          g.fillStyle = `hsla(${hue + layer * 8}, 70%, ${30 - layer * 5 + bass * 12}%, ${0.5})`;
          g.fill();
        }
        break;
      }
      case "rain": {
        g.strokeStyle = `hsla(${hue}, 60%, 70%, 0.5)`;
        g.lineWidth = 1.2;
        for (const p of ps) {
          p.y += (8 + p.z * 14) * (1 + mids);
          p.x += 1.5;
          if (p.y > H) {
            p.y = -20;
            p.x = Math.random() * W;
          }
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - 3, p.y - 14 * p.z);
          g.stroke();
        }
        // window glow
        const wg = g.createRadialGradient(W * 0.5, H * 0.85, 30, W * 0.5, H * 0.85, 400);
        wg.addColorStop(0, `hsla(${hue2}, 80%, 55%, ${0.18 + bass * 0.15})`);
        wg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = wg;
        g.fillRect(0, 0, W, H);
        break;
      }
      case "neonGrid": {
        // perspective grid
        const horizon = H * 0.55;
        g.strokeStyle = `hsla(${hue}, 95%, 60%, ${0.5 + bass * 0.4})`;
        g.lineWidth = 1.5;
        for (let i = -10; i <= 10; i++) {
          g.beginPath();
          g.moveTo(W / 2 + i * 40, horizon);
          g.lineTo(W / 2 + i * 260, H);
          g.stroke();
        }
        const scroll = (t * 80) % 60;
        for (let j = 0; j < 10; j++) {
          const y = horizon + Math.pow(j + scroll / 60, 2.2) * 7;
          if (y > H) break;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
        // sun
        const r = 90 + bass * 25;
        const sg = g.createLinearGradient(0, horizon - r * 2, 0, horizon);
        sg.addColorStop(0, `hsl(${hue2}, 95%, 65%)`);
        sg.addColorStop(1, `hsl(${hue}, 95%, 55%)`);
        g.fillStyle = sg;
        g.beginPath();
        g.arc(W / 2, horizon - 20, r, Math.PI, 0);
        g.fill();
        break;
      }
      case "embers": {
        for (const p of ps) {
          p.y -= (1 + p.z * 2.5) * (1 + bass * 2);
          p.x += Math.sin(t * 2 + p.phase) * 0.8;
          if (p.y < -10) {
            p.y = H + 10;
            p.x = Math.random() * W;
          }
          g.fillStyle = `hsla(${hue + p.phase * 4}, 95%, ${55 + highs * 30}%, ${0.25 + 0.6 * p.z})`;
          g.beginPath();
          g.arc(p.x, p.y, p.r * (0.8 + bass), 0, Math.PI * 2);
          g.fill();
        }
        const fg = g.createLinearGradient(0, H, 0, H * 0.55);
        fg.addColorStop(0, `hsla(${hue}, 90%, ${30 + bass * 25}%, 0.55)`);
        fg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fg;
        g.fillRect(0, 0, W, H);
        break;
      }
      case "bokeh": {
        for (const p of ps) {
          p.x += p.vx * 0.5;
          p.y += p.vy * 0.5;
          if (p.x < -30) p.x = W + 30;
          if (p.x > W + 30) p.x = -30;
          if (p.y < -30) p.y = H + 30;
          if (p.y > H + 30) p.y = -30;
          const r = p.r * 8 * p.z * (1 + bass * 0.5);
          const bg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          bg.addColorStop(0, `hsla(${p.phase > 3 ? hue : hue2}, 85%, 65%, ${0.12 + mids * 0.18})`);
          bg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = bg;
          g.beginPath();
          g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case "rays": {
        g.save();
        g.translate(W / 2, H * 0.3);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + t * 0.12;
          g.rotate(a - (i > 0 ? (i - 1) / 18 * Math.PI * 2 + t * 0.12 : 0));
          g.fillStyle = `hsla(${hue}, 85%, 60%, ${0.05 + mids * 0.1})`;
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, Math.max(W, H), -0.06 - bass * 0.04, 0.06 + bass * 0.04);
          g.fill();
        }
        g.restore();
        const cg = g.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.3, 220 + bass * 60);
        cg.addColorStop(0, `hsla(${hue2}, 95%, 75%, 0.95)`);
        cg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = cg;
        g.fillRect(0, 0, W, H);
        break;
      }
      case "bars": {
        const n = 48;
        const bw = W / n;
        for (let i = 0; i < n; i++) {
          const lvl = i < n / 3 ? bass : i < (2 * n) / 3 ? mids : highs;
          const jitter = 0.5 + 0.5 * Math.sin(t * 4 + i * 0.7);
          const h = (lvl * 0.85 + 0.08) * H * 0.55 * (0.6 + 0.4 * jitter);
          g.fillStyle = `hsla(${hue + (i / n) * 60}, 85%, ${45 + lvl * 30}%, 0.85)`;
          g.fillRect(i * bw + 2, H * 0.78 - h, bw - 4, h);
          g.fillRect(i * bw + 2, H * 0.78 + 6, bw - 4, h * 0.25); // reflection
        }
        break;
      }
    }
  }
}
