# BIG PROMPT EKSEKUSI UNTUK FABLE 5.2
## Sketchbook Universe — Audit Can, Pemulihan Animasi, Koreografi Cerita, Tutorial Gestur, NUI dan Integrasi REST Dias

**Tanggal:** 10 November 2026  
**Pelaksana utama:** Claude Fable 5.2 sebagai **lead, planner, integrator, reviewer akhir**.  
**Tim implementasi:** **Haiku Max** sebagai model seluruh worker/agent teammate, dengan jumlah paralel sesuai dependensi, memori, dan kapasitas alat. Validasi model ID yang benar-benar ada di instalasi Claude sebelum dispatch, jangan mengganti diam-diam.  
**Plugin terpasang menurut Owner:** Superpowers dan Caveman. Cek API/skill/plugin aktif di lingkungan nyata, jangan berpura-pura sudah dipanggil.  
**Lampiran wajib:** `PANDUAN-UTAMA-NUI-MEDIAPIPE-KOMBINASI-2026-11-10.md` untuk detail pipeline kamera/NUI.  
**Status:** Instruksi implementasi. Dokumen ini tidak menyatakan code atau fitur telah selesai dijalankan.

> **INSTRUKSI UTAMA OWNER.** Audit dan pahami **semua frontend Can dan logika game** terlebih dahulu. Pulihkan animasi yang belakangan dipercepat, lalu susun dan jalankan rencana komprehensif bersama agent team, tidak menghapus **satu pun** permintaan Owner dalam brief. Kalian boleh mengusulkan penyempurnaan UX, gesture, dan pipeline berdasarkan source/runtime, tetapi setiap perubahan terhadap perilaku yang disebut Owner harus dicatat sebagai delta yang terlihat beserta alasannya. Produk hanya mempunyai **TIGA LEVEL**, tidak ada Level 4 dan jangan membuat materi pembuktian Bab 4 yang tidak diminta. Fokus pada pengalaman siswa nyata, bukan demonstrasi tes yang merusak animasi.

---

## Daftar isi

1. Hierarki instruksi dan sumber kebenaran terbaru
2. Batas scope repo monorepo, Can dan Dias
3. Mode kerja Fable, Superpowers, Caveman dan agent team Haiku Max
4. Audit menyeluruh sebelum planning dan implementasi
5. Invariant produk, prioritas UX dan regresi animasi
6. Storyboard scene-by-scene dari cover ke portal
7. Tutorial tiga kartu, praktik gesture dan syarat kelulusan
8. Tiga level, dialog Momo, prediksi dan gameplay
9. NUI, gestur kontekstual dan handoff ke panduan MediaPipe
10. REST API Dias, provenance prediksi dan logging
11. Penutup, rekap, kuis/survei optional
12. Pembagian kerja agent teammate dan file ownership
13. Tahap eksekusi, quality gate dan bukti
14. Dokumentasi, perubahan keputusan dan pelaporan
15. Matriks non-negotiable agar tidak ada kebutuhan terhapus
16. Lampiran brief Owner sebagai pengikat semantik

---

## 1. Hierarki instruksi dan sumber kebenaran

### 1.1 Periksa source yang benar-benar terbaru, bukan file proyek GPT lama

**Sebelum planning atau mengedit kode**: buka checkout repo yang sedang digunakan dan periksa `git status`, branch, remote, HEAD SHA, `git log` beberapa commit terbaru, layout, working tree, build configuration, dan `AGENTS.md` root. Temukan lokasi ekosistem Can dan baca, dalam urutan yang sesuai aturan repo aktual:

- `contexts/can/AGENTS.md` dan dokumen navigasi Can;
- **`contexts/can/DECISIONS.md` pada branch yang benar-benar sedang dikerjakan**, utamanya `claude-monorepo` atau branch kerja yang diturunkan darinya. Referensi target Owner: https://github.com/lustresense/hitl-momo/blob/claude-monorepo/contexts/can/DECISIONS.md ;
- `contexts/can/SOUL.md`, `contexts/can/SOURCE_OF_TRUTH.md` bila ada;
- `contexts/can/NOW.md`, catatan progres dan design/prototype terkini yang relevan;
- `contracts/`, shared architecture, `CHANGELOG.md` engineering root, `frontend/implementation/`;
- **hanya** dokumen/kode Dias yang relevan untuk integrasi API dan dashboard, bukan seluruh konteks privat Dias tanpa kebutuhan.

**Catatan penyusun:** URL `contexts/can/DECISIONS.md` terbaru tidak bisa dibaca lewat web di sesi penyusunan prompt ini. Oleh sebab itu, JANGAN berpura-pura file lama yang terlampir di ChatGPT merupakan keputusan paling baru. Fable wajib membuka file dalam checkout dan menyebut SHA versi yang dibaca. Bila tautan berbeda dari checkout, catat perbedaan dan pilih aturan instruksi owner terbaru + keputusan repo yang berlaku. Hapus kebiasaan mengasumsikan progres atau fitur dari `WORKING_STATE.md` proyek GPT lama sebagai bukti status runtime.

Prioritas saat konflik: **instruksi terbaru Owner dalam prompt ini** > keputusan aktif dari `contexts/can/DECISIONS.md` terbaru > `AGENTS.md` dan aturan proyek yang sesuai scope > source/asset/runtime terbaru > dokumen planning lama > arsip percakapan. Bila ada konflik dokumentasi/implementasi, tulis tabel `existing -> requested -> conflict -> resolution/approval`. Jangan diam-diam membangkitkan fitur yang telah dicabut.

### 1.2 Tiga level saja dan bukan Bab 4

Jangan membuat Level 4, halaman Level 4, progression Level 4, tes 'level 4', atau copy yang menyiratkan level keempat. Hanya Level 1, 2, 3. **Jangan membuat bagian 'Bab 4 pembuktian'** sebagai requirement fitur. Telemetri/tes software tidak berarti menambah level, bab naskah, atau beban studi akademik. Kuis/survei bersifat tahap terpisah pada penutup, bukan level baru.

## 2. Scope dan batas monorepo

**Can/Owner** berwenang pada game siswa, canvas, UI/UX, interaction, onboarding, visual/animasi Momo, physics/game state, tutorial gesture, MediaPipe camera input serta REST client. Lingkup implementasi utama adalah `frontend/implementation/` dan `contexts/can/` yang benar-benar dipakai di repo. **Dias** memegang model prediksi, server FastAPI, dataset/training, database, dashboard/admin dan API kontrak server. Hindari mengganti backend Dias, model inferensi atau data training secara diam-diam. API tidak boleh dibuat palsu di client untuk mengklaim prediksi 'sungguhan'.

Root `AGENTS.md` adalah router AI netral untuk monorepo, bukan aturan pribadi Can untuk Dias. Jangan menulis atau mengubah `contexts/dias/` kecuali perubahan kontrak yang disepakati, dan jika perlu implementasi server Dias, buat task handoff/PR terpisah sesuai ownership. Jaga `DECISIONS.md` Can dan `CHANGELOG.md` engineering tetap berbeda jenis dokumen.

Owner meminta **bekerja di bawah scope Can**, bukan menjadikan prompt ini aturan global untuk semua project/agent. Tidak perlu membuat `CLAUDE.md` baru di root. Hormati source Git terverifikasi, jangan force push, jangan memperbarui `main` tanpa izin yang memang diberikan oleh Owner untuk kegiatan itu, jangan deploy tanpa mengetahui target dan rollback.

## 3. Orkestrasi AI dan plugin yang wajib dicoba dengan benar

### 3.1 Fable 5.2 sebagai pemilik keputusan integrasi

