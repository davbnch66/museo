// Web Worker: runs Meta's MusicGen (small) entirely in the browser via
// transformers.js / ONNX. First use downloads the model (~600 MB, cached by
// the browser); generation then produces real neural audio from a text prompt.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AutoTokenizer, MusicgenForConditionalGeneration, env } from "@huggingface/transformers";

(env as any).allowLocalModels = false;

const MODEL_ID = "Xenova/musicgen-small";
const SAMPLE_RATE = 32000;

let tokenizer: any = null;
let model: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, prompt, duration } = e.data as { id: number; prompt: string; duration: number };
  const post = (msg: Record<string, unknown>, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage({ id, ...msg }, transfer ?? []);

  try {
    if (!tokenizer || !model) {
      const seen = new Map<string, number>();
      const progress_callback = (p: any) => {
        if (p?.status === "progress" && p.file) {
          seen.set(p.file, p.progress ?? 0);
          const total = [...seen.values()].reduce((s, x) => s + x, 0) / seen.size;
          post({ type: "download", pct: Math.round(total), file: p.file });
        }
      };
      post({ type: "status", status: "download" });
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback });
      model = await MusicgenForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: { text_encoder: "q8", decoder_model_merged: "q8", encodec_decode: "fp32" },
        progress_callback,
      });
    }

    post({ type: "status", status: "generate" });
    const inputs = tokenizer(prompt);
    const max_new_tokens = Math.min(1503, Math.max(150, Math.round(duration * 50)));

    const output = await model.generate({
      ...inputs,
      max_new_tokens,
      do_sample: true,
      guidance_scale: 3,
      callback_function: (beams: any) => {
        try {
          const n = beams?.[0]?.output_token_ids?.length ?? 0;
          post({ type: "generate", pct: Math.min(99, Math.round((n / max_new_tokens) * 100)) });
        } catch {
          // progress is best-effort
        }
      },
    });

    const pcm = output.data as Float32Array;
    post({ type: "result", pcm, sampleRate: SAMPLE_RATE }, [pcm.buffer as ArrayBuffer]);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
