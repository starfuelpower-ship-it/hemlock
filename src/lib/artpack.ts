// Centralized artpack asset paths (generated assets live in /public/artpack/*)
// Keep this small + explicit so routes stay consistent.
export const artpack = {
  backgrounds: {
    home: "/artpack/backgrounds/home_bg.webp",
  },
  // Full-screen UI screen frames (EMPTY UI FRAME ASSETS ONLY)
  screens: {
    inventory: "/artpack/screens/24_inventory.webp",
    equipment: "/artpack/screens/25_equipment.webp",
    character: "/artpack/screens/26_character.webp",
    spells: "/artpack/screens/27_spells.webp",
    disciplineTree: "/artpack/screens/28_discipline_tree.webp",
    quests: "/artpack/screens/29_quests.webp",
    achievements: "/artpack/screens/30_achievements.webp",
    map: "/artpack/screens/31_map.webp",
    journal: "/artpack/screens/32_journal.webp",
    stats: "/artpack/screens/33_stats.webp",
    crafting: "/artpack/screens/34_crafting.webp",
    recipeBook: "/artpack/screens/35_recipe_book.webp",
    uiGridEmpty: "/artpack/screens/38_ui_grid_empty.webp",
    uiGridA: "/artpack/screens/39_ui_grid_variant_a.webp",
    uiGridB: "/artpack/screens/40_ui_grid_variant_b.webp",
    uiGridC: "/artpack/screens/41_ui_grid_variant_c.webp",
    uiGrid49: "/artpack/screens/49_ui_grid_v49.webp",
    uiGrid50: "/artpack/screens/50_ui_grid_v50.webp",
    uiGrid51: "/artpack/screens/51_ui_grid_v51.webp",
    uiGrid52: "/artpack/screens/52_ui_grid_v52.webp",
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
