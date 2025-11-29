// icon-color: deep-blue; icon-glyph: chalkboard-teacher;

const username = "kongesque"; // replace with your github username
const token = Keychain.get("github_token_here"); // replace this with you token
const size = "medium";
const theme = "auto"; // "auto", "dark", or "light"

const rawParam = (args.widgetParameter || theme).toLowerCase();
let themeParam = "auto";

if (rawParam.includes("dark")) {
    themeParam = "dark";
} else if (rawParam.includes("light")) {
    themeParam = "light";
}

const heatmapThemes = {
    auto: Device.isUsingDarkAppearance()
        ? {
            bg: ["#0d1117", "#0d1117", "#0d1117"],
            text: "#ffffff",
            accent: "#56d364",
            box: ["#2e2f37", "#196c2e", "#196c2e", "#2ea043", "#56d364"]
        }
        : {
            bg: ["#ffffff", "#ffffff", "#ffffff"],
            text: "#000000",
            accent: "#116329",
            box: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"]
        },
    light: {
        bg: ["#ffffff", "#ffffff", "#ffffff"],
        text: "#000000",
        accent: "#116329",
        box: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"]
    },
    dark: {
        bg: ["#0d1117", "#0d1117", "#0d1117"],
        text: "#ffffff",
        accent: "#56d364",
        box: ["#2e2f37", "#196c2e", "#196c2e", "#2ea043", "#56d364"]
    }
};

// Cache configuration
const CACHE_DIR = ".cache";
const CACHE_FILE = "github_stats_cache.json";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cache management class
class CacheManager {
    constructor() {
        this.fm = FileManager.iCloud();
        this.cacheDir = this.fm.joinPath(this.fm.documentsDirectory(), CACHE_DIR);
        this.cacheFile = this.fm.joinPath(this.cacheDir, CACHE_FILE);
        console.log(`Cache directory path: ${this.cacheDir}`);
        console.log(`Cache file path: ${this.cacheFile}`);
        this.ensureCacheDir();
    }

    ensureCacheDir() {
        try {
            if (!this.fm.fileExists(this.cacheDir)) {
                console.log("Creating cache directory...");
                this.fm.createDirectory(this.cacheDir, true);
                console.log("Cache directory created successfully");
            } else {
                console.log("Cache directory already exists");
            }
        } catch (error) {
            console.error("Failed to create cache directory:", error);
        }
    }

    async saveCache(data) {
        try {
            console.log(`Attempting to save cache with data: ${Object.keys(data).join(', ')}`);

            // Ensure directory exists before writing
            this.ensureCacheDir();

            const cacheData = {
                timestamp: Date.now(),
                data: data
            };

            const jsonString = JSON.stringify(cacheData, null, 2);
            console.log(`Writing cache data, size: ${jsonString.length} characters`);

            this.fm.writeString(this.cacheFile, jsonString);

            // Download from iCloud to ensure it's available
            if (this.fm.fileExists(this.cacheFile)) {
                await this.fm.downloadFileFromiCloud(this.cacheFile);
                const fileSize = this.fm.fileSize(this.cacheFile);
                console.log(`Cache saved successfully! File size: ${fileSize} bytes`);
            } else {
                console.error("Cache file was not created!");
            }
        } catch (error) {
            console.error("Failed to save cache:", error);
            console.error(`Error details: ${error.message}`);
        }
    }

    async loadCache() {
        try {
            if (!this.fm.fileExists(this.cacheFile)) {
                console.log("No cache file found");
                return null;
            }

            // Download from iCloud first
            await this.fm.downloadFileFromiCloud(this.cacheFile);
            const cacheContent = this.fm.readString(this.cacheFile);
            const cacheData = JSON.parse(cacheContent);

            // Check if cache is still valid (within 24 hours)
            const isValid = (Date.now() - cacheData.timestamp) < CACHE_DURATION;

            if (!isValid) {
                console.log("Cache expired");
                return null;
            }

            console.log("Cache loaded successfully");
            return cacheData.data;
        } catch (error) {
            console.error("Failed to load cache:", error);
            return null;
        }
    }
}

// Initialize cache manager
const cacheManager = new CacheManager();

// Helper function to check internet connectivity
async function isOnline() {
    try {
        const req = new Request("https://www.google.com");
        req.timeoutInterval = 5; // 5 second timeout
        await req.load();
        return true;
    } catch (error) {
        console.log("No internet connection detected");
        return false;
    }
}



const UI = {
    medium: { font: 13, headfont: 24, lineSpacing: 5, logo: 38, pad: 14 }
}[size];

function getHeatmapColor(count) {
    const boxes = heatmapThemes[themeParam].box;
    if (count === 0) return new Color(boxes[0]);
    if (count >= 20) return new Color(boxes[4]);
    if (count >= 10) return new Color(boxes[3]);
    if (count >= 5) return new Color(boxes[2]);
    if (count >= 1) return new Color(boxes[1]);
    return new Color(boxes[0]);
}

function createGradientBackground() {
    const theme = heatmapThemes[themeParam];
    const gradient = new LinearGradient();
    gradient.colors = theme.bg.map(c => new Color(c));
    gradient.locations = [0.0, 0.5, 1.0];
    return gradient;
}

