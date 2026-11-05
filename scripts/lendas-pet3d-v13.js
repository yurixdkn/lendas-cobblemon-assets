/*
 * Lendas Cobblemon V13 — um único seguidor WebGL com modelos GLTF reais.
 * Pikachu no tema claro; Rayquaza shiny no escuro. Nenhuma imagem 2D é criada.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (finePointer && !reducedMotion && !window.__lendasPet3DV13Ready) {
  window.__lendasPet3DV13Ready = true;
  window.__lendasPet3DV12Ready = true;
  /* Também impede a inicialização de módulos V11/V12 atrasados. */
  window.__lendasPet3DReady = true;
  initPet();
}

function initPet() {
  const legacySelector = '.lendas-pet-follower, .lendas-pointer-pokemon, .lendas-pet-cursor, .lendas-pikachu';
  /* O seguidor fica correto mesmo se o CSS novo não for importado na loja. */
  if (!document.getElementById('lendas-pet3d-v13-style')) {
    const style = document.createElement('style');
    style.id = 'lendas-pet3d-v13-style';
    style.textContent = `
      .lendas-pet-follower,.lendas-pointer-pokemon,.lendas-pet-cursor,.lendas-pikachu {display:none!important}
      .lendas-pet3d-host {position:fixed;top:0;left:0;z-index:2147483000;
        width:152px;height:152px;pointer-events:none;opacity:0;
        transform:translate3d(-200px,-200px,0);transition:opacity .2s;will-change:transform}
      .lendas-pet3d-host.is-visible {opacity:1}
      .lendas-pet3d-host[data-lendas-pet="dark"] {width:172px;height:172px}
      .lendas-pet3d-host canvas {display:block;width:100%;height:100%;background:transparent}
      .lendas-pet3d-shadow {position:absolute;bottom:15px;left:25%;width:50%;height:13px;
        background:rgba(0,0,0,.28);filter:blur(7px);border-radius:50%}
      @media (max-width:740px),(pointer:coarse),(prefers-reduced-motion:reduce) {
        .lendas-pet3d-host {display:none!important}
      }
    `;
    document.head.appendChild(style);
  }
  document.querySelectorAll(legacySelector + ', .lendas-pet3d-host').forEach(node => node.remove());
  /* Um script antigo em cache não pode colocar um segundo Pikachu depois. */
  const dedupe = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.matches?.(legacySelector)) node.remove();
      }
    }
  });
  dedupe.observe(document.body, { childList: true });

  const host = document.createElement('div');
  host.className = 'lendas-pet3d-host';
  host.setAttribute('aria-hidden', 'true');
  const shadow = document.createElement('span');
  shadow.className = 'lendas-pet3d-shadow';
  host.appendChild(shadow);
  document.body.appendChild(host);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    host.remove();
    console.warn('[Lendas] WebGL indisponível para o seguidor 3D.', error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(152, 152);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  /* Mantém sombra abaixo do canvas sem bloquear cliques. */
  host.insertBefore(shadow, renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 60);
  camera.position.set(0, .25, 5.6);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(2.5, 5, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb0d5ff, .7);
  fill.position.set(-3, 1, -2);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  const loader = new GLTFLoader();
  const githubModels = 'https://raw.githubusercontent.com/yurixdkn/lendas-cobblemon-assets/main/media/models/';
  const assets = {
    light: { path: '/media/models/pikachu_male.geo.gltf', remote: githubModels + 'pikachu_male.geo.gltf', idle: 'ground_idle', walk: 'ground_walk' },
    dark: { path: '/media/models/rayquazashiny.geo.gltf', remote: githubModels + 'rayquazashiny.geo.gltf', idle: 'ground_idle' }
  };
  const cache = {};
  const problems = {};
  const origins = {};
  let mode = document.documentElement.dataset.lendasTheme === 'light' ? 'light' : 'dark';
  let canvasSize = 152;
  let wantedYaw = 0;
  let yaw = 0;
  let x = -200, y = -200, targetX = -200, targetY = -200;
  let lastPointerX = null, lastPointerY = null;
  let lastPointerAt = 0, moveUntil = 0;
  let visible = false;
  let frame = 0;
  let previousTime = 0;
  let hideTimer = 0;

  const active = () => cache[mode] || null;
  const isCurrentReady = () => Boolean(active());
  const showCurrent = () => {
    for (const [key, entry] of Object.entries(cache)) entry.pivot.visible = key === mode;
    /* Nunca deixar o Pikachu representando o tema escuro, mesmo durante o carregamento. */
    host.dataset.lendasPet = mode;
    const desiredSize = mode === 'dark' ? 172 : 152;
    if (canvasSize !== desiredSize) {
      canvasSize = desiredSize;
      renderer.setSize(canvasSize, canvasSize);
    }
    const shouldShow = visible && isCurrentReady();
    host.classList.toggle('is-visible', shouldShow);
    if (shouldShow) wake();
  };

  function installModel(gltf, key) {
    const model = gltf.scene;
    const pivot = new THREE.Group();
    pivot.visible = false;
    pivot.add(model);
    root.add(pivot);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error('A geometria GLTF não tem dimensões visíveis.');
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    /* Centraliza cada espécie e adapta o comprimento do Rayquaza à área do mouse. */
    const biggest = Math.max(size.x, size.y, size.z);
    const desired = key === 'dark' ? 3.05 : 2.4;
    const factor = desired / Math.max(biggest, .01);
    model.position.set(-center.x * factor, -center.y * factor, -center.z * factor);
    model.scale.setScalar(factor);
    model.traverse(node => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (!material) continue;
        material.side = THREE.DoubleSide;
        if (material.map) {
          material.map.magFilter = THREE.NearestFilter;
          material.map.needsUpdate = true;
        }
      }
    });
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
    const findAnimation = token => gltf.animations.find(clip => clip.name.endsWith('.' + token));
    const idleClip = findAnimation(assets[key].idle);
    const walkClip = assets[key].walk && findAnimation(assets[key].walk);
    const idleAction = mixer && idleClip ? mixer.clipAction(idleClip) : null;
    const walkAction = mixer && walkClip ? mixer.clipAction(walkClip) : null;
    if (idleAction) idleAction.play();
    cache[key] = { pivot, mixer, idleAction, walkAction, walking: false };
    showCurrent();
  }

  function loadModel(key) {
    const onLoad = gltf => {
      try { installModel(gltf, key); } catch (error) {
        problems[key] = String(error);
        console.error('[Lendas] Modelo 3D inválido:', key, error);
      }
    };
    /* Arquivos confirmados no GitHub: evita erros do importador de modelos da loja. */
    loader.load(assets[key].remote, gltf => {
      origins[key] = 'GitHub';
      onLoad(gltf);
    }, undefined, error => {
      /* Suporta também o ZIP quando a CentralCart aceitar arquivos .gltf. */
      console.warn('[Lendas] Tentando modelo incluído no template:', key, error);
      loader.load(assets[key].path, gltf => {
        origins[key] = 'CentralCart';
        onLoad(gltf);
      }, undefined, fallbackError => {
        problems[key] = String(fallbackError);
        console.error('[Lendas] Nenhum endereço carregou o modelo 3D:', key, fallbackError);
      });
    });
  }
  loadModel('light');
  loadModel('dark');

  function setWalking(entry, walk) {
    if (!entry.walkAction || !entry.idleAction || entry.walking === walk) return;
    entry.walking = walk;
    const from = walk ? entry.idleAction : entry.walkAction;
    const to = walk ? entry.walkAction : entry.idleAction;
    to.reset().play();
    to.crossFadeFrom(from, .17, true);
  }

  function tick(now) {
    frame = 0;
    if (!host.isConnected || document.hidden) return;
    const dt = Math.min(Math.max((now - (previousTime || now)) / 1000, 0), .05);
    previousTime = now;
    x += (targetX - x) * Math.min(1, dt * 17);
    y += (targetY - y) * Math.min(1, dt * 17);
    host.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    const angleDelta = Math.atan2(Math.sin(wantedYaw - yaw), Math.cos(wantedYaw - yaw));
    yaw += angleDelta * Math.min(1, dt * 9);
    root.rotation.y = yaw;
    root.rotation.x = -0.08 + .04 * Math.sin(now / 700);
    root.position.y = .055 * Math.sin(now / 310);
    const entry = active();
    if (entry) {
      setWalking(entry, now < moveUntil);
      entry.mixer?.update(dt);
    }
    renderer.render(scene, camera);
    if (visible) wake();
  }
  function wake() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const vx = lastPointerX === null ? 0 : event.clientX - lastPointerX;
    const vy = lastPointerY === null ? 0 : event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerAt = performance.now();
    targetX = Math.max(0, Math.min(window.innerWidth - canvasSize, event.clientX + 13));
    targetY = Math.max(0, Math.min(window.innerHeight - canvasSize, event.clientY + 9));
    if (!visible) { x = targetX; y = targetY; }
    if (Math.hypot(vx, vy) > 2) {
      /* O GLTF veio de costas: ao descer mostramos a FRENTE; ao subir, as COSTAS. */
      wantedYaw = Math.atan2(vx, -vy);
      moveUntil = lastPointerAt + 230;
    }
    visible = true;
    showCurrent();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
      host.classList.remove('is-visible');
      setTimeout(() => {
        if (!visible && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      }, 260);
    }, 3500);
    wake();
  }, { passive: true });
  const hide = () => { visible = false; host.classList.remove('is-visible'); };
  document.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', () => {
    previousTime = 0;
    if (!document.hidden && visible) wake();
  });
  document.addEventListener('lendas:themechange', event => {
    mode = event.detail?.mode === 'light' ? 'light' : 'dark';
    showCurrent();
    wake();
  });
  /* Sincroniza também com controladores de tema antigos que não emitem evento. */
  new MutationObserver(() => {
    const next = document.documentElement.dataset.lendasTheme === 'light' ? 'light' : 'dark';
    if (mode !== next) {
      mode = next;
      showCurrent();
      wake();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lendas-theme'] });

  /* Facilita a checagem do carregamento no Console do navegador. */
  window.lendasPet3DStatus = () => ({
    tema: mode,
    temaNaPagina: document.documentElement.dataset.lendasTheme,
    modelos: Object.keys(cache),
    origens,
    problemas: problems,
    carregado: Boolean(active()),
    visivel: host.classList.contains('is-visible')
  });
}
