/**
 * Pure logic: merge template defaults with builder/config.
 * Builder config wins where both specify a value.
 */

import type { SiteConfig } from "@/types/siteConfig";
import type { TemplateConfigDefaults } from "@/types/template";

/**
 * Merge template config defaults with builder config.
 * Template provides base values; builder config overrides.
 * For arrays (extraPages, mainGoals), we union if builder has items; else use template defaults.
 */
export function mergeTemplateWithBuilderConfig(
  templateDefaults: TemplateConfigDefaults,
  builderConfig: SiteConfig
): SiteConfig {
  const merged: SiteConfig = { ...builderConfig };

  // themeColors: merge object, builder overrides
  if (templateDefaults.themeColors && !builderConfig.themeColors) {
    merged.themeColors = templateDefaults.themeColors;
  } else if (templateDefaults.themeColors && builderConfig.themeColors) {
    merged.themeColors = {
      ...templateDefaults.themeColors,
      ...builderConfig.themeColors,
    };
  }

  // heroImage, aboutImage: template default if builder empty
  if (templateDefaults.heroImage && !builderConfig.heroImage?.trim()) {
    merged.heroImage = templateDefaults.heroImage;
  }
  if (templateDefaults.aboutImage && !builderConfig.aboutImage?.trim()) {
    merged.aboutImage = templateDefaults.aboutImage;
  }

  // dividerStyle, dividerHeight
  if (templateDefaults.dividerStyle != null && builderConfig.dividerStyle == null) {
    merged.dividerStyle = templateDefaults.dividerStyle;
  }
  if (templateDefaults.dividerHeight != null && builderConfig.dividerHeight == null) {
    merged.dividerHeight = templateDefaults.dividerHeight;
  }

  // extraPages: use template default if builder has none
  if (
    templateDefaults.extraPages &&
    templateDefaults.extraPages.length > 0 &&
    (!builderConfig.extraPages || builderConfig.extraPages.length === 0)
  ) {
    merged.extraPages = [...templateDefaults.extraPages];
  }

  // vibe, photosOption
  if (templateDefaults.vibe && !builderConfig.vibe) {
    merged.vibe = templateDefaults.vibe;
  }
  if (templateDefaults.photosOption && !builderConfig.photosOption) {
    merged.photosOption = templateDefaults.photosOption;
  }

  // mainGoals: template default if builder has none
  if (
    templateDefaults.mainGoals &&
    templateDefaults.mainGoals.length > 0 &&
    (!builderConfig.mainGoals || builderConfig.mainGoals.length === 0)
  ) {
    merged.mainGoals = [...templateDefaults.mainGoals];
  }

  // contactOptions: template default if builder has none
  if (
    templateDefaults.contactOptions &&
    templateDefaults.contactOptions.length > 0 &&
    (!builderConfig.contactOptions || builderConfig.contactOptions.length === 0)
  ) {
    merged.contactOptions = [...templateDefaults.contactOptions];
  }

  return merged;
}