async function fetchHeatmapData() {
    const online = await isOnline();

    // If offline, use cache immediately
    if (!online) {
        console.log("Offline mode - loading heatmap data from cache");
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {
            console.log("✅ Using cached heatmap data (offline)");
            return cachedData.heatmapData;
        }
        throw new Error("No internet connection and no valid cache available");
    }

    // If online, try to fetch fresh data
    try {
        console.log("🌐 Online mode - fetching fresh heatmap data");
        const now = new Date();
        const fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 133); // ~19 weeks

        const query = `{
      user(login: "${username}") {
        contributionsCollection(from: "${fromDate.toISOString()}", to: "${now.toISOString()}") {
          totalCommitContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }`;

        const req = new Request("https://api.github.com/graphql");
        req.method = "POST";
        req.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        };
        req.body = JSON.stringify({ query });

        const json = await req.loadJSON();
        const contribData = json.data.user.contributionsCollection;

        // calculate streak
        const allDays = contribData.contributionCalendar.weeks.flatMap(w => w.contributionDays);
        const todayStr = new Date().toISOString().split("T")[0];
        let currentStreak = 0;
        for (let i = allDays.length - 1; i >= 0; i--) {
            const d = allDays[i];
            if (d.date === todayStr) continue;
            if (d.contributionCount > 0) currentStreak++;
            else break;
        }

        const result = {
            ...contribData,
            currentStreak
        };

        console.log("✅ Fresh heatmap data fetched successfully");
        return result;
    } catch (error) {
        console.error("❌ Failed to fetch heatmap data:", error);
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {
            console.log("✅ Using cached heatmap data as fallback");
            return cachedData.heatmapData;
        }
        throw error;
    }
}

function createErrorWidget(message) {
    const widget = new ListWidget();
    widget.backgroundGradient = createGradientBackground();

    const errorText = widget.addText(message);
    errorText.font = Font.systemFont(14);
    errorText.textColor = Color.red();
    errorText.centerAlignText();

    return widget;
}

async function createHeatmapWidget() {
    try {
        const online = await isOnline();
        let data;

        if (online) {
            // When online, fetch fresh data
            try {
                console.log("Fetching fresh heatmap data...");
                data = await fetchHeatmapData();

                // Save to cache
                console.log("Saving heatmap data to cache...");
                const existingCache = await cacheManager.loadCache() || {};
                await cacheManager.saveCache({
                    ...existingCache,
                    heatmapData: data,
                    timestamp: Date.now()
                });
                console.log("Heatmap data cached successfully");
            } catch (error) {
                console.error("Failed to fetch heatmap data:", error);
                const cachedData = await cacheManager.loadCache();
                if (cachedData && cachedData.heatmapData) {
                    data = cachedData.heatmapData;
                    console.log("Using cached heatmap data as fallback");
                } else {
                    throw error;
                }
            }
        } else {
            // When offline, load from cache
            console.log("Offline mode - loading heatmap from cache...");
            const cachedData = await cacheManager.loadCache();
            if (cachedData && cachedData.heatmapData) {
                data = cachedData.heatmapData;
                console.log("Using cached heatmap data (offline)");
            } else {
                throw new Error("No internet connection and no heatmap cache available");
            }
        }

        const weeks = data.contributionCalendar.weeks;
        const total = data.contributionCalendar.totalContributions;
        const streak = data.currentStreak;

        const widget = new ListWidget();
        widget.backgroundGradient = createGradientBackground();
        widget.setPadding(11, 11, 11, 11);

        // Add offline indicator at top right if needed
        if (!online) {
            const topRow = widget.addStack();
            topRow.layoutHorizontally();
            topRow.addSpacer();
            const offlineIndicator = topRow.addText("Offline");
            offlineIndicator.font = Font.boldSystemFont(8);
            offlineIndicator.textColor = Color.orange();
            topRow.addSpacer(12);
            widget.addSpacer(2);
        }

        widget.addSpacer();

        const grid = widget.addStack();
        grid.layoutHorizontally();
        grid.centerAlignContent();

        const boxSize = 13;
        const boxSpacing = 3;
        const displayWeeks = weeks;

        grid.addSpacer();

        for (let w = 0; w < displayWeeks.length; w++) {
            const col = grid.addStack();
            col.layoutVertically();
            col.spacing = boxSpacing;

            for (let d = 0; d < 7; d++) {
                const day = displayWeeks[w].contributionDays[d];
                const cell = col.addStack();
                cell.size = new Size(boxSize, boxSize);
                cell.backgroundColor = getHeatmapColor(day?.contributionCount || 0);
                cell.cornerRadius = 2;
            }
            grid.addSpacer(boxSpacing);
        }

        grid.addSpacer();
        widget.addSpacer();

        const footer = widget.addStack();
        footer.layoutHorizontally();
        footer.centerAlignContent();

        footer.addSpacer(12);

        // Left: Username
        const userText = footer.addText(`@${username}`);
        userText.textColor = new Color(heatmapThemes[themeParam]?.text || "#ffffff");
        userText.font = Font.mediumSystemFont(12);
        userText.opacity = 0.8;

        footer.addSpacer();

        // Right: Streak
        const totalText = footer.addText(`${streak} `);
        totalText.textColor = new Color(heatmapThemes[themeParam]?.accent || "#00ff4e");
        totalText.font = Font.heavySystemFont(12);
        const totalText2 = footer.addText(`${streak === 1 ? "day" : "days"} streak`);
        totalText2.textColor = new Color(heatmapThemes[themeParam]?.text || "#ffffff");
        totalText2.font = Font.mediumSystemFont(11);

        footer.addSpacer(12);
        widget.addSpacer();

        return widget;
    } catch (error) {
        console.error("Failed to create heatmap widget:", error);
        return createErrorWidget("Failed to load heatmap data\nCheck internet connection");
    }
}

// ===================================
const widget = await createHeatmapWidget();

if (!config.runsInWidget) await widget.presentMedium();
Script.setWidget(widget);
Script.complete();