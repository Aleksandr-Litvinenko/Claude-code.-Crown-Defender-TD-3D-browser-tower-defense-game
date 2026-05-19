# Architecture

Technical overview of Crown Defender TD for developers.

## Overview

The entire game is a single-page static site. One IIFE in `game.js` owns all state and renders via Three.js. No bundler, no transpiler, no server-side logic.

```
Browser
  └── index.html
        ├── styles.css          (UI layer)
        ├── vendor/three.min.js (rendering)
        └── game.js             (everything else)
```

## Game Loop

```
animate()
  └── requestAnimationFrame(animate)
  └── dt = clock.getDelta() * gameSpeed
  └── update(dt)
        ├── updateHeroMovement(dt)
        ├── updateCooldowns(dt)
        ├── updateProjectiles(dt)
        ├── updateEnemies(dt)
        ├── updateWaveSpawner(dt)
        ├── updateEffects(dt)
        ├── updateParticles(dt)
        ├── updateCamera(dt)
        └── updateHUD()
  └── renderer.render(scene, camera)
```

`gameSpeed` is 1 or 2 (toggled by the x2 button). It multiplies `dt` before any game logic runs, so everything speeds up uniformly.

## State Machine

```
menu ──► playing ──► paused ──► playing
   │         │                     │
   │         ├── levelup ──► playing
   │         │
   │         ├── victory ──► menu
   │         └── defeat  ──► menu
   │
   └── (continue) ──► playing
```

The `gameState` variable gates the `update()` function: only `'playing'` runs game logic. Other states show overlay screens.

## Scene Graph

```
Scene
  ├── Ground (PlaneGeometry + grass CanvasTexture)
  ├── Road (PlaneGeometry + stone CanvasTexture)
  ├── Castle (Group)
  │     ├── Base (Box)
  │     ├── 4x Towers (Cylinder + Cone roof)
  │     ├── Main roof (Cone)
  │     ├── Gate, Windows
  │     └── PointLight (warm glow)
  ├── Hero (Group)
  │     ├── Body, Head, Shoulders, Legs
  │     ├── Weapon (swapped on style change)
  │     └── Crown (optional cosmetic)
  ├── Enemies[] (Group each)
  │     ├── Body, Head, Eyes
  │     ├── HP Bar (Plane + fill Plane)
  │     └── Type-specific parts (horns, shield, etc.)
  ├── Environment
  │     ├── Trees (Cylinder trunk + Sphere leaves)
  │     ├── Rocks (Dodecahedron)
  │     └── Torches (Cylinder + Sphere flame + PointLight)
  ├── Projectiles[] (Cylinder/Sphere)
  └── Effects[] (temporary meshes, particles, zones)
```

## Lighting

| Light | Purpose |
|-------|---------|
| AmbientLight (0x303050) | Base fill, dark blue tint |
| DirectionalLight (0xffe8c0) | Main sun, casts shadows |
| DirectionalLight (0x6080c0) | Moon backlight, no shadows |
| PointLights (torches) | Animated warm glow along the road |
| PointLights (effects) | Temporary lights from fire/meteor/magic |

Shadow map: 1024x1024, PCFSoft. Only directional light casts shadows.

## Textures

All textures are procedural `CanvasTexture` generated at startup:

| Texture | Method |
|---------|--------|
| Grass | Gradient + 800 random grass strokes |
| Road | Stone base + 200 random brick rectangles |
| Castle | Brick pattern + glowing rune circles |

These can be replaced with image assets loaded via `TextureLoader` from `assets/textures/`.

## Combat System

### Attack Styles

| Style | Implementation |
|-------|---------------|
| **Sword** | `enemies.forEach` distance check (radius 3, full 360-degree), instant damage. Visual: ring + sparks |
| **Bow** | Spawns projectile toward nearest enemy (`autoAimDir`). Hits first enemy in radius 0.3 |
| **Magic** | Spawns homing projectile toward nearest enemy. On hit, damages all enemies within AOE radius 3 |
| **Chain** | `enemies.forEach` with distance + angle check (range 6, cone 60-degree). Applies slow. Visual: cone + chain links |

### Auto-Aim

`autoAimDir(fallbackDir, range)` finds the nearest enemy within `range` and returns a direction vector toward it. Falls back to the hero's facing direction if no enemies are in range.

### Elemental Abilities

