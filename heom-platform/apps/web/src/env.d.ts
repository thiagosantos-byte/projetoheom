/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_HEOM_MODE?: string;
  readonly VITE_HEOM_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
