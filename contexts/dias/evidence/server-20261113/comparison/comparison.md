Data uji: 120,000 gambar, 20 kategori game (6.000 per kategori).

| Model | Input | Parameter | Ukuran | Akurasi | Top-3 | F1 makro | Inferensi/gambar | Lama training | Epoch |
|---|---|---|---|---|---|---|---|---|---|
| ResNet-18 | 56x56x1 | 1,308,852 | 15.2 MB | 94.46% | 98.38% | 94.46% | 0.101 ms | 520.8 menit | 50 |
| MobileNetV2 | 28x28x1 | 1,548,612 | 18.2 MB | 94.34% | 98.32% | 94.34% | 0.096 ms | – | – |
| EfficientNet-B0 | 96x96x3 | 4,383,671 | 50.8 MB | 94.20% | 98.33% | 94.20% | 0.286 ms | 77.8 menit | 13 |
| SketchNN | 28x28x2 | 66,516 | 0.9 MB | 92.17% | 97.61% | 92.16% | 0.055 ms | 45.0 menit | 50 |
| SqueezeNet | 64x64x3 | 82,352 | 1.1 MB | 91.80% | 97.56% | 91.80% | 0.025 ms | 99.3 menit | 32 |
| Custom CNN | 28x28x1 | 113,172 | 1.4 MB | 89.28% | 96.79% | 89.29% | 0.016 ms | 113.2 menit | 50 |
