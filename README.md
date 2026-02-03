# SquidGame Trivia

Multi-player trivia game with host/player modes.

**URL:** `game.valkyrris.com`

## 🚀 Setup

### 1. GitHub Pages Setup
1. Settings → Pages → Source: Branch (main) → / (root)
2. Custom domain: `game.valkyrris.com`
3. Add GitHub Secret: `VITE_FIREBASE_CONFIG` (if using Firebase)

### 2. DNS Setup
Add CNAME record:
```
Type: CNAME
Name: game
Value: mishkapisarev.github.io
```

## 📁 Structure
```
valkyrris-game/
├── index.html
├── host.html
├── player.html
├── game.js
├── host.js
├── player.js
├── style.css
├── questions_*.csv
└── schema.sql
```
