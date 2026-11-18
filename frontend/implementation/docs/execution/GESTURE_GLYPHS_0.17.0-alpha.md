# Katalog Ikon Gestur NUI — 0.17.0-alpha

Semua ikon baru berupa vektor SVG yang ditulis langsung di src/components/ui/GestureGlyph.tsx. Tidak ada asset generator eksternal, unduhan stock, atau klaim sumber Figma. Warna mengikuti token paper, ink, dan orange Notebook.

| IconName baru | Bentuk tangan | Konteks |
| --- | --- | --- |
| gesture-pinch | Sentuhan ibu jari dan telunjuk dengan aksen oranye | Coret, drag penggaris, grab objek, PinchRing |
| gesture-five | Lima jari terbuka | Hapus Card 3, bantuan telapak terbuka/putar objek |
| gesture-one | Satu telunjuk tegak | Undo Card 3 |
| gesture-two | Telunjuk dan jari tengah tegak | Redo Card 3 |
| gesture-point-right | Satu telunjuk diarahkan ke kanan | Latihan steering Thinman |
| gesture-point-up | Satu telunjuk diarahkan ke atas | Latihan jump Thinman |

Legacy hand-draw, hand-erase, hand-undo, hand-redo dari Figma tetap ada untuk kompatibilitas dan tes historis, tetapi komponen NUI yang telah disentuh dalam batch ini memakai katalog baru. Jangan menyebut ikon lama sebagai mapping tutorial sekarang.

Status kualitas: STATIC_ONLY. Ketepatan bentuk yang dipahami siswa kelas 7-9, kontras aktual, dan respons pada perangkat nyata masih memerlukan QA visual serta uji pengguna.
