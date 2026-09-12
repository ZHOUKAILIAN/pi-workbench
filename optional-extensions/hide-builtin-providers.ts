import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Hide default Claude/xAI catalogs from model picker.
 * Optional personal preference; not installed by default.
 * Keep provider credentials and custom catalogs in the local Pi agent directory.
 */
export default function (pi: ExtensionAPI) {
  // Empty models array replaces the built-in catalog for that provider.
  pi.registerProvider("anthropic", {
    models: [],
  });
  pi.registerProvider("xai", {
    models: [],
  });
}
