interface PanelData {
	id: string;
	view: string;
	title: string;
	content: string;
	position?: { x: number; y: number };
	stage?: 'default' | 'minimized' | 'maximized';
}

export class PanelStore {
	panels = $state<PanelData[]>([]);

	addPanel(id: string, data: Omit<PanelData, 'id'>) {
		this.panels.push({ id, ...data });
	}

	removePanel(id: string) {
		this.panels = this.panels.filter((panel) => panel.id !== id);
	}

	updatePanel(id: string, data: Partial<PanelData>) {
		const index = this.panels.findIndex((panel) => panel.id === id);
		if (index !== -1) {
			this.panels[index] = { ...this.panels[index], ...data };
		}
	}

	getPanel(id: string) {
		return this.panels.find((panel) => panel.id === id);
	}

	getAllPanels() {
		return this.panels;
	}

	clear() {
		this.panels = [];
	}
}
