# Local fonts

The original Adobe Source Sans 3 and Source Serif 4 binaries and OFL licenses
remain unchanged. Latin characters first use the smaller **Laundered Sans Latin**
and **Laundered Serif Latin** subsets; other characters use the original fonts.
The Sans subset retains the 200–900 weight axis. Serif uses the identity role's
400 weight and retains optical sizing. Glyph advances and layout features remain.
They have distinct internal family names as required for OFL derivatives.

Generate from the repository root with the optional isolated build tools:

```sh
uv run --no-project --with fonttools==4.60.1 --with brotli python apps/web/scripts/font-subsets.py
uv run --no-project --with fonttools==4.60.1 --with brotli python apps/web/scripts/font-subsets.py --check
```

The check verifies character coverage, axes, advances, copyright and family names.
These tools are not runtime or application dependencies. Original attribution:
Adobe, Copyright 2010–2024 (Sans) and 2014–2023 (Serif). The accompanying original
OFL licenses also apply to the subsets. Outlines, sizing, weights and typography
roles are unchanged; all six files are included in the completed offline install.
Use the full Serif family for any future role that needs a different weight.
