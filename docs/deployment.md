# GitHub Pages deployment

Published from the owner's approved public repository:

- Repository: https://github.com/RamonLinares/GridPunk
- Game: https://gridpunk.smallweblab.com/
- Deployment workflow: `.github/workflows/pages.yml`
- Hosting: GitHub Pages, using GitHub Actions to build and upload `dist/`
- DNS: Cloudflare, `gridpunk.smallweblab.com CNAME ramonlinares.github.io`, DNS only, automatic TTL

Every push to `main` builds the game with Node.js 22 and `npm ci`, checks TypeScript, bundles it with Vite, and deploys the build. The workflow can also be started manually. The original local development commands remain available.

The custom domain is configured in the GitHub Pages API/settings; the `public/CNAME` file records the intended domain alongside the source. Runtime asset paths assume this domain's root. The standard GitHub Pages project URL redirects to the custom domain.

## Verification on 20 September 2026

- Public repository and pushed commit verified.
- Production build passed locally and in GitHub Actions.
- Initial deployment run `35516103857` completed successfully for commit `a95d3bc`.
- Cloudflare record saved and checked against authoritative DNS, Cloudflare's public resolver and Google's public resolver.
- Published page, production JavaScript entry, and all 21 public asset/metadata checks succeeded.
- The published game loaded its garage and started a rendered race in the browser.
- GitHub DNS health check passed: the domain resolves, its DNS configuration is valid, and it is eligible for HTTPS.
- HTTPS certificate provisioning started after refreshing the custom domain once DNS had propagated.
