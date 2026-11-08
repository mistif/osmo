import type { MetadataRoute } from "next";
import { MANIFEST } from "@/lib/shell/pwa";

export default function manifest(): MetadataRoute.Manifest {
	return MANIFEST;
}