Fable bertanggung jawab atas audit, arsitektur, dependency plan, penugasan file yang tidak tumpang tindih, quality gate, integrasi, koreksi cross-feature, dan review akhir terhadap user brief. **Jangan menyerahkan prioritas produk atau keputusan ambigu ke Haiku tanpa pengawasan.** Semua implementer worker **Haiku Max** jika model ID itu benar-benar tersedia; cek `agents/model` support dan tulis bukti konfigurasi. Jika tidak tersedia, laporkan blocker spesifik dan tunggu keputusan model pengganti, jangan diam-diam menjalankan model lain sambil mengaku 'Haiku Max'.

### 3.2 Superpowers

Plugin Superpowers **sudah diinstall menurut Owner**, jangan memasang ulang tanpa alasan. Inspect skill aktual yang terpasang, gunakan workflow yang didukung (mis. brainstorming/audit intent → writing-plans → worktree isolation → agent-team/subagent-driven execution → TDD bila sesuai), tetapi jangan memaksa skill yang mengganti instruksi Owner dengan template generik atau membuang detail scene. Planning harus menghasilkan task per file, dependency, acceptance observables, edge cases dan owner. User meminta eksekusi tanpa tersendat karena laporan fase, jadi teruskan task independen selama aman; berhenti hanya pada perubahan produk yang benar-benar membutuhkan persetujuan atau blocker keamanan.

Jika Agent Teams native Claude tersedia, bentuk tim dengan teammate, task board, batas ownership yang tegas, dependensi eksplisit, check-ins berisi bukti. Jangan membentuk dua writer pada file/router/state yang sama. Jika Agent Teams tidak tersedia, gunakan subagent native dengan kontrak yang setara dan nyatakan perbedaannya. **'Spawn sebanyak mungkin' berarti sebanyak tugas independen yang aman dan sumber daya cukup**, bukan memaksakan maksimal worker hingga bentrok atau boros.

### 3.3 Caveman, hanya untuk balasan, bukan transformasi kode

Plugin Caveman sudah diinstall menurut Owner. **Gunakan hanya untuk gaya jawaban/ringkasan kepada Owner**, bila memang tersedia. Ia tidak boleh meringkas, mengubah, 'mengefisiensikan', atau mengompresi **source code, test, JSON, dokumentasi kontrak, UI copy, animasi keyframe, scene storyboard, nama aset, maupun prompt worker**. Pastikan aturan code/commit tetap normal dan lengkap. Jika auto mode Caveman mengganggu penulisan kode atau diwariskan ke worker, atur session mode off/normal pada pipeline penulisan kode dan aktifkan gaya ringkas **hanya** ketika menyampaikan progress atau laporan user sesuai kemampuan plugin. Jangan mengklaim override keamanan atau tool policy. Bila pluginnya hanya mendukung mode global, dahulukan integritas kode/dokumen, lalu balas owner secara manual ringkas tanpa mengaktifkan transformasi code.

### 3.4 Anti laporan kosong

Setiap laporan kemajuan menyebut file/fitur yang benar-benar berubah, tests/visual check yang sudah dilakukan dan hasilnya, risiko, dan next tool/task. Model klaim PASS tanpa bukti bukan proof. **Jangan mempersingkat durasi animasi hanya supaya automation test lebih cepat.** Owner telah mengeluhkan hal ini dan ingin prioritas visual restoration dahulu.

## 4. Audit kode menyeluruh sebelum planning

Wajib lakukan audit keadaan sekarang:

1. Petakan game scene FSM, React/hooks/state-machine, styling, asset Momo, physics engine, canvas, camera input, gesture detection, route/level selection, cards, dialog bubble, popup Top-3, keputusan HITL dan Game Over/portal.
2. Temukan commit/perubahan yang membuat animasi cover, kartu bertumpuk, pembukaan buku, penggaris dan dialog menjadi terlalu cepat. Bandingkan histori lokal/ref yang tersedia dan ambil timing **sebelum regresi** sebagai baseline yang dirasakan natural, bukan set angka sembarangan.
3. Temukan Momo sleeping loop, wake, blink, levitation, transition; bedakan ada artwork, imported, mounted dan sungguh tampil runtime. Jika sleep hanya stacking sprite statis, laporkan regresi.
4. Audit posisi kamera cover (tengah), minipreview (pojok kiri), koordinat ketika bergerak, easing dan z-index. Video asli dan hasil tracking tidak boleh hilang saat elemen berpindah.
5. Audit seluruh gesture mapping, nudge UI, progress ring, feedback, premature tutorial completion, loop 10 detik, idle detection, perbedaan input mouse/camera dan respons tanpa kamera.
6. Audit integrasi klasifikasi real Dias vs mock, contract request strokes, returned Top-3/confidence, session data, timeout/retry/error dan logging decision; jangan sentuh backend Dias tanpa scope.
7. Audit apa yang sudah berfungsi pada Level 1/2/3 dan jangan mengutak-atik bagian level yang Owner sudah bilang oke kecuali ada bukti cacat.
8. Baca `contexts/can/DECISIONS.md` dari repo aktif, bukan memori lama. Cantumkan daftar konflik dan status `BELUM DIBUKTIKAN` bila source belum ditemukan.

Keluaran awal Fable adalah `CAN-FRONTEND-AUDIT.md` (file path nyata, status implemented/mock/broken/untested), `CAN-UX-STORYBOARD.md` (urutan, transisi, input, dialog), `CAN-IMPLEMENTATION-PLAN.md` (dependency dan teammate ownership), kemudian eksekusi. Tidak cukup hanya membuat ketiga dokumen, Owner minta implementasi.

## 5. Batas UX dan animasi yang tidak boleh dilanggar

- Animasi cover, membuka buku, kartu stacked/bifold, Momo sleep/wake, kamera shrink/move, Momo fly/emphasis, penggaris dan kartu tutorial **harus dipulihkan timing-nya ke wajar**. Jangan lagi mempercepat animasi untuk test. Durasi/easing konkret diperoleh dari audit versi yang dianggap normal atau dievaluasi berdasarkan pengalaman siswa, bukan tanpa alasan.
- Palet oranye/hijau, tekstur dots/paper, outline/bayangan prototype yang terkunci di keputusan terbaru dipertahankan sampai user memilih arah lain. Jangan redesign total atau mengganti karakter.
- Momo merupakan pendamping **text-bubble**, bukan chatbot generatif dan bukan kreator objek. Pengguna/Illustrator yang menggambar objek. Momo dapat ekspresif, tidur, bangun, melayang, menyapa, memberi petunjuk, membaca cerita dan menebak dari API model, tetapi tidak memakai NLP, voice atau percakapan bebas.
- Prioritaskan hierarki interaksi → gameplay/storyline → edukasi. Tidak boleh menjejalkan teks terlalu panjang, overlay salah tempat, text melindas area gerak, ataupun ring konfirmasi sebelum action selesai.
- Semua UI gesture harus intuitif untuk siswa SMP kelas 7–9. Fallback keyboard ada tetapi **jangan ditampilkan sejak awal**. Jangan membuat keadaan yang tanpa kamera tidak bisa dilalui.
- Jangan melompat dari satu scene langsung ke scene berikutnya karena state auto-complete, invisible skip, atau animasi dipercepat. Satu confirmation = satu event dengan anti-double-trigger.

## 6. Storyboard lengkap dan urutan scene (keharusan Owner)

### 6.1 Cover Sketchbook Universe dan Momo tidur

