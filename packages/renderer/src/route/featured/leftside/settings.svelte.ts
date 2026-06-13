// $lib/components/panels/settingsPanel.svelte.ts

class SettingsPanelStore {
  searchQuery = $state("");

  clearSearch() {
    this.searchQuery = "";
  }
}

export const settingsPanelStore = new SettingsPanelStore();