| Element | Mechanic |
|---------|----------|
| **Meteor** | Animated falling rock (lerp from sky), on-hit: AOE damage + `spawnMeteorCrater()` (5s: scorched ground, rocks, smoke, embers light) |
| **Fire** | `spawnFireZone()`: 12+ animated cone flames, base glow circle, PointLight. Ticks damage every 0.5s for 5s. Flames animate scale/position/opacity |
| **Ice** | Sets `slowTimer` and `slowFactor` on enemies in radius. Visual: blue circle |

### Damage Flow

```
heroAttack() / projectile hit / elemental
  └── damageEnemy(enemy, dmg)
        ├── Apply armor reduction
        ├── Subtract HP
        ├── Apply lifesteal (if vamp > 0)
        ├── Spawn damage number (sprite)
        └── if hp <= 0: killEnemy()
              ├── Remove from scene + array
              ├── Award XP + score
              ├── Spawn death particles
              └── checkLevelUp()
                    └── if xp >= xpToNext: showLevelUp()
```

### Enemy AI

Simple: walk in a straight line toward `(CASTLE_X + 4, 0, 0)`. When within distance 3, stop and attack the castle every 1.5s. Contact with hero also damages hero (50% of enemy damage).

## Upgrade System

```javascript
UPGRADES = {
  // type: 'style' — changes attackStyle, swaps hero weapon model
  // type: 'stat'  — modifies numeric multipliers
  // type: 'elem'  — sets active element, changes ability button
}
```

`getRandomUpgrades(3)` filters the pool:
- Exclude maxed upgrades
- If an element is already chosen, only show that element (for leveling it up)
- Shuffle and take 3

`applyUpgrade(key)` increments `upgradeState.chosen[key]` and applies the effect.

## Wave System

```
Wave N generates: 3 + floor(N * 1.5) enemies
  - Types weighted by wave number
  - Boss forced on waves 10, 20, 30
  - HP scales: 1 + (N-1) * 0.12
  - Damage scales: 1 + (N-1) * 0.08
  - XP scales: 1 + (N-1) * 0.05
```

Enemies spawn one at a time with 0.8-1.2s delay. After all enemies are dead, 2s pause, then next wave starts.

## Effects System

`effects[]` array holds temporary visual objects. Each effect has:

```javascript
{
  mesh: THREE.Object3D | null,  // scene object (removed on expire)
  timer: Number,                // seconds until removal
  fadeOut: Boolean,             // auto-fade material opacity
  rise: Boolean,               // float upward (damage numbers)
  physics: Boolean,            // apply velocity + gravity
  custom: Function,            // per-frame callback (fire, meteor, crater)
}
```

`updateEffects(dt)` decrements timers, runs custom callbacks, removes expired effects from scene.

## Camera

Isometric MOBA-style. Follows hero with smoothing:

```javascript
camera.position.x += (targetX - camera.position.x) * 3 * dt;
camera.position.z += (targetZ - camera.position.z) * 3 * dt;
camera.position.y = 35; // fixed height
camera.lookAt(camX, 0, camZ - offset);
```

Clamped to arena bounds to avoid showing void.

## Save/Load

`localStorage` with JSON serialization. Auto-saves after each wave. The `run` key stores a snapshot:

```javascript
{
  wave, castleHp, heroHp, heroLevel, xp, score,
  upgrades: { sword: 2, atkPow: 1, ... },
  attackStyle, element, rerollCd, guardianLvl
}
```

On continue, all state is reconstructed from this snapshot.

## Performance Notes

- Pixel ratio capped at 2 (`Math.min(devicePixelRatio, 2)`)
- Shadow map 1024x1024 (single directional light)
- Low-poly geometry throughout (6-8 segments)
- Fog hides distant objects (`FogExp2`, density 0.012)
- No post-processing
- Procedural textures generated once at startup
- Effect meshes cleaned up on timer expiry

Target: 60fps on mid-range mobile devices.

## Extending

### Adding a new enemy type

1. Add entry to `ENEMY_TYPES` with hp/speed/damage/xp/color/radius/scale
2. Add model-building logic in `spawnEnemy()` (inside the if/else chain)
3. Optionally add to `pickEnemyType()` with wave threshold

### Adding a new upgrade

1. Add entry to `UPGRADES` with name/icon/desc/type/maxLvl
2. Add application logic in `applyUpgrade()` switch
3. If it's a new type, add filtering logic in `getRandomUpgrades()`

### Replacing procedural textures

1. Place image files in `assets/textures/`
2. Load with `new THREE.TextureLoader().load('assets/textures/grass.png')`
3. Replace the `grassTexture()` / `roadTexture()` / `castleTexture()` calls in `buildArena()` / `buildCastle()`
