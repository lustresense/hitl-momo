# Third-Party Software and Dataset Notices

This project incorporates third-party open-source software libraries, pre-trained neural network architectures, and research datasets. Below are the required attributions, copyright notices, and license terms.

---

## 1. Third-Party Software and Machine Learning Frameworks

### YOLO26n / Ultralytics
- **Repository:** [https://github.com/ultralytics/ultralytics](https://github.com/ultralytics/ultralytics)
- **License:** GNU Affero General Public License v3.0 (AGPL-3.0)
- **Copyright:** Copyright (c) Ultralytics Inc. All rights reserved.
- **Notice:** This project utilizes neural network architectures and export tooling provided by Ultralytics under the AGPL-3.0 license.

### onnxruntime-web
- **Repository:** [https://github.com/Microsoft/onnxruntime](https://github.com/Microsoft/onnxruntime)
- **License:** MIT License
- **Copyright:** Copyright (c) Microsoft Corporation. All rights reserved.
- **Notice:** Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

### MediaPipe Tasks Vision
- **Repository:** [https://github.com/google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe)
- **License:** Apache License, Version 2.0
- **Copyright:** Copyright 2023 The MediaPipe Authors.
- **Notice:** Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.

---

## 2. Research Datasets Attribution and Licenses

The following research datasets are utilized in training and evaluating MoNUI-7 hand detection and rescue models:

### A1: HANDS RGB-D v2
- **DOI:** [10.17632/ndrczc35bt.2](https://data.mendeley.com/datasets/ndrczc35bt/2)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Dataset provided by Mendeley Data contributors under CC BY 4.0.

### A2: IPN Hand + HandS
- **URL:** [https://gibranbenitez.github.io/IPN_Hand/](https://gibranbenitez.github.io/IPN_Hand/)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0) (Data) / MIT (Code)
- **Attribution:** G. Benitez-Garcia et al., "IPN Hand: A Dataset for Online Gesture Recognition with Background Movement", 2020.

### A3: HandGesture-5G v2
- **DOI:** [10.17632/wj25crzdbm.2](https://data.mendeley.com/datasets/wj25crzdbm/2)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Dataset provided under CC BY 4.0 on Mendeley Data.

### A4: Natural RGB v3
- **DOI:** [10.17632/n66hhk695h.3](https://data.mendeley.com/datasets/n66hhk695h/3)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Dataset provided under CC BY 4.0 on Mendeley Data.

### A5: bxr7 v2
- **DOI:** [10.17632/bxr7kx84y6.2](https://data.mendeley.com/datasets/bxr7kx84y6/2)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Dataset provided under CC BY 4.0 on Mendeley Data.

### A6: BISINDO v2
- **DOI:** [10.17632/235c78xbmk.2](https://data.mendeley.com/datasets/235c78xbmk/2)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Indonesian Sign Language (BISINDO) dataset provided under CC BY 4.0.

### A8: Open Images V7 (Human hand)
- **URL:** [https://storage.googleapis.com/openimages/web/factsfigures_v7.html](https://storage.googleapis.com/openimages/web/factsfigures_v7.html)
- **License:** Annotations licensed under CC BY 4.0 by Google LLC; Images licensed under CC BY 2.0.
- **Attribution:** Open Images V7 dataset contributors and Google LLC.

### A10: Depth Camera D435
- **DOI:** [10.17632/8ffrgcmjkm/1](https://data.mendeley.com/datasets/8ffrgcmjkm/1)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** RealSense D435 RGB-D dataset provided under CC BY 4.0 on Mendeley Data.

### A13: HaGRID v2 (HAnd Gesture Recognition Image Dataset)
- **Repository:** [https://github.com/hukenovs/hagrid](https://github.com/hukenovs/hagrid)
- **License:** Custom Open Public License (CC BY-SA 4.0 Derivative, ShareAlike)
- **Attribution:** A. Kapitanov et al., "HaGRID -- HAnd Gesture Recognition Image Dataset", 2022-2024.

---

## 3. Fonts

The following fonts are self-hosted locally in `frontend/implementation/public/fonts/` (decoded from sandbox r8.3, without external CDN requests):

### Bowlby One (`BowlbyOne-Regular.woff2`)
- **Designer / Author:** Vernon Adams
- **License:** SIL Open Font License 1.1 (OFL-1.1) — [https://openfontlicense.org/](https://openfontlicense.org/)
- **File:** `frontend/implementation/public/fonts/BowlbyOne-Regular.woff2` (21536 B)
- **SHA-256:** `e2f3c84b26df8512d2cda4a9595e278e67b3efc86c5866b0a89ac45a16625e35`
- **Notice:** Self-hosted from sandbox r8.3 without CDN under the terms of the SIL Open Font License, Version 1.1.

### Hanken Grotesk Variable (`HankenGrotesk-Variable.woff2`)
- **Designer / Author:** Hanken Design Co. (Alfredo Marco Pradil)
- **License:** SIL Open Font License 1.1 (OFL-1.1) — [https://openfontlicense.org/](https://openfontlicense.org/)
- **File:** `frontend/implementation/public/fonts/HankenGrotesk-Variable.woff2` (34704 B)
- **SHA-256:** `e9201eddf1d41d0b62253295d869ce3cf65768f7102b797f02c7f8c876b4a9d5`
- **Notice:** Self-hosted from sandbox r8.3 without CDN under the terms of the SIL Open Font License, Version 1.1.

---

## 4. Audio (music, sound effects, ambience)

All audio in `frontend/implementation/public/audio/` (104 files, Opus in Ogg, about 4.4 MiB) is **original work generated by this repository's own scripts** (`frontend/implementation/tools/audio-gen/`, Python with numpy and scipy, encoded with ffmpeg/libopus).

- **No third-party audio is included**: no sample, recording, loop pack, sound-bank preset, MIDI file, text-to-speech or AI audio model was used, and nothing was downloaded. Candidate third-party sounds that could not be verified as CC0/public domain/original were not added.
- **License:** distributed under the repository license (GNU Affero General Public License v3.0, see `LICENSE.md`). No third-party attribution is required.
- **Provenance and checksums:** per-asset id, generator function, duration, loudness and SHA-256 are in `frontend/implementation/docs/audio/AUDIO_ASSET_MANIFEST.md` and `frontend/implementation/public/audio/manifest.json`. The synthesis is deterministic; rebuilding changes the Ogg container serial (file hashes) but not the decoded samples.
- **Tooling licenses (build-time only, not shipped):** NumPy (BSD-3-Clause), SciPy (BSD-3-Clause), FFmpeg/libopus (LGPL/BSD, invoked as an external program).
