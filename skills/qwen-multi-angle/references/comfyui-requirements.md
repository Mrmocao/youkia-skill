# ComfyUI workflow requirements

The skill bundles the workflow definition but not model weights or third-party ComfyUI nodes. Before inference, the target ComfyUI installation must resolve these exact workflow values.

## API connection

- Service base URL: `http://192.168.5.149:8199`
- Web UI: `http://192.168.5.149:8199/`
- Submit workflow: `POST /prompt`
- Query result: `GET /history/{prompt_id}`
- Query queue: `GET /queue`
- View output: `GET /view?filename={filename}&type=output`
- WebSocket progress: `ws://192.168.5.149:8199/ws?clientId={client_id}`

The submitted workflow must be exported from ComfyUI in **API format**. Do not submit an ordinary visual-interface workflow JSON to `/prompt`.

## Model files

| Type | Workflow value |
|---|---|
| UNet | `Qwen2511/qwenImageEdit2511_bf16.safetensors` |
| Multi-angle LoRA | `Qwen-Image-Edit-2511-Multiple-Angles-LoRA/qwen-image-edit-2511-multiple-angles-lora.safetensors` |
| Lightning LoRA | `Qwen_Image_Edit_2511_Lightning_4步加速lora_fp32.safetensors` |
| CLIP | `qwen_2.5_vl_7b_fp8_scaled.safetensors.safetensors` |
| VAE | `qwen_image_vae.safetensors` |

## Node classes

The server must recognize all node classes in the bundled API workflow. Non-core or installation-sensitive classes include:

- `TextEncodeQwenImageEditPlus`
- `FluxKontextMultiReferenceLatentMethod`
- `FluxKontextImageScale`
- `CFGNorm`
- `ModelSamplingAuraFlow`

Standard workflow classes also include `LoadImage`, `SaveImage`, `CLIPLoader`, `VAELoader`, `UNETLoader`, `LoraLoaderModelOnly`, `VAEEncode`, `VAEDecode`, and `KSampler`.

If `/prompt` returns an unknown-node or missing-model error, install or map the missing component in ComfyUI. Do not rewrite node types automatically because that can change generation behavior.
