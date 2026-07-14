export default {
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:4174", localStorage: [{ name: "subnet-studio-walkthrough-v1", value: "complete" }] }] },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 720 } } },
    { name: "firefox", use: { browserName: "firefox", viewport: { width: 1280, height: 720 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 1280, height: 720 } } },
    { name: "mobile-chrome", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
};
