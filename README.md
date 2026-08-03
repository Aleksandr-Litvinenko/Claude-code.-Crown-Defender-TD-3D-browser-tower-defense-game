# Crown Defender TD

Browser-based 3D tower defense game built with Three.js. Defend your castle from 30 waves of monsters, level up your hero, and unlock the crown.

![Genre](https://img.shields.io/badge/genre-Tower%20Defense%20%2F%20Action-blue)
![Tech](https://img.shields.io/badge/tech-Three.js%20%2F%20WebGL-green)
![Platform](https://img.shields.io/badge/platform-Browser-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Quick Start

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node.js
npx serve -l 8000

# Option 3: Open directly
open index.html
```

Open `http://127.0.0.1:8000/index.html` in your browser.

## Gameplay

You control a hero on a 3D arena. Monsters spawn on the right and march toward your castle on the left. Kill them to earn XP, level up, and choose upgrades. Survive all 30 waves to win.

### Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | `WASD` / Arrow keys | Virtual joystick (left) |
| Attack | `;` / `Space` | Attack button (right) |
| Dash | `[` / `Q` | Dash button |
| Elemental | `]` / `E` | Element button |
| Castle Shield | `'` / `R` | Shield button |
| Pause | `Esc` / `P` | Pause button (HUD) |
| Speed x2 | - | x1/x2 button (HUD) |

### Win / Lose

- **Win**: Clear wave 30. Unlocks a cosmetic crown for future runs.
- **Lose**: Castle HP reaches 0 ("Вы проиграли") or hero gets knocked out ("Вас оглушили").

## Features

### Combat Styles

Upgrades change how the hero fights:

| Style | Behavior |
|-------|----------|
| **Bow** (default) | Ranged auto-aim arrows targeting nearest enemy |
| **Sword** | 360-degree melee AOE around the hero |
| **Magic** | Auto-aim projectile with AOE explosion on impact |
| **Chain** | Forward cone attack (medium range) with slow effect |

### Elemental Abilities

After choosing an element upgrade, the `]` button changes:

| Element | Effect |
|---------|--------|
| **Meteor** | Falls on enemy cluster, AOE damage, leaves a crater (5s) |
| **Fire** | Creates a burning zone with animated flames (5s), periodic damage |
| **Ice** | Freezes and slows enemies in an area |

### Upgrade System

On each level-up, the game pauses and offers 3 random upgrades. Pick one:

- **Weapon styles**: Sword, Bow, Magic, Chain (up to Lv.3 each)
- **Stats**: Attack Power, Attack Speed, Lifesteal, Castle Guardian (up to Lv.3-5)
- **Elements**: Meteor, Fire, Ice (up to Lv.3, locks to one element)

A **Reroll** button lets you reshuffle the 3 options (3-wave cooldown).

### Enemies

| Type | Traits |
|------|--------|
| **Minion** | Basic, balanced |
| **Runner** | Fast, low HP |
| **Brute** | Slow, high HP, high damage |
| **Shield** | Armored, reduces incoming damage by 50% |
| **Boss** | Appears on waves 10, 20, 30. Very high HP and damage |

### Progression

- XP from kills scales with wave number and enemy type
- Hero gains +10 max HP per level
- Castle Guardian upgrade heals and increases castle max HP
- High score and best wave are saved between sessions
- Crown unlocked after wave 30 persists via localStorage

## Tech Stack

| File | Purpose |
|------|---------|
| `index.html` | DOM structure, HUD overlays, screen templates |
| `styles.css` | Responsive UI, mobile controls, animations |
| `game.js` | Three.js scene, game logic, combat, waves, saves |
| `vendor/three.min.js` | Three.js r128 (local copy) |
| `server.js` | Optional co-op relay — see [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) |

No build step. No frameworks. The game itself has no dependencies beyond the
bundled Three.js; only the optional co-op relay needs `ws`.

## Co-op

Two players can share a run through a small relay server (three rooms, two
slots each). The game is playable without it — the relay is only needed for
the lobby.

```bash
npm install ws
node server.js
```

The client connects to `ws://<host>/ws`, without a port, so the relay has to
sit behind a reverse proxy. Setup, the message protocol and the usual failure
modes are in [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

## Save System

Uses `localStorage` with keys prefixed `crownDefender.`:

| Key | Value |
|-----|-------|
| `crownUnlocked` | Whether the crown has been earned |
| `crownEquipped` | Whether the crown is worn |
| `highScore` | Best score across all runs |
| `bestLevel` | Highest wave reached |
| `run` | JSON blob of current run state (wave, HP, upgrades, etc.) |

The "Reset saves" button on the start screen clears all keys.

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+
- Mobile browsers with WebGL support

Targets mobile-first (portrait), also works in landscape and desktop.

## Project Structure

```
.
├── index.html              # Entry point
├── styles.css              # All styles
├── game.js                 # All game logic (~2600 lines)
├── server.js               # Optional co-op relay (needs `ws`)
├── vendor/
│   └── three.min.js        # Three.js r128
├── docs/
│   └── MULTIPLAYER.md      # Relay setup and protocol
├── PRD_RESTART_CROWN_DEFENDER_TD.md  # Product requirements
├── README.md               # This file
├── ARCHITECTURE.md         # Technical deep-dive
├── COMPARISON.md           # Same brief, built by Codex — what differs
└── LICENSE
```

All geometry is generated in code: there are no texture files in this
repository. The [Codex build of the same brief](COMPARISON.md) went the other
way.

## License

MIT
