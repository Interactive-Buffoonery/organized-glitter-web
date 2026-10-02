/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;
declare const __APP_TEST_ENV__: string;

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
    onNeedRefresh?: () => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
