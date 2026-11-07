/**
 * Import jobs from here (not from ./registry) so every built-in job is registered before use.
 */
import "./static-sync";
import "./integrity";
import "./accounts";
import "./rank-watch";
import "./auth-audit";
import "./access-audit";
import "./data-audit";
import "./db-usage";
import "./egress";
import "./skin-audit";
import "./proficiency-audit";
import "./rank-audit";
import "./perf-probe";
import "./riot-check";
import "./privacy";
import "./history-rescan";

export * from "./registry";
export * from "./scheduler";