1. Masih di cover buku. Momo **ada di kanan** dan benar-benar **TIDUR dalam animasi loop**: bukan hanya gambar bertumpuk atau sprite sekadar ganti posisi, tetapi tidur bernapas/gerak natural; tidak kelihatan melek terus.
2. Kamera awal berada **di tengah** cover dengan treatment besar sesuai source. Saat user mengizinkan kamera, tampilan harus tetap jelas dan konteks waving tersedia. User menghendaki kamera **mengecil menjadi kotak kecil di pojok kiri, melalui animasi mengerucut/shrink lalu berpindah**, seperti preview pada halaman-halaman berikutnya.
3. Trigger interaksi adalah user **melambaikan tangan / waving (dada-dada)** yang terdeteksi, bukan hanya menunggu timer. Ketika waving pertama dikenali, Momo bangun bertahap: masih berkedip, membuka mata, bereaksi, lalu melayang ke tengah, dengan emphasis lebih besar. Kamera bergerak tengah → kiri atas kecil dengan animasi yang natural pada transisi terkait waving. **Ada dua penyebutan timing dalam brief Owner (setelah kamera on dan setelah waving)**. Fable wajib menjaga kedua keadaan UI dan mengusulkan choreography terukur; jangan menghapus salah satunya tanpa menunjukkan kompromi dan bukti UX.
4. Teks instruksi eksplisit “Lambaikan tanganmu” **hilang** dari tampilan utama. Guidance harus bersifat intuitif dari Momo yang melambai/menyapa, arahan visual subtle yang tidak mengganggu, dan feedback kamera. Jika butuh recovery karena no wave, tampilkan bantuan progresif, bukan memaksa user menebak gestur selamanya.
5. Momo langsung menyapa/dada-dada, kemudian bubble ditempatkan tepat dan tidak menutupi wajah/elemen penting. Copy naratif Owner perlu diperbaiki redaksinya tanpa menghilangkan maknanya:
   - “Aku Momo, gambar satu-satunya yang hidup di dunia **Sketchbook Universe**.”
   - “Aku barusan menemukan **Tinman**. Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku.”
   - “Yuk, antar dia ke tempat yang tepat.”
   Teks **Tinman** ditebalkan. Bila repo memakai ejaan Thinman, audit lalu konsistenkan source berdasarkan keputusan terbaru; jangan ganti diam-diam. Momo bukan pencipta gambar.
6. Dialog Momo diberi acknowledgment **thumbs-up sebagai tanda ‘aku mengerti’**. Gesture tidak boleh menyela/bypass dialog sebelum selesai dibaca. UI ring progress terlihat saat sudah eligible dan diterangkan secara natural.

### 6.2 Membuka buku dan layar penggaris/nomor absen

1. Setelah intro Momo selesai, lakukan **transisi membuka buku ke atas** yang terlihat, tidak dipotong/tiba-tiba pindah scene. Pemakaian kata `red`/detail efek yang Owner ucapkan saat menceritakan transisi harus diperiksa di asset/source, jangan mengarang scene baru atau menghapus transisi.
2. Masuk ke **penggaris yang hanya berisi angka dan bentuk penggaris**. Bukan halaman isian yang disesaki elemen. Momo muncul besar **di tengah sebagai emphasis**, sementara latar elemen lain agak gelap (dimmed).
3. Momo mengajak user memilih nomor absen terlebih dahulu. Draft copy: “Sebelum kita masuk, pilih nomor absenmu dulu, ya.” Letak bubble harus enak dibaca, tidak menutup pilihan angka.
4. Momo kemudian **mengecil ke pojok kanan** dan tetap terlihat saat user fokus ke angka penggaris. Konfirmasi nomor absen yang dipilih berbentuk pertanyaan natural, “Benar ini nomor absenmu?”; jika salah, user bisa membetulkan, tidak dikunci.
5. Setelah konfirmasi nomor absen, baru ada **gesture jempol dan ring konfirmasi**, kemudian masuk ke kartu. Sinkronkan identitas absen dengan mekanisme class session backend Dias tanpa mengarang login atau database. Jika belum ada kelas yang di-join, perlakukan sebagai state UI yang bisa dijelaskan, tidak mengirim ID siswa acak.

### 6.3 Tiga kartu onboarding dengan animasi normal

**Bentuk visual:** Cards stack → spread 1–2–3 → flip/bifold seperti buku, sesuai aset dan keputusan terbaru. Pulihkan durasi transisi yang normal, jangan mempercepat demi automated tests. Momo menjelaskan kartu via bubble yang tepat, bukan tutup konten.

**Kartu 1 — Gerakkan Tinman/Thinman (pinch).**
- User harus benar-benar mencoba **pinch menggerakkan Tinman dari kiri ke kanan hingga bendera/pojok kanan**.
- Jangan ‘pinch sekali lalu Tinman auto berjalan’ jika intent user adalah dragging nyata. Evaluasi dua opsi yang Owner izinkan: karakter mengikuti tangan sampai menyentuh bendera atau gerak mengikuti saat pinch, kemudian **berhenti** saat di bendera. Keduanya harus melibatkan aksi user hingga target benar-benar tercapai.
- **Jangan munculkan thumb confirm ring sebelum tiba di bendera.** Setelah capaian, Momo memberi feedback, kartu dapat dibaca cukup lama, **setidaknya 10 detik reading window** sebelum ring jempol muncul dan bisa mengonfirmasi sudah paham. Durasi 10 detik tidak boleh otomatis menutup kartu tanpa jempol.
- Setelah jempol valid, kartu menutup **pelan normal**, lalu kartu kedua.

**Kartu 2 — Aturan dunia.**
- Ini tetap kartu kedua dan bukan placeholder dibuang. Isi/fungsi game tutorial yang ada di repo terbaru **harus diaudit**, termasuk jika menjelaskan solid vs dangerous objek. Momo memberi penjelasan yang relevan dengan mekanika; user membaca konten. Jika ada demo/practice existing, pertahankan dan pastikan berfungsi.
- Tunggu **10 detik sebelum** ring jempol tersedia, juga hanya setelah task interaktif bila ada telah beres. Momo tetap visible dan bubble pas. Baru flip/tutup ke kartu ketiga dengan animasi normal.

**Kartu 3 — Semua alat gambar benar-benar dicoba.**
- **Pinch = brush/coret** secara real-time, bukan demo palsu.
- **Kepalan tangan/fist = eraser** dengan ukuran penghapus tetap yang proporsional dulu; Owner mempertanyakan variable eraser size dan sementara lebih condong **fixed size**, jadi jangan membuat penyesuaian ukuran sebagai ketergantungan sebelum bisa bermain.
- **Undo dua jari / victory** dan **Redo telapak terbuka** benar-benar bekerja pada stroke buffer dan **wajib dicoba satu per satu**. Berikan progress status tiap gesture tanpa mengubah state kalau gerak ambigu.
- Setelah brush, eraser, undo, redo benar-benar dicoba, baru muncul masa baca yang cukup lalu ring jempol yang sah untuk lanjut. Bukan skip kartu hanya karena thumbs-up tanpa praktik.

### 6.4 Pilih level

- Hanya ada **Level 1, Level 2, Level 3**. Untuk pengguna baru yang belum pernah menyelesaikan level, copy dan highlight mengarahkan mulai dari **Level 1**. Jangan mengarang progress unlocked lain, dan jangan auto menutup layar sebelum user paham.
- Level 2 dan 3 mengikuti gating/progression yang benar-benar berlaku pada repo terbaru. Jangan menambahkan Level 4 dalam UI, code enum, analytics atau copy.

### 6.5 Intro Level 1 dan dialog Momo

