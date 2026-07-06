"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseUrl = void 0;
// Loads DATABASE_URL for drizzle-kit and the seed script,
// preferring the repo-root .env.
const dotenv_1 = require("dotenv");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const rootEnv = (0, node_path_1.resolve)(__dirname, "../../.env");
(0, dotenv_1.config)({ path: (0, node_fs_1.existsSync)(rootEnv) ? rootEnv : (0, node_path_1.resolve)(__dirname, ".env") });
function requireDatabaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root and point it at your local PostgreSQL 17+ instance.");
    }
    return url;
}
exports.databaseUrl = requireDatabaseUrl();
//# sourceMappingURL=env.js.map