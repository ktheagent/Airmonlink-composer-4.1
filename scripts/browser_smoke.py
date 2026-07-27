#!/usr/bin/python3
"""Local Chromium validation without remote-debugging dependencies."""
from __future__ import annotations
import base64, html, json, os, re, shutil, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "Airmonlink-Composer-3-Preview.html"
VALIDATION = ROOT / "validation"
REPORT = VALIDATION / "browser-smoke.json"
SCREENSHOT = VALIDATION / "composer3-browser.png"
PDF = VALIDATION / "composer3-print.pdf"
CHROMIUM = os.environ.get("CHROMIUM", "/usr/bin/chromium")
COMMON = [
    CHROMIUM,
    "--headless",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-gpu-sandbox",
    "--hide-scrollbars",
    "--window-size=1600,1000",
]

HARNESS = r"""
<script>
(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const checks = [];
  const add = (name, ok, details = '') => checks.push({ name, status: ok ? 'PASS' : 'FAIL', details: String(details || '') });
  async function run() {
    try {
      for (let i = 0; i < 300 && !window.AirmonComposer3; i += 1) await sleep(20);
      add('Composer 3 mounted', Boolean(window.AirmonComposer3));
      if (!window.AirmonComposer3) throw new Error('Composer 3 did not mount.');

      const verification = window.AirmonComposer3.verify();
      add('Canonical semantic model', verification.canonicalModel, JSON.stringify(verification));
      add('Direct engine API', verification.directApi, JSON.stringify(verification));
      add('Exactly four voice layers', verification.fourVoiceLayers, JSON.stringify(verification));
      add('No legacy selectors', verification.legacySelectors === 0, JSON.stringify(verification));
      add('Six work-area tabs', verification.tabs === 6, JSON.stringify(verification));
      add('One active panel', verification.activePanels === 1, JSON.stringify(verification));
      add('Score viewport', verification.scoreViewport, JSON.stringify(verification));
      add('Commands connected', verification.allControlsConnected, JSON.stringify(verification));

      const api = window.AirmonComposer3;
      const before = api.state().score.events.length;
      await api.command('addNote');
      const after = api.state().score.events.length;
      add('Note command changes canonical score', after === before + 1, `before=${before};after=${after}`);

      const voice = document.querySelector('#voiceSelect');
      voice.value = '2';
      voice.dispatchEvent(new Event('change', { bubbles: true }));
      await api.command('addNote');
      add('Independent Voice 2 entry', api.state().score.events.some(event => Number(event.voice) === 2));

      const lyric = document.querySelector('#lyricText');
      lyric.value = 'Airmonlink';
      await api.command('applyLyric');
      add('Lyric command updates score', api.state().score.events.some(event => Array.isArray(event.lyrics) && event.lyrics.length));

      await api.command('showSolfa');
      add('Dedicated Tonic Sol-fa page', !document.querySelector('#solfaPage').hidden && document.querySelector('#solfaPages').textContent.trim().length > 0);
      await api.command('showStaff');

      await api.command('save');
      add('Save reaches desktop service', window.__desktopMock.saved.length === 1);

      await api.command('exportMusicXml');
      add('MusicXML export reaches desktop service', window.__desktopMock.exports.some(item => item.defaultName.endsWith('.musicxml')));

      await api.command('exportMidi');
      add('MIDI export reaches desktop service', window.__desktopMock.exports.some(item => item.defaultName.endsWith('.mid')));

      await api.command('exportPdf');
      add('PDF reaches desktop service', Boolean(window.__desktopMock.pdf));

      const styles = getComputedStyle(document.documentElement);
      const colours = ['--navy-950', '--royal-600', '--gold-500'].map(name => styles.getPropertyValue(name).trim());
      add('Official colour identity', colours.every(Boolean), colours.join(','));

      const failures = checks.filter(item => item.status !== 'PASS');
      const report = { status: failures.length ? 'FAIL' : 'PASS', checks, failures };
      document.documentElement.dataset.smoke = btoa(JSON.stringify(report));
    } catch (error) {
      const report = { status: 'FAIL', checks, failures: [{ name: 'Harness', status: 'FAIL', details: error.stack || error.message || String(error) }] };
      document.documentElement.dataset.smoke = btoa(JSON.stringify(report));
    }
  }
  void run();
})();
</script>
"""

def run(args: list[str], timeout: int = 90) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout)

def main() -> int:
    if not PREVIEW.exists():
        raise RuntimeError("Run npm run preview first.")
    if not Path(CHROMIUM).exists():
        raise RuntimeError(f"Chromium unavailable: {CHROMIUM}")

    VALIDATION.mkdir(parents=True, exist_ok=True)
    source = PREVIEW.read_text(encoding="utf-8")
    test_source = source.replace("</body>", HARNESS + "\n</body>")
    with tempfile.TemporaryDirectory(prefix="airmon-composer3-") as tmp:
        test_file = Path(tmp) / "browser-test.html"
        test_file.write_text(test_source, encoding="utf-8")
        dump = run(COMMON + ["--virtual-time-budget=15000", "--dump-dom", test_file.as_uri()])
        if dump.returncode != 0:
            raise RuntimeError(f"Chromium DOM validation failed ({dump.returncode}):\n{dump.stderr[-4000:]}")
        match = re.search(r'data-smoke="([^"]+)"', dump.stdout)
        if not match:
            raise RuntimeError(f"Browser harness did not produce a result.\nChromium stderr:\n{dump.stderr[-4000:]}")
        report = json.loads(base64.b64decode(html.unescape(match.group(1))).decode("utf-8"))
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    shot = run(COMMON + [
        "--virtual-time-budget=5000",
        "--run-all-compositor-stages-before-draw",
        f"--screenshot={SCREENSHOT}",
        PREVIEW.as_uri()
    ])
    if shot.returncode != 0 or not SCREENSHOT.exists() or SCREENSHOT.stat().st_size < 1000:
        raise RuntimeError(f"Chromium screenshot failed: {shot.stderr[-4000:]}")

    pdf = run(COMMON + [
        "--virtual-time-budget=5000",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={PDF}",
        "--print-to-pdf-no-header",
        PREVIEW.as_uri()
    ])
    if pdf.returncode != 0 or not PDF.exists() or not PDF.read_bytes().startswith(b"%PDF-"):
        raise RuntimeError(f"Chromium PDF generation failed: {pdf.stderr[-4000:]}")

    if report["status"] != "PASS":
        print(json.dumps(report, indent=2))
        return 1
    print(f"Browser validation passed: {len(report['checks'])}/{len(report['checks'])} checks.")
    print(f"Screenshot: {SCREENSHOT}")
    print(f"PDF: {PDF}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
