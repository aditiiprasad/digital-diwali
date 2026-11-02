import { defineConfig, type Plugin } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Exposes `virtual:asset-list`: an array of every file currently in /public.
 * The app uses it to pick the first asset candidate that actually exists, so
 * missing media never triggers 404s and falls straight back to generated art/audio.
 * Adding or removing a file in /public triggers a full reload in dev.
 */
function publicAssetList(): Plugin {
  const virtualId = 'virtual:asset-list';
  const resolvedId = '\0' + virtualId;
  let publicDir = '';

  const walk = (dir: string): string[] => {
    let out: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out = out.concat(walk(full));
      else out.push(relative(publicDir, full).split(sep).join('/'));
    }
    return out;
  };

  return {
    name: 'public-asset-list',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    resolveId(id) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return undefined;
      return `export default ${JSON.stringify(walk(publicDir))};`;
    },
    configureServer(server) {
      const onChange = (file: string) => {
        if (!publicDir || !file.startsWith(publicDir)) return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(publicDir);
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  plugins: [publicAssetList()],
  server: { host: true },
});
