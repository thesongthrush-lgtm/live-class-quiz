"""Stamp every local script/style reference with a version so browsers never use stale copies.
Covers the Rapidiom pages and the Weakest Link folder. Run before each commit:  python3 tools/stamp.py
"""
import re, time, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
version = time.strftime("%Y%m%d%H%M%S")
pat_js = re.compile(r'''((?:from\s+|import\s*\(\s*)["'])((?:\.{1,2}/)+[^"'?]+\.js)(\?v=[^"']*)?(["'])''')
pat_tag = re.compile(r'''((?:src|href)=")((?:\.{1,2}/)*(?:(?:js|css)/[^"?]+\.(?:js|css)|config\.js))(\?v=[^"]*)?(")''')

files = []
for d in (root, root / "weakest-link"):
    files += list(d.glob("*.html")) + list((d / "js").glob("*.js"))
for f in files:
    s = f.read_text()
    n = pat_js.sub(lambda m: f"{m[1]}{m[2]}?v={version}{m[4]}", s)
    n = pat_tag.sub(lambda m: f"{m[1]}{m[2]}?v={version}{m[4]}", n)
    if n != s:
        f.write_text(n)
print("stamped", version)