- Owner bilang **hasil gambar dan leveling Level 1 yang sudah bagus jangan dikotakin lagi**. Audit source dan pertahankan bentuk rendering kanvas/hasil gambar yang alami, tidak membungkusnya ke kotak generik.
- Awal level, Momo **mengajak interaksi** dan menyarankan gambar yang diperlukan untuk membantu Tinman. Bubble harus dibaca; konfirmasi jempol **bukan melewati ucapan Momo** melainkan mengakui telah paham, hanya tersedia pada kondisi yang tepat.
- Setelah dialog selesai, **Momo bergerak melayang/naik ke atas** lalu diam pada posisi berikutnya dengan animasi penuh. Jangan buat seolah karakter ter-solve/teleport atau tiba-tiba hilang karena state transition singkat.
- Momo bisa mengajak interaksi/menjelaskan lagi bila perlu sesuai state. Thumb tetap acknowledgment, tidak otomatis memilih jawaban prediction atau men-submit sebelum gambar selesai.

### 6.6 Menggambar, idle prompt, dan Top-3 AI

1. Canvas melakukan gesture brush/fist/undo/redo yang sudah dipraktikkan. Momo berada di **pojok kiri atas** selama menggambar/menebak; jangan bergeser mendadak ke tengah setiap event. Kalau Momo perlu emphasis, **perbesar sedikit secara konsisten** tanpa menutupi area gambar.
2. Momo boleh bereaksi dan menebak-nebak secara naratif, tetapi **JANGAN munculkan UI Top-3 sebelum user mengonfirmasi selesai gambar**.
3. Jika user **idle 10 detik**, Momo bertanya dengan text bubble alami, misalnya, “Sudah selesai gambarnya? Kalau sudah, coba acungkan jempol, ya.” **Idle tidak otomatis menjalankan prediksi** dan bukan batas waktu paksa.
4. Setelah user benar-benar melakukan **thumbs-up selesai gambar**, baru kirim stroke ke **REST `/predict` Dias** sesuai kontrak live terbaru, lalu tampilkan Top-3 + confidence nyata. Selama proses, tampilkan status loading dan error yang jujur. Jangan membuat confidence mock tampil seolah model asli. Jangan submit berulang akibat thumb gesture tertahan.
5. HitL lengkap tetap berlaku: **Accept / Correct / Override** dengan label/behavior hasil akhir; **Redraw adalah recovery**, bukan tombol keputusan keempat. Periksa keputusan Can terbaru tentang popup `Masukkan ke dunia`, `Gambar lagi`, provenance dan layout Top-3. Jangan mengganti dengan CTA lama yang telah dicabut.
6. Setelah siswa mengonfirmasi pilihan/label, gambar asli dan label final masuk ke game sesuai flow, bukan otomatis mengganti stroke asli dengan grafis kotak atau label tanpa konsekuensi.

### 6.7 Manipulasi objek dan gameplay

- Hasil gambar muncul sebagai objek gameplay 2D sesuai behavior yang dipilih siswa.
- **Pinch** untuk menangkap/memindah objek; Owner meminta **ring progress confirmation** sebelum mode pindah dimulai dan **release** untuk meletakkan di posisi. Jangan meletakkan saat gesture masih aktif; jangan mengubah posisi secara tidak sengaja ketika pinch terputus sebentar.
- **Lima jari terbuka + gerak tangan seperti memutar benda** untuk merotasi objek. Jangan menyamakan open palm diam dengan rotasi. Gunakan perubahan orientasi/geometri temporal yang sesuai; ring confirmation bila masuk mode rotasi menurut user. Karena open palm adalah redo saat tutorial gambar, state router harus membedakan.
- Bila objek gagal menyelesaikan masalah atau user ingin mengulang, ada UI **`Gambar lagi`** dan usulan gesture natural yang tidak bentrok. User meminta full NUI, namun fallback keyboard/pointer tetap tersedia lewat reveal saat diperlukan, bukan ditonjolkan di awal.
- Kontrol Thinman dan konsekuensi level harus mengikuti source keputusan terbaru. Jangan menebak input keyboard sebagai default gesture NUI atau mengganti physics yang sudah oke tanpa alasan.

### 6.8 Level 2 dan Level 3

- Lakukan progresi kompleksitas sesuai game yang ada, tanpa merusak apa yang sudah berfungsi di Level 1. Level 3 boleh dibuat lebih sulit, termasuk Momo yang **salah menebak/terlihat 'halu' dalam narasi**, tetapi kesalahan AI harus punya asal yang jujur. Jangan menciptakan angka confidence palsu atau memakai mock yang ditandai live.
- Lakukan edukasi AI literacy melalui pengalaman siswa **membandingkan dan mengoreksi tebakan**, bukan skor judgement terhadap kecerdasan murid.
- **Level 4 tidak ada**, titik. Tidak ada `extra level` tersamar lewat tutorial, survei, atau kuis.

### 6.9 Portal akhir dan ringkasan

- Setelah Level 3, Tinman masuk **portal**, dengan animasi meyakinkan bahwa ia sekarang bisa hidup. Momo bereaksi dan memberi ringkasan pengalaman serta pesan singkat literasi AI yang tidak menggurui.
- Tampilkan kembali **benda-benda yang siswa gambar/pakai, tebakan Momo, keputusan siswa, berapa jumlahnya, dan ukuran performa interaksi yang netral** sesuai data yang benar-benar dicatat. Jangan membuat skor “siswa pintar/tidak pintar” atau metrik yang belum tersedia. Jika tidak ada data valid, tampilkan `tidak tercatat`, jangan mengarang.
- Ending harus terasa selesai. Kembali ke cover/level menu hanya lewat navigasi yang masuk akal dengan sinyal akhir, jangan loop otomatis ke Level 1 tanpa persetujuan.
- **Kuis/survei** diletakkan **SETELAH** portal dan recap, masih dengan interaksi Momo. Owner ingin admin/superadmin mempunyai toggle untuk mengaktifkan kuis, tetapi materi/gestur kuis belum final. Buat **placement dan arsitektur gate lebih dulu**; bila backend admin belum ada, buat kontrak usulan/feature flag aman pada scope Can dan koordinasikan ke Dias, bukan memodifikasi dashboard partner diam-diam. Jika toggle OFF, ending tetap lengkap. Jika toggle ON, Momo mengantar ke kuis secara natural tanpa menjadikan level keempat. Kalau user meminta implementasi kuis sekarang, audit kesesuaian dengan source dan buat modul terpisah yang tidak memblok release utama.

## 7. Rule tutorial dan gate interaksi (anti-skip)

Untuk setiap dialog tutorial:

`ENTER -> Momo speaking/animating -> visual readable -> required gesture/action completion -> reading delay minimal 10s (kartu) -> thumbs ring eligible -> thumb dwell/ack -> closing animation -> NEXT`

Bila aktivitas selesai lebih cepat, timer baca tetap dipenuhi. Bila user membaca lebih lama, **jangan auto-skip**. Jika 10 detik telah lewat tapi task belum selesai, ring tetap tidak muncul. Untuk dialog di luar tutorial, waktu bacanya mengikuti source/UX dan tidak boleh tiba-tiba dapat thumbs ketika teks belum stabil. Prefer satu source event FSM bukan banyak timeout/timers tak terkoordinasi. Cancel all timers on unmount/transition; no double-ack.

## 8. Integrasi dokumen NUI MediaPipe (WAJIB)

Baca keseluruhan `PANDUAN-UTAMA-NUI-MEDIAPIPE-KOMBINASI-2026-11-10.md` sebelum implementasi kamera. Terapkan fungsi minimum **MediaPipe 21 hand landmarks sebagai baseline, gesture FSM kontekstual, visual One Euro smoothing bila terbukti berguna, fallback pointer**. Pertahankan CLAHE, screen fill-light dan ONNX/RTMPose sebagai kandidat design/experiments yang harus dinilai berdasarkan hardware compatibility dan data, **bukan syarat harus dimuat bersamaan**.

