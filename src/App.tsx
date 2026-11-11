import { useEffect, useRef, useState } from 'react';
import { Game, type CombatHUD } from './game/Game';

// Aelyra düellosu geçici olarak kapalı: boss HUD ve düello butonu gizli
const BOSS_ENABLED = false;

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

interface Prefs {
  sensitivity: number;
  shake: number;
}

const DEFAULT_PREFS: Prefs = { sensitivity: 50, shake: 0.5 };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem('duel-settings') ?? '{}');
    return {
      sensitivity:
        typeof raw.sensitivity === 'number' && raw.sensitivity >= 10 && raw.sensitivity <= 100
          ? raw.sensitivity
          : DEFAULT_PREFS.sensitivity,
      shake: [0, 0.5, 1].includes(raw.shake) ? raw.shake : DEFAULT_PREFS.shake,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const TABS = ['Kontroller', 'Ses', 'Oyun'] as const;
type Tab = (typeof TABS)[number];

const CONTROLS: [string, string][] = [
  ['W A S D', 'Hareket'],
  ['Shift', 'Koş'],
  ['Fareyi sürükle', 'Kamera'],
  ['Tekerlek', 'Yakınlaştır'],
  ['Sol tık / J', 'Saldırı'],
  ['Sağ tık / K', 'Güçlü saldırı'],
  ['Space', 'Takla'],
  ['Tab', 'Hedefe kilitlen'],
  ['Q', 'Çekiç desteği'],
  ['F2', 'Karakter değiştir'],
  ['F3', 'Shaderlar'],
  ['R', 'Düelloyu sıfırla'],
];

function SettingsDialog({
  preferences,
  shaders,
  onChange,
  onShaders,
  onReset,
  onClose,
}: {
  preferences: Prefs;
  shaders: boolean;
  onChange: (p: Prefs) => void;
  onShaders: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('Kontroller');

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      className="settings-panel"
      ref={ref}
      aria-labelledby="settings-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="settings-header">
        <div>
          <div className="settings-caption">Oyun duraklatıldı</div>
          <h1 id="settings-title">Ayarlar</h1>
        </div>
        <button onClick={onClose} aria-label="Ayarları kapat">
          Esc
        </button>
      </header>

      <nav className="settings-tabs" aria-label="Ayar bölümleri">
        {TABS.map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <section className="settings-content" aria-label={tab}>
        {tab === 'Kontroller' && (
          <>
            <h2>Klavye ve fare</h2>
            <dl className="settings-controls">
              {CONTROLS.map(([keys, label]) => (
                <div className="settings-row" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {tab === 'Ses' && (
          <>
            <h2>Ses dengesi</h2>
            <p className="settings-row">Bu sürümde müzik ve ses efektleri henüz eklenmedi.</p>
          </>
        )}

        {tab === 'Oyun' && (
          <>
            <h2>Oyun tercihleri</h2>
            <div className="settings-options">
              <label className="settings-row">
                Kamera hassasiyeti
                <span className="settings-range">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={preferences.sensitivity}
                    onChange={(e) => onChange({ ...preferences, sensitivity: Number(e.target.value) })}
                  />
                  <output>{preferences.sensitivity}</output>
                </span>
              </label>
              <div className="settings-row">
                <span>Kamera sarsıntısı</span>
                <div className="settings-segment" role="group" aria-label="Kamera sarsıntısı">
                  {['Kapalı', 'Az', 'Normal'].map((label, i) => (
                    <button
                      key={label}
                      aria-pressed={preferences.shake === i / 2}
                      onClick={() => onChange({ ...preferences, shake: i / 2 })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <span>Shaderlar</span>
                <button aria-label="Shaderlar" aria-pressed={shaders} onClick={onShaders}>
                  {shaders ? 'Açık' : 'Kapalı'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <footer className="settings-footer">
        <button onClick={onReset}>Varsayılana dön</button>
        <button className="settings-return" onClick={onClose}>
          Oyuna dön
        </button>
      </footer>
    </dialog>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  const upd = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 14;
    const m = Math.hypot(dx, dy);
    if (m > max) {
      dx = (dx / m) * max;
      dy = (dy / m) * max;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / max, -dy / max);
  };

  return (
    <div
      ref={base}
      className="relative h-36 w-36 rounded-full border-4 border-amber-900/60 bg-amber-100/40 backdrop-blur-sm"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        active.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        upd(e);
      }}
      onPointerMove={(e) => active.current && upd(e)}
      onPointerUp={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-900 bg-amber-300 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [paused, setPaused] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [hud, setHUD] = useState<CombatHUD>({
    hp: 200,
    maxHp: 200,
    stamina: 100,
    maxStamina: 100,
    bossHp: 1200,
    bossMaxHp: 1200,
    bossName: 'Aelyra, Kızıl Çiçeğin Kılıcı',
    phase: 1,
    engaged: false,
    move: '',
    selected: 'Mızrak Kız',
    result: 'playing',
    notice: '',
    locked: false,
    shaders: true,
  });

  useEffect(() => {
    if (!mount.current) return;
    const g = new Game(mount.current, () => {}, setHUD);
    game.current = g;
    return () => {
      g.dispose();
      game.current = null;
    };
  }, []);

  useEffect(() => {
    game.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat && !paused) {
        e.preventDefault();
        setPaused(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  useEffect(() => {
    if (game.current) {
      game.current.cameraSensitivity = prefs.sensitivity / 50;
      game.current.cameraShake = prefs.shake;
      try {
        localStorage.setItem('duel-settings', JSON.stringify(prefs));
      } catch {
        /* depolama kapalıysa tercihler kalıcı olmaz */
      }
    }
  }, [prefs]);

  const act = (a: Parameters<Game['action']>[0]) => () => game.current?.action(a);

  const btn =
    'select-none rounded-full border-4 border-amber-900 font-extrabold text-amber-950 shadow-[0_4px_0_#6b4420] active:translate-y-1 active:shadow-none';
  const bossPct = Math.max(0, Math.min(1, hud.bossHp / hud.bossMaxHp));
  const bossBarWidth = 988 * bossPct;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mount} className="absolute inset-0" />

      <button className="settings-launch" onClick={() => setPaused(true)} aria-haspopup="dialog">
        Ayarlar <kbd>Esc</kbd>
      </button>
      {paused && (
        <SettingsDialog
          preferences={prefs}
          shaders={hud.shaders}
          onChange={setPrefs}
          onShaders={act('shaders')}
          onReset={() => {
            setPrefs(DEFAULT_PREFS);
            if (!hud.shaders) game.current?.action('shaders');
          }}
          onClose={() => setPaused(false)}
        />
      )}

      <div className="vitals-panel" aria-label="Oyuncu durumu">
        <div
          className="vital-track"
          role="progressbar"
          aria-label="Can"
          aria-valuenow={hud.hp}
          aria-valuemin={0}
          aria-valuemax={hud.maxHp}
        >
          <div className="vital-fill health-trail" style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} />
          <div className="vital-fill health-fill" style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} />
        </div>
        <div
          className="vital-track stamina-track"
          role="progressbar"
          aria-label="Stamina"
          aria-valuenow={Math.floor(hud.stamina)}
          aria-valuemin={0}
          aria-valuemax={hud.maxStamina}
        >
          <div className="vital-fill stamina-fill" style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }} />
        </div>
      </div>

      <div className={`boss-hud ${isTouch ? 'boss-hud-touch' : ''}`} style={BOSS_ENABLED ? undefined : { display: 'none' }}>
        <div className="boss-heading">{hud.bossName}</div>
        <div
          role="progressbar"
          aria-label={`${hud.bossName} canı`}
          aria-valuenow={hud.bossHp}
          aria-valuemin={0}
          aria-valuemax={hud.bossMaxHp}
        >
          <svg className="boss-health-track" viewBox="0 0 993 15" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0.2" y="0.2" width="992" height="14" fill="#101112" />
            <rect x="0.1" y="0.1" width="992.2" height="14.2" stroke="#777874" strokeOpacity=".2" strokeWidth=".2" fill="none" />
            <rect x="2.2" y="2.2" width="988" height="10" fill="#242527" />
            <rect x="2.2" y="2.2" height="10" fill="#685B5B" className="boss-health-trail" style={{ width: bossBarWidth }} />
            <rect x="2.2" y="2.2" height="10" fill="#FF3D41" style={{ width: bossBarWidth }} />
            <rect x="2.2" y="2.2" height="1" fill="#C44548" style={{ width: bossBarWidth }} />
          </svg>
        </div>
      </div>

      {hud.result !== 'playing' && (
        <div className={`result-overlay ${hud.result}`}>
          <div className="result-card">
            <h1>{hud.result === 'victory' ? 'ZAFER' : 'ÖLDÜN'}</h1>
            <button onClick={act('reset')}>
              {hud.result === 'victory' ? 'Tekrar oyna' : 'Yeniden dene'} <span>R</span>
            </button>
          </div>
        </div>
      )}

      <div className="duel-actions">
        {BOSS_ENABLED && !hud.engaged && hud.result === 'playing' && (
          <button className="duel-start" onClick={act('duel')}>
            ⚔ Düelloyu başlat
          </button>
        )}
        {isTouch && (
          <button className="duel-start" onClick={act('lock')}>
            {hud.locked ? '◈ Kilit açık' : '◈ Hedef kilidi'}
          </button>
        )}
      </div>

      {isTouch && (
        <>
          <div className="absolute bottom-6 left-6">
            <Joystick onChange={(x, y) => game.current?.setStick(x, y)} />
          </div>
          <div className="absolute bottom-6 right-5 flex flex-col items-end gap-3">
            <button className={`${btn} bg-amber-100 px-4 py-2 text-xs`} onClick={act('switch')}>
              Karakter değiştir
            </button>
            <div className="flex gap-3">
              <button className={`${btn} h-14 w-14 bg-sky-200 text-xs`} onPointerDown={act('roll')}>
                Takla
              </button>
              <button className={`${btn} h-14 w-14 bg-orange-300 text-xs`} onPointerDown={act('hammer')}>
                Çekiç
              </button>
            </div>
            <div className="flex gap-3">
              <button className={`${btn} h-16 w-16 bg-rose-300 text-xs`} onPointerDown={act('heavy')}>
                Atılış
              </button>
              <button className={`${btn} h-20 w-20 bg-amber-300 text-sm`} onPointerDown={act('attack')}>
                Saldırı
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
