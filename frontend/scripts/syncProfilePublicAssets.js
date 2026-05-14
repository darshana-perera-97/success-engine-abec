const fs = require("fs");
const path = require("path");

const frontendRoot = path.join(__dirname, "..");
const profileConfigPath = path.join(frontendRoot, "src", "profileConfig.js");
const publicDir = path.join(frontendRoot, "public");

const profileConfigSource = fs.readFileSync(profileConfigPath, "utf8");
const profileMatch = profileConfigSource.match(
  /export const ACTIVE_PROFILE\s*=\s*["']([^"']+)["']/
);
const activeProfile = profileMatch?.[1] || "abec";
const profileAssetsDir = path.join(
  frontendRoot,
  "src",
  "profile",
  activeProfile,
  "assets"
);

const filesToSync = ["companyIcon.png", "company-full-logo.png"];

for (const fileName of filesToSync) {
  const sourcePath = path.join(profileAssetsDir, fileName);
  const targetPath = path.join(publicDir, fileName);
  if (!fs.existsSync(sourcePath)) {
    console.warn(
      `[syncProfilePublicAssets] Skipping ${fileName}: not found for profile "${activeProfile}".`
    );
    continue;
  }
  fs.copyFileSync(sourcePath, targetPath);
  console.log(
    `[syncProfilePublicAssets] Copied ${fileName} from profile "${activeProfile}" to public/.`
  );
}
