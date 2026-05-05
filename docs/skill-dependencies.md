# Skill Dependencies

This repo installs skill instructions/scripts. It does not install all runtime deps those scripts may call.

Scope: script-backed skills under `~/.codex/skills/*/scripts`. Skills without scripts are not listed here.

Not everything is Python:

- Python packages: installed with `uv pip install ...`
- Node packages: installed with `npm install -g ...` or run with `npx ...`
- System binaries: installed by OS/Nix/Homebrew/apt/etc.
- API keys/CLIs: required only for API-backed workflows

## Minimal Groups

### Office Scripts

Covers `office-tools:pptx`, `office-tools:pdf`, `office-tools:docx`, `office-tools:xlsx`.

```bash
uv pip install Pillow defusedxml lxml openpyxl pypdf pdf2image pdfplumber
```

Optional but useful for office workflows:

```bash
uv pip install "markitdown[pptx]" python-pptx python-docx
npm install -g pptxgenjs docx
```

System binaries:

```bash
libreoffice  # soffice; Office -> PDF/doc conversion and XLSX recalculation
poppler      # pdftoppm, pdftotext; PDF -> images/text
pandoc       # DOCX/DOC text extraction where requested
```

### Data Analysis Scripts

Covers `data-analysis:exploratory-data-analysis`, `data-analysis:markitdown`, `data-analysis:statistical-analysis`.

```bash
uv pip install numpy pandas scipy matplotlib seaborn h5py biopython markitdown requests python-dotenv openai
```

### Research / Writing / Reasoning Scripts

Covers citation, literature review, research lookup, scientific writing, peer review, venue templates, hypothesis generation, and critical thinking scripts.

```bash
uv pip install requests python-dotenv openai scholarly
```

Optional external CLI/API tools used by some research docs:

```bash
parallel-cli  # research lookup / literature review search helper
pandoc        # document/PDF generation helpers
tectonic      # LaTeX/PDF generation when requested
```

Likely env vars for API-backed workflows:

```bash
OPENAI_API_KEY=...
PARALLEL_API_KEY=...
OPENROUTER_API_KEY=...
PERPLEXITY_API_KEY=...
GEMINI_API_KEY=...
```

### Scientific Visualization Scripts

Covers `scientific-visualization:matplotlib`, `scientific-visualization:scientific-visualization`, `scientific-visualization:scientific-schematics`, `scientific-visualization:infographics`.

```bash
uv pip install numpy scipy matplotlib PyPDF2 requests python-dotenv
```

API-backed image generation/review scripts may also need:

```bash
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

### Deep Learning Scripts

Covers `deep-learning:pytorch-lightning`.

```bash
uv pip install torch lightning
```

Optional transformer workflows:

```bash
uv pip install transformers accelerate datasets
```

### MCP Builder Scripts

Covers `mcp-builder`.

```bash
uv pip install "anthropic>=0.39.0" "mcp>=1.1.0"
npx @modelcontextprotocol/inspector
```

### Skill Creator Scripts

Covers `skill-creator`.

```bash
uv pip install PyYAML
```

## Per-Skill Script Dependencies

| Skill | Python packages detected from scripts |
| --- | --- |
| `data-analysis:exploratory-data-analysis` | `Pillow`, `biopython`, `h5py`, `numpy`, `pandas` |
| `data-analysis:markitdown` | `markitdown`, `openai`, `python-dotenv`, `requests` |
| `data-analysis:statistical-analysis` | `matplotlib`, `numpy`, `pandas`, `scipy`, `seaborn` |
| `deep-learning:pytorch-lightning` | `lightning`, `torch` |
| `mcp-builder` | `anthropic`, `mcp` |
| `office-tools:docx` | `defusedxml`, `lxml` |
| `office-tools:pdf` | `Pillow`, `pdf2image`, `pdfplumber`, `pypdf` |
| `office-tools:pptx` | `Pillow`, `defusedxml`, `lxml` |
| `office-tools:xlsx` | `defusedxml`, `lxml`, `openpyxl` |
| `research-workflow:citation-management` | `python-dotenv`, `requests`, `scholarly` |
| `research-workflow:literature-review` | `python-dotenv`, `requests` |
| `research-workflow:research-lookup` | `openai`, `python-dotenv`, `requests` |
| `scientific-reasoning:hypothesis-generation` | `python-dotenv`, `requests` |
| `scientific-reasoning:scientific-critical-thinking` | `python-dotenv`, `requests` |
| `scientific-visualization:infographics` | `python-dotenv`, `requests` |
| `scientific-visualization:matplotlib` | `matplotlib`, `numpy`, `scipy` |
| `scientific-visualization:scientific-schematics` | `python-dotenv`, `requests` |
| `scientific-visualization:scientific-visualization` | `PyPDF2`, `matplotlib`, `numpy` |
| `scientific-writing:peer-review` | `python-dotenv`, `requests` |
| `scientific-writing:scientific-writing` | `python-dotenv`, `requests` |
| `scientific-writing:venue-templates` | `python-dotenv`, `requests` |
| `skill-creator` | `PyYAML` |

## One-Shot Script Dependency Install

Installs Python deps detected from all script-backed skills, including optional heavy deep-learning and MCP deps.

```bash
uv pip install Pillow PyPDF2 PyYAML biopython defusedxml h5py lightning lxml markitdown matplotlib numpy openai openpyxl pandas pdf2image pdfplumber pypdf python-dotenv requests scholarly scipy seaborn torch anthropic mcp
```

Office/system extras:

```bash
npm install -g pptxgenjs docx
# install system packages separately: libreoffice poppler pandoc tectonic
```

If you do not need deep learning, omit:

```bash
torch lightning
```

If you do not need MCP builder, omit:

```bash
anthropic mcp
```

## Local Check Command

```bash
python - <<'PY'
mods = [
    'PIL', 'PyPDF2', 'yaml', 'Bio', 'defusedxml', 'h5py', 'lightning',
    'lxml', 'markitdown', 'matplotlib', 'numpy', 'openai', 'openpyxl',
    'pandas', 'pdf2image', 'pdfplumber', 'pypdf', 'dotenv', 'requests',
    'scholarly', 'scipy', 'seaborn', 'torch', 'anthropic', 'mcp',
]
for mod in mods:
    try:
        __import__(mod)
        print('OK  ', mod)
    except Exception as exc:
        print('MISS', mod, type(exc).__name__)

import shutil
print('\nBinaries:')
for binary in ['libreoffice', 'soffice', 'pdftoppm', 'pdftotext', 'pandoc', 'tectonic', 'node', 'npm', 'npx']:
    print(('OK   ' if shutil.which(binary) else 'MISS '), binary, shutil.which(binary) or '')
PY
```