Fable boleh memperbaiki desain kombinasi NUI untuk worst case, misalnya low-light, blur, occlusion, izin kamera ditolak, GPU tidak ada, paket besar, dua tangan, input flicker, WebGPU gagal, memory/performance drop. Jangan menyebut zero-lag atau ukuran aset pasti tanpa bench. Jangan memasang **body-pose 17 keypoints** sebagai fallback bagi **21 finger landmarks** tanpa model hand-specific dan adapter yang kompatibel.

**Konflik yang harus dicegah:** thumbs-up sebagai acknowledgment vs submit; open palm untuk redo vs rotasi lima jari; pinch brush vs pinch drag Thinman vs pinch object; waving wake vs open palm redo. Solusi **gesture router berdasarkan state**, bukan menonaktifkan salah satu gesture yang Owner minta.

## 9. REST API Dias, kontrak dan data penelitian

- Can memakai REST client dalam `frontend/implementation` ke **satu backend Dias**. Tidak membuat backend API tiruan Can.
- `/predict` dipanggil setelah thumbs-up `done drawing`. Top-3 & confidence harus berasal dari response model sungguhan. Kalau response mock, beri label demo, jangan samarkan.
- `POST /api/submissions` dipanggil pada momen keputusan HITL jika siswa mengikuti sesi kelas, menggunakan kontrak aktual. Kegagalan logging tidak boleh membekukan physics/game. Data keputusan inti harus dipertahankan sampai ack atau ditandai gagal, tanpa duplikasi.
- Outcome gameplay dapat memakai endpoint outcome hanya jika benar-benar ada; jika belum, catat kebutuhan kontrak kepada Dias, jangan mengklaim berhasil. Hindari edit tabel Dias tanpa koordinasi.
- **Jangan mengorbankan UI Top-3 untuk latency**: pengalaman user tetap gambar -> thumbs selesai -> prediction -> Top-3 -> Accept/Correct/Override -> label -> gameplay -> logging.
- Atur error, offline/retry, loading Momo, kegagalan model, security basic dan identitas kelas agar siswa tidak terjebak atau melihat confidence palsu.

## 10. Arsitektur coding dan UX review

Cegah god component dan coupling antarbagian. Laporkan modul nyata yang ditemukan dan susun separation of concerns secara adaptif, bukan mengarang path default:

- Camera session/state, frame scheduler, tracker adapters, gesture classifier, gesture FSM, user feedback
- Momo animation controller (sleep, wake, blink, fly, emotion), bubble layout and text pacing
- Cover/camera preview choreography, book and ruler navigation, onboarding 3-card controller
- Canvas input/brush/eraser/undo/redo state, prediction adapter to Dias, HITL panel, behavior mapping
- Level progression and object manipulation, level summary/portal, optional quiz entry
- Shared timing tokens/animation design system *tanpa* mempersingkat durasi seenak model.

Perubahan UI harus konsisten dengan visual design Can terbaru, aksesibilitas keyboard/pointer saat kamera tidak tersedia, dan responsif pada laptop sekolah. Jangan membuat CSS `animation-duration` global yang mengganti kartu dan Momo secara sekaligus tanpa audit.

## 11. Planning dan agent-team execution

**Tahap A: source & behavior audit (Fable lead).** Verifikasi keputusan Can terbaru, kontrak Dias, data runtime yang ada dan titik regresi. Inventarisasi seluruh file. Ambil snapshot screenshot/video bila tersedia tanpa pengubahan state palsu.

**Tahap B: desain/storyboard & dependency plan (Superpowers).** Tulis matrix `scene -> user action -> gesture -> UI state -> exit condition -> camera/Momo pose -> time rules -> fallback`. Susun arsitektur state machine, diagram integrasi, dependencies dan per-file work contracts. Kemudian jalankan implementasi sesuai keputusan yang sudah jelas; untuk ambigu yang mengubah produk, tulis rekomendasi delta dan jangan diam-diam pilih.

**Tahap C: restoration dahulu.** Perbaiki animation timing, Momo sleep, book opening, camera choreography, card transitions, bubble positioning, z-index. Jangan menghapus fitur demi lolos snapshot tests. Owner meminta kembali normal sebelum benchmark besar.

**Tahap D: onboarding dan gestures.** Lengkapi ruler/absen, cards 1-3 real practice, timer 10 detik dan thumbs confirmation modal. Audit NUI real input dan implement robust state routing.

**Tahap E: level, REST dan gameplay.** Integrasikan API Dias, stable Top-3 timing, Momo dialog/submit, rotate/pinch place, recovery, Level 1→2→3 only. Pertahankan hasil gambar yang telah bagus.

**Tahap F: ending + survey placement.** Portal animation, recap, AI literacy, optional quiz/survey gated via admin feature flag bila support tersedia.

**Tahap G: verification, docs, handoff.** Build, typecheck, tests per modul, browser QA (normal input), output screenshot/video sah bila tersedia, cek seluruh matrix requirement. Jangan pernah mengklaim hardware camera PASS dari synthetic events, jangan menyederhanakan animasi agar tes cepat. Kirim laporan `PASS/FAIL/NOT TESTED` lengkap dengan batas bukti.

### Contoh pembagian teammate berdasarkan dependensi

| Stream | Owner | Input dependency | File ownership dan output |
|---|---|---|---|
| S0 Audit/repo decisions | Fable | checkout | file audit/plan, no production write sebelum audit |
| S1 Animation tokens + cover/booking | Haiku Max A | scene matrix | source/asset animasi cover saja |
| S2 Momo sleeping/story/dialog | Haiku Max B | storyboard | Momo assets/controller/bubble tanpa edit file milik S1 |
| S3 Camera/gesture FSM | Haiku Max C | NUI audit | tracker & gesture files, tidak edit shared root state bersamaan |
| S4 3-card tutorial | Haiku Max D | gesture contract + animation design | onboarding card files; integrator menghubungkan parent state |
| S5 REST Dias adapter | Haiku Max E | API contract | client adapter/error/loading; tidak mengedit backend Dias |
| S6 Gameplay level/objects | Haiku Max F | gesture router | scenes Level1–3, manipulation; status dan merge oleh Fable |
| S7 Ending/portal/quiz placement | Haiku Max G | level flow | portal/review/quiz proposal, no admin rewrite |
| S8 QA/audit non-destructive | Haiku Max H / Fable reviewer | semua stream cukup stabil | test logs, evidence; jangan 'memperbaiki' animasi hanya untuk test |

Tabel adalah **alokasi tugas contoh, bukan jumlah pekerja wajib**. Maksimalkan paralel yang *aman* dan terapkan file ownership / explicit interface handoff / cherry-pick atau merge terkendali. Bila satu file shared dibutuhkan dua stream, hanya Fable/integrator boleh mengeditnya setelah keduanya menghasilkan usulan. Fable harus menjalankan pemeriksaan integrasi sesudah setiap dependency selesai, bukan hanya menggabungkan file dan mengaku PASS. Semua model implementer Haiku Max jika tersedia.

## 12. Kriteria hasil dan pengujian yang tidak menyalahi instruksi Owner

Owner meminta “lu gausah test ... balikin animasi kartunya jadi lebih ok” sebagai reaksi terhadap tindakan tester sebelumnya yang mempercepat/mengubah animasi, **bukan persetujuan menipu QA**. Artinya **restorasi visual lebih dulu**, tanpa mengubah speed untuk menyenangkan tests. Setelah code stabil, lakukan tes non-destruktif, bedakan L3 fake-browser tests dan real camera/real model. Semua protes Owner tentang animasi dan interaksi harus diuji dengan mata/rekaman gesture normal, tidak dengan `force click`, injeksi physics, menghapus disabled, spoof model atau timer speed-up.

