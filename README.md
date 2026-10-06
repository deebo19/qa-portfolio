# Adeeb Hussain — QA Lead Portfolio

Live site: **https://deebo19.github.io/qa-portfolio/**

A portfolio for recruiters and hiring managers covering my QA career end to end, with its own automated test suite and a deploy that only ships when every test passes.

**Stack:** React + TypeScript + SCSS (Create React App), Material UI. Hosted on GitHub Pages, tested with Playwright and axe-core.
**Design:** based on the open-source [react-portfolio-template](https://github.com/yujisatojr/react-portfolio-template) by Yuji Sato (MIT, see `LICENSE-template`).

## Editing content

All text, links, stats, roles and case studies live in **`src/data.tsx`**. Change that file and push: CI rebuilds, retests and redeploys.

## Run it locally

```bash
npm install
npm start        # dev server with live reload at http://localhost:3000
npm test         # builds, then runs the full test suite (desktop + mobile)
```

## What the tests check

| Check | Why it matters |
|---|---|
| Title, single h1, avatar loads | Content and SEO regressions |
| Job title, tagline, 4 company cards each with a source link | Hero accuracy |
| 7 roles, 7 case studies, all 8 approach stages | Missing content |
| Nav links point to real sections | Broken navigation |
| No local link or asset returns 404 | Broken files after a build |
| Theme toggle and mobile menu work | Interactive behaviour |
| Contact buttons go to email and LinkedIn | Recruiters can reach me |
| No horizontal scroll, no console errors | Layout and JS regressions |
| WCAG 2 A/AA via axe-core, in dark **and** light mode | Accessibility |

A second, independent suite lives in [`qa/`](qa/README.md): **Python + Playwright + Page Object Model**, run headless with `cd qa && pytest`. It's explained on the site's own "How I Test" page.

CI (`.github/workflows/ci.yml`) builds the site, runs the JS suite against that exact build, then the Python POM suite, checks the bundle has every referenced file, and only deploys from `main` when everything passed.

## Side project: London commute alerts

[`commute/`](commute/README.md) is a self-contained TypeScript service that checks a London commute against live TfL data each weekday morning and sends a Telegram alert, with an alternative route, only when the usual route is affected. It has its own unit tests, recorded fixtures and a scheduled GitHub Actions workflow (`.github/workflows/commute-morning.yml`).

## Visitor analytics

Visit and click stats use [GoatCounter](https://www.goatcounter.com): free, no cookies, no consent banner needed.

1. Sign up at goatcounter.com and pick a site code (e.g. `adeeb-qa`).
2. Set `REACT_APP_GOATCOUNTER_CODE=adeeb-qa` in `.env` and push.
3. View the dashboard at `https://adeeb-qa.goatcounter.com`: visitors, pages, countries, referrers, devices,
   and click events (`click-nav-*`, `click-out-*`, `click-button-*`, `click-email`).

Local dev and automated test runs are never counted. `qa/tests/test_analytics.py` checks what gets sent using a stub.

## Search engines (SEO)

- Every build is **prerendered** (`scripts/prerender.mjs`): the shipped `index.html` already contains the full rendered page, so crawlers that don't run JavaScript still see the name, title and experience.
- Structured data is a schema.org `ProfilePage` about a `Person`, linked to LinkedIn and GitHub.
- **Google Search Console:** add a URL-prefix property for the site, choose "HTML tag", paste the `content` value into
  `REACT_APP_GOOGLE_SITE_VERIFICATION` in `.env`, push, verify, then submit `sitemap.xml` and request indexing.
