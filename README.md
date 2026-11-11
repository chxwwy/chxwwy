# chxwwy

## Kızıl Çiçek Düellosu – Anime Combat

3D souls-like düello oyunu (React 19 + Three.js + Vite). Katedral sahnesi `src/assets/katedral.glb` (Blender'dan dışa aktarıldı) ve `src/assets/Agmena.ttf` yazı tipi ile gelir.

```bash
npm ci
npm run dev     # geliştirme sunucusu
npm run build   # tek dosyalık çıktı: dist/index.html
```

Ana dosyalar:
- `src/App.tsx` – arayüz (HUD, Ayarlar paneli, dokunmatik kontroller)
- `src/game/Game.ts` – oyun döngüsü, kamera, dövüş
- `src/game/world.ts` – katedral sahnesi, pencere ışık huzmeleri, toz parçacıkları
- `src/index.css` – stil
