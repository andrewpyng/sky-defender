# Sky Defender

A small browser-based vertical shooter inspired by 1942 — built with plain HTML/CSS/JS and ready to host on GitHub Pages.

Play: open `index.html` in your browser or host the repo on GitHub Pages.

Features
- Responsive canvas gameplay (desktop + mobile)
- Player movement, shooting, enemies, waves, scoring, and lives
- Single-file engine in `main.js` — easy to extend

Deploy on GitHub Pages
1. Create a repo on GitHub named `sky-defender`.
2. Push your local repository.
3. In your GitHub repo settings → Pages, choose branch `main` (or `gh-pages`) and the root (or `docs/`) folder.

Local dev

You can serve the folder over a simple HTTP server for local testing:

```bash
# macOS / Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

License

This project is provided under the MIT License — see `LICENSE`.
