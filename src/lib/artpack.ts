// Centralized artpack asset paths (generated assets live in /public/artpack/*)
// Keep this small + explicit so routes stay consistent.
export const artpack = {
  backgrounds: {
    home: "/artpack/backgrounds/home_bg.webp",
  },
  icons: {
    logoCrest: "/artpack/icons/logo_crest.webp",
    lock: "/artpack/icons/icon_lock.webp",
  },
  frames: {
    topNav: "/artpack/frames/top_nav_frame.webp",
    sideNav: "/artpack/frames/side_nav_frame.webp",
    cta: "/artpack/frames/cta_panel.webp",
    buttonPrimary: "/artpack/frames/button_primary.webp",
    tutorial: "/artpack/frames/tutorial_panel.webp",
    domainMap: "/artpack/frames/domain_map_frame.webp",
    inventory: "/artpack/frames/inventory_panel.webp",
    itemSlot: "/artpack/frames/item_slot_frame.webp",
    tooltip: "/artpack/frames/item_tooltip_frame.webp",
    profile: "/artpack/frames/profile_panel.webp",
    profilePortrait: "/artpack/frames/profile_portrait_frame.webp",
    statRow: "/artpack/frames/stat_row_frame.webp",
    courtBanner: "/artpack/frames/court_banner_frame.webp",
    courtMemberRow: "/artpack/frames/court_member_row_frame.webp",
    domainOverview: "/artpack/frames/domain_overview_frame.webp",
    domainUpgradeSlot: "/artpack/frames/domain_upgrade_slot.webp",
    chronicleEntry: "/artpack/frames/chronicle_entry_frame.webp",
    chronicleChoice: "/artpack/frames/chronicle_choice_frame.webp",
    reportEntry: "/artpack/frames/report_entry_frame.webp",
  },
  portraits: {
    advisor: "/artpack/portraits/advisor_portrait.webp",
  }
} as const;
