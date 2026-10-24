# JARVIS Cloud Brain — isolated test backend

This folder is a **separate Cloudflare Worker**, not GrowthPilot and not the existing Supabase project. It keeps the Hugging Face token on the server and never asks the Android app to contain that provider token.

## Important free-tier limitation

The Worker now uses the official Ollama Cloud OpenAI-compatible API at `https://ollama.com/v1/chat/completions`. It uses `gemma4:31b`, which is listed in Ollama's cloud API model catalog. The requested `OBLITERATUS/Qwen3.8-27B-OBLITERATED` model is not listed in the current Ollama cloud catalog, so this is a provider switch plus a model change for the initial test. Ollama Cloud usage limits and plan terms can change; an API key alone does not guarantee unlimited free inference. Check Ollama's usage page before relying on it, and do not purchase anything unless you choose to.

Model: `gemma4:31b`

## Deploy as a new Worker (do not reuse any existing Worker)

1. Create a **new** Cloudflare Worker named `jarvis-cloud-brain`.
2. From this folder, deploy with Wrangler, or paste `src/index.js` into the Worker editor.
3. Add Worker secrets in Cloudflare:
   - `OLLAMA_API_KEY`: your Ollama Cloud API key.
   - `JARVIS_CLIENT_KEY`: a long, random value used to authenticate requests.
4. Never put `HF_TOKEN` in the Android app, GitHub files, screenshots, or chat.
5. Test `GET /health`; it should return `ok: true`.
6. Test `POST /chat` using the `x-jarvis-client-key` header and a short message before connecting the Android UI.

## API

`POST /chat`

Headers:
- `content-type: application/json`
- `x-jarvis-client-key: <JARVIS_CLIENT_KEY>`

Body:
```json
{
  "messages": [
    {"role": "user", "content": "नमस्ते JARVIS"}
  ]
}
```

Successful response:
```json
{"reply":"...","model":"gemma4:31b"}
```

The Worker caps message size, message count, and response length. It intentionally does not store chat history or Drive files yet.

## Security note before app integration

A shared client key embedded in a mobile APK can be extracted. Do not treat it as strong user authentication or publish the endpoint widely. Before connecting the Android app for regular use, add an appropriate per-user authentication/rate-limit layer. The current branch is a test foundation only; it is not deployed and does not alter `main`.
