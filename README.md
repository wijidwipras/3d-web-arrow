# Gesture AR Viewer

Aplikasi web AR sederhana: webcam memenuhi layar, rangka tangan terlihat di atas video, busur Blender mengikuti tangan pertama, dan anak panah mengikuti tangan kedua. Dokumen [PRD awal](docs/PRD_Gesture_3D_Web_Viewer.md) menjelaskan versi dua panel; implementasi saat ini mengikuti rancangan AR yang menggantikannya.

## Menjalankan

Memerlukan Node.js 20.19+ atau 22.12+, browser modern dengan WebGL, dan webcam.

```bash
npm install
npm run dev
```

Buka alamat `localhost` dari Vite. Pada kunjungan pertama, klik **Mulai AR** dan izinkan akses kamera. Jika izin kamera sudah tersimpan, aplikasi mencoba memulai otomatis. Deployment publik memerlukan HTTPS.

```bash
npm test
npm run build
npm run preview
```

## Cara memakai

1. Tampilkan satu tangan utuh di depan kamera, lalu buka lima jari sekitar 150 ms. Rangka biru kehijauan akan mengikuti tangan dan busur muncul melintang di telapak. Setelah muncul, tangan boleh mengepal untuk memegang busur. Jika tangan keluar dari frame lebih dari 350 ms, buka lima jari lagi untuk memunculkannya kembali.
2. Angkat tangan kedua dan luruskan telunjuk serta jari tengah sekitar 200 ms. Gesture **Victory** dikenali langsung; pose dua jari yang rapat juga diperiksa dari titik tangan. Rangka jingga menandai tangan kedua, lalu anak panah muncul di tangan tersebut dan berputar mengikuti arah dua jari.
   Peran tangan terkunci selama kamera aktif: jika tangan busur keluar dari frame, tangan panah tetap menjadi tangan panah. Matikan dan hidupkan kamera untuk memulai penetapan peran dari awal.
3. Dekatkan pangkal panah ke tengah tali busur, lalu cubit ibu jari dan telunjuk pada tangan panah. Gerakkan tangan tersebut menjauhi busur untuk menarik tali. Buka cubitan untuk menembak. Tarikan sangat pendek hanya melepas kait tanpa menembak. Setelah panah meluncur, tunjukkan dua jari lagi untuk menyiapkan panah baru.
4. Buka **Pengaturan** di kanan atas untuk menyalakan atau mematikan rangka, busur, dan anak panah, serta mengatur posisi, ukuran, dan putaran busur.
5. Klik **Matikan Kamera** di bawah untuk menghentikan semua track video dan inferensi.

Video dan landmark diproses di browser. Aplikasi tidak merekam atau mengunggah frame maupun hasil tracking.

## Aset dan struktur

- `public/models/busur.glb` berasal dari `docs/ice_crystal_fantasy_bow.glb`.
- `public/models/anak-panah.glb` adalah aset demo sederhana dari `scripts/generate_arrow.py` dan dapat diganti dengan ekspor Blender final.
- `public/mediapipe/` menyimpan model Gesture Recognizer dan runtime WASM secara lokal.
- `src/features/camera/useGestureCamera.ts` mengelola stream, inferensi, status, dan cleanup.
- `src/features/ar/handPose.ts` memetakan landmark ke viewport video yang dicerminkan dan menghitung posisi busur.
- `src/features/ar/handRoles.ts` mempertahankan peran busur/panah ketika urutan hasil deteksi dua tangan berubah.
- `src/features/ar/twoFingerGate.ts` menstabilkan gesture dua jari sebelum anak panah ditampilkan.
- `src/features/ar/archeryInteraction.ts` mengatur kait, tarikan, pelepasan, dan kecepatan panah.
- `src/components/HandOverlay.tsx` menggambar rangka tangan.
- `src/components/ARViewer.tsx` merender busur 3D pada canvas transparan.
- `src/config/arConfig.ts` mengatur path model, batas resolusi render (DPR 2), dan jarak antar inferensi (50 ms). Canvas rangka tangan hanya mengubah ukuran buffer saat viewport berubah.

Untuk mengganti busur, ekspor model Blender ke `.glb`, lalu sesuaikan path `bowModelSrc` di `src/config/arConfig.ts`. Pivot pegangan dan orientasi model memengaruhi hasil AR; gunakan panel kalibrasi untuk penyetelan pada perangkat nyata.

## Batasan

Ini adalah AR berbasis satu webcam dengan dua jangkar tangan pada layar. Ukuran model mengikuti lebar telapak sebagai perkiraan jarak. Tali ditarik dan panah meluncur dalam bidang layar 2D; badan busur belum melentur dan belum ada pelacakan kedalaman atau occlusion yang membuat jari menutupi sebagian model. Ketepatan posisi, ambang cubitan, dan performa perlu diuji dengan webcam nyata pada perangkat target, terutama saat dua tangan saling berdekatan atau keluar dari frame.
