# Inspire Edge Radio - Multi-Tenant SaaS Platform Plan

**Prepared for:** Malcolm Olagundoye (Chopstix), CEO of Inspire (inspire.codes)
**Date:** 2026-03-11

---

## 1. EXECUTIVE SUMMARY

Turn Radio1 into a **multi-tenant SaaS platform** where any creator, brand, or org can spin up their own 24/7 AI-powered radio station or podcast channel -- Dockerized, isolated, delivered via AWS. Radio1 becomes "Station Zero" -- the flagship that every tenant's station is built from.

---

## 2. PRICING TIERS

| Tier | Name | Price | Stations | Listeners | Storage | AI DJ |
|------|------|-------|----------|-----------|---------|-------|
| Free | **Spark** | $0 | 1 radio | 10 | 1 GB | None |
| Starter | **Broadcast** | $29/mo | 1 radio + 1 podcast | 100 | 25 GB | 30 min/mo |
| Pro | **Studio** | $79/mo | 2 radio + 3 podcast | 500 | 100 GB | 120 min/mo |
| Business | **Network** | $199/mo | 5 radio + 10 podcast | 2,000 | 500 GB | 500 min/mo |
| Enterprise | **Empire** | $500+ | Unlimited | Custom | Custom | Custom |

**Empire** includes full white-label (remove all Inspire branding, custom domains, dedicated support). Setup fee: $2,000-$10,000.

---

## 3. REVENUE STREAMS

1. **Subscription MRR** -- primary
2. **Overage charges** -- $0.10/GB storage, $0.02/listener-hour beyond limits
3. **AI DJ credits** -- $0.50/min beyond plan allotment
4. **White-label licensing** -- setup fee + premium monthly
5. **Marketplace** -- DJ voice packs, themes, playlist packs (15% commission)
6. **Podcast hosting add-on** -- $9/mo RSS distribution on Spark tier
7. **Ad network** (future) -- pre-roll/mid-roll insertion, revenue share

### Year 1 Projections (Conservative)

| Quarter | Tenants | MRR | ARR |
|---------|---------|-----|-----|
| Q1 | 50 | $3,500 | $42,000 |
| Q2 | 150 | $10,500 | $126,000 |
| Q3 | 400 | $28,000 | $336,000 |
| Q4 | 800 | $56,000 | $672,000 |

---

## 4. DOCKER ARCHITECTURE

### Per-Tenant "Station Pod"

```
TENANT STATION POD (Docker Compose / ECS Task)
================================================
  stream-engine      -- ffmpeg + HLS pipeline
  scheduler          -- playlist management + cron
  metadata-server    -- SSE/WebSocket now-playing
  podcast-engine     -- RSS gen, episode processing
================================================
```

### Docker Image Hierarchy

```
inspire-edge-radio-base     (~200MB: Node.js, ffmpeg, common libs)
  ├── inspire-edge-stream
  ├── inspire-edge-scheduler
  ├── inspire-edge-metadata
  ├── inspire-edge-podcast
  └── inspire-edge-dj        (shared pool, not per-tenant)
```

### Shared vs Isolated

| Component | Model | Why |
|-----------|-------|-----|
| Stream engine | **Isolated** per-tenant | CPU-intensive, quality-critical |
| Scheduler | **Isolated** per-tenant | Tenant-specific playlists |
| Metadata server | **Isolated** per-tenant | Tenant-specific SSE connections |
| Podcast engine | **Isolated** per-tenant | Tenant-specific processing |
| AI DJ engine | **Shared pool** (SQS queue) | Bursty API calls, cost-efficient shared |
| Frontend (Next.js) | **Shared** multi-tenant app | Subdomain routing, dynamic theming |
| Auth | **Shared** (Cognito) | Centralized |
| Billing | **Shared** (Stripe) | Centralized |
| Storage (S3) | **Shared bucket**, tenant-prefixed paths | IAM-scoped isolation |
| Database | **Shared** Postgres, row-level security | tenant_id on every table |
| CDN | **Shared** CloudFront | Path-based routing per tenant |

### Container Resource Limits

| Tier | CPU | Memory | Containers |
|------|-----|--------|------------|
| Spark | 0.25 vCPU | 256 MB | 2 |
| Broadcast | 0.5 vCPU | 512 MB | 4 |
| Studio | 1.0 vCPU | 1 GB | 5 |
| Network | 2.0 vCPU | 2 GB | 5 per station |
| Empire | Custom | Custom | Dedicated cluster |

