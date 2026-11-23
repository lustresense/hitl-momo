# Pemetaan 20 kelas MobileNetV2

Label sesuai urutan JSON model. Pemetaan untuk prediksi MobileNetV2, bukan penggantian perilaku label lama.

- Pijak / solid (6): ladder, stairs, bridge, bench, table, skateboard.
- Bahaya / danger (8): cactus, campfire, lightning, saw, knife, sword, snake, spider.
- Netral-tembus / neutral (6): fence, zigzag, line, cloud, bucket, umbrella.

Tes unit resolver 20/20 lulus pada tiga level; belum membuktikan collision runtime pada browser. Label yang tidak diketahui di luar 20 kelas tetap dapat menghasilkan fallback unresolved sesuai kontrak lama. Prediksi model ini sendiri dicek terhadap urutan label wajib saat server mulai.

Rate limit server bersifat global 120 request per menit, bukan per-pengguna, karena proxy DEV menghubungkan semua klien sebagai localhost. Saat banyak pengguna, klien dapat menerima HTTP 429. Tidak ada penyimpanan goresan di server atau proxy.
