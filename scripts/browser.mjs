import { chromium } from 'playwright';

const removedOverrides = ['VK_DRIVER_FILES', 'VK_ICD_FILENAMES', 'VK_ADD_DRIVER_FILES', 'VK_LOADER_DRIVERS_SELECT', 'VK_LOADER_DRIVERS_DISABLE', '__GLX_VENDOR_LIBRARY_NAME', 'CHROME_CANARY_GPU'];
const commonArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox'];
const timeout = async (promise, milliseconds, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

function options(mode) {
  const env = { ...process.env };
  for (const key of removedOverrides) delete env[key];
  if (mode === 'native') env.EGL_PLATFORM = 'surfaceless';
  const args = mode === 'native'
    ? [...commonArgs, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-software-rasterizer', '--use-gl=angle', '--use-angle=gl-egl', '--ozone-platform=headless']
    : [...commonArgs, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
  const executablePath = process.env.CHROMIUM_PATH;
  return { headless: true, env, ...(executablePath ? { executablePath } : {}), timeout: 12000, args, ignoreDefaultArgs: ['--disable-gpu'] };
}

async function checkedLaunch(mode) {
  let browser;
  try {
    browser = await chromium.launch(options(mode));
    const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
    const info = await timeout(page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
      const creationErrors = [];
      canvas.addEventListener('webglcontextcreationerror', event => creationErrors.push(event.statusMessage));
      const gl = canvas.getContext('webgl2', { antialias: false });
      if (!gl) throw new Error(`WebGL2 context unavailable: ${creationErrors.join('; ')}`);
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      gl.clearColor(.25, .5, .75, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const error = gl.getError();
      if (gl.isContextLost() || error !== 0 || Math.abs(pixel[0] - 64) > 1 || Math.abs(pixel[1] - 128) > 1 || Math.abs(pixel[2] - 191) > 1 || pixel[3] !== 255) throw new Error(`WebGL2 completion probe failed (error ${error}, pixel ${Array.from(pixel)})`);
      return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), glVersion: gl.getParameter(gl.VERSION), glError: error, contextLost: false };
    }), 8000, `${mode} WebGL2 probe`);
    await page.close();
    if (mode === 'native' && /swiftshader/i.test(info.renderer)) throw new Error('Native probe unexpectedly selected SwiftShader.');
    Object.defineProperty(browser, 'hinaRenderer', { enumerable: true, value: Object.freeze({ mode, hardwareAccelerated: !/swiftshader|llvmpipe|softpipe/i.test(info.renderer), ...info }) });
    return browser;
  } catch (error) {
    if (browser) await timeout(browser.close(), 5000, `${mode} browser cleanup`).catch(() => {});
    throw error;
  }
}

/** Native surfaceless EGL first; HINA_RENDERER=software explicitly selects the
 * verified SwiftShader fallback. All environment changes are child-local.
 * Returns a standard Playwright Browser, with diagnostic .hinaRenderer data.
 */
export async function launchReviewBrowser() {
  if (process.env.HINA_RENDERER === 'software') {
    const browser = await checkedLaunch('software');
    console.error(`[Hina review renderer] Explicit software override: ${browser.hinaRenderer.renderer}`);
    return browser;
  }
  try {
    const browser = await checkedLaunch('native');
    console.error(`[Hina review renderer] Native EGL: ${browser.hinaRenderer.renderer}`);
    return browser;
  } catch (error) {
    console.error(`[Hina review renderer] Native EGL unavailable (${String(error.message || error).slice(0, 1200)}). Trying the verified SwiftShader software fallback.`);
    const browser = await checkedLaunch('software');
    console.error(`[Hina review renderer] Software fallback: ${browser.hinaRenderer.renderer}`);
    return browser;
  }
}