Definition of done hanya untuk fitur yang memang ada bukti:

- Cover sleeping Momo actual moving; wave triggers wake; camera center→top-left animated; responsive bubble layout.
- Ruler minimal numbers, dim emphasis Momo, validated absentee confirm, thumbs interaction.
- Three onboarding cards: drag Thinman to flag, card2 guidance, card3 brush/fist/undo/redo all practiced; thumbs only after eligible & 10-second read; transitions do not race.
- Three levels, no level4, correct Momo dialog acknowledgment, drawing idle 10s prompt, real Dias prediction only after thumbs-up, Top-3 visible only then, HITL choices, game object manipulation, rotate and place, recovery.
- Portal ending, objective recap and optional quiz/survey placement behind dashboard/admin toggle if supported; Momo participates.
- Functional camera fallback without keyboard promo at start, model unavailable gracefully handled; mediaPipe realistic performance.
- Build/unit regressions, manual visual checks, browser interaction evidence with normal input; source and runtime status clearly separated.

## 13. Dokumentasi yang diperbarui

Fable wajib memperbarui dokumen **yang benar-benar relevan dalam checkout**:

- `contexts/can/NOW.md` dengan status teknis, blocker dan next action Can terbaru;
- `contexts/can/DECISIONS.md` **sesuai governance yang diatur dokumen itu**, bukan ditulis ulang spontan. Jika perubahan user langsung ini menuntut audit/approval ID, buat draft patch sesuai prosedur. Jangan memanipulasi approval atau mengklaim dosen menyetujui;
- desain/storyboard/gesture mapping di bawah konteks Can atau docs yang ditunjuk oleh AGENTS;
- `contracts/` hanya bila perlu usulan interface ke Dias; tulis incompatibility dan ownership;
- `CHANGELOG.md` engineering root sesuai workflow tim: catat perubahan produk bersama, tetapi jangan membiarkan beberapa worker menulis file root bersamaan; jika repo memakai per-PR fragment, gunakan itu;
- `README.md`, `AGENTS.md` hanya bila path/command arsitektur benar-benar berubah, tetap **root netral**, jangan menyebarkan instruksi pribadi Can ke Dias.

Jangan menambah `CLAUDE.md` untuk mengganti router `AGENTS.md` kecuali owner memerintahkan nanti. Jangan mencampur catatan sementara agent dengan keputusan PA.

## 14. Format hasil yang Owner perlu terima

Ringkas di chat, detail di file yang bisa diaudit:

1. Commit/branch/HEAD + daftar dokumen Can yang benar-benar dibaca, termasuk versi DECISIONS dan status conflict.
2. Audit apa yang rusak/missing vs apa yang sudah sesuai, jangan klaim semua broken.
3. Implementasi apa saja, file/commit/diff dan bukti revisi animation speed.
4. Agent team roster/teammate model IDs, tasks, ownership, dependency, status nyata.
5. Hasil gameplay/NUI/API/classroom, mana real hardware, mana mock/isolated.
6. Tiga level saja dan ending portal/quiz gate status.
7. Daftar `PASS`, `FAIL`, `NOT TESTED`, alasan dan next step; no invented metrics.

**Jangan berhenti hanya setelah mengirim plan**. Execute terus sesuai akses dan izin yang benar-benar tersedia. Jangan bekerja setelah giliran berakhir tanpa mekanisme tool/scheduling yang diizinkan. Jika source tidak tersedia, laporkan blocker konkret; jangan mengarang source atau hasil.

## 15. MATRlKS CEK NON-NEGOTIABLE (jangan hapus permintaan Owner)

- [ ] Tidak ada Level 4 atau Bab 4 pembuktian baru.
- [ ] Animasi kartu dan keseluruhan motion kembali normal, tidak dipercepat.
- [ ] Penggaris hanya angka + penggaris; Momo pusat dan dimmed, lalu pojok kanan.
- [ ] Momo tidur benar-benar animasi, bukan sekadar stacking sprite.
- [ ] Transisi buku membuka ke atas tetap terlihat.
- [ ] Preview kamera awal besar/tengah, lalu shrink/bergerak jadi kecil di kiri.
- [ ] Trigger waving benar-benar dikenali; Momo berkedip, bangun, dadah, melayang ke tengah, besar sebagai emphasis.
- [ ] Hilangkan instruksi kaku “Lambaikan tanganmu” dan buat UX intuitif.
- [ ] Bubble Momo tepat posisinya; intro menyebut Momo gambar satu-satunya hidup dan **Tinman** bold.
- [ ] Absen dipilih dan dikonfirmasi, Momo tetap terlihat, konfirmasi thumbs.
- [ ] Kartu 1 pinch drag Tinman kiri→kanan ke bendera, tidak auto-walk; ring thumbs setelah target.
- [ ] Kartu 2 tetap ada, penjelasan Momo, timing baca normal; isi existing diaudit.
- [ ] Kartu 3 pinch brush, fist erase fixed-size, undo, redo benar-benar dicoba.
- [ ] 10 detik sebelum ring thumbs pada kartu setelah aktivitas/isi eligible, bukan auto-skip.
- [ ] Kartu berakhir dengan animasi normal dan urutan kartu benar.
- [ ] Level select tiga level, pengguna baru diarahkan ke Level 1.
- [ ] Level 1 gambar tidak diberi kotak lagi; hasil yang bagus tidak dirusak.
- [ ] Momo dialog perlu acknowledgment thumbs, bukan skip, dan fly up natural lalu diam.
- [ ] Momo pojok kiri atas saat gambar/menebak; emphasis boleh sedikit lebih besar.
- [ ] UI Top-3 TIDAK muncul sebelum thumbs siswa selesai menggambar.
- [ ] Idle 10 detik hanya membuat pertanyaan Momo, tidak otomatis menebak.
- [ ] Integrasi model Dias REST untuk prediction asli, provenance jujur, Accept/Correct/Override.
- [ ] Gesture putar 5 jari dengan gerakan putar, pinch move dengan ring lalu release place.
- [ ] Gambar lagi untuk recovery, gesture-nya dievaluasi tanpa bentrok.
- [ ] NUI full UI dengan fallback keyboard tersimpan tapi tidak dipamerkan dari awal.
- [ ] NUI MediaPipe + opsional CLAHE/One Euro/ONNX dinilai worst case sesuai MD panduan.
- [ ] Level 3 lebih menantang, Momo bisa salah/halu secara naratif, hasil model tidak direkayasa.
- [ ] Portal menunjukkan Tinman hidup, Momo menguraikan AI, recap semua benda dan tebakan/jumlah/performa netral.
- [ ] Sesudah ending ada *placement* kuis/survei dengan Momo; admin/superadmin toggle on/off sebagai kontrak/usulan sesuai backend yang tersedia.
- [ ] Fable lead planner, semua workers Haiku Max jika available, parallel teamwork via agent teammates.
- [ ] Superpowers dipakai sesuai plugin aktual, Caveman hanya memadatkan **jawaban ke Owner**, kode/asset/teks tidak berubah.
- [ ] Patuh `contexts/can` terbaru, jangan menerapkan keputusan/aturan Can ke folder Dias.

## 16. LAMPIRAN — PESAN ASLI OWNER SEBAGAI CHECK SEMANTIK

