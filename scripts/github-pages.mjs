/**
 * Builds the copy of the site for GitHub Pages and, with --publish, puts it
 * online at https://<github user>.github.io/<repository>/.
 *
 *   npm run pages            build it into .static-build/site
 *   npm run pages:publish    build it and publish it (gh-pages branch)
 *
 * GitHub Pages only serves files, so this copy has no server: browsing, the
 * designer, prices and the cart work, and orders and "send it to us" requests
 * go to WhatsApp. Online checkout, group links, order pages and the admin
 * panel are left out. English is at the root and Arabic under /ar.
 * Prices come from this computer's database when it's built, so publish again
 * after changing prices in the admin panel.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const work = path.join(root, ".static-build");
const app = path.join(work, "app");
const site = path.join(work, "site");
const publish = process.argv.includes("--publish");

const git = (args, cwd = root) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// The repository's name is the site's path on GitHub Pages.
const remote = git(["remote", "get-url", "origin"]);
const repo = remote.replace(/\.git$/, "").split(/[/:]/).pop();
const rootPath = `/${repo}`;

// Parts that need the server, so they can't be on GitHub Pages.
const SERVER_ONLY = ["src/app/api", "src/app/admin", "src/app/checkout", "src/app/g", "src/app/track"];
const CONFIG_FILES = ["next.config.ts", "tsconfig.json", "postcss.config.mjs", "package.json"];

function prepareCopy() {
  for (const dir of ["src", "public", "out"]) fs.rmSync(path.join(app, dir), { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  for (const dir of ["src", "public"]) {
    fs.cpSync(path.join(root, dir), path.join(app, dir), { recursive: true, filter: (p) => !p.endsWith(".test.ts") });
  }
  for (const file of CONFIG_FILES) fs.copyFileSync(path.join(root, file), path.join(app, file));
  for (const dir of SERVER_ONLY) fs.rmSync(path.join(app, dir), { recursive: true, force: true });
}

function build(locale) {
  const basePath = locale === "ar" ? `${rootPath}/ar` : rootPath;
  console.log(`\nBuilding the ${locale === "ar" ? "Arabic" : "English"} copy for ${basePath}/`);
  fs.rmSync(path.join(app, "out"), { recursive: true, force: true });
  execFileSync(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
    cwd: app,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_SITE: "1",
      NEXT_PUBLIC_STATIC_LOCALE: locale,
      NEXT_PUBLIC_STATIC_ROOT: rootPath,
      STATIC_BASE_PATH: basePath,
      // Bake in the prices saved on this computer.
      ARCANE_DATA_DIR: path.join(root, ".data"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  fs.cpSync(path.join(app, "out"), locale === "ar" ? path.join(site, "ar") : site, { recursive: true });
}

function publishSite() {
  const pub = path.join(work, "publish");
  fs.rmSync(pub, { recursive: true, force: true });
  fs.cpSync(site, pub, { recursive: true });
  git(["init", "-q", "-b", "gh-pages"], pub);
  git(["config", "user.name", git(["config", "user.name"])], pub);
  git(["config", "user.email", git(["config", "user.email"])], pub);
  git(["remote", "add", "origin", remote], pub);
  // Add to what's already published instead of replacing its history.
  try {
    git(["fetch", "-q", "--depth", "1", "origin", "gh-pages"], pub);
    git(["reset", "-q", "--soft", "FETCH_HEAD"], pub);
  } catch {
    // First time: the gh-pages branch doesn't exist yet.
  }
  git(["add", "-A"], pub);
  if (!git(["status", "--porcelain"], pub)) {
    console.log("\nNothing changed since the last publish.");
    return;
  }
  git(["commit", "-q", "-m", process.env.PAGES_COMMIT_MESSAGE || "Publish website"], pub);
  git(["push", "-q", "origin", "gh-pages"], pub);
  const user = remote.match(/github\.com[/:]([^/]+)\//)?.[1] ?? "<user>";
  console.log(`\nPublished. It appears at https://${user.toLowerCase()}.github.io/${repo}/ within a minute or two.`);
}

prepareCopy();
fs.rmSync(site, { recursive: true, force: true });
build("en");
build("ar");
// Without this, GitHub Pages hides the _next folder that holds the site's code.
fs.writeFileSync(path.join(site, ".nojekyll"), "");
console.log(`\nBuilt the GitHub Pages copy in ${path.relative(root, site)}`);
if (publish) publishSite();
