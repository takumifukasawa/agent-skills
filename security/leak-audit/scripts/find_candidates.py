#!/usr/bin/env python3
"""List CANDIDATES for private information in a git repo, for a person to judge: names no pattern knows about,
identifiers, business numbers and schedules.

scan.py only finds fixed patterns and the private terms you already listed. This finds what you did not think of:
words that look like names (product, company, game, person, place, asset), reverse-DNS app ids, ticket keys,
numbers next to business-metric words (CPI, retention, 売上 ...), and dates next to release / deadline words.
Confirmed private names go into the terms file and scan.py then checks every layer for them.

    uv run --with janome --with wordfreq python find_candidates.py [--history] [--known FILE] [--top N]

Run inside the repo. Works on macOS, Linux and Windows (janome and wordfreq are pure-Python pip packages;
uv fetches them into a throwaway environment).

Sources: tracked + untracked text files (minus gitignored), file names, ref names; with --history also every
added line in every commit, every file name ever added, and every commit message.

Japanese: morphological analysis (janome, IPADIC). Keeps 名詞-固有名詞 (人名 / 組織 / 地域 / 一般) and
dictionary-unknown nouns (coined product names usually are), plus katakana runs of 3+ characters.
Also 株式会社X / X株式会社 style company names. Without janome it falls back to katakana runs only and says so.
Latin script: words that are not common English (wordfreq zipf frequency below --common, default 3.5; falls back
to /usr/share/dict/words, then to nothing) and are Capitalized, CamelCase, or kebab/snake slugs with an uncommon
part (repo slugs). Asset file names (models, images, audio, scenes ...) are always listed: an asset name from a
past project is a typical leak even when its words are ordinary (e.g. a model named after a client's character).

Identifiers: reverse-DNS ids (com.example.game: bundle / package ids name the company and the product) and
ticket keys (PROJ-123: name the tracker project). Business numbers ("metric"): a number with %, a currency or a
decimal within a few characters of a KPI word -- a "generic" repo should not carry a product's CPI or retention.
Schedules: a date near release / launch / deadline words (unannounced plans).

--known FILE  terms already reviewed and judged fine to publish, one per line (case-insensitive). They are
              hidden, so each run shows only new candidates. Defaults to .public-check.known when it exists.
              Keep it gitignored: it is review state, not repo content.

Output: count, kind, term, first location. It is a candidate list, not a verdict: most hits are ordinary
technical words. Exit 0 always.
"""
import argparse
import collections
import os
import re
import subprocess
import sys

ASSET = re.compile(r"([A-Za-z0-9][A-Za-z0-9._-]*)\.(glb|gltf|fbx|obj|blend|usdz?|png|jpe?g|webp|gif|psd|tga|exr|hdr|"
                   r"ktx2|wav|mp3|ogg|m4a|mp4|mov|webm|prefab|unity|asset|mat|anim|controller|ttf|otf|atlas|spine)\b", re.I)
# Company names: the name part is a run without hiragana (particles end it) -- "株式会社サンプル商事の" -> サンプル商事.
_NAME = r"[ァ-ヴーA-Za-z0-9Ａ-Ｚａ-ｚ０-９一-龥々&＆・]{1,20}"
JA_ORG = re.compile(r"(?:株式会社|有限会社|合同会社|\(株\)|（株）)\s*" + _NAME + "|" + _NAME + r"(?:株式会社|有限会社|合同会社)")
RDNS = re.compile(r"\b(?:com|jp|net|org|io|dev|co|app|me)\.[a-z0-9_-]+\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\b", re.I)
TICKET = re.compile(r"\b([A-Z][A-Z0-9]{1,9})-([1-9][0-9]{0,5})\b")
TICKET_NOT = {"UTF", "SHA", "ISO", "RFC", "CVE", "MD", "AES", "RSA", "PEP", "ES", "ECMA", "WCAG", "IEC", "CP", "UTC",
              "GMT", "TLS", "SSL", "HTTP", "IPV", "MP", "MPEG", "PS", "COVID", "F", "A", "B", "C", "X", "H", "S", "V"}
KPI = re.compile(r"(?<![A-Za-z])(CPI|CPA|CPM|CPC|CTR|CVR|IPM|eCPM|ROAS|ROI|LTV|ARPU|ARPPU|ARPDAU|DAU|MAU|WAU|"
                 r"D1|D7|D30|retention|revenue|budget|conversion|継続率|リテンション|売上|収益|利益|予算|単価|課金率|"
                 r"インストール数|DL数|ダウンロード数|CV率|広告費)(?![A-Za-z])", re.I)
