# SquidGame Trivia

Multi-player trivia game with host/player modes.

**URL:** `game.valkyrris.com`

## 🚀 Setup

### 1. Create Repository
1. Create new repository: `valkyrris-game`
2. Make it public (for free GitHub Pages)

### 2. Copy Files
Copy from `valkyrris-site/public/SquidGameTrivia/*` to root of new repository

### 3. Update Files
- Update `game.js` with Firebase config (if using Firebase)
- Update any hardcoded URLs

### 4. GitHub Pages Setup
1. Settings → Pages → Source: Branch (main) → / (root)
2. Custom domain: `game.valkyrris.com`
3. Add GitHub Secret: `VITE_FIREBASE_CONFIG` (if using Firebase)

### 5. DNS Setup
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
