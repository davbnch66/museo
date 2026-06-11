import { OfflineAudioContext } from 'node-web-audio-api';
const ctx = new OfflineAudioContext(2, 44100 * 2, 44100);
// master chain like renderSong
const master = ctx.createGain();
const comp = ctx.createDynamicsCompressor();
master.connect(comp); comp.connect(ctx.destination);
const reverb = ctx.createConvolver();
const ir = ctx.createBuffer(2, 44100 * 2, 44100);
for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length); }
reverb.buffer = ir;
const rg = ctx.createGain(); reverb.connect(rg); rg.connect(master);
// track bus
const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = -0.2;
g.connect(p); p.connect(master);
const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(reverb);
// waveshaper + osc
const ws = ctx.createWaveShaper();
const curve = new Float32Array(1024);
for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i/1023)*2-1)*4);
ws.curve = curve;
const o = ctx.createOscillator(); o.connect(ws); ws.connect(g); o.start(0); o.stop(1.5);
console.log('rendering…');
const buf = await ctx.startRendering();
console.log('done, sample:', buf.getChannelData(0)[44100]);