---

## 5. AWS INFRASTRUCTURE

```
                      Route 53 (*.inspire.radio)
                              |
                        CloudFront (CDN + HLS)
                              |
                  +-----------+-----------+
                  |                       |
                 ALB                     S3
          (API + Stream)          (Media + HLS segments)
                  |
      +-----------+-----------+
      |                       |
  ECS Fargate             ECS Fargate
  CONTROL PLANE           TENANT PODS
  - API Server            - stream-engine
  - Provisioner           - scheduler
  - Auth                  - metadata-svr
  - Billing               - podcast-eng
      |                       |
  RDS Postgres          ElastiCache Redis
  (multi-tenant DB)     (queues, sessions)
      |
  DynamoDB
  (analytics, real-time)
```

### AWS Cost at 100 Tenants

| Service | Monthly Cost |
|---------|-------------|
| ECS Fargate (tenant pods) | $800-1,200 |
| S3 (media storage) | $50-200 |
| CloudFront (CDN) | $100-400 |
| RDS Postgres | $100 |
| ElastiCache Redis | $75 |
| DynamoDB | $25-50 |
| ALB + Route 53 | $30 |
| CloudWatch + misc | $40 |
| **Total** | **$1,220-$2,095/mo** |

### Why ECS Fargate (not EKS)

- No cluster management overhead
- Per-second billing (idle tenants cost less)
- Task definitions map 1:1 to station pods
- $72/mo cheaper (no EKS control plane fee)
- Migrate to EKS at 500+ tenants if needed

---

## 6. TENANT PROVISIONING (< 3 Minutes)

```
SIGNUP (30s)
  -> Email/OAuth -> Select plan -> Stripe checkout -> Account created

CONFIGURE (60s)
  -> Station name, genre, description
  -> Upload logo -> Select AI DJ voice
  -> Choose subdomain: {name}.inspire.radio

PROVISION (60-90s, automated)
  1. Create tenant record in Postgres
  2. Create S3 prefix: s3://inspire-radio-media/{tenant_id}/
  3. Register ECS Task Definition from template
  4. Start ECS Service (containers)
  5. Register ALB target group + routing
  6. Create Route 53 CNAME
  7. Seed default playlist
  8. Init analytics entries

LIVE -> Redirect to dashboard, station streaming with defaults
```

Deprovisioning: containers stopped immediately, media retained 30 days, then purged.

---

## 7. CLIENT DASHBOARD

Single Next.js app, tenant-scoped via JWT:

```
/dashboard
  /overview          -- Health, listeners, storage usage
  /library           -- Upload/manage audio files
  /playlists         -- Create/edit, drag-and-drop ordering
  /schedule          -- Visual schedule builder (time blocks)
  /dj
    /voice           -- Select/preview AI DJ voice + personality
    /scripts         -- Custom DJ script templates
    /segments        -- Preview/approve generated segments
  /podcast
    /episodes        -- Publish/unpublish episodes
    /rss             -- Feed settings, distribution status
    /analytics       -- Per-episode downloads, retention
  /player            -- Embed code generator, player theming
  /analytics         -- Listener demographics, peak hours, geo
  /settings
    /station         -- Name, description, genre, logo
    /domain          -- Custom domain setup (CNAME)
    /billing         -- Plan, invoices, usage meters
    /api-keys        -- Generate/revoke API keys
    /team            -- Invite collaborators (Studio+)
```

---

## 8. API DESIGN