Lampiran ini **mengikat maksud**, bukan izin untuk menghapus requirement atau mempercepat animasi. Bila storyboard terstruktur dan kalimat aslinya terasa beda, Fable harus membandingkan keduanya dan mempertahankan intent. Ejaan informal di sini tidak menjadi copy UI final.

> “Ini apa cok tiba2 ada bab 4/level 4 pembuktian? Gausah, ga level 4 gaada. Dan ini kenapa dipercepat semua animasinya? Balikin animasi kartunya jadi lebih ok. Animasinya balik lagi normal, terutama animasi kartu. Terus pas penggaris, banyak salah paham. Momo animasi tidurnya nggak ada, dia cuma kayak ngestak gitu doang. Padahal dia harus bisa tidur. Beneran animasi tidur. Transisi buka bukunya itu gak ada. Terlalu cepet.”
>
> “Kamera di tengah, kita masih di cover. Ketika user nyalain kamera, kameranya jadi kotak kecil ke pojok kiri seperti page lainnya. Ada animasi mengerucut mengecil terus pindah ke pojok kiri. Momonya dari kanan tidur. Kalau dadah-dadah baru deteksi animasi itu pindah. User waving hand. Momo masih kedip-kedip melek, baru mulai animasi kamera dari tengah pindah ke pojok kiri kecil. Habis wave, dia bangun melayang ke tengah, agak gedean, fokusnya ke Momo. Tulisan 'lambaikan tanganmu' hilang. Momo langsung dada-dada halo. Bubble diperbaiki. 'Aku Momo, gambar satu-satunya yang hidup di Sketchbook Universe. Aku barusan nemuin Tinman' [bold]. 'Dia butuh bantuanmu untuk hidup juga kayak aku. Antar dia ke suatu tempat.' Baru transisi buka buku ke atas masuk penggaris.”
>
> “Penggaris cuma angka dan penggarisnya. Momo bilang sebelum masuk pilih nomor absen, fokus Momo dulu di tengah gede, lainnya gelap. Baru mengecil pojok kanan. 'Benerkah nomor absenmu?' Bubble enak, Momo terlihat, confirm jempol. Baru masuk card. Kartu pertama nyoba bikin Tinman jalan pakai pinch, user pinch dari kiri ke kanan sampai bendera, bukan pinch autojalan. Nyampe bendera stop. Baru ring jempol. Jangan munculin ring sebelum. Biar Momo jelasin kartu, tunggu 10 detik sebelum konfirmasi paham, baru kartu menutup normal. Kartu ketiga nyobain gambar, pinch kuas, fist mengepal hapus, eraser size fixed lebih disarankan, undo redo semuanya harus dicoba dulu. Level select cuma 3, yang baru mulai Level 1.”
>
> “Level 1 gambar sudah oke, jangan dikotakin lagi. Sambung API model Dias. Sebelum hasil gambar, maskot ngajak interaksi, bubble dikonfirmasi thumbs bukan skip. Kalau sudah paham, Momo ke atas dengan animasi dan diam. Momo pojok kiri atas saat nebak, jangan geser tengah, kalau emphasis gedein sedikit. Top 3 belum muncul selama Momo menebak, baru setelah user thumbs selesai gambar. Kalau user idle 10 detik Momo tanya 'Sudah gambar? Kalau sudah acungin jempol'. Baru API model, Top-3, konfirmasi hasil, masuk game.”
>
> “Objek bisa dirotate pakai lima jari gerakan memutar dan pindah pakai pinch dengan progress ring konfirmasi sebelum pindah, lepas untuk meletakkan. Kalau gagal bisa Gambar lagi, rancang gesture full UI. Fallback keyboard ada tapi jangan dikasih di awal. NUI ada revisi MediaPipe, ONNX dan lainnya di MD. Hanya 3 level. Level 3 lebih susah meski Momo halu. Penutup sesuai plan lewat portal, Tinman bisa hidup, Momo memberi overview AI, benda yang dipakai dan tebakan/jumlah/performa netral tanpa nilai pintar atau tidak. Selesai. Kuis/survei di akhir nanti dengan toggle admin/superadmin, tetap ada interaksi Momo, letaknya disiapkan dulu dan implement kalau memungkinkan.”
>
> “Fable 5.2 sebagai lead/planner. Semua subagent Haiku Max, sebanyak mungkin paralel sesuai dependensi pakai agent teammate. Gunakan Superpowers untuk planning, Caveman hanya untuk respons Owner, bukan untuk penulisan code. Baca konteks Can terbaru di repo termasuk DECISIONS, bukan context proyek GPT lama. Scope Can, jangan ganggu Dias. Boleh memperbaiki rancangan menurut hasil audit dan worst case, tapi **tidak boleh menghapus permintaan Owner**.”

**Pengingat terakhir:** Tidak ada hak Fable untuk menyatakan seluruh ide ini sudah disetujui dosen atau terbukti runtime. Semua bagian yang user minta tetap dipertahankan, sementara perubahan teknis boleh dikritik dengan evidence dan opsi paling aman. Buktikan implementasi satu per satu, bukan lewat klaim generik.

## 17. ARSIP UTUH BRIEF FITUR OWNER, TANPA PENGHAPUSAN

> **Instruksi kepada Fable:** Bagian ini adalah salinan pesan fitur awal Owner yang diminta untuk ditata ulang. Bagian terstruktur di atas memudahkan eksekusi, namun tidak menghapus klausa-klausa di bawah. Jika ada rincian dari kata-kata Owner yang tidak masuk checklist, **tambahkan** ke rencana dan implementasi sesuai governance repo. Jangan menghapus kalimat hanya karena terdengar ambigu. Perbedaan penafsiran harus dicatat, bukan diselesaikan diam-diam.

