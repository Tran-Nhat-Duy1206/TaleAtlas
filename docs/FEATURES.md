# Feature scope

V0 foundation is implemented and local acceptance is complete. Hosted acceptance remains pending; observed results and historical failures are recorded separately in VALIDATION.

| Area | Implemented V0 scope | Observed evidence / limits |
| --- | --- | --- |
| Accounts | Better Auth email/password, verified email, reset and deletion flows | Local PostgreSQL auth lifecycle checks passed; production SMTP unverified |
| Sessions/roles | Server guards, revocation, server-owned user/moderator/admin roles | Role injection/downgrade, logout/reset/replay/deletion integration checks passed |
| Persistence | Drizzle PostgreSQL identity/rate-limit schema, explicit migrations | Actual isolated UTF-8 PostgreSQL 18.4 migration and unique/FK/rollback checks passed |
| Presentation | Shared shell, EN/VI core pages, mobile layout and next-themes | Native locale/account links cross root-layout documents; 3/3 development tests passed twice consecutively after bounded-source correction; final production smoke passed; not a11y certification |
| Security | Trusted Origin/CSRF, production secure cookies, DB limiter, sanitized errors | Forged Origin denied; concurrent 12-attempt limiter allowed 5/rejected 7 |
| Health | `/api/health` liveness; `/api/ready` bounded DB/schema probe | Browser checks passed locally; not SMTP/backup health |

Latest static/unit/build evidence passed: root/all-package/test typecheck including Next type generation, 57 unit tests across six files, lint and production build after native navigation/Vietnamese font fixes. Cold migration/repeat/no-change generation passed. `pnpm audit --prod` reported zero vulnerabilities; not a security certification.

**V0 LOCAL ACCEPTANCE COMPLETE; hosted validation remains pending.** Three development Playwright tests passed twice consecutively; final post-font/navigation/bounded-source production build and smoke passed SSR Vietnamese language, health/readiness, EN/VI navigation, robots/sitemap and zero browser page errors. Historical navigation/reload failures were addressed with root-layout document links and bounded Tailwind scanning, not waived. Development `destination stream errored` diagnostics during interrupted navigation/prefetch remain known; none observed in production smoke. Emails remain English-only; database preferredLocale is read-only/reserved with default en.

Absent/planned: metadata providers, story catalog/search, private reading library, progress/rereads, communities, imports, recommendations, analytics and durable jobs. GitHub social login is not configured. Neon/Vercel deployment guidance does not imply provisioned resources. See VALIDATION for final command evidence and ROADMAP for future scope.
