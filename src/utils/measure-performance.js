// scripts/measure-performance.js - NOVI FAJL
import puppeteer from "puppeteer";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function measurePerformance() {
  console.log("🚀 Starting performance measurement...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Enable performance monitoring
    await page.setCacheEnabled(false);

    console.log("📊 Navigating to app...");

    // Navigate to your app
    const response = await page.goto("http://localhost:4173", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    if (!response.ok()) {
      throw new Error(`Failed to load page: ${response.status()}`);
    }

    // Wait for app to load
    await page.waitForSelector("main", { timeout: 10000 });

    // Measure initial load performance
    const metrics = await page.metrics();
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        domContentLoaded:
          navigation.domContentLoadedEventEnd -
          navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint:
          performance.getEntriesByName("first-paint")[0]?.startTime || 0,
        firstContentfulPaint:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime || 0,
      };
    });

    // Test navigation to matches page
    console.log("🔄 Testing matches page navigation...");
    const matchesStart = Date.now();

    await page.click('a[href*="matches"]');
    await page.waitForSelector(
      '[data-testid="matches-container"], .min-h-screen',
      { timeout: 10000 }
    );

    const matchesLoadTime = Date.now() - matchesStart;

    // Test tab switching
    console.log("📊 Testing tab switching performance...");
    const tabSwitchTimes = [];

    const tabs = ["live", "upcoming", "finished", "all"];
    for (const tab of tabs) {
      const startTime = Date.now();

      // Click tab button
      const tabButton = await page.$(
        `button:has-text("${tab.charAt(0).toUpperCase() + tab.slice(1)}")`
      );
      if (tabButton) {
        await tabButton.click();
        await page.waitForTimeout(500); // Give it time to load
      }

      const switchTime = Date.now() - startTime;
      tabSwitchTimes.push({ tab, time: switchTime });
    }

    // Get final metrics
    const finalMetrics = await page.metrics();

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      initialLoad: {
        domContentLoaded: `${performanceMetrics.domContentLoaded.toFixed(2)}ms`,
        loadComplete: `${performanceMetrics.loadComplete.toFixed(2)}ms`,
        firstPaint: `${performanceMetrics.firstPaint.toFixed(2)}ms`,
        firstContentfulPaint: `${performanceMetrics.firstContentfulPaint.toFixed(
          2
        )}ms`,
      },
      memory: {
        heapUsed: `${(finalMetrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(finalMetrics.JSHeapTotalSize / 1024 / 1024).toFixed(
          2
        )}MB`,
        heapLimit: `${(finalMetrics.JSHeapTotalSize / 1024 / 1024).toFixed(
          2
        )}MB`,
      },
      dom: {
        nodes: finalMetrics.Nodes,
        eventListeners: finalMetrics.JSEventListeners,
      },
      navigation: {
        matchesPageLoad: `${matchesLoadTime}ms`,
        tabSwitching: tabSwitchTimes
          .map((t) => `${t.tab}: ${t.time}ms`)
          .join(", "),
      },
      performance: {
        status:
          performanceMetrics.firstContentfulPaint < 1500
            ? "✅ Good"
            : "⚠️ Needs improvement",
        recommendations: generateRecommendations(
          performanceMetrics,
          finalMetrics
        ),
      },
    };

    // Save report
    const reportPath = join(__dirname, "../performance-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Console output
    console.log("\n📊 Performance Report:");
    console.log("=".repeat(50));
    console.log(
      `🚀 First Contentful Paint: ${performanceMetrics.firstContentfulPaint.toFixed(
        2
      )}ms`
    );
    console.log(
      `📄 DOM Content Loaded: ${performanceMetrics.domContentLoaded.toFixed(
        2
      )}ms`
    );
    console.log(
      `🧠 Memory Used: ${(finalMetrics.JSHeapUsedSize / 1024 / 1024).toFixed(
        2
      )}MB`
    );
    console.log(`🌐 DOM Nodes: ${finalMetrics.Nodes}`);
    console.log(`🔄 Matches Page Load: ${matchesLoadTime}ms`);
    console.log(
      `📊 Tab Switch Average: ${(
        tabSwitchTimes.reduce((sum, t) => sum + t.time, 0) /
        tabSwitchTimes.length
      ).toFixed(2)}ms`
    );
    console.log(`\n💾 Full report saved to: ${reportPath}`);

    return report;
  } catch (error) {
    console.error("❌ Performance measurement failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

function generateRecommendations(performanceMetrics, metrics) {
  const recommendations = [];

  if (performanceMetrics.firstContentfulPaint > 1500) {
    recommendations.push("Consider code splitting and lazy loading");
  }

  if (metrics.JSHeapUsedSize > 50 * 1024 * 1024) {
    // 50MB
    recommendations.push("High memory usage detected - check for memory leaks");
  }

  if (metrics.Nodes > 5000) {
    recommendations.push("Large DOM detected - consider virtualization");
  }

  if (performanceMetrics.domContentLoaded > 1000) {
    recommendations.push("Slow DOM loading - optimize critical render path");
  }

  if (recommendations.length === 0) {
    recommendations.push("Performance looks good! 🎉");
  }

  return recommendations;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  measurePerformance()
    .then(() => {
      console.log("✅ Performance measurement completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Performance measurement failed:", error);
      process.exit(1);
    });
}

export default measurePerformance;
