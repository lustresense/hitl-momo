# PRD: Sketchbook Universe — PA AI Literacy Platform (2026-10-21)

> **Source of truth**: Existing comprehensive docs (CHANGELOG, DESIGN_RESEARCH, BAB_4, etc.) + reality check.
> **Status**: Initial PRD konsolidasi dari dokumentasi yang sudah ada.

---

## 1. PRODUCT IDENTITY

| Field | Value |
|-------|-------|
| **Product** | Sketchbook Universe / Escape the Sketchbook |
| **Mission** | PA terpadu literasi AI untuk siswa SMP kelas 7–9 |
| **Target User** | Siswa SMP (primary), Guru (facilitator), Sekolah (stakeholder) |
| **Platform** | Web-based (multi-tenant sekolah) |
| **Brand** | "Escape the Sketchbook" — narrative-driven AI literacy |

---

## 2. CURRENT STATE (Dari docs existing)

### Core Documentation
- **CHANGELOG.md** — Decision log dengan protokol semi-otomatis
- **DESIGN_RESEARCH.md** — Research desain, kompetisi, user needs
- **BAB_4_Implementasi_dan_Pengujian.md** — Implementasi & testing detail
- **DESIGN_TOKENS_EXTRACTION.md** — Design system tokens
- **SECURITY_GATE.md** — Security requirements & gates
- **Laporan-Progres.md** — Progress report akademik
- **SOURCE_OF_TRUTH.md** — Single source of truth definitions
- **PROJECT_MEMORY.md** — Project context & memory
- **WORKING_CONTEXT.md** — Current working context
- **INSTRUCTION.md** — Instructions untuk AI agents
- **AGENTS.md** — Agent orchestration config

### Key Decisions (dari CHANGELOG)
- Single integrated PA system (bukan dua app terpisah)
- Internal name: **Sketchbook Universe**
- Target: SMP kelas 7–9
- Formal title follows latest approved doc/MIS

---

## 3. TECH STACK — SPEC vs REALITY

| Layer | **Target** | **Current (dari docs)** | **Gap** |
|-------|------------|-------------------------|---------|
| **Frontend** | Modern web framework (React/Vue/Svelte + TS) | Not specified in root docs | Major |
| **Backend** | API + Database (PostgreSQL/Supabase) | Not specified | Major |
| **Auth** | School SSO / Google / Microsoft Edu | Not specified | Major |
| **Real-time** | WebSocket/SSE untuk kolaborasi | Not specified | Medium |
| **AI Integration** | LLM API (OpenAI/Anthropic/local) + RAG | Referenced in docs | Medium |
| **Deploy** | Cloud (Vercel/Netlify/Cloudflare) + Docker | Not specified | Major |
| **Testing** | Vitest + Playwright + A11y | Not specified | Major |
| **CI/CD** | GitHub Actions | Not specified | Major |
| **Monitoring** | Sentry + Analytics | Not specified | Major |

> **Note**: Root folder docs adalah level proyek/akademik. Implementation details kemungkinan di subfolder `implementation/`, `design/`, `academic/`.

---

## 4. ARCHITECTURE (Target — perlu detail dari implementation/)

```
sketchbook-universe/
├── apps/
│   ├── web/                 # Student/Teacher web app
│   ├── admin/               # School admin dashboard
│   └── api/                 # Backend API
├── packages/
│   ├── ui/                  # Shared design system (design tokens dari DESIGN_TOKENS_EXTRACTION.md)
│   ├── shared/              # Types, utilities, AI prompts
│   └── config/              # ESLint, TSConfig, Tailwind
├── docs/                    # Academic & project docs (existing)
├── implementation/          # Implementation specs (existing)
├── design/                  # Design assets (existing)
├── academic/                # Academic docs (existing)
├── research/                # Research (existing)
├── docker-compose.yml
├── turbo.json               # Turborepo (if monorepo)
├── PRD.md                   # This file
├── SPEC.md                  # Spec template
├── CHANGELOG.md             # Existing (decision log)
├── README.md
└── AGENTS.md                # Existing
```

---

## 5. FEATURE AREAS (Dari research & design docs)