### Control Plane: `https://api.inspire.radio/v1`

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/signup` | Create account |
| `POST /tenants` | Provision station |
| `GET/PATCH/DELETE /tenants/:id` | Manage tenant |
| `POST /stations/:id/start\|stop\|restart` | Stream control |
| `GET/POST/DELETE /library/tracks` | Media management |
| `GET/POST/PATCH/DELETE /playlists` | Playlist CRUD |
| `GET/PUT /schedule` | Schedule management |
| `GET/PUT /dj/config` | AI DJ configuration |
| `GET/POST/PATCH/DELETE /podcast/episodes` | Podcast management |
| `GET /analytics/*` | Listener/episode analytics |
| `GET/POST /billing/*` | Plan, usage, invoices |

### Public Listener API: `https://{station}.inspire.radio/api`

| Endpoint | Purpose |
|----------|---------|
| `GET /now-playing` | Current track metadata |
| `GET /stream.m3u8` | HLS playlist |
| `GET /podcast/feed.xml` | Podcast RSS |
| `WS /ws/live` | Real-time metadata |

---

## 9. COST PER TENANT

| Component | Spark | Broadcast | Studio | Network |
|-----------|-------|-----------|--------|---------|
| ECS compute | $2 | $8 | $18 | $45 |
| S3 storage | $0.02 | $0.58 | $2.30 | $11.50 |
| CloudFront | $0.50 | $5 | $20 | $80 |
| ElevenLabs | $0 | $3 | $12 | $50 |
| Claude API | $0 | $0.50 | $2 | $8 |
| DynamoDB | $0.05 | $0.25 | $1 | $3 |
| **Total cost** | **$2.57** | **$17.33** | **$55.30** | **$197.50** |
| **Price** | **$0** | **$29** | **$79** | **$199** |
| **Gross margin** | -$2.57 | **40%** | **30%** | **~1%** |

Network tier margins improve at scale (CloudFront volume pricing). Fixed platform costs: ~$420/mo. **Break-even: ~36 Broadcast tenants or ~18 Studio tenants.**

---

## 10. SCALING STRATEGY

| Phase | Tenants | Action |
|-------|---------|--------|
| Phase 1 | 0-200 | Single region (us-east-1), single ECS cluster |
| Phase 2 | 200-1,000 | Multi-AZ, Fargate Spot for batch work, container bin-packing |
| Phase 3 | 1,000-5,000 | Multi-region (eu-west-1, ap-southeast-1), Global Accelerator |
| Phase 4 | 5,000+ | Evaluate dedicated streaming CDN, mobile apps, ad network |

**Bin-packing optimization:** Pack 4 Spark tenants per single Fargate task using cgroup limits. Reduces per-tenant compute cost by 60-70%.

---

## 11. SECURITY & ISOLATION

| Layer | Method |
|-------|--------|
| Compute | Separate ECS tasks (Fargate VM-level isolation) |
| Network | Per-task security groups, no inter-tenant communication |
| Storage | S3 prefix isolation + IAM policies scoped to `/{tenant_id}/*` |
| Database | Postgres Row-Level Security (tenant_id on every table) |
| API | JWT embeds tenant_id, middleware enforces scope on every request |
| Secrets | AWS Secrets Manager, per-tenant task IAM roles |
| DNS | Wildcard TLS (`*.inspire.radio`), custom domains via ACM + SNI |
| Content | File type validation on upload, DMCA takedown automation |
| Infra | Non-root containers, ECR scanning, VPC private subnets, WAF, GuardDuty |

---

## 12. WHITE-LABEL (EMPIRE TIER)

| Feature | Description |
|---------|-------------|
| Custom domain | `radio.clientbrand.com` |
| Complete brand removal | No Inspire logos, colors, or references |
| Custom dashboard domain | `dashboard.clientbrand.com` |
| Custom color scheme | Full CSS variable override |
| Custom email templates | Sent from client's domain |
| Dedicated support | Private Slack channel |
| Custom TOS/Privacy | Client's legal docs |

Implementation: `tenant_config.branding` JSON object applied via CSS variables + conditional rendering.

---

## 13. BUILD PHASES

| Phase | Weeks | Deliverables |
|-------|-------|-------------|
| **A: Foundation** | 1-4 | Dockerize stream engine, control plane API, AWS infra, provisioning pipeline |
| **B: Multi-Tenancy** | 5-8 | Multi-tenant frontend, client dashboard, tenant-scoped storage, Stripe billing |
| **C: AI + Podcast** | 9-12 | Shared DJ service, podcast pipeline, analytics dashboard, beta launch (10 tenants) |
| **D: Launch** | 13-16 | Public launch of inspire.radio, marketing site, docs, onboarding optimization |

---

## 14. KEY RISKS

| Risk | Mitigation |
|------|------------|
| Copyright liability | TOS: tenants own content rights. DMCA automation. |
| ElevenLabs cost at scale | Volume pricing negotiation. Voice caching. BYOK option. |
| Noisy neighbor | Hard resource limits per container. Automatic throttling. |
| AWS bill surprise | Budget alerts at 80%/100%. Reserved instances after 6 months. |
| Low adoption | Freemium drives signups. Malcolm's music industry network for traction. |

---

*Mixed and mastered. Let's discuss, boss.*
