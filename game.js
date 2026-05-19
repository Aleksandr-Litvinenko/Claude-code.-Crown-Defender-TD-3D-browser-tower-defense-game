(function () {
    'use strict';

    // ─── CONFIG ───
    const CFG = {
        ARENA_W: 80, ARENA_H: 50,
        ROAD_Y: 0, ROAD_W: 6,
        CASTLE_X: -32, SPAWN_X: 38,
        CAM_HEIGHT: 35, CAM_DIST: 28, CAM_ANGLE: Math.PI / 5,
        HERO_SPEED: 12, HERO_HP: 100, HERO_RADIUS: 0.6,
        ARROW_SPEED: 30, ARROW_RANGE: 18,
        DASH_DIST: 8, DASH_CD: 3,
        ELEM_CD: 8, SHIELD_CD: 12, SHIELD_DUR: 4,
        CASTLE_HP: 200,
        MAX_WAVE: 30,
        BOSS_WAVES: [10, 20, 30],
        REROLL_CD_WAVES: 3,
        XP_BASE: 10, XP_GROWTH: 1.3,
        LEVEL_XP_BASE: 30, LEVEL_XP_MULT: 1.4,
    };

    // ─── STATE ───
    let scene, camera, renderer, clock;
    let hero, castle, ground, road;
    let gameState = 'menu'; // menu, playing, paused, levelup, victory, defeat
    let heroData, castleData, waveData, upgradeState, saveData;
    let enemies = [], projectiles = [], particles = [], effects = [];
    let keys = {}, joystickDir = { x: 0, y: 0 }, joystickActive = false;
    let isMobile = false;
    let animFrame;
    let ambientLight, dirLight, pointLights = [];
    let gameSpeed = 1;

    // ─── DOM ───
    const $ = id => document.getElementById(id);
    const canvas = $('game-canvas');
    const hudEl = $('hud');
    const mobileCtrl = $('mobile-controls');

    // ─── INIT ───
    function init() {
        detectMobile();
        initThree();
        buildArena();
        buildCastle();
        buildHero();
        initLights();
        initListeners();
        loadSave();
        showScreen('start-screen');
        animate();
    }

    function detectMobile() {
        isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    // ─── THREE.JS SETUP ───
    function initThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0c0c18);
        scene.fog = new THREE.FogExp2(0x0c0c18, 0.012);

        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 200);
        camera.position.set(0, CFG.CAM_HEIGHT, CFG.CAM_DIST);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9;

        clock = new THREE.Clock();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    function initLights() {
        ambientLight = new THREE.AmbientLight(0x303050, 0.6);
        scene.add(ambientLight);

        dirLight = new THREE.DirectionalLight(0xffe8c0, 0.8);
        dirLight.position.set(-20, 30, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 80;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 35;
        dirLight.shadow.camera.bottom = -35;
        scene.add(dirLight);

        const moonLight = new THREE.DirectionalLight(0x6080c0, 0.3);
        moonLight.position.set(15, 25, -20);
        scene.add(moonLight);
    }

    // ─── TEXTURE HELPERS ───
    function makeCanvasTex(w, h, drawFn) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        drawFn(ctx, w, h);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function grassTexture() {
        return makeCanvasTex(256, 256, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#1a3a1a');
            grad.addColorStop(0.5, '#1e4420');
            grad.addColorStop(1, '#163016');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 800; i++) {
                ctx.strokeStyle = `rgba(${30 + Math.random() * 40}, ${60 + Math.random() * 50}, ${20 + Math.random() * 30}, ${0.3 + Math.random() * 0.3})`;
                ctx.lineWidth = 0.5 + Math.random();
                const x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 5); ctx.stroke();
            }
        });
    }

    function roadTexture() {
        return makeCanvasTex(128, 256, (ctx, w, h) => {
            ctx.fillStyle = '#4a4540';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 200; i++) {
                const rx = Math.random() * w, ry = Math.random() * h;
                const rw = 5 + Math.random() * 15, rh = 4 + Math.random() * 10;
                ctx.fillStyle = `rgba(${60 + Math.random() * 40}, ${55 + Math.random() * 35}, ${50 + Math.random() * 30}, 0.6)`;
                ctx.fillRect(rx, ry, rw, rh);
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.strokeRect(rx, ry, rw, rh);
            }
        });
    }

    function castleTexture() {
        return makeCanvasTex(128, 128, (ctx, w, h) => {
            ctx.fillStyle = '#3a3540';
            ctx.fillRect(0, 0, w, h);
            for (let y = 0; y < h; y += 8) {
                for (let x = 0; x < w; x += 16) {
                    const ox = (y % 16 === 0) ? 0 : 8;
                    ctx.fillStyle = `rgb(${50 + Math.random() * 20}, ${45 + Math.random() * 20}, ${55 + Math.random() * 20})`;
                    ctx.fillRect(x + ox, y, 15, 7);
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.strokeRect(x + ox, y, 15, 7);
                }
            }
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#60a0ff';
            ctx.strokeStyle = '#4080c0';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const rx = Math.random() * w, ry = Math.random() * h;
                ctx.beginPath();
                ctx.arc(rx, ry, 3 + Math.random() * 5, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        });
    }

    // ─── BUILD ARENA ───
    function buildArena() {
        const gTex = grassTexture();
        gTex.repeat.set(8, 5);
        ground = new THREE.Mesh(
            new THREE.PlaneGeometry(CFG.ARENA_W, CFG.ARENA_H),
            new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.9, metalness: 0 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const rTex = roadTexture();
        rTex.repeat.set(10, 1);
        road = new THREE.Mesh(
            new THREE.PlaneGeometry(CFG.ARENA_W, CFG.ROAD_W),
            new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.85, metalness: 0.05 })
        );
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.02;
        road.receiveShadow = true;
        scene.add(road);

        addEnvironment();
    }

    function addEnvironment() {
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a20, roughness: 0.8 });
        const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x0f3015, roughness: 0.8 });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x454050, roughness: 0.85, metalness: 0.05 });

        for (let i = 0; i < 25; i++) {
            const x = -35 + Math.random() * 70;
            const z = (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 18);
            if (Math.abs(z) < 5) continue;

            const trunkH = 2 + Math.random() * 3;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, trunkH, 6), treeMat);
            trunk.position.set(x, trunkH / 2, z);
            trunk.castShadow = true;
            scene.add(trunk);

            const leafR = 1.2 + Math.random() * 1.5;
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(leafR, 6, 5),
                Math.random() > 0.5 ? leafMat : darkLeafMat
            );
            leaf.position.set(x, trunkH + leafR * 0.5, z);
            leaf.scale.y = 0.7 + Math.random() * 0.3;
            leaf.castShadow = true;
            scene.add(leaf);
        }

        for (let i = 0; i < 15; i++) {
            const x = -30 + Math.random() * 60;
            const z = (Math.random() < 0.5 ? 1 : -1) * (4 + Math.random() * 20);
            const s = 0.5 + Math.random() * 1.5;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
            rock.position.set(x, s * 0.4, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            scene.add(rock);
        }

        const torchPositions = [
            [-28, 0, -5], [-28, 0, 5], [-18, 0, -4], [-18, 0, 4],
            [0, 0, -5], [0, 0, 5], [18, 0, -4], [18, 0, 4], [30, 0, -5], [30, 0, 5]
        ];
        torchPositions.forEach(([tx, , tz]) => {
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.1, 2, 5),
                new THREE.MeshStandardMaterial({ color: 0x3a2a1a })
            );
            pole.position.set(tx, 1, tz);
            scene.add(pole);

            const glow = new THREE.PointLight(0xff8830, 0.8, 12);
            glow.position.set(tx, 2.3, tz);
            scene.add(glow);
            pointLights.push(glow);

            const flame = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xff6620 })
            );
            flame.position.set(tx, 2.1, tz);
            scene.add(flame);
            particles.push({ mesh: flame, type: 'torch', time: Math.random() * 10 });
        });
    }

    // ─── CASTLE ───
    function buildCastle() {
        castle = new THREE.Group();
        const cTex = castleTexture();
        const mat = new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.8, metalness: 0.1 });

        const base = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), mat);
        base.position.y = 2.5;
        base.castShadow = true;
        castle.add(base);

        const towerGeo = new THREE.CylinderGeometry(1.2, 1.4, 8, 8);
        [[-2.5, 4, -3.5], [-2.5, 4, 3.5], [2.5, 4, -3.5], [2.5, 4, 3.5]].forEach(p => {
            const t = new THREE.Mesh(towerGeo, mat);
            t.position.set(...p);
            t.castShadow = true;
            castle.add(t);

            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(1.6, 2.5, 8),
                new THREE.MeshStandardMaterial({ color: 0x4a2020, roughness: 0.7 })
            );
            roof.position.set(p[0], p[1] + 5.2, p[2]);
            roof.castShadow = true;
            castle.add(roof);
        });

        const mainRoof = new THREE.Mesh(
            new THREE.ConeGeometry(2, 3, 6),
            new THREE.MeshStandardMaterial({ color: 0x5a2828, roughness: 0.7 })
        );
        mainRoof.position.y = 6.5;
        castle.add(mainRoof);

        const gateMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
        const gate = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.3), gateMat);
        gate.position.set(3.1, 1.5, 0);
        castle.add(gate);

        const windowMat = new THREE.MeshBasicMaterial({ color: 0xffcc60 });
        [[0, 3.5, -4.05], [0, 3.5, 4.05], [-1, 4, -4.05], [1, 4, -4.05]].forEach(p => {
            const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), windowMat);
            w.position.set(...p);
            if (Math.abs(p[2]) > 4) w.rotation.y = p[2] > 0 ? Math.PI : 0;
            castle.add(w);
        });

        const castleGlow = new THREE.PointLight(0xffaa40, 0.6, 15);
        castleGlow.position.set(0, 6, 0);
        castle.add(castleGlow);

        castle.position.set(CFG.CASTLE_X, 0, 0);
        scene.add(castle);
    }

    // ─── HERO ───
    function buildHero() {
        hero = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3050a0, roughness: 0.6, metalness: 0.2 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.7 });
        const armorMat = new THREE.MeshStandardMaterial({ color: 0x607090, roughness: 0.4, metalness: 0.5 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 1.2, 8), bodyMat);
        body.position.y = 1.2;
        body.castShadow = true;
        hero.add(body);
        hero.userData.body = body;

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skinMat);
        head.position.y = 2.1;
        head.castShadow = true;
        hero.add(head);
        hero.userData.head = head;

        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.4), armorMat);
        shoulders.position.y = 1.75;
        hero.add(shoulders);

        const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 });
        const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6), legMat);
        legL.position.set(-0.15, 0.35, 0);
        hero.add(legL);
        hero.userData.legL = legL;

        const legR = legL.clone();
        legR.position.x = 0.15;
        hero.add(legR);
        hero.userData.legR = legR;

        hero.userData.weapon = null;
        hero.userData.crown = null;

        hero.position.set(CFG.CASTLE_X + 10, 0, 0);
        hero.castShadow = true;
        scene.add(hero);
    }

    function updateHeroWeapon(style) {
        if (hero.userData.weapon) {
            hero.remove(hero.userData.weapon);
            hero.userData.weapon = null;
        }

        let weapon;
        const metalMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, roughness: 0.3, metalness: 0.7 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 });
        const magicMat = new THREE.MeshStandardMaterial({ color: 0x8040d0, roughness: 0.3, metalness: 0.3, emissive: 0x4020a0, emissiveIntensity: 0.3 });
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x808890, roughness: 0.4, metalness: 0.6 });

        switch (style) {
            case 'sword':
                weapon = new THREE.Group();
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.02), metalMat);
                blade.position.y = 0.6;
                weapon.add(blade);
                const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
                weapon.add(hilt);
                const shield = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.08), armorShieldMat());
                shield.position.set(-0.6, 0.3, 0);
                weapon.add(shield);
                weapon.position.set(0.5, 1.3, 0);
                weapon.rotation.z = -0.3;
                break;
            case 'bow':
                weapon = new THREE.Group();
                const bowCurve = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 12, Math.PI), woodMat);
                bowCurve.rotation.z = Math.PI / 2;
                weapon.add(bowCurve);
                const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 4), new THREE.MeshBasicMaterial({ color: 0xcccccc }));
                string.position.x = 0;
                weapon.add(string);
                weapon.position.set(0.5, 1.4, 0);
                break;
            case 'magic':
                weapon = new THREE.Group();
                const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2, 6), woodMat);
                staff.position.y = 0.5;
                weapon.add(staff);
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), magicMat);
                orb.position.y = 1.55;
                weapon.add(orb);
                const orbGlow = new THREE.PointLight(0x8040d0, 0.4, 5);
                orbGlow.position.y = 1.55;
                weapon.add(orbGlow);
                weapon.position.set(0.45, 0.8, 0);
                break;
            case 'chain':
                weapon = new THREE.Group();
                const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), chainMat);
                weapon.add(handle);
                for (let i = 0; i < 5; i++) {
                    const link = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 6), chainMat);
                    link.position.set(0, 0.3 + i * 0.15, 0);
                    link.rotation.x = i % 2 === 0 ? 0 : Math.PI / 2;
                    weapon.add(link);
                }
                const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), chainMat);
                ball.position.y = 1.1;
                weapon.add(ball);
                weapon.position.set(0.5, 1, 0);
                break;
            default:
                weapon = new THREE.Group();
                const defBow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 10, Math.PI), woodMat);
                defBow.rotation.z = Math.PI / 2;
                weapon.add(defBow);
                weapon.position.set(0.5, 1.4, 0);
        }

        if (weapon) {
            hero.add(weapon);
            hero.userData.weapon = weapon;
        }

        hero.userData.body.material.color.setHex(
            style === 'sword' ? 0x505a70 :
            style === 'magic' ? 0x3a2060 :
            style === 'chain' ? 0x404a50 :
            0x3050a0
        );
    }

    function armorShieldMat() {
        return new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.5, metalness: 0.4 });
    }

    function toggleCrown(on) {
        if (hero.userData.crown) {
            hero.remove(hero.userData.crown);
            hero.userData.crown = null;
        }
        if (on) {
            const crownGroup = new THREE.Group();
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(0.28, 0.04, 6, 12),
                new THREE.MeshStandardMaterial({ color: 0xf0c030, roughness: 0.2, metalness: 0.8 })
            );
            band.rotation.x = Math.PI / 2;
            crownGroup.add(band);
            for (let i = 0; i < 5; i++) {
                const spike = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04, 0.18, 4),
                    new THREE.MeshStandardMaterial({ color: 0xf0d040, roughness: 0.2, metalness: 0.8 })
                );
                const angle = (i / 5) * Math.PI * 2;
                spike.position.set(Math.cos(angle) * 0.26, 0.09, Math.sin(angle) * 0.26);
                crownGroup.add(spike);
            }
            crownGroup.position.y = 2.4;
            hero.add(crownGroup);
            hero.userData.crown = crownGroup;
        }
    }

    // ─── ENEMIES ───
    const ENEMY_TYPES = {
        minion: { hp: 20, speed: 3, damage: 5, xp: 10, color: 0x50a050, radius: 0.4, scale: 0.8 },
        runner: { hp: 12, speed: 6, damage: 3, xp: 8, color: 0xa0a040, radius: 0.35, scale: 0.7 },
        brute:  { hp: 60, speed: 1.5, damage: 12, xp: 25, color: 0x805030, radius: 0.7, scale: 1.3 },
        shield: { hp: 45, speed: 2, damage: 8, xp: 20, color: 0x6070a0, radius: 0.5, scale: 1, armor: 0.5 },
        boss:   { hp: 200, speed: 1.2, damage: 25, xp: 100, color: 0x802020, radius: 1.2, scale: 2 },
    };

    function spawnEnemy(type, waveNum) {
        const def = ENEMY_TYPES[type];
        const hpMult = 1 + (waveNum - 1) * 0.12;
        const dmgMult = 1 + (waveNum - 1) * 0.08;

        const group = new THREE.Group();
        const bodyColor = def.color;

        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.1 });

        if (type === 'boss') {
            const torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.2), bodyMat);
            torso.position.y = 1.8;
            torso.castShadow = true;
            group.add(torso);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 5),
                new THREE.MeshStandardMaterial({ color: 0xa03030, roughness: 0.6 }));
            head.position.y = 3.2;
            group.add(head);
            const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 0.5, metalness: 0.3 });
            const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), hornMat);
            hornL.position.set(-0.4, 3.8, 0);
            hornL.rotation.z = 0.4;
            group.add(hornL);
            const hornR = hornL.clone();
            hornR.position.x = 0.4;
            hornR.rotation.z = -0.4;
            group.add(hornR);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat);
            eyeL.position.set(-0.2, 3.3, 0.55);
            group.add(eyeL);
            const eyeR = eyeL.clone(); eyeR.position.x = 0.2;
            group.add(eyeR);
        } else if (type === 'shield') {
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 1.2, 6), bodyMat);
            body.position.y = 0.8;
            body.castShadow = true;
            group.add(body);
            const shieldMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.8, 0.1),
                new THREE.MeshStandardMaterial({ color: 0x4050a0, roughness: 0.4, metalness: 0.5 })
            );
            shieldMesh.position.set(-0.5, 0.8, 0);
            group.add(shieldMesh);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), bodyMat);
            head.position.y = 1.6;
            group.add(head);
        } else {
            const body = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3 * def.scale, 0.25 * def.scale, 0.9 * def.scale, 6),
                bodyMat
            );
            body.position.y = 0.5 * def.scale;
            body.castShadow = true;
            group.add(body);
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.2 * def.scale, 6, 5),
                new THREE.MeshStandardMaterial({
                    color: type === 'runner' ? 0xc0c040 : 0x408040,
                    roughness: 0.6
                })
            );
            head.position.y = 1.05 * def.scale;
            group.add(head);
            const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'runner' ? 0xffff00 : 0xff4040 });
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04 * def.scale, 4, 4), eyeMat);
            eyeL.position.set(-0.08 * def.scale, 1.1 * def.scale, 0.18 * def.scale);
            group.add(eyeL);
            const eyeR = eyeL.clone();
            eyeR.position.x = 0.08 * def.scale;
            group.add(eyeR);
        }

        const hpBar = createHPBar(def.radius * 2);
        hpBar.position.y = (type === 'boss' ? 4.2 : 1.6 * def.scale + 0.3);
        group.add(hpBar);

        const z = (Math.random() - 0.5) * (CFG.ROAD_W - 1);
        group.position.set(CFG.SPAWN_X + Math.random() * 5, 0, z);
        scene.add(group);

        const enemy = {
            mesh: group,
            type,
            hp: Math.floor(def.hp * hpMult),
            maxHp: Math.floor(def.hp * hpMult),
            speed: def.speed,
            damage: Math.floor(def.damage * dmgMult),
            xp: Math.floor(def.xp * (1 + (waveNum - 1) * 0.05)),
            radius: def.radius,
            armor: def.armor || 0,
            hpBar,
            attackCd: 0,
            slowTimer: 0,
            slowFactor: 1,
        };
        enemies.push(enemy);
    }

    function createHPBar(width) {
        const group = new THREE.Group();
        const bgGeo = new THREE.PlaneGeometry(width, 0.12);
        const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x200000, transparent: true, opacity: 0.7 }));
        group.add(bg);
        const fill = new THREE.Mesh(
            new THREE.PlaneGeometry(width, 0.1),
            new THREE.MeshBasicMaterial({ color: 0xff3030 })
        );
        fill.position.z = 0.01;
        group.add(fill);
        group.userData.fill = fill;
        group.userData.width = width;
        group.lookAt(camera.position);
        return group;
    }

    function updateEnemyHPBar(enemy) {
        const ratio = enemy.hp / enemy.maxHp;
        const fill = enemy.hpBar.userData.fill;
        const w = enemy.hpBar.userData.width;
        fill.scale.x = Math.max(0, ratio);
        fill.position.x = -w * (1 - ratio) / 2;
        fill.material.color.setHex(ratio > 0.5 ? 0x40c040 : ratio > 0.25 ? 0xc0c040 : 0xff3030);
        enemy.hpBar.lookAt(camera.position);
    }

    // ─── WAVE SYSTEM ───
    function initWaveData() {
        waveData = {
            current: 1,
            enemiesLeft: 0,
            spawnQueue: [],
            spawnTimer: 0,
            betweenWaves: false,
            betweenTimer: 0,
        };
    }

    function generateWave(waveNum) {
        const queue = [];
        const count = 3 + Math.floor(waveNum * 1.5);

        if (CFG.BOSS_WAVES.includes(waveNum)) {
            queue.push('boss');
            for (let i = 0; i < count - 1; i++) queue.push(pickEnemyType(waveNum));
        } else {
            for (let i = 0; i < count; i++) queue.push(pickEnemyType(waveNum));
        }
        return queue;
    }

    function pickEnemyType(wave) {
        const r = Math.random();
        if (wave >= 15 && r < 0.15) return 'shield';
        if (wave >= 8 && r < 0.3) return 'brute';
        if (r < 0.4) return 'runner';
        return 'minion';
    }

    function startWave(waveNum) {
        waveData.current = waveNum;
        waveData.spawnQueue = generateWave(waveNum);
        waveData.enemiesLeft = waveData.spawnQueue.length;
        waveData.spawnTimer = 0;
        waveData.betweenWaves = false;
        announceWave(waveNum);
        updateHUD();
    }

    function announceWave(num) {
        const el = $('wave-announce');
        const txt = $('wave-announce-text');
        txt.textContent = CFG.BOSS_WAVES.includes(num) ? `⚠ БОСС — Волна ${num}` : `Волна ${num}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 2200);
    }

    // ─── UPGRADE SYSTEM ───
    const UPGRADES = {
        sword:    { name: 'Меч', icon: '⚔️', desc: 'Ближний бой мечом', type: 'style', maxLvl: 3 },
        bow:      { name: 'Лук', icon: '🏹', desc: 'Дальний бой стрелой', type: 'style', maxLvl: 3 },
        magic:    { name: 'Магия', icon: '✨', desc: 'Взрыв по площади', type: 'style', maxLvl: 3 },
        chain:    { name: 'Цепи', icon: '⛓️', desc: 'Средняя дистанция + замедление', type: 'style', maxLvl: 3 },
        atkPow:   { name: 'Сила', icon: '💪', desc: 'Урон +20%', type: 'stat', maxLvl: 5 },
        atkSpd:   { name: 'Скорость', icon: '⚡', desc: 'Скорость атаки +15%', type: 'stat', maxLvl: 5 },
        vamp:     { name: 'Вампиризм', icon: '🩸', desc: 'Лечение от урона', type: 'stat', maxLvl: 3 },
        guardian: { name: 'Страж', icon: '🏰', desc: 'HP замка +30, лечение', type: 'stat', maxLvl: 3 },
        meteor:   { name: 'Метеорит', icon: '☄️', desc: 'Огненный взрыв по площади', type: 'elem', maxLvl: 3 },
        fire:     { name: 'Огонь', icon: '🔥', desc: 'Огненная зона', type: 'elem', maxLvl: 3 },
        ice:      { name: 'Лёд', icon: '❄️', desc: 'Заморозка врагов', type: 'elem', maxLvl: 3 },
    };

    function initUpgradeState() {
        upgradeState = {
            chosen: {},
            attackStyle: 'bow',
            element: null,
            rerollCd: 0,
            atkPow: 1,
            atkSpd: 1,
            vamp: 0,
            guardianLvl: 0,
        };
    }

    function getRandomUpgrades(count) {
        const pool = Object.keys(UPGRADES).filter(k => {
            const lvl = upgradeState.chosen[k] || 0;
            if (lvl >= UPGRADES[k].maxLvl) return false;
            if (UPGRADES[k].type === 'elem' && upgradeState.element && upgradeState.element !== k) {
                return upgradeState.chosen[k] > 0;
            }
            return true;
        });
        const shuffled = pool.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    function applyUpgrade(key) {
        const cur = upgradeState.chosen[key] || 0;
        upgradeState.chosen[key] = cur + 1;
        const def = UPGRADES[key];

        if (def.type === 'style') {
            upgradeState.attackStyle = key;
            updateHeroWeapon(key);
        } else if (def.type === 'elem') {
            upgradeState.element = key;
            updateElementButton(key);
        } else {
            switch (key) {
                case 'atkPow': upgradeState.atkPow += 0.2; break;
                case 'atkSpd': upgradeState.atkSpd += 0.15; break;
                case 'vamp': upgradeState.vamp += 0.05; break;
                case 'guardian':
                    upgradeState.guardianLvl++;
                    castleData.maxHp += 30;
                    castleData.hp = Math.min(castleData.hp + 20, castleData.maxHp);
                    break;
            }
        }
        updateUpgradesList();
    }

    function updateElementButton(elem) {
        const btn = $('btn-ability2');
        const iconEl = btn.querySelector('.ability-icon');
        const labelEl = btn.querySelector('.ability-label');
        if (elem === 'meteor') { iconEl.textContent = '☄️'; labelEl.textContent = 'Метеор'; }
        else if (elem === 'fire') { iconEl.textContent = '🔥'; labelEl.textContent = 'Огонь'; }
        else if (elem === 'ice') { iconEl.textContent = '❄️'; labelEl.textContent = 'Лёд'; }
    }

    function showLevelUp() {
        gameState = 'levelup';
        const cards = getRandomUpgrades(3);
        renderUpgradeCards(cards);
        $('levelup-screen').classList.remove('hidden');

        const rerollBtn = $('btn-reroll');
        if (upgradeState.rerollCd > 0) {
            rerollBtn.disabled = true;
            $('reroll-cd').textContent = `(${upgradeState.rerollCd} волн)`;
        } else {
            rerollBtn.disabled = false;
            $('reroll-cd').textContent = '';
        }
    }

    function renderUpgradeCards(keys) {
        const container = $('upgrade-cards');
        container.innerHTML = '';
        keys.forEach(k => {
            const def = UPGRADES[k];
            const lvl = (upgradeState.chosen[k] || 0) + 1;
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `<div class="card-icon">${def.icon}</div><div class="card-name">${def.name}</div><div class="card-desc">${def.desc}</div>`;
            card.addEventListener('click', () => {
                applyUpgrade(k);
                $('levelup-screen').classList.add('hidden');
                gameState = 'playing';
            });
            container.appendChild(card);
        });
        container.dataset.keys = JSON.stringify(keys);
    }

    function updateUpgradesList() {
        const el = $('upgrades-list');
        el.innerHTML = '';
        Object.entries(upgradeState.chosen).forEach(([k, lvl]) => {
            if (lvl > 0 && UPGRADES[k]) {
                const tag = document.createElement('div');
                tag.className = 'upgrade-tag';
                tag.innerHTML = `${UPGRADES[k].icon} ${UPGRADES[k].name}<span class="tag-level">Ур.${lvl}</span>`;
                el.appendChild(tag);
            }
        });
    }

    // ─── HERO DATA ───
    function initHeroData() {
        heroData = {
            hp: CFG.HERO_HP,
            maxHp: CFG.HERO_HP,
            level: 1,
            xp: 0,
            xpToNext: CFG.LEVEL_XP_BASE,
            score: 0,
            attackCd: 0,
            dashCd: 0,
            elemCd: 0,
            shieldCd: 0,
            shieldActive: false,
            shieldTimer: 0,
            stunTimer: 0,
            invincTimer: 0,
            moveDir: new THREE.Vector3(),
            facing: new THREE.Vector3(1, 0, 0),
        };
    }

    function initCastleData() {
        castleData = {
            hp: CFG.CASTLE_HP,
            maxHp: CFG.CASTLE_HP,
        };
    }

    // ─── COMBAT ───
    function findNearestEnemy(pos, maxRange) {
        let best = null, bestDist = maxRange || Infinity;
        enemies.forEach(e => {
            const d = pos.distanceTo(e.mesh.position);
            if (d < bestDist) { bestDist = d; best = e; }
        });
        return best;
    }

    function heroAttack() {
        if (heroData.attackCd > 0 || heroData.stunTimer > 0) return;

        const style = upgradeState.attackStyle;
        const baseCD = style === 'sword' ? 0.5 : style === 'bow' ? 0.4 : style === 'magic' ? 0.7 : 0.55;
        heroData.attackCd = baseCD / upgradeState.atkSpd;

        const baseDmg = style === 'sword' ? 18 : style === 'bow' ? 12 : style === 'magic' ? 15 : 14;
        const dmg = Math.floor(baseDmg * upgradeState.atkPow * (1 + (upgradeState.chosen[style] || 0) * 0.25));

        const dir = heroData.facing.clone().normalize();

        if (style === 'sword') {
            const range = 3;
            enemies.forEach(e => {
                const dist = hero.position.distanceTo(e.mesh.position);
                if (dist < range + e.radius) {
                    damageEnemy(e, dmg);
                }
            });
            spawnSwordAOE(hero.position, range);
        } else if (style === 'bow') {
            const aimDir = autoAimDir(dir, CFG.ARROW_RANGE);
            spawnProjectile(hero.position, aimDir, dmg, 'arrow', CFG.ARROW_SPEED, CFG.ARROW_RANGE);
        } else if (style === 'magic') {
            const aimDir = autoAimDir(dir, 15);
            spawnProjectile(hero.position, aimDir, dmg, 'magic', 20, 15);
        } else if (style === 'chain') {
            const range = 6;
            const coneAngle = Math.PI / 3;
            enemies.forEach(e => {
                const dx = e.mesh.position.x - hero.position.x;
                const dz = e.mesh.position.z - hero.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < range + e.radius) {
                    const enemyAngle = Math.atan2(dz, dx);
                    const facingAngle = Math.atan2(dir.z, dir.x);
                    let diff = enemyAngle - facingAngle;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    if (Math.abs(diff) < coneAngle) {
                        damageEnemy(e, dmg);
                        e.slowTimer = 2;
                        e.slowFactor = 0.5;
                    }
                }
            });
            spawnChainConeEffect(hero.position, dir, range);
        }
    }

    function autoAimDir(fallbackDir, range) {
        const target = findNearestEnemy(hero.position, range);
        if (target) {
            const d = new THREE.Vector3().subVectors(target.mesh.position, hero.position);
            d.y = 0;
            if (d.length() > 0.1) return d.normalize();
        }
        return fallbackDir.clone().normalize();
    }

    function spawnProjectile(origin, dir, dmg, type, speed, range) {
        const geo = type === 'arrow' ?
            new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4) :
            type === 'magic' ?
            new THREE.SphereGeometry(0.2, 6, 6) :
            new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4);

        const matColor = type === 'arrow' ? 0xc0a060 : type === 'magic' ? 0x8040d0 : 0x808890;
        const mat = type === 'magic' ?
            new THREE.MeshBasicMaterial({ color: matColor }) :
            new THREE.MeshStandardMaterial({ color: matColor, metalness: 0.5 });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(origin);
        mesh.position.y = 1.5;

        const angle = Math.atan2(dir.z, dir.x);
        if (type === 'arrow' || type === 'chain') {
            mesh.rotation.z = Math.PI / 2;
            mesh.rotation.y = -angle;
        }

        scene.add(mesh);

        if (type === 'magic') {
            const glow = new THREE.PointLight(0x8040d0, 0.5, 5);
            mesh.add(glow);
        }

        projectiles.push({
            mesh, dir: dir.clone().normalize(), speed, dmg, type,
            dist: 0, maxDist: range, aoe: type === 'magic' ? 3 : 0,
            slow: type === 'chain' ? 0.5 : 0,
        });
    }

    function spawnSwordAOE(pos, radius) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.3, radius, 24),
            new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        ring.position.set(pos.x, 0.15, pos.z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
        effects.push({ mesh: ring, timer: 0.3, fadeOut: true });

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const spark = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.08, 0.3),
                new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
            );
            spark.position.set(
                pos.x + Math.cos(angle) * radius * 0.7,
                1,
                pos.z + Math.sin(angle) * radius * 0.7
            );
            spark.rotation.y = angle;
            scene.add(spark);
            effects.push({ mesh: spark, timer: 0.2, fadeOut: true });
        }
    }

    function spawnChainConeEffect(pos, dir, range) {
        const angle = Math.atan2(dir.z, dir.x);
        const coneGeo = new THREE.RingGeometry(0.5, range, 12, 1, -Math.PI / 3, Math.PI / 3 * 2);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x8090a0, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(pos.x, 0.15, pos.z);
        cone.rotation.x = -Math.PI / 2;
        cone.rotation.z = -angle;
        scene.add(cone);
        effects.push({ mesh: cone, timer: 0.35, fadeOut: true });

        for (let i = 0; i < 4; i++) {
            const t = (i + 1) / 5;
            const link = new THREE.Mesh(
                new THREE.TorusGeometry(0.1, 0.03, 4, 6),
                new THREE.MeshBasicMaterial({ color: 0xb0b8c0, transparent: true, opacity: 0.6 })
            );
            link.position.set(
                pos.x + dir.x * range * t,
                0.8,
                pos.z + dir.z * range * t
            );
            scene.add(link);
            effects.push({ mesh: link, timer: 0.25 + i * 0.05, fadeOut: true });
        }
    }

    function damageEnemy(enemy, dmg) {
        const finalDmg = Math.max(1, Math.floor(dmg * (1 - enemy.armor)));
        enemy.hp -= finalDmg;

        if (upgradeState.vamp > 0) {
            heroData.hp = Math.min(heroData.maxHp, heroData.hp + finalDmg * upgradeState.vamp);
        }

        spawnDmgNumber(enemy.mesh.position, finalDmg);

        if (enemy.hp <= 0) {
            killEnemy(enemy);
        } else {
            updateEnemyHPBar(enemy);
        }
    }

    function killEnemy(enemy) {
        scene.remove(enemy.mesh);
        const idx = enemies.indexOf(enemy);
        if (idx >= 0) enemies.splice(idx, 1);

        heroData.xp += enemy.xp;
        heroData.score += enemy.xp * 2;
        waveData.enemiesLeft = Math.max(0, waveData.enemiesLeft - 1);

        spawnDeathParticles(enemy.mesh.position, enemy.type);

        checkLevelUp();
        updateHUD();
    }

    function checkLevelUp() {
        while (heroData.xp >= heroData.xpToNext) {
            heroData.xp -= heroData.xpToNext;
            heroData.level++;
            heroData.xpToNext = Math.floor(CFG.LEVEL_XP_BASE * Math.pow(CFG.LEVEL_XP_MULT, heroData.level - 1));
            heroData.maxHp += 10;
            heroData.hp = Math.min(heroData.maxHp, heroData.hp + 20);
            showLevelUp();
        }
    }

    function damageHero(dmg) {
        if (heroData.invincTimer > 0) return;
        heroData.hp -= dmg;
        heroData.invincTimer = 0.5;
        showDamageFlash();
        if (heroData.hp <= 0) {
            heroData.hp = 0;
            heroStunned();
        }
        updateHUD();
    }

    function heroStunned() {
        heroData.stunTimer = 3;
        heroData.hp = Math.floor(heroData.maxHp * 0.3);
        heroData.invincTimer = 3;
    }

    function damageCastle(dmg) {
        if (heroData.shieldActive) {
            dmg = Math.floor(dmg * 0.3);
        }
        castleData.hp -= dmg;
        showDamageFlash();
        if (castleData.hp <= 0) {
            castleData.hp = 0;
            gameOver(false);
        }
        updateHUD();
    }

    function showDamageFlash() {
        const el = $('damage-flash');
        el.classList.remove('hidden');
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => el.classList.add('hidden'), 300);
    }

    // ─── ABILITIES ───
    function heroDash() {
        if (heroData.dashCd > 0 || heroData.stunTimer > 0) return;
        heroData.dashCd = CFG.DASH_CD;
        const dir = heroData.facing.clone().normalize();
        const target = hero.position.clone().add(dir.multiplyScalar(CFG.DASH_DIST));
        target.x = clamp(target.x, -CFG.ARENA_W / 2 + 2, CFG.ARENA_W / 2 - 2);
        target.z = clamp(target.z, -CFG.ARENA_H / 2 + 2, CFG.ARENA_H / 2 - 2);
        hero.position.copy(target);
        hero.position.y = 0;
        heroData.invincTimer = 0.3;

        for (let i = 0; i < 8; i++) {
            const p = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.7 })
            );
            p.position.copy(hero.position);
            p.position.y = 0.5 + Math.random();
            p.position.x += (Math.random() - 0.5) * 2;
            p.position.z += (Math.random() - 0.5) * 2;
            scene.add(p);
            effects.push({ mesh: p, timer: 0.4, fadeOut: true });
        }
    }

    function heroElemental() {
        if (heroData.elemCd > 0 || heroData.stunTimer > 0) return;

        const elemLvl = upgradeState.element ? (upgradeState.chosen[upgradeState.element] || 1) : 0;
        const baseCd = elemLvl > 0 ? Math.max(4, CFG.ELEM_CD - elemLvl) : CFG.ELEM_CD;
        heroData.elemCd = baseCd;

        if (!upgradeState.element) {
            const range = 4;
            const dmg = Math.floor(20 * upgradeState.atkPow);
            enemies.forEach(e => {
                const dist = hero.position.distanceTo(e.mesh.position);
                if (dist < range + e.radius) damageEnemy(e, dmg);
            });
            spawnCircleEffect(hero.position, range, 0xffffff, 0.5);
            return;
        }

        const dmgMult = upgradeState.atkPow * (1 + elemLvl * 0.3);

        if (upgradeState.element === 'meteor') {
            let target = findClosestEnemyCluster();
            if (!target) target = hero.position.clone();
            const dmg = Math.floor(50 * dmgMult);
            const radius = 5 + elemLvl;

            const meteor = new THREE.Group();
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.9, 1),
                new THREE.MeshStandardMaterial({ color: 0x804020, emissive: 0xff4010, emissiveIntensity: 0.6, roughness: 0.5 })
            );
            meteor.add(rock);
            const trail = new THREE.Mesh(
                new THREE.ConeGeometry(0.5, 2.5, 6),
                new THREE.MeshBasicMaterial({ color: 0xff6020, transparent: true, opacity: 0.6 })
            );
            trail.position.y = 1.5;
            meteor.add(trail);
            const glow = new THREE.PointLight(0xff6020, 3, 20);
            meteor.add(glow);
            meteor.position.set(target.x + 8, 25, target.z - 8);
            scene.add(meteor);

            effects.push({
                mesh: meteor, timer: 0.7, custom: (dt, eff) => {
                    const dest = new THREE.Vector3(target.x, 0.5, target.z);
                    meteor.position.lerp(dest, dt * 3.5);
                    rock.rotation.x += dt * 5;
                    rock.rotation.z += dt * 3;
                    if (eff.timer <= 0) {
                        enemies.forEach(e => {
                            if (e.mesh.position.distanceTo(target) < radius) damageEnemy(e, dmg);
                        });
                        scene.remove(meteor);
                        spawnMeteorCrater(target, radius);
                    }
                }
            });
        } else if (upgradeState.element === 'fire') {
            const pos = hero.position.clone();
            pos.add(heroData.facing.clone().normalize().multiplyScalar(4));
            const dmg = Math.floor(15 * dmgMult);
            const radius = 4 + elemLvl;
            const duration = 5;

            spawnFireZone(pos, radius, duration);

            const fireZone = { pos: pos.clone(), radius, dmg, timer: duration, tickCd: 0 };
            effects.push({
                mesh: null, timer: duration, custom: (dt) => {
                    fireZone.tickCd -= dt;
                    fireZone.timer -= dt;
                    if (fireZone.tickCd <= 0 && fireZone.timer > 0) {
                        fireZone.tickCd = 0.5;
                        enemies.forEach(e => {
                            if (e.mesh.position.distanceTo(fireZone.pos) < fireZone.radius) {
                                damageEnemy(e, fireZone.dmg);
                            }
                        });
                    }
                }
            });
        } else if (upgradeState.element === 'ice') {
            const pos = hero.position.clone();
            pos.add(heroData.facing.clone().normalize().multiplyScalar(5));
            const radius = 5 + elemLvl;
            const duration = 2 + elemLvl * 0.5;
            const slowFactor = 0.3;

            spawnCircleEffect(pos, radius, 0x40a0ff, duration);

            enemies.forEach(e => {
                if (e.mesh.position.distanceTo(pos) < radius) {
                    e.slowTimer = duration;
                    e.slowFactor = slowFactor;
                }
            });
        }
    }

    function heroCastleShield() {
        if (heroData.shieldCd > 0 || heroData.stunTimer > 0) return;
        heroData.shieldCd = CFG.SHIELD_CD;
        heroData.shieldActive = true;
        heroData.shieldTimer = CFG.SHIELD_DUR;

        castleData.hp = Math.min(castleData.maxHp, castleData.hp + 15 + upgradeState.guardianLvl * 10);

        spawnCircleEffect(castle.position, 6, 0x40a0ff, CFG.SHIELD_DUR);
        updateHUD();
    }

    function findClosestEnemyCluster() {
        if (enemies.length === 0) return null;
        let bestPos = null, bestCount = 0;
        enemies.forEach(e => {
            let count = 0;
            enemies.forEach(e2 => {
                if (e.mesh.position.distanceTo(e2.mesh.position) < 6) count++;
            });
            if (count > bestCount) { bestCount = count; bestPos = e.mesh.position.clone(); }
        });
        return bestPos;
    }

    function spawnCircleEffect(pos, radius, color, duration) {
        const geo = new THREE.RingGeometry(0.1, radius, 24);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, 0.1, pos.z);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        effects.push({ mesh, timer: duration, fadeOut: true });
    }

    function spawnFireZone(center, radius, duration) {
        const fireGroup = new THREE.Group();

        const baseGlow = new THREE.Mesh(
            new THREE.CircleGeometry(radius, 20),
            new THREE.MeshBasicMaterial({ color: 0xff4010, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
        );
        baseGlow.rotation.x = -Math.PI / 2;
        baseGlow.position.y = 0.05;
        fireGroup.add(baseGlow);

        const flameCount = 12 + Math.floor(radius * 2);
        const flames = [];
        for (let i = 0; i < flameCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.85;
            const flameH = 0.5 + Math.random() * 1.2;
            const flame = new THREE.Mesh(
                new THREE.ConeGeometry(0.15 + Math.random() * 0.2, flameH, 5),
                new THREE.MeshBasicMaterial({
                    color: Math.random() > 0.4 ? 0xff6020 : (Math.random() > 0.5 ? 0xffaa30 : 0xff2010),
                    transparent: true, opacity: 0.7 + Math.random() * 0.3
                })
            );
            flame.position.set(Math.cos(angle) * dist, flameH * 0.5, Math.sin(angle) * dist);
            fireGroup.add(flame);
            flames.push({ mesh: flame, phase: Math.random() * 10, baseY: flameH * 0.5, baseH: flameH });
        }

        const fireLight = new THREE.PointLight(0xff4020, 2, radius * 2);
        fireLight.position.y = 1.5;
        fireGroup.add(fireLight);

        fireGroup.position.set(center.x, 0, center.z);
        scene.add(fireGroup);

        effects.push({
            mesh: fireGroup, timer: duration, fadeOut: false,
            custom: (dt, eff) => {
                const t = eff.timer;
                const fadeRatio = Math.min(1, t / 1.0);
                flames.forEach(f => {
                    f.phase += dt * (5 + Math.random() * 3);
                    f.mesh.scale.y = (0.6 + Math.sin(f.phase) * 0.4) * fadeRatio;
                    f.mesh.scale.x = f.mesh.scale.z = 0.8 + Math.sin(f.phase * 1.3) * 0.3;
                    f.mesh.position.y = f.baseY + Math.sin(f.phase * 0.7) * 0.2;
                    f.mesh.material.opacity = (0.5 + Math.sin(f.phase) * 0.3) * fadeRatio;
                });
                fireLight.intensity = (1.5 + Math.sin(Date.now() * 0.01) * 0.5) * fadeRatio;
                baseGlow.material.opacity = 0.2 * fadeRatio;
            }
        });
    }

    function spawnMeteorCrater(center, radius) {
        const craterGroup = new THREE.Group();

        const craterRing = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.3, radius, 16),
            new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, side: THREE.DoubleSide })
        );
        craterRing.rotation.x = -Math.PI / 2;
        craterRing.position.y = 0.06;
        craterGroup.add(craterRing);

        const scorchMark = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.9, 16),
            new THREE.MeshBasicMaterial({ color: 0x1a0a00, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        scorchMark.rotation.x = -Math.PI / 2;
        scorchMark.position.y = 0.04;
        craterGroup.add(scorchMark);

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
            const dist = radius * (0.7 + Math.random() * 0.3);
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.3, 0),
                new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
            );
            rock.position.set(Math.cos(angle) * dist, 0.15, Math.sin(angle) * dist);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            craterGroup.add(rock);
        }

        const embers = new THREE.PointLight(0xff4010, 1, radius * 1.5);
        embers.position.y = 0.5;
        craterGroup.add(embers);

        for (let i = 0; i < 6; i++) {
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(0.3 + Math.random() * 0.4, 5, 5),
                new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 })
            );
            const sAngle = Math.random() * Math.PI * 2;
            const sDist = Math.random() * radius * 0.5;
            smoke.position.set(Math.cos(sAngle) * sDist, 0.5 + Math.random(), Math.sin(sAngle) * sDist);
            craterGroup.add(smoke);
        }

        craterGroup.position.set(center.x, 0, center.z);
        scene.add(craterGroup);

        effects.push({
            mesh: craterGroup, timer: 5, fadeOut: false,
            custom: (dt, eff) => {
                const fadeRatio = Math.min(1, eff.timer / 1.5);
                embers.intensity = fadeRatio * (0.8 + Math.sin(Date.now() * 0.008) * 0.3);
                craterGroup.children.forEach(c => {
                    if (c.material && c.material.transparent) {
                        c.material.opacity = Math.min(c.material.opacity, fadeRatio * 0.6);
                    }
                });
            }
        });
    }

    function spawnDmgNumber(pos, dmg) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dmg.toString(), 32, 24);
        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        sprite.position.set(pos.x + (Math.random() - 0.5), pos.y + 2, pos.z + (Math.random() - 0.5));
        sprite.scale.set(1.5, 0.75, 1);
        scene.add(sprite);
        effects.push({ mesh: sprite, timer: 0.8, fadeOut: true, rise: true });
    }

    function spawnDeathParticles(pos, type) {
        const color = ENEMY_TYPES[type]?.color || 0x808080;
        for (let i = 0; i < 6; i++) {
            const p = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, 0.15),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
            );
            p.position.set(
                pos.x + (Math.random() - 0.5) * 1.5,
                pos.y + 0.5 + Math.random(),
                pos.z + (Math.random() - 0.5) * 1.5
            );
            p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
            scene.add(p);
            effects.push({ mesh: p, timer: 0.6, fadeOut: true, physics: true });
        }
    }

    // ─── UPDATE LOOP ───
    function update(dt) {
        if (gameState !== 'playing') return;
        if (dt > 0.1) dt = 0.1;
        dt *= gameSpeed;

        updateHeroMovement(dt);
        updateCooldowns(dt);
        updateProjectiles(dt);
        updateEnemies(dt);
        updateWaveSpawner(dt);
        updateEffects(dt);
        updateParticles(dt);
        updateCamera(dt);
        updateHUD();

        if (heroData.shieldActive) {
            heroData.shieldTimer -= dt;
            if (heroData.shieldTimer <= 0) heroData.shieldActive = false;
        }
    }

    function updateHeroMovement(dt) {
        if (heroData.stunTimer > 0) {
            heroData.stunTimer -= dt;
            hero.userData.body.material.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
            return;
        }
        hero.userData.body.material.opacity = 1;

        let mx = 0, mz = 0;
        if (joystickActive) {
            mx = joystickDir.x;
            mz = joystickDir.y;
        } else {
            if (keys['KeyW'] || keys['ArrowUp']) mz = -1;
            if (keys['KeyS'] || keys['ArrowDown']) mz = 1;
            if (keys['KeyA'] || keys['ArrowLeft']) mx = -1;
            if (keys['KeyD'] || keys['ArrowRight']) mx = 1;
        }

        const len = Math.sqrt(mx * mx + mz * mz);
        if (len > 0.1) {
            mx /= len; mz /= len;
            heroData.facing.set(mx, 0, mz);

            hero.position.x += mx * CFG.HERO_SPEED * dt;
            hero.position.z += mz * CFG.HERO_SPEED * dt;

            hero.position.x = clamp(hero.position.x, -CFG.ARENA_W / 2 + 2, CFG.ARENA_W / 2 - 2);
            hero.position.z = clamp(hero.position.z, -CFG.ARENA_H / 2 + 2, CFG.ARENA_H / 2 - 2);

            const angle = Math.atan2(mx, mz);
            hero.rotation.y = angle;

            const walkCycle = Math.sin(Date.now() * 0.012) * 0.15;
            hero.userData.legL.position.z = walkCycle;
            hero.userData.legR.position.z = -walkCycle;
        } else {
            hero.userData.legL.position.z = 0;
            hero.userData.legR.position.z = 0;
        }
    }

    function updateCooldowns(dt) {
        heroData.attackCd = Math.max(0, heroData.attackCd - dt);
        heroData.dashCd = Math.max(0, heroData.dashCd - dt);
        heroData.elemCd = Math.max(0, heroData.elemCd - dt);
        heroData.shieldCd = Math.max(0, heroData.shieldCd - dt);
        heroData.invincTimer = Math.max(0, heroData.invincTimer - dt);

        updateCooldownUI('cd-1', heroData.dashCd, CFG.DASH_CD);
        updateCooldownUI('cd-2', heroData.elemCd, CFG.ELEM_CD);
        updateCooldownUI('cd-3', heroData.shieldCd, CFG.SHIELD_CD);
    }

    function updateCooldownUI(id, current, max) {
        const el = $(id);
        if (el) el.style.height = (current / max * 100) + '%';
    }

    function updateProjectiles(dt) {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            const move = p.speed * dt;
            p.mesh.position.x += p.dir.x * move;
            p.mesh.position.z += p.dir.z * move;
            p.dist += move;

            let hit = false;
            for (const e of enemies) {
                const dx = p.mesh.position.x - e.mesh.position.x;
                const dz = p.mesh.position.z - e.mesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < e.radius + 0.3) {
                    if (p.aoe > 0) {
                        enemies.forEach(e2 => {
                            if (e2.mesh.position.distanceTo(p.mesh.position) < p.aoe) {
                                damageEnemy(e2, p.dmg);
                            }
                        });
                        spawnCircleEffect(p.mesh.position, p.aoe, 0x8040d0, 0.3);
                    } else {
                        damageEnemy(e, p.dmg);
                    }
                    if (p.slow > 0) {
                        e.slowTimer = 2;
                        e.slowFactor = p.slow;
                    }
                    hit = true;
                    break;
                }
            }

            if (hit || p.dist > p.maxDist) {
                scene.remove(p.mesh);
                projectiles.splice(i, 1);
            }
        }
    }

    function updateEnemies(dt) {
        const castlePos = new THREE.Vector3(CFG.CASTLE_X + 4, 0, 0);

        for (const e of enemies) {
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                if (e.slowTimer <= 0) e.slowFactor = 1;
            }

            const dx = castlePos.x - e.mesh.position.x;
            const dz = castlePos.z - e.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 3) {
                e.attackCd -= dt;
                if (e.attackCd <= 0) {
                    damageCastle(e.damage);
                    e.attackCd = 1.5;
                }
            } else {
                const speed = e.speed * e.slowFactor;
                const nx = dx / dist, nz = dz / dist;
                e.mesh.position.x += nx * speed * dt;
                e.mesh.position.z += nz * speed * dt;
                e.mesh.rotation.y = Math.atan2(nx, nz);
            }

            const heroDist = hero.position.distanceTo(e.mesh.position);
            if (heroDist < e.radius + CFG.HERO_RADIUS && heroData.invincTimer <= 0) {
                damageHero(Math.floor(e.damage * 0.5));
            }

            e.mesh.position.y = Math.sin(Date.now() * 0.003 + e.mesh.id) * 0.05;
        }
    }

    function updateWaveSpawner(dt) {
        if (waveData.betweenWaves) {
            waveData.betweenTimer -= dt;
            if (waveData.betweenTimer <= 0) {
                waveData.current++;
                if (waveData.current > CFG.MAX_WAVE) {
                    gameOver(true);
                    return;
                }
                startWave(waveData.current);
            }
            return;
        }

        if (waveData.spawnQueue.length > 0) {
            waveData.spawnTimer -= dt;
            if (waveData.spawnTimer <= 0) {
                const type = waveData.spawnQueue.shift();
                spawnEnemy(type, waveData.current);
                waveData.spawnTimer = 0.8 + Math.random() * 0.4;
            }
        }

        if (waveData.spawnQueue.length === 0 && enemies.length === 0) {
            if (upgradeState.rerollCd > 0) upgradeState.rerollCd--;
            waveData.betweenWaves = true;
            waveData.betweenTimer = 2;
            saveGame();
        }
    }

    function updateEffects(dt) {
        for (let i = effects.length - 1; i >= 0; i--) {
            const eff = effects[i];
            eff.timer -= dt;

            if (eff.custom) eff.custom(dt, eff);

            if (eff.fadeOut && eff.mesh && eff.mesh.material) {
                eff.mesh.material.opacity = Math.max(0, eff.timer / 0.5);
            }
            if (eff.rise && eff.mesh) {
                eff.mesh.position.y += dt * 2;
            }
            if (eff.physics && eff.mesh) {
                eff.mesh.position.add(eff.mesh.userData.vel.clone().multiplyScalar(dt));
                eff.mesh.userData.vel.y -= 10 * dt;
            }

            if (eff.timer <= 0) {
                if (eff.mesh) scene.remove(eff.mesh);
                effects.splice(i, 1);
            }
        }
    }

    function updateParticles(dt) {
        particles.forEach(p => {
            p.time += dt;
            if (p.type === 'torch') {
                p.mesh.scale.setScalar(0.8 + Math.sin(p.time * 8) * 0.3);
                p.mesh.position.y += Math.sin(p.time * 5) * 0.002;
            }
        });

        pointLights.forEach((l, i) => {
            l.intensity = 0.6 + Math.sin(Date.now() * 0.005 + i * 2) * 0.3;
        });
    }

    function updateCamera(dt) {
        const targetX = hero.position.x;
        const targetZ = hero.position.z;

        const camTargetX = clamp(targetX, -CFG.ARENA_W / 2 + 15, CFG.ARENA_W / 2 - 15);
        const camTargetZ = clamp(targetZ + CFG.CAM_DIST * 0.6, -CFG.ARENA_H / 2 + 10, CFG.ARENA_H / 2 + 10);

        camera.position.x += (camTargetX - camera.position.x) * 3 * dt;
        camera.position.z += (camTargetZ - camera.position.z) * 3 * dt;
        camera.position.y = CFG.CAM_HEIGHT;

        camera.lookAt(
            camera.position.x,
            0,
            camera.position.z - CFG.CAM_DIST * 0.6
        );
    }

    // ─── HUD ───
    function updateHUD() {
        $('castle-hp-bar').style.width = (castleData.hp / castleData.maxHp * 100) + '%';
        $('castle-hp-text').textContent = `${castleData.hp}/${castleData.maxHp}`;
        $('hero-hp-bar').style.width = (heroData.hp / heroData.maxHp * 100) + '%';
        $('hero-hp-text').textContent = `${Math.ceil(heroData.hp)}/${heroData.maxHp}`;
        $('hero-level').textContent = `Ур.${heroData.level}`;
        $('exp-bar').style.width = (heroData.xp / heroData.xpToNext * 100) + '%';
        $('exp-text').textContent = `${heroData.xp}/${heroData.xpToNext}`;
        $('wave-num').textContent = waveData.current;
        $('enemy-num').textContent = enemies.length;
        $('score-num').textContent = heroData.score;
    }

    // ─── GAME FLOW ───
    function startNewGame() {
        clearGameObjects();
        initHeroData();
        initCastleData();
        initWaveData();
        initUpgradeState();

        hero.position.set(CFG.CASTLE_X + 10, 0, 0);
        hero.rotation.y = 0;
        updateHeroWeapon('bow');

        if (saveData.crownEquipped) toggleCrown(true);
        else toggleCrown(false);

        gameState = 'playing';
        hideAllScreens();
        hudEl.classList.remove('hidden');
        mobileCtrl.classList.remove('hidden');

        startWave(1);
        updateHUD();
        updateUpgradesList();
    }

    function continueGame() {
        if (!saveData.run) return;
        const r = saveData.run;
        clearGameObjects();

        initHeroData();
        heroData.hp = r.heroHp;
        heroData.maxHp = CFG.HERO_HP + (r.heroLevel - 1) * 10;
        heroData.level = r.heroLevel;
        heroData.xp = r.xp;
        heroData.xpToNext = Math.floor(CFG.LEVEL_XP_BASE * Math.pow(CFG.LEVEL_XP_MULT, r.heroLevel - 1));
        heroData.score = r.score || 0;

        initCastleData();
        castleData.hp = r.castleHp;
        castleData.maxHp = CFG.CASTLE_HP + (r.guardianLvl || 0) * 30;

        initWaveData();
        waveData.current = r.wave;

        initUpgradeState();
        upgradeState.chosen = r.upgrades || {};
        upgradeState.attackStyle = r.attackStyle || 'bow';
        upgradeState.element = r.element || null;
        upgradeState.rerollCd = r.rerollCd || 0;
        upgradeState.guardianLvl = r.guardianLvl || 0;
        upgradeState.atkPow = 1 + (upgradeState.chosen.atkPow || 0) * 0.2;
        upgradeState.atkSpd = 1 + (upgradeState.chosen.atkSpd || 0) * 0.15;
        upgradeState.vamp = (upgradeState.chosen.vamp || 0) * 0.05;

        hero.position.set(CFG.CASTLE_X + 10, 0, 0);
        updateHeroWeapon(upgradeState.attackStyle);
        if (upgradeState.element) updateElementButton(upgradeState.element);
        if (saveData.crownEquipped) toggleCrown(true);

        gameState = 'playing';
        hideAllScreens();
        hudEl.classList.remove('hidden');
        mobileCtrl.classList.remove('hidden');

        startWave(waveData.current);
        updateHUD();
        updateUpgradesList();
    }

    function gameOver(victory) {
        gameState = victory ? 'victory' : 'defeat';

        if (victory) {
            saveData.crownUnlocked = true;
            $('victory-score').textContent = `Счёт: ${heroData.score}`;
            showScreen('victory-screen');
        } else {
            $('defeat-text').textContent = heroData.stunTimer > 0 ? 'Вас оглушили' : 'Вы проиграли';
            $('defeat-score').textContent = `Волна: ${waveData.current} | Счёт: ${heroData.score}`;
            showScreen('defeat-screen');
        }

        if (heroData.score > (saveData.highScore || 0)) saveData.highScore = heroData.score;
        if (waveData.current > (saveData.bestLevel || 0)) saveData.bestLevel = waveData.current;
        saveData.run = null;
        persistSave();
    }

    function clearGameObjects() {
        enemies.forEach(e => scene.remove(e.mesh));
        enemies = [];
        projectiles.forEach(p => scene.remove(p.mesh));
        projectiles = [];
        effects.forEach(e => { if (e.mesh) scene.remove(e.mesh); });
        effects = [];
    }

    function returnToMenu() {
        clearGameObjects();
        gameState = 'menu';
        hideAllScreens();
        hudEl.classList.add('hidden');
        mobileCtrl.classList.add('hidden');
        loadSave();
        showScreen('start-screen');
    }

    // ─── SAVE SYSTEM ───
    function loadSave() {
        saveData = {
            crownUnlocked: localStorage.getItem('crownDefender.crownUnlocked') === 'true',
            crownEquipped: localStorage.getItem('crownDefender.crownEquipped') === 'true',
            highScore: parseInt(localStorage.getItem('crownDefender.highScore')) || 0,
            bestLevel: parseInt(localStorage.getItem('crownDefender.bestLevel')) || 0,
            run: null,
        };
        try {
            const runStr = localStorage.getItem('crownDefender.run');
            if (runStr) saveData.run = JSON.parse(runStr);
        } catch (e) { /* ignore */ }

        $('best-score').textContent = saveData.highScore;
        $('best-level').textContent = saveData.bestLevel;

        if (saveData.crownUnlocked) {
            $('crown-display').classList.remove('hidden');
            $('crown-toggle').checked = saveData.crownEquipped;
        } else {
            $('crown-display').classList.add('hidden');
        }

        $('btn-continue').style.display = saveData.run ? 'block' : 'none';
    }

    function saveGame() {
        saveData.run = {
            wave: waveData.current,
            castleHp: castleData.hp,
            heroHp: heroData.hp,
            heroLevel: heroData.level,
            xp: heroData.xp,
            score: heroData.score,
            upgrades: upgradeState.chosen,
            attackStyle: upgradeState.attackStyle,
            element: upgradeState.element,
            rerollCd: upgradeState.rerollCd,
            guardianLvl: upgradeState.guardianLvl,
        };
        persistSave();
    }

    function persistSave() {
        localStorage.setItem('crownDefender.crownUnlocked', saveData.crownUnlocked);
        localStorage.setItem('crownDefender.crownEquipped', saveData.crownEquipped);
        localStorage.setItem('crownDefender.highScore', saveData.highScore);
        localStorage.setItem('crownDefender.bestLevel', saveData.bestLevel);
        if (saveData.run) {
            localStorage.setItem('crownDefender.run', JSON.stringify(saveData.run));
        } else {
            localStorage.removeItem('crownDefender.run');
        }
    }

    function resetSave() {
        localStorage.removeItem('crownDefender.crownUnlocked');
        localStorage.removeItem('crownDefender.crownEquipped');
        localStorage.removeItem('crownDefender.highScore');
        localStorage.removeItem('crownDefender.bestLevel');
        localStorage.removeItem('crownDefender.run');
        loadSave();
    }

    // ─── SCREENS ───
    function showScreen(id) {
        $(id).classList.remove('hidden');
    }

    function hideAllScreens() {
        ['start-screen', 'levelup-screen', 'pause-screen', 'victory-screen', 'defeat-screen'].forEach(id => {
            $(id).classList.add('hidden');
        });
    }

    // ─── INPUT ───
    function initListeners() {
        document.addEventListener('keydown', e => {
            keys[e.code] = true;

            if (gameState === 'playing') {
                if (e.code === 'Semicolon' || e.code === 'Space') heroAttack();
                if (e.code === 'BracketLeft' || e.code === 'KeyQ') heroDash();
                if (e.code === 'BracketRight' || e.code === 'KeyE') heroElemental();
                if (e.code === 'Quote' || e.code === 'KeyR') heroCastleShield();
                if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
            } else if (gameState === 'paused') {
                if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
            }
        });
        document.addEventListener('keyup', e => { keys[e.code] = false; });

        $('btn-new-game').addEventListener('click', startNewGame);
        $('btn-continue').addEventListener('click', continueGame);
        $('btn-reset').addEventListener('click', () => {
            if (confirm('Сбросить все сохранения?')) resetSave();
        });
        $('btn-resume').addEventListener('click', togglePause);
        $('btn-quit').addEventListener('click', returnToMenu);
        $('btn-victory-menu').addEventListener('click', returnToMenu);
        $('btn-defeat-menu').addEventListener('click', returnToMenu);
        $('pause-btn').addEventListener('click', togglePause);

        $('crown-toggle').addEventListener('change', e => {
            saveData.crownEquipped = e.target.checked;
            persistSave();
        });

        $('btn-reroll').addEventListener('click', () => {
            if (upgradeState.rerollCd > 0) return;
            upgradeState.rerollCd = CFG.REROLL_CD_WAVES;
            const cards = getRandomUpgrades(3);
            renderUpgradeCards(cards);
            $('btn-reroll').disabled = true;
            $('reroll-cd').textContent = `(${upgradeState.rerollCd} волн)`;
        });

        const abilityHandler = (el, fn) => {
            el.addEventListener('touchstart', e => { e.preventDefault(); fn(); });
            el.addEventListener('click', e => { e.preventDefault(); fn(); });
        };
        abilityHandler($('btn-attack'), heroAttack);
        abilityHandler($('btn-ability1'), heroDash);
        abilityHandler($('btn-ability2'), heroElemental);
        abilityHandler($('btn-ability3'), heroCastleShield);

        $('speed-btn').addEventListener('click', () => {
            gameSpeed = gameSpeed === 1 ? 2 : 1;
            $('speed-btn').textContent = gameSpeed === 1 ? 'x1' : 'x2';
            $('speed-btn').classList.toggle('active', gameSpeed === 2);
        });

        initJoystick();
    }

    function togglePause() {
        if (gameState === 'playing') {
            gameState = 'paused';
            showScreen('pause-screen');
        } else if (gameState === 'paused') {
            gameState = 'playing';
            $('pause-screen').classList.add('hidden');
        }
    }

    function initJoystick() {
        const zone = $('joystick-zone');
        const base = $('joystick-base');
        const thumb = $('joystick-thumb');
        let touchId = null;
        let baseRect;

        zone.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.changedTouches[0];
            touchId = t.identifier;
            baseRect = base.getBoundingClientRect();
            joystickActive = true;
            updateJoystick(t);
        });

        document.addEventListener('touchmove', e => {
            for (const t of e.changedTouches) {
                if (t.identifier === touchId) {
                    updateJoystick(t);
                    break;
                }
            }
        });

        document.addEventListener('touchend', e => {
            for (const t of e.changedTouches) {
                if (t.identifier === touchId) {
                    touchId = null;
                    joystickActive = false;
                    joystickDir.x = 0;
                    joystickDir.y = 0;
                    thumb.style.transform = 'translate(0, 0)';
                    break;
                }
            }
        });

        function updateJoystick(touch) {
            if (!baseRect) return;
            const cx = baseRect.left + baseRect.width / 2;
            const cy = baseRect.top + baseRect.height / 2;
            let dx = touch.clientX - cx;
            let dy = touch.clientY - cy;
            const maxR = baseRect.width / 2;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
            thumb.style.transform = `translate(${dx}px, ${dy}px)`;
            joystickDir.x = dx / maxR;
            joystickDir.y = dy / maxR;
        }
    }

    // ─── RENDER ───
    function animate() {
        animFrame = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        update(dt);
        renderer.render(scene, camera);
    }

    // ─── UTILS ───
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // ─── START ───
    init();
})();
