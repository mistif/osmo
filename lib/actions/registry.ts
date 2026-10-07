import { reminderDefs } from "../connectors/reminders";
import type { Def } from "./types";

// Every action Osmo can take. Connectors add their defs here as they land (tasks 1.3 to 1.6).
export const REGISTRY: readonly Def[] = [...reminderDefs];