KPI_NUM = re.compile(r"[$¥￥]\s?\d[\d,.]*|\d[\d,.]*\s?(?:%|％|円|ドル|万|億|USD|JPY|k\b|M\b)|\d+\.\d+")
PLAN = re.compile(r"リリース|ローンチ|公開予定|発表|締め?切り?|納期|launch|release date|ship(?:ping)? date|deadline|due", re.I)
DATE = re.compile(r"\b20\d\d[-/.年]\s?\d{1,2}(?:[-/.月]\s?\d{1,2})?|\d{1,2}月\d{1,2}日|\bQ[1-4]\s?20\d\d|"
                  r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{1,2}\b")
PROSE_EXT = {".md", ".mdx", ".txt", ".rst", ".adoc", ".org", ""}
KATAKANA = re.compile(r"[ァ-ヴー]{3,}")
JA_CHUNK = re.compile(r"[ぁ-んァ-ヴー一-龥々〆ヵヶ]+[A-Za-z0-9ァ-ヴー一-龥]*")
WORD = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*")
CAMEL = re.compile(r"^[A-Z]?[a-z]+(?:[A-Z][a-z0-9]+)+$|^[A-Z][a-z]+[A-Z][A-Za-z0-9]*$")
# Common tech vocabulary the system word list lacks. Extend per repo with --known, not here.
TECH = set("""
github gitlab git json yaml toml html css js ts jsx tsx api apis url urls uri cli gui ui ux sdk ide npm npx pnpm
yarn pip uv venv macos ios android linux windows wsl unix posix bash zsh sh powershell ssh https http dns tcp udp
utf ascii regex readme changelog todo fixme config configs repo repos webgl webgpu glsl hlsl shader shaders png
jpg jpeg webp svg gif mp4 mp3 wav ogg pdf csv tsv md mdx claude anthropic openai chatgpt gpt llm llms mcp oauth
jwt sql sqlite postgres mysql redis docker kubernetes k8s aws gcp azure vercel netlify cloudflare node nodejs deno
bun vite webpack rollup esbuild babel eslint prettier typescript javascript python ruby rust golang java kotlin
swift csharp cpp unity unreal godot threejs three pixi pixijs phaser react vue svelte angular nextjs nuxt tailwind
chromium chrome firefox safari playwright puppeteer selenium jest vitest pytest ffmpeg imagemagick exiftool
homebrew brew xcode gradle cmake makefile dockerfile localhost stdin stdout stderr async await enum struct
args kwargs init src lib dist tmp env dotenv cdn cors csp xss csrf ci cd gha png2 webm hevc aac opus utc iso
""".split())


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True, errors="replace")
    return r.stdout


def make_common(threshold, words_path):
    """Return is_common(word) -> bool."""
    try:
        from wordfreq import zipf_frequency
        return (lambda w: w in TECH or zipf_frequency(w, "en") >= threshold), None
    except ImportError:
        pass
    words = load_words(words_path)
    if words:
        return (lambda w: w in TECH or w in words), f"wordfreq not available: using {words_path} (noisier)"
    return (lambda w: w in TECH), "no wordfreq and no word list: Latin-script candidates will be very noisy"


def make_common_ja(threshold=2.5):
    """Common Japanese words (wordfreq's list, looked up directly: its tokenizer would need MeCab)."""
    try:
        import math
        from wordfreq import get_frequency_dict
        d = get_frequency_dict("ja")
        return lambda w: d.get(w, 0) and math.log10(d[w]) + 9 >= threshold
    except Exception:
        return lambda w: False