```text
ini apa cok tiba2 ada bab 4/level 4 pembuktian??????????? gausah anjing benahin ga level 4 gaada. dan ini kenapa dipercepat semua animasinya jancok? lu gausah test anjing balikin animasi kartunya jadi lebih ok. Animasinya balik lagi normal, terutama animasi kartu. Terus pas penggaris, itu, ini lo banyak salah paham deh kayaknya. Pertemuan dulu kita lewat di awal nih. Momo animasi tidurnya nggak ada, dia cuma kayak ngestak gitu doang. Padahal dia harus bisa tidur. Beneran animasi tidur gitu loh. Transisi buka bukunya itu gak ada. Jadi kayak terlalu cepet lah gara-gara tadi. Terus habis itu ya, kan itu kamera di tengah tuh, kita masih di cover. Ketika user udah nyalain kamera, kameranya jadi kotak kecil ke pojok kiri kayak di tempat lain, kayak di page-page lainnya. Dan ada animasi dia mengerucut mengecil terus pindah ke pojok kiri. Terus habis itu momonya dari kanan kan tidur. Pokoknya kalau dada-dada baru deteksi animasi itu pindah. Jadi user waving hand. Terus dat terus momo itu kayak masih kedip-kedip gitu melek. Nah, itu baru mulai animasi kamera dari tengah pindah ke pojok kiri kecil kayak di page lain. Terus habis itu baru si momo ini pas user udah waving hand terus, dia kayak bangun melayang ke tengah. Nah, agak gedean dikit. Fokusnya ke momo emphasis-nya sekarang. Dan tulisan dari lambaikan tanganmu itu hilang. Gue mau yang UX intuitif banget ya, mudah dipahami. Jadi momonya itu langsung dada-dada halo, dan bubble chatnya benerin dong itu kayak tempatnya nggak pas banget. Aku momo, gambar satu-satunya yang hidup di dunia ini, di sketchbook universe bilang gitu. Aku barusan nemuin ada namanya Tinman, lo cetak bold. Kayaknya dia butuh bantuanmu untuk hidup juga kayak aku. Jadi antar dia ke suatu tempat. Nah, itu kan sekilas ceritanya. Baru transisi, buka ke atas, red, masuk ke penggaris. Penggaris itu cuma ada angka sama ya penggarisnya. Nah, di situ tuh momo tuh bilang, "Aku sebelum masuk, kamu pilih nomor absenmu ya, dan pastiin user itu ngelihat momo dulu di tengah gede sebagai emphasis dan lainnya agak gelap gitu loh." Baru dia mengecil ke pojok kanan. Benerkah nomor absenmu gini? Pokoknya meskipun user fokusnya ke tengah, tapi user masih tetap bisa melihat maskotnya. Dan penempatan bubble chatnya yang enak. Nah, kalau udah konfirmasinya baru gini, jempol. Habis itu kan masuk ke card. Nah, ke card itu maksud gua kan card pertama nyobain bikin stickman atau tinman-nya ini jalan. Thinman jalan itu pakai pinch. Jadi di situ dia langsung nyobain pinch-nya, bukan di pinch terus auto jalan gitu enggak, tapi biarin user nyoba pinch Thinman dari pojok kiri ke pojok kanan. Kalau udah nyampe ke pojok kanan, udah Thinman-nya diem. Jadi tangan user bisa langsung jempol kalau misal udah bisa gerakin gitu. Atau nggak apa-apa ngikutin tangan user. Pokoknya Thinman nyampe ke bendera itu selesai. Nah, habis itu baru muncul konfirmasi jempol UI yang ring itu. Nah, habis itu baru ke kartu selanjutnya. Jangan munculin jempol konfirmasi dulu. Biarin momo atau maskotnya ngomong, jelasin kartu itulah sambil user baca. Kasih 10 detik baru muncul jempol buat konfirmasi udah dan paham. Baru kartunya nutup. Animasinya normal, jangan lo cepetin. Terus habis itu, kartu ketiga kan nyobain gambar. Nah, itu semuanya juga berguna gitu loh, berfungsi gitu loh. Jadi pinch buat kuas, terus yang gue bilang itu user mau menghapus itu pakai ngebogem tangannya, kayak nutup semua tangannya, itu buat ngehapus. Dan suruh nyobain juga besar kecil hapusnya, tapi saran gue gak usah deh, difiksin aja hapusnya seberapa. Tapi better gimana coba lo riset, lo audit dulu lah kodenya. Terus habis itu, udah kan, ada redo, undo, semua harus dicoba dulu baru bisa lanjut kartu ketiga skip. Nah, masuklah itu ke pilihan level, ada 3 level. Karena user baru pertama kali masuk, UX-nya yang enak, berarti pilih karena kamu belum masuk ke level berapa gitu. Kamu bikinlah, masuklah ke level 1 gitu. Ya udah, masuk level 1, selesai, lanjut ke level 1-nya. Nah, di level 1 ini gue sempet nyoba level-levelingnya itu udah oke. Maksudnya hasil gambarnya itu udah oke. Bukan dikotakin lagi. Nah, tapi tolong sambungin ke API modelnya si Dias. Terus abis itu gue mau hasil gambarnya itu Oh iya, sebelum ke hasil gambar kan maskot ngajak interaksi user. Nah, chatnya itu dikonfirmasi baca dengan thumb atau jempol. Nah, jempolnya itu bukan nge-skip omongan Momo, tapi konfirmasi kalau dia berinteraksi dengan Momo atau maskotnya itu. Nah, kalau udah paham semua omongannya dan dikasih tahu maskot kalau cuma kamu aku sarankan gambar ini ya. Terus habis itu maskotnya ke atas, animasi ke atas dan jangan di solve, dia langsung diem. Jadi kayak seolah gak ada transisi di solve. Kan maskotnya ke atas tuh ke awal. Ini harus ada animasinya juga, jangan dicepetin. Habis itu dia kayak ngajak interaksi lagi, jempol lagi, kan cobain kuasnya udah dan lain-lain. Terus tebakannya itu, kalau maskot nebak, itu maskotnya tetap di pojok kiri atas, jangan agak geser ke tengah. Kalau misal mau jadi emphasis ya berarti agak gedein. Nah, maskot ini buat dia nyoba nebak-nebak aneh apapun, tapi gak munculin UI 3 tebakan atau top 3. Top 3-nya muncul kalau user udah ngancungin jempol kalau dia udah selesai gambar. Nah, maskot ngedeteksi, nanyain. Kalau misal ada idle user selama 10 detik, ditanyain sama maskot, kamu udah gambar? Kalau udah gambar, coba acungin jempol gitu. Baru ditebak, dilempar ke API model. Nah, abis itu gambarnya dikonfirmasi. Masuklah ke gamenya. Ya ini user dikasih tahu kalau dia bisa ngerotate hasil gambarnya dengan ya cuma 5 jari gitu loh, hi-fi. Tapi dia muter gitu, beneran 5 jari, tangannya kayak muter sesuatu gitu loh. Nah, kalau misal dipindah, dia bisa nge-pinch. Dan itu konfirmasi dulu, maksudnya kalau dia mau pinch, ada UI konfirmasi ring progress bar untuk konfirmasi dia mau pindah itu. Nah, kalau udah ditaruh, ya udah dilepas baru naruh. Konfirmasi itu kalau dia mau muter atau mau nge-pinch. Nah, habis itu ya udah, kalau misal gagal dia mau gambar lagi, ada UI gambar lagi pakai gestur apa gitu. Gue mau semuanya full UI ya, dan fallbacknya itu memang pakai keyboard, tapi jangan dikasih keyboard dulu. Dan ada revisi dari segi NUI-nya, karena gue tambahin media pipe ONNX sama apalah, nanti gue kasih MD-nya. Nah habis itu kayak gitu cuma ada 3 level. Nah level 3 ini juga meskipun si Momo ini halu, maskotnya halu, juga dikasih agak sulit lagi. Nggak usah ada level 4 sama sekali. Nah, terus abis itu, gue mau penutupnya itu masih sesuai plan yang kita bilang gitu loh. Dia masuk ke sebuah portal gitu, terus kasih animasi kalau dia udah bisa hidup. Terus Momo ngasih tau lah, kasih overview dia kayak gimana-gimana tentang AI dan lain-lain. Terus baru muncul barang-barang yang dia di user pakai itu apa aja yang ditebak sama maskot, ada berapa dan performanya gimana. Performa ini ya cuma analisis biasa aja kan, nggak ada parameter yang gue sebut dia pintar atau enggak gitu loh. Jadi ya kayak gitu udah. Baru selesai, balik lagi ke enaknya kemana ya, harusnya udah selesai sih. Nah, harusnya kan kuis kan. Cuma ya nanti aja di admin, super admin ada toggle buat nyalain kuis ini. User itu bikin kuis. User itu ngisi kuis, gimana gesturnya dan lain-lain. Nanti gue belum bikin lah. Kalau bisa lo sekalian bikin. Nah, gue bakal pakai model Fable 5.2 sebagai lead dan planner. Sedangkan lo harus spawn sub-agent lo adalah Haiku Max. Haiku Max, oke? Semua workernya Haiku Max. Lo spawn sebanyak mungkin paralel dan dependensinya pakai agent teammate.
```

**Lampiran 17 ini merupakan kutipan ulang permintaan fitur dalam pesan Owner, bukan copy yang wajib muncul apa adanya di UI untuk siswa.** Lampiran 16 menempatkan detail dalam ringkasan semantik; jika keduanya berbeda, kutipan penuh Bagian 17 diutamakan selama tidak bertentangan dengan instruksi Owner berikutnya.