### Core Learning Experience
- **Narrative-driven**: "Escape the Sketchbook" storyline
- **AI Literacy Modules**: Understanding AI, prompting, ethics, bias, creativity
- **Progressive Disclosure**: Complexity naik per level/kelas
- **Assessment**: Formative + summative, portfolio-based

### Teacher Tools
- Class management
- Progress tracking
- Curriculum alignment (Kurikulum Merdeka)
- Lesson plans & facilitation guides

### School Admin
- Multi-class/school management
- Analytics & reporting
- Data privacy compliance (PDP Indonesia)

### Platform (Fovenelab)
- Content authoring
- A/B testing curriculum
- Analytics across schools

---

## 6. IMMEDIATE ACTION ITEMS

### P0 — Foundation (Need Technical Spec)
- [ ] **Technical architecture decision**: Monorepo? Framework? Database? Deploy target?
- [ ] **Auth strategy**: How schools onboard? SSO?
- [ ] **Data model**: Students, classes, schools, progress, assessments
- [ ] **AI integration pattern**: Proxy API? Direct? Local models?

### P1 — MVP Features
- [ ] Student app: Onboarding → Module 1 → Assessment
- [ ] Teacher dashboard: Class view, progress
- [ ] Content delivery: Interactive lessons (text, media, AI chat)
- [ ] Basic analytics

### P2 — Quality & Scale
- [ ] Testing infrastructure
- [ ] CI/CD pipeline
- [ ] Accessibility (WCAG AA)
- [ ] Performance budgets
- [ ] Security audit (SECURITY_GATE.md)

### P3 — Production Ready
- [ ] Multi-tenancy (sekolah)
- [ ] GDPR/PDP compliance
- [ ] Offline-first / PWA
- [ ] Analytics dashboard
- [ ] Content management system

---

## 7. OPEN QUESTIONS (Critical — Need Owner Decision)

1. **Tech stack final**: React/Next.js? Vue/Nuxt? Svelte/SvelteKit? Astro? Plain TS?
2. **Backend**: BaaS (Supabase/Appwrite/Firebase) atau custom Node/Go/Rust?
3. **Database**: PostgreSQL (Supabase/Neon), SQLite (Turso), MongoDB?
4. **Auth**: Clerk? NextAuth? Custom? School Google/Microsoft SSO?
5. **AI Provider**: OpenAI API? Anthropic? Local (Ollama/llama.cpp)? Hybrid?
6. **Deployment**: Vercel? Cloudflare Pages? VPS + Docker? Kubernetes?
7. **Monorepo**: Turborepo? Nx? Single repo per app?
8. **Timeline**: Academic deadline? Pilot schools ready?
9. **Budget**: API costs (AI), hosting, third-party services?
10. **Team**: Who builds? Udin/Dadang/Asep roles?

---

## 8. REFERENCES (Existing Docs)

| File | Purpose |
|------|---------|
| [CHANGELOG.md](./CHANGELOG.md) | Decision log (single source of truth untuk keputusan) |
| [DESIGN_RESEARCH.md](./DESIGN_RESEARCH.md) | Design research, competitive analysis |
| [BAB_4_Implementasi_dan_Pengujian.md](./BAB_4_Implementasi_dan_Pengujian.md) | Implementation & testing spec |
| [DESIGN_TOKENS_EXTRACTION.md](./DESIGN_TOKENS_EXTRACTION.md) | Design system tokens |
| [SECURITY_GATE.md](./SECURITY_GATE.md) | Security requirements |
| [Laporan-Progres.md](./Laporan-Progres.md) | Academic progress report |
| [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md) | Source of truth definitions |
| [PROJECT_MEMORY.md](./PROJECT_MEMORY.md) | Project context |
| [WORKING_CONTEXT.md](./WORKING_CONTEXT.md) | Current context |
| [INSTRUCTION.md](./INSTRUCTION.md) | AI agent instructions |
| [AGENTS.md](./AGENTS.md) | Agent orchestration |

---

## 9. NEXT STEPS

1. **Owner review PRD ini** → isi/open questions di section 7
2. **Technical architecture session** → tentukan stack (section 3)
3. **Create SPEC** untuk MVP features (dari template SPEC.md)
4. **Setup repo structure** (monorepo atau polyrepo)
5. **Implement P0** foundation
