import {loadPyodide} from './pyodide/pyodide.mjs';

let functionsReady;
async function ready() {
  if (!functionsReady) {
    functionsReady = (async () => {
      const pyodide = await loadPyodide({indexURL: new URL('./pyodide/', import.meta.url).href});
      const response = await fetch(new URL('./despacho_core.py', import.meta.url));
      if (!response.ok) throw new Error('Módulo de síntese não encontrado.');
      pyodide.FS.writeFile('/home/pyodide/despacho_core.py', await response.text());
      pyodide.runPython('import sys; sys.path.insert(0, "/home/pyodide"); import despacho_core');
      return pyodide.pyimport('despacho_core');
    })();
  }
  return functionsReady;
}

self.onmessage = async ({data}) => {
  const {id, action, payload} = data;
  try {
    const core = await ready();
    const result = action === 'build'
      ? JSON.parse(core.from_json(JSON.stringify(payload)))
      : action === 'docx'
        ? core.docx_from_json(JSON.stringify(payload))
        : (() => { throw new Error('Ação de síntese desconhecida.'); })();
    self.postMessage({id, result});
  } catch (error) {
    self.postMessage({id, error: String(error?.message || error)});
  }
};
