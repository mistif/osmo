import { buildDef } from "./build";
import { noteDefs } from "../connectors/notes";
import { reminderDefs } from "../connectors/reminders";
import { weatherDefs } from "../connectors/weather";
import type { Def } from "./types";

// Every action Osmo can take. The build action (artifacts) closes the list. Calendar, mail and Spotify join in phases 2 and 3.
export const REGISTRY: readonly Def[] = [...reminderDefs, ...noteDefs, ...weatherDefs, buildDef];
