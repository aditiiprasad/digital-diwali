/// <reference types="vite/client" />

declare module 'virtual:asset-list' {
  /** Paths (relative to /public, forward slashes) of every file in /public at build/dev time. */
  const files: string[];
  export default files;
}
