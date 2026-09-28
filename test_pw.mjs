import { chromium } from "playwright";
import fs from "fs";
import path from "path";

(async () => {
  const userDataDir = path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data");
  
  // We must launch a persistent context
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();
  console.log("Navigating to localhost:3000/social...");
  await page.goto("http://localhost:3000/social");
  
  await page.waitForTimeout(3000);
  console.log("Current URL:", page.url());
  
  const html = await page.content();
  console.log("Page title:", await page.title());
  if (html.includes("Admin")) {
    console.log("Successfully logged in as Admin.");
  } else {
    console.log("Not logged in. HTML snippet:", html.substring(0, 500));
  }

  await browser.close();
})();
