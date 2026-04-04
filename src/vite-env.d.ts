/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_GOOGLE_GEMINI_API_KEY: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SOME_OTHER_KEY?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