def load_words(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            return {w.strip().lower() for w in f if w.strip()}
    except OSError:
        return set()


def sources(history):
    """Yield (location, text)."""
    files = git("ls-files", "--cached", "--others", "--exclude-standard").splitlines()
    for path in files:
        yield "FILENAME", path
        try:
            with open(path, "rb") as f:
                data = f.read(2_000_000)
        except OSError:
            continue
        if b"\0" in data[:8000]:
            continue  # binary
        for i, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
            yield f"{path}:{i}", line
    for ref in git("for-each-ref", "--format=%(refname)").splitlines():
        yield "REF", ref
    if not history:
        return
    commit, path = "", ""
    for line in git("log", "--all", "-p", "-U0", "--no-color", "--no-ext-diff", "--format=commit %H").splitlines():
        if line.startswith("commit ") and len(line) == 47:
            commit = line[7:17]
        elif line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else ""
        elif line.startswith("+") and path:
            yield f"{commit}:{path}", line[1:]
    for path in git("log", "--all", "--name-only", "--format=", "--diff-filter=A").splitlines():
        if path:
            yield "FILENAME(history)", path
    for block in git("log", "--all", "--format=%h%x09%B%x1e").split("\x1e"):
        block = block.strip("\n")
        if not block:
            continue
        sha, _, body = block.partition("\t")
        for line in body.splitlines():
            if line.strip():
                yield f"{sha}:COMMIT_MSG", line


def make_ja_tokenizer():
    try:
        from janome.tokenizer import Tokenizer
    except ImportError:
        return None
    t = Tokenizer()

    def tokens(text):
        for tok in t.tokenize(text):
            pos = tok.part_of_speech.split(",")
            if pos[0] != "名詞" or len(tok.surface) < 2:
                continue
            if pos[1] == "固有名詞":
                yield tok.surface, "ja-proper-" + {"人名": "person", "組織": "org", "地域": "place"}.get(pos[2], "noun")
            elif getattr(tok, "node_type", "") == "UNKNOWN" and not tok.surface.isascii():
                yield tok.surface, "ja-unknown"

    return tokens


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--history", action="store_true", help="also scan every commit, file name and commit message")
    ap.add_argument("--known", help="reviewed public terms to hide (default .public-check.known if present)")
    ap.add_argument("--common", type=float, default=3.5, help="wordfreq zipf threshold for 'common English word'")
    ap.add_argument("--words", default="/usr/share/dict/words", help="word list used when wordfreq is missing")
    ap.add_argument("--min", type=int, default=1, help="hide candidates seen fewer times than this")
    ap.add_argument("--top", type=int, default=300, help="print at most this many candidates")
    a = ap.parse_args()

    root = git("rev-parse", "--show-toplevel").strip()
    if not root:
        sys.exit("not inside a git repo")
    os.chdir(root)
    known_path = a.known or (".public-check.known" if os.path.exists(".public-check.known") else None)
    known = load_words(known_path) if known_path else set()
    common, note = make_common(a.common, a.words)
    common_ja = make_common_ja()
    if note:
        print(f"[note] {note}. Run with: uv run --with janome --with wordfreq python find_candidates.py", file=sys.stderr)
    ja = make_ja_tokenizer()
    if ja is None:
        print("[note] janome not available: Japanese uses katakana runs only. "
              "Run with: uv run --with janome --with wordfreq python find_candidates.py", file=sys.stderr)

    count = collections.Counter()
    kind = {}
    first = {}
    skip = {".public-check.local", ".public-check.known", "find_candidates.py", "scan.py"}
    if a.known:
        skip.add(os.path.basename(a.known))

    def add(term, k, loc):
        key = term.lower()
        if key in known:
            return
        count[key] += 1
        kind.setdefault(key, k)
        first.setdefault(key, (term, loc))

    for loc, text in sources(a.history):
        head = loc.split(":")
        fname = head[1] if len(head) > 1 and re.fullmatch(r"[0-9a-f]{10}", head[0]) else head[0]
        if os.path.basename(fname) in skip or (loc.startswith("FILENAME") and os.path.basename(text) in skip):
            continue
        prose = (loc.startswith(("FILENAME", "REF")) or loc.endswith("COMMIT_MSG")
                 or os.path.splitext(fname)[1].lower() in PROSE_EXT)
        for m in ASSET.finditer(text):
            add(m.group(0).split("/")[-1], "asset", loc)
        for m in JA_ORG.finditer(text):
            add(m.group(0), "ja-org", loc)
        for m in RDNS.finditer(text):
            add(m.group(0), "app-id", loc)
        for m in TICKET.finditer(text):
            if m.group(1) not in TICKET_NOT:
                add(m.group(0), "ticket-key", loc)
        for m in KPI.finditer(text):  # one candidate per line, however many KPI words it has
            if KPI_NUM.search(text[max(0, m.start() - 20): m.end() + 30]):
                add(text.strip()[:70], "metric", loc)
                break
        if PLAN.search(text) and DATE.search(text):
            add(text.strip()[:70], "schedule", loc)
        if ja and not text.isascii():
            for chunk in JA_CHUNK.findall(text):
                for term, k in ja(chunk):
                    # tagged proper nouns stay even when frequent (company names are); unknown words that are
                    # just common loanwords (リポジトリ, アセット) go.
                    if k.startswith("ja-proper") or not common_ja(term):
                        add(term, k, loc)
        elif not text.isascii():
            for term in KATAKANA.findall(text):
                if not common_ja(term):
                    add(term, "ja-katakana", loc)
        for w in WORD.findall(text):
            if len(w) < 3:
                continue
            parts = [p for p in re.split(r"[-_]", w) if p]
            if len(parts) > 1:
                # slugs: interesting when a part is unknown (repo / asset / project slugs)
                unknown = [p for p in parts if not common(p.lower()) and not p.isdigit() and len(p) >= 2]
                # In prose, refs and file names every slug is listed: abbreviations ("xx-") look like common
                # words to a frequency list, and project slugs leak mostly there. In code, only uncommon ones.
                if (unknown or prose) and not w.isupper():
                    add(w, "slug", loc)
                continue
            lw = w.lower()
            if common(lw) or w.isupper() or w.isdigit():
                continue
            if CAMEL.match(w):
                sub = [s.lower() for s in re.findall(r"[A-Z]?[a-z0-9]+", w)]
                if any(not common(s) and len(s) >= 3 for s in sub):
                    add(w, "camel", loc)
            elif w[0].isupper():
                add(w, "capitalized", loc)

    rows = [(c, kind[k], first[k][0], first[k][1]) for k, c in count.items() if c >= a.min]
    rows.sort(key=lambda r: (-r[0], r[2].lower()))
    print(f"# {len(rows)} candidates ({'tree+history' if a.history else 'tree'}); known hidden: {len(known)}")
    print("# count\tkind\tterm\tfirst seen")
    for c, k, term, loc in rows[: a.top]:
        print(f"{c}\t{k}\t{term}\t{loc[:120]}")
    if len(rows) > a.top:
        print(f"# ... {len(rows) - a.top} more (raise --top, or add reviewed terms to the known file)")


if __name__ == "__main__":
    main()
